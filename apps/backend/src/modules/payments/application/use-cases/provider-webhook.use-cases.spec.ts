import { AsyncLocalStorage } from 'async_hooks';
import { createHmac } from 'crypto';
import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import type { ConfirmationResult } from '../../../appointments/application/integration/appointment-integration.services';
import { MercadoPagoWebhookAuthenticator } from '../../infrastructure/mercadopago/mercadopago-webhook-authenticator';
import { money, type Money } from '../../domain/money';
import type { PaymentStatus } from '../../domain/payment-status';
import { canTransition } from '../../domain/payment-transitions';
import type { AppointmentForPayment } from '../ports/appointment-payment.reader';
import { PaymentProviderError, type PaymentProviderPort, type ProviderPaymentSnapshot } from '../ports/payment-provider.port';
import type { PaymentProviderUpdate, PaymentRecord } from '../ports/payments.repositories';
import {
  WebhookAuthenticationError,
  type ClaimOptions,
  type NewWebhookEvent,
  type RawWebhookRequest,
  type RetryableQuery,
  type WebhookEventOutcome,
  type WebhookEventRecord,
  type WebhookEventRepository,
} from '../ports/provider-webhook.port';
import {
  ProcessProviderWebhookEventUseCase,
  ReceiveProviderWebhookUseCase,
  RetryProviderWebhookEventsUseCase,
  WEBHOOK_EXHAUSTED_TAG,
  WEBHOOK_MAX_ATTEMPTS,
  WEBHOOK_PERMANENT_FAILURE_TAG,
  WEBHOOK_STALE_PROCESSING_AFTER_MS,
  type ProcessWebhookResult,
} from './provider-webhook.use-cases';
import { cumulativeBackoffMs, PERMANENT_WEBHOOK_FAILURES } from './webhook-retry-policy';

// F3.3 · INTEGRACIÓN SIMULADA: firma real (HMAC con clave sintética), casos de uso reales y dobles en memoria para la
// base de datos, Mercado Pago y M08. NO hay red, ni PostgreSQL, ni sandbox: estas pruebas no demuestran la integración
// con Mercado Pago. Los dobles reproducen lo que importa de 0017 y de M08:
// - provider_webhook_event_uq y la inmutabilidad de un evento processed/ignored;
// - payment_guard (transiciones y datos fijados una vez) y el bloqueo de fila (SELECT … FOR UPDATE) con rollback;
// - confirmPaid/markPaymentFailed de M08: bloqueo de la cita, idempotencia (already_confirmed) y vencimiento.

const SECRET = 'clave-secreta-sintetica-webhooks-0003';
const PAYMENT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_PAYMENT_ID = '00000000-0000-4000-8000-000000000002';
const MP_ID = '987654321';
const T0 = new Date('2026-11-14T12:00:00Z');

class Mutex {
  private tail = Promise.resolve();
  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.tail;
    this.tail = prev.then(() => next);
    await prev;
    return release;
  }
}

interface Tx { writes: (() => void)[]; releases: (() => void)[] }

function failedEligible(e: { processingAttempts: number; receivedAt: Date; lastError: string | null }, q: RetryableQuery): boolean {
  const limits = q.failedReceivedBefore ?? [];
  const before = limits.length ? limits[Math.min(e.processingAttempts, limits.length - 1)] : null;
  if (before && !(e.receivedAt < before)) return false;
  const error = e.lastError ?? '';
  return !(q.excludeFailures ?? []).some((m) => (m.kind === 'exact' ? error === m.value : error.startsWith(m.value)));
}

class World {
  now = T0;
  clock = { now: () => this.now };
  events = new Map<string, WebhookEventRecord & { payload: Record<string, unknown> }>();
  payments = new Map<string, PaymentRecord>();
  paymentWrites: { id: string; update: PaymentProviderUpdate }[] = [];
  paymentLocks = new Map<string, Mutex>();
  appointments = new Map<string, AppointmentForPayment>();
  appointmentLocks = new Map<string, Mutex>();
  confirmations: string[] = []; // transiciones reales a confirmed (una por cita como máximo)
  confirmCalls: ConfirmationResult[] = [];
  releases: string[] = []; // markPaymentFailed efectivos
  confirmFailures = 0;
  providerCalls: string[] = [];
  providerBehaviour: ((id: string) => Promise<ProviderPaymentSnapshot>)[] = [];
  defaultSnapshot: (id: string) => ProviderPaymentSnapshot = () => this.snapshot('succeeded');
  dispatched: string[] = [];
  warnings: string[] = [];
  alerts: string[] = [];
  seq = 0;
  tx = new AsyncLocalStorage<Tx>();

