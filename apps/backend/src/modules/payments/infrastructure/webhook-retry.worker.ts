import { Logger, type BeforeApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import type { RetryProviderWebhookEventsUseCase, RetryWebhookSummary } from '../application/use-cases/provider-webhook.use-cases';

// H-6, etapa 1: worker periódico de recuperación de webhooks (autorizado el 2026-11-16).
//
// Ejecuta RetryProviderWebhookEventsUseCase (los eventos `received` no despachados, los `failed` con intentos y los
// `processing` abandonados) una vez al arrancar y después cada intervalo. NO sustituye a InProcessWebhookDispatcher,
// que sigue siendo la vía rápida: el worker solo recoge lo que esa vía no terminó (reinicio, caída, fallo).
//
// - Desactivado por defecto. Solo se activa con PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED=true.
// - Una ejecución a la vez por instancia (si la anterior no terminó, el turno se omite).
// - Una ejecución a la vez entre instancias: pg_try_advisory_xact_lock en una transacción propia de una conexión
//   dedicada, que se mantiene abierta mientras dura el barrido. Válido también tras un pooler en modo transacción (la
//   transacción fija la conexión del servidor). Quien no obtiene el candado omite el turno sin esperar.
// - Un error no detiene el worker: se registra (solo el nombre del error) y el siguiente turno vuelve a intentarlo.
// - Apagado ordenado (beforeApplicationShutdown): deja de iniciar turnos, cancela el temporizador y espera al barrido en
//   curso antes de que se cierren las conexiones.
//
// PRECAUCIÓN (pendiente R-3 y R-4 de la auditoría H-6): los reintentos no tienen backoff y los errores permanentes
// (p. ej. appointment_mismatch, conflict) pueden consumir los 8 intentos. El worker debe permanecer DESACTIVADO hasta
// resolver ambas condiciones; no se activa automáticamente en ningún entorno.

export const WEBHOOK_RETRY_WORKER_ENV = {
  enabled: 'PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED',
  intervalSeconds: 'PAYMENTS_WEBHOOK_RETRY_INTERVAL_SECONDS',
} as const;
export const DEFAULT_WEBHOOK_RETRY_INTERVAL_SECONDS = 60;
export const MIN_WEBHOOK_RETRY_INTERVAL_SECONDS = 5;
export const MAX_WEBHOOK_RETRY_INTERVAL_SECONDS = 3600;
// Clave del candado consultivo (bigint) exclusiva de este barrido.
export const WEBHOOK_RETRY_LOCK_KEY = '7031420610001';

export interface WebhookRetryWorkerConfig {
  enabled: boolean;
  intervalMs: number;
}

export class WebhookRetryWorkerConfigError extends Error {
  constructor(reason: string) {
    super(`Configuración del worker de webhooks inválida: ${reason}`);
    this.name = 'WebhookRetryWorkerConfigError';
  }
}

export function loadWebhookRetryWorkerConfig(env: NodeJS.ProcessEnv = process.env): WebhookRetryWorkerConfig {
  const enabled = (env[WEBHOOK_RETRY_WORKER_ENV.enabled] ?? '').trim();
  const interval = (env[WEBHOOK_RETRY_WORKER_ENV.intervalSeconds] ?? '').trim();
  if (enabled !== '' && enabled !== 'true' && enabled !== 'false') {
    throw new WebhookRetryWorkerConfigError(`${WEBHOOK_RETRY_WORKER_ENV.enabled} solo admite true o false`);
  }
  let seconds = DEFAULT_WEBHOOK_RETRY_INTERVAL_SECONDS;
  if (interval !== '') {
    if (!/^\d+$/.test(interval)) throw new WebhookRetryWorkerConfigError(`${WEBHOOK_RETRY_WORKER_ENV.intervalSeconds} debe ser un entero de segundos`);
    seconds = Number(interval);
    if (seconds < MIN_WEBHOOK_RETRY_INTERVAL_SECONDS || seconds > MAX_WEBHOOK_RETRY_INTERVAL_SECONDS) {
      throw new WebhookRetryWorkerConfigError(
        `${WEBHOOK_RETRY_WORKER_ENV.intervalSeconds} debe estar entre ${MIN_WEBHOOK_RETRY_INTERVAL_SECONDS} y ${MAX_WEBHOOK_RETRY_INTERVAL_SECONDS}`,
      );
    }
  }
  return { enabled: enabled === 'true', intervalMs: seconds * 1000 };
}

// Exclusión entre instancias: ejecuta `work` solo si obtiene el candado; si no, no espera.
export interface ExclusiveRunLock {
  runExclusive<T>(work: () => Promise<T>): Promise<{ acquired: true; value: T } | { acquired: false }>;
}

interface LockClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(error?: unknown): void;
}

