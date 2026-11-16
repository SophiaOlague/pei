import type { RetryWebhookSummary } from '../application/use-cases/provider-webhook.use-cases';
import {
  loadWebhookRetryWorkerConfig,
  PgAdvisoryXactLock,
  WEBHOOK_RETRY_LOCK_KEY,
  WebhookRetryWorker,
  WebhookRetryWorkerConfigError,
  type ExclusiveRunLock,
} from './webhook-retry.worker';

// H-6, etapa 1 (sin BD ni temporizadores reales): temporizador manual, candado y caso de uso falsos.

const SUMMARY: RetryWebhookSummary = { examined: 1, processed: 1, failed: 0, ignored: 0, skipped: 0 };
const flush = () => new Promise((r) => setImmediate(r));

class ManualTimers {
  readonly intervals: { fn: () => void; ms: number; cleared: boolean }[] = [];
  setInterval = (fn: () => void, ms: number) => {
    const h = { fn, ms, cleared: false };
    this.intervals.push(h);
    return h;
  };
  clearInterval = (h: unknown) => {
    (h as { cleared: boolean }).cleared = true;
  };
  fire() {
    for (const h of this.intervals) if (!h.cleared) h.fn();
  }
}

const freeLock: ExclusiveRunLock = { runExclusive: async (work) => ({ acquired: true, value: await work() }) };
const heldLock: ExclusiveRunLock = { runExclusive: async () => ({ acquired: false }) };

function setup(options: { enabled?: boolean; intervalMs?: number; lock?: ExclusiveRunLock; execute?: jest.Mock } = {}) {
  const timers = new ManualTimers();
  const execute = options.execute ?? jest.fn().mockResolvedValue(SUMMARY);
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const worker = new WebhookRetryWorker({
    config: { enabled: options.enabled ?? true, intervalMs: options.intervalMs ?? 60_000 },
    retry: { execute },
    lock: options.lock ?? freeLock,
    timers,
    logger,
  });
  return { worker, timers, execute, logger };
}

describe('Configuración del worker de recuperación de webhooks', () => {
  it('[H6-CFG-01] sin variables: desactivado y cada 60 s', () => {
    expect(loadWebhookRetryWorkerConfig({})).toEqual({ enabled: false, intervalMs: 60_000 });
    expect(loadWebhookRetryWorkerConfig({ PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED: 'false', PAYMENTS_WEBHOOK_RETRY_INTERVAL_SECONDS: '' })).toEqual({ enabled: false, intervalMs: 60_000 });
  });

  it('[H6-CFG-02] solo `true` lo activa; el intervalo es configurable entre 5 y 3600 s', () => {
    expect(loadWebhookRetryWorkerConfig({ PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED: 'true' })).toEqual({ enabled: true, intervalMs: 60_000 });
    expect(loadWebhookRetryWorkerConfig({ PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED: 'true', PAYMENTS_WEBHOOK_RETRY_INTERVAL_SECONDS: '5' }).intervalMs).toBe(5_000);
  });

  it.each([
    [{ PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED: 'si' }],
    [{ PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED: '1' }],
    [{ PAYMENTS_WEBHOOK_RETRY_INTERVAL_SECONDS: '4' }],
    [{ PAYMENTS_WEBHOOK_RETRY_INTERVAL_SECONDS: '3601' }],
    [{ PAYMENTS_WEBHOOK_RETRY_INTERVAL_SECONDS: '60s' }],
    [{ PAYMENTS_WEBHOOK_RETRY_INTERVAL_SECONDS: '-60' }],
  ])('[H6-CFG-03] rechaza una configuración inválida: %j', (env) => {
    expect(() => loadWebhookRetryWorkerConfig(env)).toThrow(WebhookRetryWorkerConfigError);
  });
});