  constructor() {
    this.payments.set(PAYMENT_ID, payment());
    this.appointments.set('apt-1', { appointmentId: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', status: 'pending_payment', price: money(65_000), paymentHoldExpiresAt: new Date(T0.getTime() + 5 * 60_000) });
  }

  snapshot(status: PaymentStatus, over: Partial<ProviderPaymentSnapshot> = {}): ProviderPaymentSnapshot {
    const providerStatus = { succeeded: 'approved/accredited', processing: 'in_process/pending_contingency', failed: 'rejected/cc_rejected_other_reason', pending: 'pending/pending_waiting_payment', canceled: 'cancelled/expired' }[status as string] ?? status;
    return {
      provider: 'mercado_pago', providerPaymentId: MP_ID, providerStatus, status, externalReference: PAYMENT_ID,
      amount: money(65_000), refunded: money(0),
      providerFeeActual: status === 'succeeded' ? money(2_536) : null,
      netReceived: status === 'succeeded' ? money(62_464) : null,
      moneyReleaseDate: status === 'succeeded' ? new Date('2026-11-28T12:00:00Z') : null,
      ...over,
    };
  }

  // ---- dobles de puertos -------------------------------------------------------------------------------------------
  uow = {
    runInTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
      const tx: Tx = { writes: [], releases: [] };
      try {
        const result = await this.tx.run(tx, work);
        for (const w of tx.writes) w(); // COMMIT
        return result;
      } finally {
        tx.releases.forEach((r) => r()); // ROLLBACK descarta las escrituras; los bloqueos se liberan siempre
      }
    },
  };

  eventsRepo: WebhookEventRepository = {
    insert: async (e: NewWebhookEvent) => {
      const dup = [...this.events.values()].find((x) => x.provider === e.provider && x.topic === e.topic && x.dataId === e.dataId && x.requestId === e.requestId);
      if (dup) throw new UniqueConstraintViolationError({ code: '23505', constraint: 'provider_webhook_event_uq', table: 'provider_webhook_event' });
      const id = `evt-${++this.seq}`;
      this.events.set(id, { ...e, id, paymentId: null, processedAt: null, processingAttempts: 0, lastError: null });
      return id;
    },
    findByKey: async (k) => [...this.events.values()].find((x) => x.provider === k.provider && x.topic === k.topic && x.dataId === k.dataId && x.requestId === k.requestId) ?? null,
    // Sin await entre la comprobación y la escritura: atómico como el UPDATE condicional.
    claim: async (id: string, o: ClaimOptions) => {
      const e = this.events.get(id);
      if (!e || e.processingAttempts >= o.maxAttempts) return null;
      const pending = e.status === 'received' || e.status === 'failed';
      const abandoned = e.status === 'processing' && !!o.reclaimProcessingReceivedBefore && e.receivedAt < o.reclaimProcessingReceivedBefore;
      if (!pending && !abandoned) return null;
      e.status = 'processing';
      e.processingAttempts += 1;
      return { ...e };
    },
    finish: async (id: string, o: WebhookEventOutcome) => {
      const e = this.events.get(id)!;
      if (e.status === 'processed' || e.status === 'ignored') return;
      e.status = o.status;
      if (o.status === 'processed') e.processedAt = o.at;
      e.lastError = o.lastError ?? null;
      if (o.paymentId && !e.paymentId) e.paymentId = o.paymentId;
    },
    // Misma semántica que DrizzleWebhookEventRepository.findRetryable, incluida la etapa 2 de H-6 (backoff y permanentes).
    findRetryable: async (q: RetryableQuery) =>
      [...this.events.values()]
        .filter((e) => e.processingAttempts < q.maxAttempts && (
          (e.status === 'received' && e.receivedAt < q.receivedBefore) || (e.status === 'failed' && failedEligible(e, q)) || (e.status === 'processing' && e.receivedAt < q.processingReceivedBefore)))
        .slice(0, q.limit).map((e) => e.id),
  };

  paymentsRepo = {
    findById: async (id: string) => (this.payments.has(id) ? { ...this.payments.get(id)! } : null),
    update: async (id: string, update: PaymentProviderUpdate) => {
      const write = () => {
        const current = this.payments.get(id)!;
        // payment_guard de 0017.
        if (update.status && !canTransition(current.status, update.status)) throw new Error(`payment_guard: ${current.status} → ${update.status}`);
        const setOnce = (field: 'providerPaymentId' | 'providerFeeActual' | 'netReceived' | 'moneyReleaseDate') => {
          if (update[field] !== undefined && current[field] !== null) throw new Error(`payment_guard: ${field} ya fijado`);
        };
        (['providerPaymentId', 'providerFeeActual', 'netReceived', 'moneyReleaseDate'] as const).forEach(setOnce);
        this.payments.set(id, { ...current, ...update } as PaymentRecord);
        this.paymentWrites.push({ id, update });
      };
      const tx = this.tx.getStore();
      if (tx) tx.writes.push(write);
      else write();
    },
  };

  locks = {
    lockById: async (id: string) => {
      const tx = this.tx.getStore();
      if (!tx) throw new Error('lockById fuera de una transacción');
      if (!this.paymentLocks.has(id)) this.paymentLocks.set(id, new Mutex());
      tx.releases.push(await this.paymentLocks.get(id)!.acquire());
      return this.payments.has(id) ? { ...this.payments.get(id)! } : null;
    },
  };

  provider: PaymentProviderPort = {
    name: 'mercado_pago',
    createPayment: async () => {
      throw new Error('el webhook nunca cobra');
    },
    getPayment: async (id: string) => {
      this.providerCalls.push(id);
      const next = this.providerBehaviour.shift();
      return next ? next(id) : this.defaultSnapshot(id);
    },
  };

  appointmentReader = { findForPayment: async (id: string) => (this.appointments.has(id) ? { ...this.appointments.get(id)! } : null) };

  private async withAppointment<T>(id: string, fn: (a: AppointmentForPayment) => T): Promise<T> {
    if (!this.appointmentLocks.has(id)) this.appointmentLocks.set(id, new Mutex());
    const release = await this.appointmentLocks.get(id)!.acquire();
    try {
      await Promise.resolve();
      return fn(this.appointments.get(id)!);
    } finally {
      release();
    }
  }

  // M08 simulado con la misma lógica que AppointmentConfirmationService (bloqueo de la cita, idempotencia, vencimiento).
  confirmation = {
    confirmPaid: async (appointmentId: string, paymentId: string, amount: string): Promise<ConfirmationResult> => {
      if (this.confirmFailures > 0) {
        this.confirmFailures -= 1;
        throw new Error('M08 no respondió');
      }
      const r = await this.withAppointment<ConfirmationResult>(appointmentId, (a) => {
        if (a.status === 'confirmed') return { result: 'already_confirmed' };
        if (a.status === 'expired') return { result: 'not_confirmable', reason: 'expired' };
        if (a.status !== 'pending_payment') return { result: 'not_confirmable', reason: 'invalid_state' };
        if (!a.paymentHoldExpiresAt || a.paymentHoldExpiresAt <= this.now) {
          a.status = 'expired';
          return { result: 'not_confirmable', reason: 'expired' };
        }
        if (Number(amount) !== a.price.cents / 100) return { result: 'not_confirmable', reason: 'amount_mismatch' };
        a.status = 'confirmed';
        this.confirmations.push(`${appointmentId}:${paymentId}`);
        return { result: 'confirmed' };
      });
      this.confirmCalls.push(r);
      return r;
    },
    markPaymentFailed: async (appointmentId: string) => {
      await this.withAppointment(appointmentId, (a) => {
        if (a.status !== 'pending_payment') return;
        a.status = 'expired';
        this.releases.push(appointmentId);
      });
    },
  };

  processor = new ProcessProviderWebhookEventUseCase({
    uow: this.uow, clock: this.clock, events: this.eventsRepo, provider: this.provider, payments: this.paymentsRepo,
    locks: this.locks, appointments: this.appointmentReader, confirmation: this.confirmation, warn: (m) => this.warnings.push(m),
    alert: (m) => this.alerts.push(m),
  });

  receiver = new ReceiveProviderWebhookUseCase({
    clock: this.clock,
    authenticator: new MercadoPagoWebhookAuthenticator({ secret: SECRET, now: this.clock.now }),
    events: this.eventsRepo,
    dispatcher: { dispatch: (id) => this.dispatched.push(id) },
  });

  retry = new RetryProviderWebhookEventsUseCase({ clock: this.clock, events: this.eventsRepo, processor: this.processor });

  // Procesa lo despachado (en la aplicación ocurre en segundo plano, después de responder).
  async drain(): Promise<ProcessWebhookResult[]> {
    const ids = this.dispatched.splice(0);
    return Promise.all(ids.map((id) => this.processor.execute(id)));
  }

  event(id: string) {
    return this.events.get(id)!;
  }

  get payment() {
    return this.payments.get(PAYMENT_ID)!;
  }
}

function payment(over: Partial<PaymentRecord> = {}): PaymentRecord {
  const m = (c: number): Money => money(c);
  return {
    id: PAYMENT_ID, type: 'consultation', provider: 'mercado_pago', providerPaymentId: MP_ID, providerStatus: 'in_process/pending_contingency', status: 'processing',
    patientId: 'pat-1', doctorId: 'doc-1', appointmentId: 'apt-1', medicationOrderId: null,
    gross: m(65_000), peiFeeConfigurationId: 'fee-1', peiFixedFee: m(10_000), doctorNet: m(55_000), processorFeeScheduleId: 'sch-1', providerFeeEstimated: m(2_869),
    providerFeeActual: null, netReceived: null, moneyReleaseDate: null, feeReconciledAt: null, createdAt: T0, updatedAt: T0, ...over,
  };
}

function webhook(over: { dataId?: string; requestId?: string; secret?: string; type?: string; body?: Record<string, unknown> } = {}): RawWebhookRequest {
  const dataId = over.dataId ?? MP_ID;
  const requestId = over.requestId ?? 'req-0001';
  const ts = String(T0.getTime());
  const v1 = createHmac('sha256', over.secret ?? SECRET).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return {
    url: `/webhooks/mercado-pago?data.id=${dataId}&type=${over.type ?? 'payment'}`,
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    body: { action: 'payment.updated', api_version: 'v1', type: over.type ?? 'payment', data: { id: dataId }, live_mode: false, ...over.body },
  };
}

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

// ---------------------------------------------------------------------------------------------------------------------

describe('Webhooks · recepción y firma', () => {
  it('webhook válido: se registra, se despacha y, al procesarse, el pago queda succeeded y la cita confirmada', async () => {
    const w = new World();
    const r = await w.receiver.execute(webhook());
    expect(r.outcome).toBe('accepted');
    expect(w.dispatched).toEqual([r.eventId]);
    expect(w.event(r.eventId)).toMatchObject({ status: 'received', topic: 'payment', dataId: MP_ID, requestId: 'req-0001', paymentId: null });

    const [p] = await w.drain();
    expect(p).toMatchObject({ outcome: 'processed', paymentId: PAYMENT_ID, paymentStatus: 'succeeded', paymentChanged: true, effect: { kind: 'confirmation', result: { result: 'confirmed' } }, refundRequired: false });
    expect(w.payment).toMatchObject({ status: 'succeeded', providerStatus: 'approved/accredited', providerFeeActual: money(2_536), netReceived: money(62_464) });
    expect(w.confirmations).toEqual([`apt-1:${PAYMENT_ID}`]);
    expect(w.event(r.eventId)).toMatchObject({ status: 'processed', paymentId: PAYMENT_ID, processingAttempts: 1, lastError: null });
    expect(w.event(r.eventId).processedAt).toEqual(T0);
  });

  it.each([
    ['firma con otra clave', webhook({ secret: 'otra-clave-secreta-sintetica-9999' })],
    ['sin x-signature', (() => { const r = webhook(); return { ...r, headers: { 'x-request-id': 'req-0001' } }; })()],
    ['data.id distinto del firmado', (() => { const r = webhook(); return { ...r, url: '/webhooks/mercado-pago?data.id=111&type=payment', body: { data: { id: '111' } } }; })()],
  ])('firma inválida (%s): se rechaza sin registrar, despachar ni consultar al proveedor', async (_n, request) => {
    const w = new World();
    await expect(w.receiver.execute(request)).rejects.toBeInstanceOf(WebhookAuthenticationError);
    expect(w.events.size).toBe(0);
    expect(w.dispatched).toEqual([]);
    expect(w.providerCalls).toEqual([]);
    expect(w.paymentWrites).toEqual([]);
  });

  it('un tema distinto de payment se registra como ignorado y no se procesa', async () => {
    const w = new World();
    const r = await w.receiver.execute(webhook({ type: 'merchant_order' }));
    expect(r.outcome).toBe('ignored');
    expect(w.event(r.eventId).status).toBe('ignored');
    expect(w.dispatched).toEqual([]);
    expect(await w.processor.execute(r.eventId)).toEqual({ outcome: 'skipped' });
  });

  it('el payload guardado solo tiene campos permitidos: un "status" en el cuerpo no se conserva ni se usa', async () => {
    const w = new World();
    const r = await w.receiver.execute(webhook({ body: { status: 'approved', transaction_amount: 650 } }));
    expect(w.event(r.eventId).payload).toEqual({ data: { id: MP_ID }, type: 'payment', action: 'payment.updated', api_version: 'v1', live_mode: false });
  });
});

describe('Webhooks · duplicados y concurrencia', () => {
  it('evento duplicado (misma clave): no se registra ni se procesa otra vez; la cita se confirma una sola vez', async () => {
    const w = new World();
    const first = await w.receiver.execute(webhook());
    await w.drain();
    const again = await w.receiver.execute(webhook());
    expect(again).toEqual({ outcome: 'duplicate', eventId: first.eventId });
    expect(w.dispatched).toEqual([]);
    expect(w.events.size).toBe(1);
    expect(w.providerCalls).toEqual([MP_ID]);
    expect(w.confirmations).toHaveLength(1);
    expect(w.paymentWrites).toHaveLength(1);
  });

  it('duplicado de un evento que falló: se vuelve a despachar (reintento idempotente)', async () => {
    const w = new World();
    w.providerBehaviour.push(async () => {
      throw new PaymentProviderError('unavailable', 'sin red');
    });
    const first = await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason: 'provider:unavailable' });
    expect(await w.receiver.execute(webhook())).toEqual({ outcome: 'duplicate', eventId: first.eventId });
    expect(w.dispatched).toEqual([first.eventId]);
    expect((await w.drain())[0]).toMatchObject({ outcome: 'processed', paymentStatus: 'succeeded' });
    expect(w.event(first.eventId)).toMatchObject({ status: 'processed', processingAttempts: 2 });
    expect(w.confirmations).toHaveLength(1);
  });