// Candado consultivo de transacción en una conexión dedicada del pool. Se libera al terminar la transacción (COMMIT o
// ROLLBACK) o si la conexión se cae: nunca queda retenido por un proceso que ya no existe.
export class PgAdvisoryXactLock implements ExclusiveRunLock {
  constructor(
    private readonly pool: { connect(): Promise<LockClient> },
    private readonly key: string = WEBHOOK_RETRY_LOCK_KEY,
  ) {}

  async runExclusive<T>(work: () => Promise<T>): Promise<{ acquired: true; value: T } | { acquired: false }> {
    const client = await this.pool.connect();
    let broken: unknown;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired', [this.key]);
      if (rows[0]?.acquired !== true) {
        await client.query('ROLLBACK');
        return { acquired: false };
      }
      try {
        return { acquired: true, value: await work() };
      } finally {
        // La transacción solo contiene el candado: terminarla lo libera.
        await client.query('ROLLBACK');
      }
    } catch (error) {
      broken = error;
      throw error;
    } finally {
      client.release(broken);
    }
  }
}

export type WebhookRetryTickResult =
  | { status: 'completed'; summary: RetryWebhookSummary }
  | { status: 'locked' }
  | { status: 'busy' }
  | { status: 'stopped' }
  | { status: 'error'; error: string };

export interface WebhookRetryWorkerDeps {
  config: WebhookRetryWorkerConfig;
  retry: Pick<RetryProviderWebhookEventsUseCase, 'execute'>;
  lock: ExclusiveRunLock;
  timers?: { setInterval: (fn: () => void, ms: number) => unknown; clearInterval: (handle: unknown) => void };
  logger?: Pick<Logger, 'log' | 'warn' | 'error'>;
}

export class WebhookRetryWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private handle: unknown = null;
  private current: Promise<WebhookRetryTickResult> | null = null;
  private stopping = false;
  private readonly logger: Pick<Logger, 'log' | 'warn' | 'error'>;
  private readonly timers: NonNullable<WebhookRetryWorkerDeps['timers']>;

  constructor(private readonly deps: WebhookRetryWorkerDeps) {
    this.logger = deps.logger ?? new Logger('PaymentsWebhookRetryWorker');
    this.timers = deps.timers ?? {
      setInterval: (fn, ms) => {
        const h = setInterval(fn, ms);
        // No mantiene vivo el proceso por sí solo.
        h.unref?.();
        return h;
      },
      clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
    };
  }

  get running(): boolean {
    return this.handle !== null;
  }

  onApplicationBootstrap(): void {
    if (!this.deps.config.enabled) {
      this.logger.log('Worker de recuperación de webhooks desactivado');
      return;
    }
    this.start();
  }

  // Ejecución inicial y después una por intervalo.
  start(): void {
    if (this.handle !== null || this.stopping) return;
    this.logger.log(`Worker de recuperación de webhooks activo (cada ${this.deps.config.intervalMs / 1000} s)`);
    this.handle = this.timers.setInterval(() => void this.tick(), this.deps.config.intervalMs);
    void this.tick();
  }

  // Un turno: se omite si el worker se está deteniendo, si el turno anterior sigue en curso o si otra instancia tiene el
  // candado. Nunca lanza.
  tick(): Promise<WebhookRetryTickResult> {
    if (this.stopping) return Promise.resolve({ status: 'stopped' });
    if (this.current) return Promise.resolve({ status: 'busy' });
    const run = this.runOnce().finally(() => {
      this.current = null;
    });
    this.current = run;
    return run;
  }

  private async runOnce(): Promise<WebhookRetryTickResult> {
    try {
      const result = await this.deps.lock.runExclusive(() => this.deps.retry.execute());
      if (!result.acquired) return { status: 'locked' };
      const s = result.value;
      if (s.examined > 0) {
        this.logger.log(`Recuperación de webhooks: examinados ${s.examined}; procesados ${s.processed}; ignorados ${s.ignored}; omitidos ${s.skipped}; con error ${s.failed}`);
      }
      return { status: 'completed', summary: s };
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      // Solo el nombre: nunca mensajes que puedan contener datos del proveedor o de conexión.
      this.logger.error(`Recuperación de webhooks fallida (${name}); se reintentará en el siguiente turno`);
      return { status: 'error', error: name };
    }
  }

  // Deja de iniciar turnos y espera al que esté en curso (antes de que Nest cierre las conexiones).
  async beforeApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.handle !== null) {
      this.timers.clearInterval(this.handle);
      this.handle = null;
    }
    if (this.current) await this.current;
  }
}