describe('WebhookRetryWorker', () => {
  it('[H6-W-01] desactivado: no programa nada ni ejecuta la recuperación', async () => {
    const { worker, timers, execute } = setup({ enabled: false });
    worker.onApplicationBootstrap();
    await flush();
    expect(timers.intervals).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
    expect(worker.running).toBe(false);
  });

  it('[H6-W-02] activado: ejecución inicial al arrancar', async () => {
    const { worker, execute } = setup();
    worker.onApplicationBootstrap();
    await flush();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(worker.running).toBe(true);
  });

  it('[H6-W-03] activado: una recuperación por cada intervalo de 60 s', async () => {
    const { worker, timers, execute } = setup();
    worker.onApplicationBootstrap();
    await flush();
    expect(timers.intervals).toEqual([expect.objectContaining({ ms: 60_000 })]);
    timers.fire();
    await flush();
    timers.fire();
    await flush();
    expect(execute).toHaveBeenCalledTimes(3); // inicial + 2 intervalos
  });

  it('[H6-W-04] no permite ejecuciones simultáneas en la instancia: un turno con el anterior en curso se omite', async () => {
    let release!: (s: RetryWebhookSummary) => void;
    const execute = jest.fn().mockResolvedValue(SUMMARY).mockImplementationOnce(() => new Promise<RetryWebhookSummary>((r) => (release = r)));
    const { worker, timers } = setup({ execute });
    worker.onApplicationBootstrap();
    await flush();
    expect(await worker.tick()).toEqual({ status: 'busy' });
    timers.fire();
    await flush();
    expect(execute).toHaveBeenCalledTimes(1);
    release(SUMMARY);
    await flush();
    expect(await worker.tick()).toEqual({ status: 'completed', summary: SUMMARY });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('[H6-W-05] respeta el candado: si otra instancia lo tiene, omite el turno sin ejecutar la recuperación', async () => {
    const { worker, execute } = setup({ lock: heldLock });
    expect(await worker.tick()).toEqual({ status: 'locked' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('[H6-W-06] un error no detiene el worker: se registra solo su nombre y el siguiente turno vuelve a ejecutar', async () => {
    const failure = Object.assign(new Error('detalle con postgres://usuario:secreto@host'), { name: 'DrizzleQueryError' });
    const execute = jest.fn().mockRejectedValueOnce(failure).mockResolvedValue(SUMMARY);
    const { worker, timers, logger } = setup({ execute });
    worker.onApplicationBootstrap();
    await flush();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('DrizzleQueryError'));
    expect(JSON.stringify(logger.error.mock.calls)).not.toMatch(/secreto|postgres:\/\//);
    timers.fire();
    await flush();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(worker.running).toBe(true);
    // Un fallo del candado (conexión) tampoco lo detiene.
    const brokenLock: ExclusiveRunLock = { runExclusive: async () => { throw new Error('ECONNRESET'); } };
    const second = setup({ lock: brokenLock });
    expect(await second.worker.tick()).toEqual({ status: 'error', error: 'Error' });
    expect(await second.worker.tick()).toEqual({ status: 'error', error: 'Error' });
  });

  it('[H6-W-07] apagado ordenado: cancela el intervalo, espera el turno en curso y no inicia más', async () => {
    let release!: (s: RetryWebhookSummary) => void;
    const execute = jest.fn().mockImplementation(() => new Promise<RetryWebhookSummary>((r) => (release = r)));
    const { worker, timers } = setup({ execute });
    worker.onApplicationBootstrap();
    await flush();
    let stopped = false;
    const shutdown = worker.beforeApplicationShutdown().then(() => (stopped = true));
    await flush();
    expect(timers.intervals[0].cleared).toBe(true);
    expect(stopped).toBe(false); // espera al turno en curso
    release(SUMMARY);
    await shutdown;
    expect(stopped).toBe(true);
    expect(worker.running).toBe(false);
    expect(await worker.tick()).toEqual({ status: 'stopped' });
    timers.fire();
    worker.start();
    await flush();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('[H6-W-08] no interfiere con la vía rápida: solo usa el caso de uso de recuperación (no despacha ni procesa eventos)', () => {
    // El worker no recibe ni el despachador ni el procesador: su única dependencia de negocio es RetryProviderWebhookEventsUseCase.
    const { worker } = setup({ enabled: false });
    expect(Object.keys((worker as unknown as { deps: Record<string, unknown> }).deps).sort()).toEqual(['config', 'lock', 'logger', 'retry', 'timers']);
  });
});

describe('PgAdvisoryXactLock', () => {
  function fakePool(acquired: boolean) {
    const calls: string[] = [];
    const released: unknown[] = [];
    const client = {
      query: jest.fn(async (text: string, params?: unknown[]) => {
        calls.push(params ? `${text} ${JSON.stringify(params)}` : text);
        return { rows: text.includes('pg_try_advisory_xact_lock') ? [{ acquired }] : [] };
      }),
      release: (e?: unknown) => released.push(e ?? null),
    };
    return { pool: { connect: async () => client }, calls, released };
  }

  it('[H6-L-01] con el candado libre: BEGIN, intento sin espera, trabajo, ROLLBACK (libera) y devuelve la conexión', async () => {
    const { pool, calls, released } = fakePool(true);
    const result = await new PgAdvisoryXactLock(pool).runExclusive(async () => 'ok');
    expect(result).toEqual({ acquired: true, value: 'ok' });
    expect(calls).toEqual(['BEGIN', `SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired ${JSON.stringify([WEBHOOK_RETRY_LOCK_KEY])}`, 'ROLLBACK']);
    expect(released).toEqual([null]);
  });

  it('[H6-L-02] con el candado tomado por otra instancia: no ejecuta el trabajo', async () => {
    const { pool, calls, released } = fakePool(false);
    const work = jest.fn();
    expect(await new PgAdvisoryXactLock(pool).runExclusive(work)).toEqual({ acquired: false });
    expect(work).not.toHaveBeenCalled();
    expect(calls.at(-1)).toBe('ROLLBACK');
    expect(released).toEqual([null]);
  });

  it('[H6-L-03] si el trabajo falla: libera el candado, devuelve la conexión y propaga el error', async () => {
    const { pool, calls, released } = fakePool(true);
    const boom = new Error('fallo');
    await expect(new PgAdvisoryXactLock(pool).runExclusive(async () => { throw boom; })).rejects.toBe(boom);
    expect(calls.at(-1)).toBe('ROLLBACK');
    expect(released).toEqual([boom]);
  });
});