  it('el mismo evento despachado dos veces a la vez: uno lo procesa y el otro se omite', async () => {
    const w = new World();
    const r = await w.receiver.execute(webhook());
    const results = await Promise.all([w.processor.execute(r.eventId), w.processor.execute(r.eventId)]);
    expect(results.map((x) => x.outcome).sort()).toEqual(['processed', 'skipped']);
    expect(w.providerCalls).toHaveLength(1);
    expect(w.confirmations).toHaveLength(1);
  });

  it('dos notificaciones concurrentes del mismo pago (distinto x-request-id): un solo cambio del pago y una sola confirmación', async () => {
    const w = new World();
    const a = await w.receiver.execute(webhook({ requestId: 'req-a' }));
    const b = await w.receiver.execute(webhook({ requestId: 'req-b' }));
    expect(a.eventId).not.toBe(b.eventId);
    const results = await w.drain();
    expect(results.every((x) => x.outcome === 'processed')).toBe(true);
    expect(results.filter((x) => (x as { paymentChanged: boolean }).paymentChanged)).toHaveLength(1);
    // Datos financieros escritos una sola vez (payment_guard los rechazaría una segunda vez).
    expect(w.paymentWrites).toHaveLength(1);
    expect(w.confirmations).toEqual([`apt-1:${PAYMENT_ID}`]);
    expect(w.confirmCalls.map((c) => c.result).sort()).toEqual(['already_confirmed', 'confirmed']);
    expect(w.event(a.eventId).status).toBe('processed');
    expect(w.event(b.eventId).status).toBe('processed');
  });

  it('concurrencia con un snapshot atrasado: no retrocede el estado ni se considera conflicto', async () => {
    const w = new World();
    const slow = deferred<ProviderPaymentSnapshot>();
    w.providerBehaviour.push(() => slow.promise, async () => w.snapshot('succeeded'));
    const a = await w.receiver.execute(webhook({ requestId: 'req-a' }));
    const b = await w.receiver.execute(webhook({ requestId: 'req-b' }));
    const pa = w.processor.execute(a.eventId); // leerá in_process (lectura antigua)
    const rb = await w.processor.execute(b.eventId); // lee approved y lo aplica primero
    expect(rb).toMatchObject({ outcome: 'processed', paymentStatus: 'succeeded', paymentChanged: true });
    slow.resolve(w.snapshot('processing'));
    expect(await pa).toMatchObject({ outcome: 'processed', paymentStatus: 'succeeded', paymentChanged: false, effect: { result: { result: 'already_confirmed' } } });
    expect(w.payment.status).toBe('succeeded');
    expect(w.paymentWrites).toHaveLength(1);
    expect(w.confirmations).toHaveLength(1);
  });

  it('muchas reentregas y notificaciones del mismo pago nunca duplican confirmaciones ni datos financieros', async () => {
    const w = new World();
    for (let i = 0; i < 5; i++) {
      await w.receiver.execute(webhook({ requestId: `req-${i}` }));
      await w.receiver.execute(webhook({ requestId: `req-${i}` }));
    }
    await w.drain();
    expect(w.events.size).toBe(5);
    expect(w.paymentWrites).toHaveLength(1);
    expect(w.confirmations).toHaveLength(1);
    expect([...w.events.values()].every((e) => e.status === 'processed')).toBe(true);
  });
});

describe('Webhooks · estados del pago verificados con el gateway', () => {
  it('verificación del estado real: se consulta la API con el data.id firmado y manda su respuesta, no el cuerpo', async () => {
    const w = new World();
    w.defaultSnapshot = () => w.snapshot('failed');
    await w.receiver.execute(webhook({ body: { status: 'approved', action: 'payment.approved' } }));
    const [r] = await w.drain();
    expect(w.providerCalls).toEqual([MP_ID]);
    expect(r).toMatchObject({ outcome: 'processed', paymentStatus: 'failed' });
    expect(w.confirmations).toEqual([]);
  });

  it('pago aprobado desde pending sin referencia del proveedor (respuesta de creación perdida): se recupera por external_reference', async () => {
    const w = new World();
    w.payments.set(PAYMENT_ID, payment({ status: 'pending', providerPaymentId: null, providerStatus: null }));
    await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'processed', paymentStatus: 'succeeded' });
    expect(w.payment.providerPaymentId).toBe(MP_ID);
    expect(w.confirmations).toHaveLength(1);
  });

  it('pago rechazado con la retención vigente: queda failed y la cita sigue pendiente para reintentar (sin markPaymentFailed)', async () => {
    const w = new World();
    w.defaultSnapshot = () => w.snapshot('failed');
    await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'processed', paymentStatus: 'failed', effect: { kind: 'retry_allowed' } });
    expect(w.payment.status).toBe('failed');
    expect(w.releases).toEqual([]);
    expect(w.appointments.get('apt-1')!.status).toBe('pending_payment');
    expect(w.confirmations).toEqual([]);
  });

  it('pago rechazado con la retención vencida: intento terminal → markPaymentFailed una sola vez', async () => {
    const w = new World();
    w.defaultSnapshot = () => w.snapshot('failed');
    w.now = new Date(T0.getTime() + 6 * 60_000);
    await w.receiver.execute(webhook({ requestId: 'req-a' }));
    await w.receiver.execute(webhook({ requestId: 'req-b' }));
    const results = await w.drain();
    // Las dos pueden pedir la liberación; M08 la aplica una sola vez (bloquea la cita y solo actúa en pending_payment).
    for (const r of results) expect(['hold_released', 'none']).toContain((r as { effect: { kind: string } }).effect.kind);
    expect(w.releases).toEqual(['apt-1']);
    expect(w.appointments.get('apt-1')!.status).toBe('expired');
  });

  it('pago cancelado en el proveedor con la retención vencida también libera la retención', async () => {
    const w = new World();
    w.payments.set(PAYMENT_ID, payment({ status: 'pending', providerStatus: 'pending/pending_waiting_payment' }));
    w.defaultSnapshot = () => w.snapshot('canceled');
    w.now = new Date(T0.getTime() + 6 * 60_000);
    await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ paymentStatus: 'canceled', effect: { kind: 'hold_released' } });
  });

  it.each([
    ['in_process', 'processing' as const, 'in_process/pending_contingency'],
    ['authorized', 'processing' as const, 'authorized/pending_capture'],
    ['pending', 'pending' as const, 'pending/pending_waiting_transfer'],
  ])('pago %s: se registra el estado y no se confirma la cita', async (_n, status, providerStatus) => {
    const w = new World();
    w.payments.set(PAYMENT_ID, payment({ status: 'pending', providerPaymentId: null, providerStatus: null }));
    w.defaultSnapshot = () => w.snapshot(status, { providerStatus });
    await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'processed', paymentStatus: status, effect: { kind: 'none' } });
    expect(w.payment).toMatchObject({ status, providerStatus, providerPaymentId: MP_ID });
    expect(w.confirmations).toEqual([]);
    expect(w.releases).toEqual([]);
  });

  it('in_process y después approved (dos notificaciones): se confirma con la segunda', async () => {
    const w = new World();
    w.payments.set(PAYMENT_ID, payment({ status: 'pending', providerPaymentId: null, providerStatus: null }));
    w.providerBehaviour.push(async () => w.snapshot('processing'));
    await w.receiver.execute(webhook({ requestId: 'req-1' }));
    expect((await w.drain())[0]).toMatchObject({ paymentStatus: 'processing' });
    await w.receiver.execute(webhook({ requestId: 'req-2' }));
    expect((await w.drain())[0]).toMatchObject({ paymentStatus: 'succeeded', effect: { result: { result: 'confirmed' } } });
    expect(w.paymentWrites).toHaveLength(2);
    expect(w.confirmations).toHaveLength(1);
  });

  it('el mismo estado con otro detalle del proveedor se registra sin repetir datos fijados', async () => {
    const w = new World();
    w.defaultSnapshot = () => w.snapshot('processing', { providerStatus: 'in_process/pending_review_manual' });
    await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ paymentChanged: true, paymentStatus: 'processing' });
    expect(w.payment.providerStatus).toBe('in_process/pending_review_manual');
  });

  it('reembolso informado por el proveedor: se registra el estado sin efectos en M08 (F5)', async () => {
    const w = new World();
    w.payments.set(PAYMENT_ID, payment({ status: 'succeeded', providerStatus: 'approved/accredited', providerFeeActual: money(2_536), netReceived: money(62_464), moneyReleaseDate: new Date('2026-11-28T12:00:00Z') }));
    w.appointments.get('apt-1')!.status = 'confirmed';
    w.defaultSnapshot = () => w.snapshot('refunded', { providerStatus: 'refunded/refunded', refunded: money(65_000), providerFeeActual: money(2_536), netReceived: money(62_464), moneyReleaseDate: new Date('2026-11-28T12:00:00Z') });
    await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ paymentStatus: 'refunded', effect: { kind: 'none' } });
    expect(w.confirmCalls).toEqual([]);
  });
});

describe('Webhooks · anomalías (no se confirma nada)', () => {
  it('importe que no coincide: el evento falla con conflicto, el pago no cambia y la cita no se confirma', async () => {
    const w = new World();
    w.defaultSnapshot = () => w.snapshot('succeeded', { amount: money(1_000) });
    const r = await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toEqual({ outcome: 'failed', reason: 'conflict:importe distinto', paymentId: PAYMENT_ID, permanent: true, exhausted: false });
    expect(w.paymentWrites).toEqual([]);
    expect(w.payment.status).toBe('processing');
    expect(w.confirmCalls).toEqual([]);
    expect(w.event(r.eventId)).toMatchObject({ status: 'failed', lastError: 'conflict:importe distinto', paymentId: PAYMENT_ID });
    expect(w.warnings.join()).toMatch(/requiere conciliación/);
  });

  it('pago asociado a una cita de otro paciente: el pago refleja el estado real, pero la cita no se confirma', async () => {
    const w = new World();
    w.appointments.get('apt-1')!.patientId = 'otro-paciente';
    await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason: 'appointment_mismatch:patient' });
    expect(w.payment.status).toBe('succeeded');
    expect(w.confirmCalls).toEqual([]);
  });

  it('pago asociado a una cita de otro médico: no se confirma', async () => {
    const w = new World();
    w.appointments.get('apt-1')!.doctorId = 'otro-medico';
    await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason: 'appointment_mismatch:doctor' });
    expect(w.confirmCalls).toEqual([]);
  });

  it('cita inexistente: no se confirma', async () => {
    const w = new World();
    w.appointments.clear();
    await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason: 'appointment_not_found' });
  });

  it('el pago del proveedor apunta a un pago de PEI que ya tiene otra referencia: conflicto', async () => {
    const w = new World();
    w.defaultSnapshot = () => w.snapshot('succeeded', { providerPaymentId: '111' });
    await w.receiver.execute(webhook({ dataId: '111' }));
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason: 'conflict:otro pago del proveedor' });
    expect(w.confirmCalls).toEqual([]);
  });

  it('transición imposible (failed → succeeded): conflicto, sin confirmar', async () => {
    const w = new World();
    w.payments.set(PAYMENT_ID, payment({ status: 'failed', providerStatus: 'rejected/cc_rejected_other_reason' }));
    await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason: 'conflict:transición failed → succeeded no permitida' });
    expect(w.confirmCalls).toEqual([]);
  });

  it('pago cuya retención ya expiró: el pago queda succeeded, M08 no confirma y se marca para reembolso (F5)', async () => {
    const w = new World();
    w.now = new Date(T0.getTime() + 6 * 60_000);
    const r = await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({
      outcome: 'processed', paymentStatus: 'succeeded', refundRequired: true, effect: { kind: 'confirmation', result: { result: 'not_confirmable', reason: 'expired' } },
    });
    expect(w.confirmations).toEqual([]);
    expect(w.appointments.get('apt-1')!.status).toBe('expired');
    expect(w.event(r.eventId).status).toBe('processed');
    expect(w.warnings.join()).toMatch(/reembolso total/);
  });

  it('pago que no es de PEI (external_reference ajena) o desconocido: el evento se ignora', async () => {
    const w = new World();
    w.providerBehaviour.push(async () => w.snapshot('succeeded', { externalReference: 'pedido-externo-42' }), async () => w.snapshot('succeeded', { externalReference: OTHER_PAYMENT_ID }));
    const a = await w.receiver.execute(webhook({ requestId: 'req-a' }));
    expect(await w.processor.execute(a.eventId)).toEqual({ outcome: 'ignored', reason: 'foreign_payment' });
    const b = await w.receiver.execute(webhook({ requestId: 'req-b' }));
    expect(await w.processor.execute(b.eventId)).toEqual({ outcome: 'ignored', reason: 'unknown_payment' });
    w.dispatched = [];
    expect(w.event(a.eventId).status).toBe('ignored');
    expect(w.paymentWrites).toEqual([]);
  });
});

describe('Webhooks · reintentos', () => {
  it('reintento después de un error del proveedor: el evento falla, el reintento periódico lo procesa', async () => {
    const w = new World();
    w.providerBehaviour.push(async () => {
      throw new PaymentProviderError('timeout', 'tiempo agotado');
    });
    const r = await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason: 'provider:timeout' });
    expect(w.event(r.eventId)).toMatchObject({ status: 'failed', processingAttempts: 1, lastError: 'provider:timeout' });
    expect(w.confirmations).toEqual([]);

    // H-6 etapa 2: dentro de la espera (1 min tras el primer intento) no se reintenta; después, sí.
    expect(await w.retry.execute()).toMatchObject({ examined: 0 });
    w.now = new Date(T0.getTime() + cumulativeBackoffMs(1) + 1_000);
    expect(await w.retry.execute()).toEqual({ examined: 1, processed: 1, failed: 0, ignored: 0, skipped: 0 });
    expect(w.event(r.eventId)).toMatchObject({ status: 'processed', processingAttempts: 2, lastError: null });
    expect(w.confirmations).toHaveLength(1);
    expect(await w.retry.execute()).toEqual({ examined: 0, processed: 0, failed: 0, ignored: 0, skipped: 0 });
  });

  it('reintento después de que confirmPaid falle: el pago no se reescribe y la cita se confirma una vez', async () => {
    const w = new World();
    w.confirmFailures = 1;
    const r = await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason: 'confirmation_failed', paymentId: PAYMENT_ID });
    expect(w.payment.status).toBe('succeeded');
    expect(w.event(r.eventId).paymentId).toBe(PAYMENT_ID);
    w.now = new Date(T0.getTime() + cumulativeBackoffMs(1) + 1_000);
    await w.retry.execute();
    expect(w.event(r.eventId).status).toBe('processed');
    expect(w.paymentWrites).toHaveLength(1);
    expect(w.confirmations).toHaveLength(1);
  });

  it('error al escribir el pago: rollback (nada aplicado) y el reintento lo aplica', async () => {
    const w = new World();
    const original = w.paymentsRepo.update;
    let fail = true;
    w.paymentsRepo.update = async (id, u) => {
      await original(id, u);
      if (fail) {
        fail = false;
        throw new Error('conexión perdida');
      }
    };
    const r = await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason: 'internal' });
    expect(w.payment.status).toBe('processing');
    expect(w.paymentWrites).toEqual([]);
    w.now = new Date(T0.getTime() + cumulativeBackoffMs(1) + 1_000);
    await w.retry.execute();
    expect(w.event(r.eventId).status).toBe('processed');
    expect(w.paymentWrites).toHaveLength(1);
    expect(w.confirmations).toHaveLength(1);
  });

  it(`sin intentos disponibles (${WEBHOOK_MAX_ATTEMPTS}) el evento queda fallido para conciliación manual`, async () => {
    const w = new World();
    w.defaultSnapshot = () => {
      throw new PaymentProviderError('unavailable', 'sin red');
    };
    const r = await w.receiver.execute(webhook());
    await w.drain();
    for (let i = 1; i < WEBHOOK_MAX_ATTEMPTS; i++) {
      w.now = new Date(T0.getTime() + cumulativeBackoffMs(i) + 1_000);
      await w.retry.execute();
    }
    expect(w.event(r.eventId)).toMatchObject({ status: 'failed', processingAttempts: WEBHOOK_MAX_ATTEMPTS });
    expect(await w.retry.execute()).toMatchObject({ examined: 0 });
    expect(await w.processor.execute(r.eventId)).toEqual({ outcome: 'skipped' });
    // H-6 etapa 2 (R-5): el último intento fallido deja un aviso identificable.
    expect(w.alerts.filter((m) => m.startsWith(WEBHOOK_EXHAUSTED_TAG))).toHaveLength(1);
    expect(w.alerts.join()).toContain(`intento ${WEBHOOK_MAX_ATTEMPTS} de ${WEBHOOK_MAX_ATTEMPTS}`);
  });

  it('un evento recibido que nunca se despachó, o abandonado en processing, lo recoge el reintento', async () => {
    const w = new World();
    const a = await w.receiver.execute(webhook({ requestId: 'req-a' }));
    const b = await w.receiver.execute(webhook({ requestId: 'req-b' }));
    w.dispatched = []; // el proceso cayó antes de procesar
    w.event(b.eventId).status = 'processing'; // cayó a medias
    w.event(b.eventId).processingAttempts = 1;
    expect(await w.retry.execute()).toMatchObject({ examined: 0 }); // aún recientes
    w.now = new Date(T0.getTime() + WEBHOOK_STALE_PROCESSING_AFTER_MS + 1);
    w.appointments.get('apt-1')!.paymentHoldExpiresAt = new Date(w.now.getTime() + 60_000);
    expect(await w.retry.execute()).toEqual({ examined: 2, processed: 2, failed: 0, ignored: 0, skipped: 0 });
    expect(w.event(a.eventId).status).toBe('processed');
    expect(w.event(b.eventId).status).toBe('processed');
    expect(w.confirmations).toHaveLength(1);
  });
});

// F5: el webhook con el servicio de reembolsos (doble que cuenta las llamadas).
describe('Webhooks · reembolsos (F5)', () => {
  function withRefunds(w: World, opts: { failFirst?: boolean } = {}) {
    const calls = { unconfirmable: [] as string[], sync: [] as string[] };
    let fail = opts.failFirst ?? false;
    const processor = new ProcessProviderWebhookEventUseCase({
      uow: w.uow, clock: w.clock, events: w.eventsRepo, provider: w.provider, payments: w.paymentsRepo, locks: w.locks,
      appointments: w.appointmentReader, confirmation: w.confirmation, warn: (m) => w.warnings.push(m),
      refunds: {
        requestForUnconfirmablePayment: async (id: string) => {
          calls.unconfirmable.push(id);
          if (fail) {
            fail = false;
            throw new Error('BD caída');
          }
          return { outcome: 'created' as const, refund: null, action: null };
        },
        syncOpenForPayment: async (id: string) => (calls.sync.push(id), 0),
      },
    });
    return { processor, calls };
  }

  it('pago aprobado con la retención vencida: pide el reembolso total del pago (durable) y el evento queda procesado', async () => {
    const w = new World();
    w.now = new Date(T0.getTime() + 6 * 60_000);
    const { processor, calls } = withRefunds(w);
    const r = await w.receiver.execute(webhook());
    expect(await processor.execute(r.eventId)).toMatchObject({ outcome: 'processed', refundRequired: true });
    expect(calls.unconfirmable).toEqual([PAYMENT_ID]);
    expect(w.warnings.join()).toMatch(/reembolso total solicitado/);
  });

  it('webhook tardío de una cita ya completada (invalid_state): NO se pide reembolso', async () => {
    const w = new World();
    w.appointments.get('apt-1')!.status = 'completed';
    w.payments.set(PAYMENT_ID, { ...w.payment, status: 'succeeded', providerStatus: 'approved/accredited', providerFeeActual: money(2_536), netReceived: money(62_464), moneyReleaseDate: new Date('2026-11-28T12:00:00Z') });
    const { processor, calls } = withRefunds(w);
    const r = await w.receiver.execute(webhook());
    expect(await processor.execute(r.eventId)).toMatchObject({ outcome: 'processed', refundRequired: false, effect: { result: { result: 'not_confirmable', reason: 'invalid_state' } } });
    expect(calls.unconfirmable).toEqual([]);
  });

  it('si no se puede registrar el reembolso, el evento falla y el reintento lo vuelve a pedir (idempotente en reembolsos)', async () => {
    const w = new World();
    w.now = new Date(T0.getTime() + 6 * 60_000);
    const { processor, calls } = withRefunds(w, { failFirst: true });
    const r = await w.receiver.execute(webhook());
    expect(await processor.execute(r.eventId)).toMatchObject({ outcome: 'failed', reason: 'refund_request_failed' });
    expect(await processor.execute(r.eventId)).toMatchObject({ outcome: 'processed', refundRequired: true });
    expect(calls.unconfirmable).toEqual([PAYMENT_ID, PAYMENT_ID]);
  });

  it('webhook de un pago reembolsado: avanza los reembolsos abiertos de ese pago', async () => {
    const w = new World();
    w.payments.set(PAYMENT_ID, { ...w.payment, status: 'succeeded', providerStatus: 'approved/accredited', providerFeeActual: money(2_536), netReceived: money(62_464), moneyReleaseDate: new Date('2026-11-28T12:00:00Z') });
    w.appointments.get('apt-1')!.status = 'canceled';
    w.defaultSnapshot = () => w.snapshot('refunded', { providerStatus: 'refunded/refunded', refunded: money(65_000), providerFeeActual: money(2_536), netReceived: money(62_464), moneyReleaseDate: new Date('2026-11-28T12:00:00Z') });
    const { processor, calls } = withRefunds(w);
    const r = await w.receiver.execute(webhook());
    expect(await processor.execute(r.eventId)).toMatchObject({ outcome: 'processed', paymentStatus: 'refunded' });
    expect(calls.sync).toEqual([PAYMENT_ID]);
    expect(calls.unconfirmable).toEqual([]);
  });
});

describe('Webhooks · H-6 etapa 2: backoff, errores permanentes y avisos', () => {
  const unavailable = () => {
    throw new PaymentProviderError('unavailable', 'sin red');
  };

  it('[H6-E2-01] un evento dentro del periodo de espera no se reintenta; al superarlo, sí', async () => {
    const w = new World();
    w.providerBehaviour.push(async () => unavailable());
    const r = await w.receiver.execute(webhook());
    await w.drain();
    w.now = new Date(T0.getTime() + cumulativeBackoffMs(1) - 1_000);
    expect(await w.retry.execute()).toMatchObject({ examined: 0 });
    expect(w.event(r.eventId)).toMatchObject({ status: 'failed', processingAttempts: 1 });
    w.now = new Date(T0.getTime() + cumulativeBackoffMs(1) + 1_000);
    expect(await w.retry.execute()).toMatchObject({ examined: 1, processed: 1 });
  });

  it('[H6-E2-02] una caída breve ya no consume los 8 intentos: barridos cada minuto durante 10 minutos usan solo 4', async () => {
    const w = new World();
    w.defaultSnapshot = unavailable;
    // Retención amplia: esta prueba mide solo los reintentos (sin vencimiento de la cita).
    w.appointments.get('apt-1')!.paymentHoldExpiresAt = new Date(T0.getTime() + 24 * 3_600_000);
    const r = await w.receiver.execute(webhook());
    await w.drain();
    for (let minute = 1; minute <= 10; minute++) {
      w.now = new Date(T0.getTime() + minute * 60_000 + 1_000);
      await w.retry.execute();
    }
    // Intentos en los minutos 0, 1, 3 y 8 (esperas acumuladas 1, 3 y 8 min): quedan 4 para la recuperación.
    expect(w.event(r.eventId)).toMatchObject({ status: 'failed', processingAttempts: 4, lastError: 'provider:unavailable' });
    // Al volver el proveedor, el evento se recupera en su siguiente ventana.
    w.defaultSnapshot = () => w.snapshot('succeeded');
    w.now = new Date(T0.getTime() + cumulativeBackoffMs(4) + 1_000);
    expect(await w.retry.execute()).toMatchObject({ processed: 1 });
    expect(w.confirmations).toHaveLength(1);
  });

  it.each([
    ['provider:timeout', () => {
      throw new PaymentProviderError('timeout', 't');
    }],
    ['provider:unauthorized', () => {
      throw new PaymentProviderError('unauthorized', 'u');
    }],
    ['provider:unexpected_response', () => {
      throw new PaymentProviderError('unexpected_response', 'x');
    }],
  ])('[H6-E2-03] un error transitorio (%s) conserva sus oportunidades: sin aviso y vuelve a ser elegible', async (reason, fail) => {
    const w = new World();
    w.providerBehaviour.push(async () => fail());
    const r = await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason, permanent: false, exhausted: false });
    expect(w.alerts).toEqual([]);
    w.now = new Date(T0.getTime() + cumulativeBackoffMs(1) + 1_000);
    expect(await w.retry.execute()).toMatchObject({ examined: 1, processed: 1 });
    expect(w.event(r.eventId)).toMatchObject({ status: 'processed', processingAttempts: 2 });
  });

  it('[H6-E2-04] un error permanente no se reintenta en el barrido (no consume intentos) y deja un aviso identificable', async () => {
    const w = new World();
    w.appointments.get('apt-1')!.patientId = 'otro-paciente';
    const r = await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ outcome: 'failed', reason: 'appointment_mismatch:patient', permanent: true, exhausted: false });
    expect(w.alerts).toHaveLength(1);
    expect(w.alerts[0].startsWith(`${WEBHOOK_PERMANENT_FAILURE_TAG} evento de webhook ${r.eventId} `)).toBe(true);
    expect(w.alerts[0]).toMatch(/error permanente \(appointment_mismatch:patient\).*requiere revisión$/);
    for (const minutes of [5, 60, 24 * 60]) {
      w.now = new Date(T0.getTime() + minutes * 60_000);
      expect(await w.retry.execute()).toMatchObject({ examined: 0 });
    }
    expect(w.event(r.eventId)).toMatchObject({ status: 'failed', processingAttempts: 1 });
    expect(w.confirmations).toEqual([]);
  });

  it('[H6-E2-05] un conflicto permanente (importe distinto) tampoco se reintenta; uno transitorio de M08 sí', async () => {
    const w = new World();
    w.defaultSnapshot = () => w.snapshot('succeeded', { amount: money(1_000) });
    const r = await w.receiver.execute(webhook());
    expect((await w.drain())[0]).toMatchObject({ reason: 'conflict:importe distinto', permanent: true });
    w.now = new Date(T0.getTime() + 24 * 3_600_000);
    expect(await w.retry.execute()).toMatchObject({ examined: 0 });
    expect(w.event(r.eventId).processingAttempts).toBe(1);

    const m = new World();
    m.confirmFailures = 1;
    await m.receiver.execute(webhook());
    expect((await m.drain())[0]).toMatchObject({ reason: 'confirmation_failed', permanent: false });
    m.now = new Date(T0.getTime() + cumulativeBackoffMs(1) + 1_000);
    expect(await m.retry.execute()).toMatchObject({ processed: 1 });
  });

  it('[H6-E2-06] el barrido sigue recuperando los elegibles: received abandonado, failed fuera de espera y processing abandonado', async () => {
    const w = new World();
    const recv = await w.receiver.execute(webhook({ requestId: 'req-recv' }));
    w.dispatched.splice(0); // nunca se despachó
    w.now = new Date(T0.getTime() + 2 * 60_000);
    expect(await w.retry.execute()).toMatchObject({ examined: 1, processed: 1 });
    expect(w.event(recv.eventId).status).toBe('processed');
  });

  it('[H6-E2-07] el barrido pasa al repositorio la espera por intentos y la lista de permanentes', async () => {
    const w = new World();
    const seen: RetryableQuery[] = [];
    const original = w.eventsRepo.findRetryable;
    w.eventsRepo.findRetryable = async (q) => {
      seen.push(q);
      return original(q);
    };
    await w.retry.execute();
    expect(seen[0].failedReceivedBefore).toHaveLength(WEBHOOK_MAX_ATTEMPTS);
    expect(seen[0].failedReceivedBefore![1].getTime()).toBe(T0.getTime() - cumulativeBackoffMs(1));
    expect(seen[0].failedReceivedBefore![7].getTime()).toBe(T0.getTime() - cumulativeBackoffMs(7));
    expect(seen[0].excludeFailures).toBe(PERMANENT_WEBHOOK_FAILURES);
  });
});
