import { AsyncLocalStorage } from 'async_hooks';
import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import type { ConfirmationResult } from '../../../appointments/application/integration/appointment-integration.services';
import { money } from '../../domain/money';
import type { PaymentStatus } from '../../domain/payment-status';
import type { RefundStatus } from '../../domain/refund';
import type { AppointmentForPayment } from '../ports/appointment-payment.reader';
import { PaymentProviderError, type ProviderPaymentSnapshot } from '../ports/payment-provider.port';
import type { IdempotencyKeyRecord, PaymentProviderUpdate, PaymentRecord } from '../ports/payments.repositories';
import type { CreateProviderRefund, NewRefundRecord, ProviderRefundSnapshot, RefundRecord, RefundUpdate } from '../ports/refunds.port';
import { IdempotencyKeyConflictError } from '../payments-use-case.errors';
import { PaymentNotRefundableError, RefundApprovalError, RefundExceedsAvailableError } from '../refunds.errors';
import { AppointmentCanceledRefundHandler, noticeFromCanceledEvent } from './appointment-canceled-refund.handler';
import { auditedHoursBefore, CanceledAppointmentFeedService, type CanceledAppointmentAuditRow } from '../../../appointments/application/integration/canceled-appointment-feed';
import { CancellationFeedStalledError, ReconcileCanceledAppointmentRefundsUseCase } from './reconcile-canceled-appointment-refunds.use-case';
import { AppointmentNoShowRefundHandler, noticeFromOutcomeEvent, noticeFromOutcomeFeed } from './appointment-no-show-refund.handler';
import { ReconcileNoShowRefundsUseCase } from './reconcile-no-show-refunds.use-case';
import type { OutcomeRecordedNotice } from '../../../appointments/application/integration/outcome-recorded-feed';
import { confirmCapturedPayment } from './payment-appointment-identity';
import {
  REFUND_CREATE_SCOPE,
  REFUND_IN_FLIGHT_MS,
  REFUND_RECOVERY_IDLE_MS,
  REFUND_RESUBMIT_WINDOW_MS,
  RefundsUseCases,
  type RequestRefundInput,
} from './refunds.use-cases';

// F5 · INTEGRACIÓN SIMULADA: casos de uso reales con dobles en memoria de la base de datos, Mercado Pago y M08. NO hay
// PostgreSQL ni sandbox: no demuestran la integración real. Los dobles reproducen lo que importa de 0017:
// - refund_guard: alta en requested solo sobre un pago succeeded/partially_refunded, prorrata exacta, transiciones,
//   datos fijados una vez, parciales con approved_by y succeeded con referencia y fecha;
// - refund_within_payment (acumulado activo ≤ pago), refund_payment_error_uq e idempotency_key_uq;
// - el bloqueo FOR UPDATE del pago y el rollback de la transacción.
// Mercado Pago: la misma X-Idempotency-Key devuelve el mismo reembolso (no reembolsa dos veces).

const PAYMENT_ID = '00000000-0000-4000-8000-000000000001';
const MP_PAYMENT = '987654321';
const T0 = new Date('2026-11-20T12:00:00Z');
const ADMIN = 'admin-user-1';

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
interface Tx { undo: (() => void)[]; releases: (() => void)[] }
const TRANSITIONS: Record<RefundStatus, RefundStatus[]> = { requested: ['pending', 'canceled'], pending: ['processing', 'canceled', 'failed'], processing: ['succeeded', 'failed'], succeeded: [], failed: [], canceled: [] };
const ACTIVE = (s: RefundStatus) => s !== 'failed' && s !== 'canceled';

function paymentRecord(over: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: PAYMENT_ID, type: 'consultation', provider: 'mercado_pago', providerPaymentId: MP_PAYMENT, providerStatus: 'approved/accredited', status: 'succeeded',
    patientId: 'pat-1', doctorId: 'doc-1', appointmentId: 'apt-1', medicationOrderId: null, gross: money(65_000), peiFeeConfigurationId: 'fee-1',
    peiFixedFee: money(10_000), doctorNet: money(55_000), processorFeeScheduleId: 'sch-1', providerFeeEstimated: money(2_869),
    providerFeeActual: money(2_536), netReceived: money(62_464), moneyReleaseDate: null, feeReconciledAt: null, createdAt: T0, updatedAt: T0, ...over,
  };
}

class World {
  now = T0;
  clock = { now: () => this.now };
  tx = new AsyncLocalStorage<Tx>();
  payments = new Map<string, PaymentRecord>([[PAYMENT_ID, paymentRecord()]]);
  paymentLocks = new Map<string, Mutex>();
  refunds = new Map<string, RefundRecord>();
  keys = new Map<string, IdempotencyKeyRecord>();
  seq = 0;
  warnings: string[] = [];
  // Mercado Pago simulado: reembolsos por clave de idempotencia y comportamiento programable.
  mpByKey = new Map<string, ProviderRefundSnapshot>();
  mpSeq = 100;
  createCalls: CreateProviderRefund[] = [];
  getCalls: string[] = [];
  createBehaviour: ((r: CreateProviderRefund) => Promise<ProviderRefundSnapshot>)[] = [];
  getBehaviour: ((id: string) => Promise<ProviderRefundSnapshot>)[] = [];
  createStatus: ProviderRefundSnapshot['status'] = 'succeeded';
  paymentQueries = 0;

  private undoable(apply: () => void, undo: () => void) {
    apply();
    this.tx.getStore()?.undo.push(undo);
  }

  uow = {
    runInTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
      const tx: Tx = { undo: [], releases: [] };
      try {
        return await this.tx.run(tx, work);
      } catch (e) {
        for (const u of tx.undo.reverse()) u(); // ROLLBACK
        throw e;
      } finally {
        tx.releases.forEach((r) => r());
      }
    },
  };

  locks = {
    lockById: async (id: string) => {
      const tx = this.tx.getStore();
      if (!tx) throw new Error('lockById fuera de transacción');
      if (!this.paymentLocks.has(id)) this.paymentLocks.set(id, new Mutex());
      tx.releases.push(await this.paymentLocks.get(id)!.acquire());
      return this.payments.has(id) ? { ...this.payments.get(id)! } : null;
    },
  };

  paymentsRepo = {
    findById: async (id: string) => (this.payments.has(id) ? { ...this.payments.get(id)! } : null),
    update: async (id: string, u: PaymentProviderUpdate) => {
      const prev = this.payments.get(id)!;
      this.undoable(() => this.payments.set(id, { ...prev, ...u } as PaymentRecord), () => this.payments.set(id, prev));
    },
  };

  keysRepo = {
    find: async (scope: string, key: string) => this.keys.get(`${scope}|${key}`) ?? null,
    insert: async (r: { scope: string; key: string; requestHash: string; paymentId: string; refundId?: string; createdAt: Date }) => {
      const k = `${r.scope}|${r.key}`;
      if (this.keys.has(k)) throw new UniqueConstraintViolationError({ code: '23505', constraint: 'idempotency_key_uq', table: 'idempotency_key' });
      this.undoable(() => this.keys.set(k, { ...r, refundId: r.refundId ?? null, completedAt: null }), () => this.keys.delete(k));
    },
    complete: async () => undefined,
  };

  refundsRepo = {
    insert: async (r: NewRefundRecord) => {
      const p = this.payments.get(r.paymentId)!;
      // refund_guard (alta) y refund_within_payment, con fórmulas propias de la prueba.
      if (!['succeeded', 'partially_refunded'].includes(p.status)) throw new Error(`refund_guard: pago ${p.status}`);
      const active = [...this.refunds.values()].filter((x) => x.paymentId === r.paymentId && ACTIVE(x.status));
      const prevAmount = active.reduce((c, x) => c + x.amount.cents, 0);
      const prevPei = active.reduce((c, x) => c + x.peiFeeShare.cents, 0);
      if (prevAmount + r.amount.cents > p.gross.cents) throw new Error('refund_within_payment: excede el pago');
      const peiCum = Math.round(((prevAmount + r.amount.cents) * p.peiFixedFee!.cents) / p.gross.cents);
      if (r.peiFeeShare.cents !== peiCum - prevPei || r.doctorShare.cents !== r.amount.cents - (peiCum - prevPei)) throw new Error('refund_guard: prorrata');
      if (r.reason === 'payment_error' && active.some((x) => x.reason === 'payment_error')) {
        throw new UniqueConstraintViolationError({ code: '23505', constraint: 'refund_payment_error_uq', table: 'refund' });
      }
      const row: RefundRecord = {
        ...r, status: 'requested', providerRefundId: null, providerStatus: null, providerFeeReturned: null, unrecoveredProviderFee: null,
        processedAt: null, failureReason: null, createdAt: r.requestedAt, updatedAt: r.requestedAt,
      };
      this.undoable(() => this.refunds.set(r.id, row), () => this.refunds.delete(r.id));
    },
    findById: async (id: string) => (this.refunds.has(id) ? { ...this.refunds.get(id)! } : null),
    lockById: async (id: string) => (this.refunds.has(id) ? { ...this.refunds.get(id)! } : null),
    listByPayment: async (paymentId: string) => [...this.refunds.values()].filter((r) => r.paymentId === paymentId).map((r) => ({ ...r })),
    update: async (id: string, expected: RefundStatus, c: RefundUpdate) => {
      const prev = this.refunds.get(id)!;
      if (prev.status !== expected) return false;
      const next = { ...prev, ...c } as RefundRecord;
      // refund_guard (cambios).
      if (next.status !== prev.status && !TRANSITIONS[prev.status].includes(next.status)) throw new Error(`refund_guard: ${prev.status} → ${next.status}`);
      for (const f of ['providerRefundId', 'approvedBy', 'processedAt'] as const) {
        if (prev[f] !== null && c[f] !== undefined && c[f] !== prev[f]) throw new Error(`refund_guard: ${f} fijado`);
      }
      const gross = this.payments.get(prev.paymentId)!.gross;
      if (next.amount.cents < gross.cents && !['requested', 'canceled'].includes(next.status) && next.approvedBy === null) throw new Error('refund_guard: parcial sin aprobación');
      if (next.status === 'succeeded' && (!next.providerRefundId || !next.processedAt)) throw new Error('refund_succeeded_reference_chk');
      this.undoable(() => this.refunds.set(id, next), () => this.refunds.set(id, prev));
      return true;
    },
    findRecoverable: async (q: { idleBefore: Date; limit: number }) =>
      [...this.refunds.values()]
        .filter((r) => r.updatedAt < q.idleBefore && (['pending', 'processing'].includes(r.status) || (r.status === 'requested' && (r.approvedBy !== null || r.amount.cents === this.payments.get(r.paymentId)!.gross.cents))))
        .slice(0, q.limit).map((r) => r.id),
  };

  mpRefund(r: CreateProviderRefund, status = this.createStatus): ProviderRefundSnapshot {
    const gross = [...this.payments.values()].find((p) => p.providerPaymentId === r.providerPaymentId)!.gross;
    return { provider: 'mercado_pago', providerRefundId: String(++this.mpSeq), providerPaymentId: r.providerPaymentId, providerStatus: { succeeded: 'approved', processing: 'in_process', failed: 'rejected' }[status], status, amount: r.amount ?? gross };
  }

  provider = {
    name: 'mercado_pago' as const,
    createRefund: async (r: CreateProviderRefund) => {
      this.createCalls.push(r);
      const custom = this.createBehaviour.shift();
      if (custom) return custom(r);
      // Idempotencia de Mercado Pago: misma clave → mismo reembolso.
      if (!this.mpByKey.has(r.idempotencyKey)) this.mpByKey.set(r.idempotencyKey, this.mpRefund(r));
      return { ...this.mpByKey.get(r.idempotencyKey)! };
    },
    getRefund: async (_p: string, id: string) => {
      this.getCalls.push(id);
      const custom = this.getBehaviour.shift();
      if (custom) return custom(id);
      return { ...[...this.mpByKey.values()].find((x) => x.providerRefundId === id)! };
    },
  };

  // Estado del pago en Mercado Pago según lo reembolsado (approved → partially_refunded / refunded).
  paymentProvider = {
    getPayment: async (id: string): Promise<ProviderPaymentSnapshot> => {
      this.paymentQueries += 1;
      const p = [...this.payments.values()].find((x) => x.providerPaymentId === id)!;
      const refunded = [...this.mpByKey.values()].filter((x) => x.providerPaymentId === id && x.status === 'succeeded').reduce((c, x) => c + x.amount.cents, 0);
      const status: PaymentStatus = refunded === 0 ? 'succeeded' : refunded >= p.gross.cents ? 'refunded' : 'partially_refunded';
      return { provider: 'mercado_pago', providerPaymentId: id, providerStatus: status === 'refunded' ? 'refunded/refunded' : 'approved/accredited', status, externalReference: p.id, amount: p.gross, refunded: money(refunded), providerFeeActual: p.providerFeeActual, netReceived: p.netReceived, moneyReleaseDate: null };
    },
  };

  useCases = new RefundsUseCases({
    uow: this.uow, clock: this.clock, payments: this.paymentsRepo, locks: this.locks, refunds: this.refundsRepo, keys: this.keysRepo,
    provider: this.provider, paymentProvider: this.paymentProvider, ids: { newId: () => `00000000-0000-4000-9000-${String(++this.seq).padStart(12, '0')}` },
    warn: (m) => this.warnings.push(m),
  });

  get payment() {
    return this.payments.get(PAYMENT_ID)!;
  }
  list() {
    return [...this.refunds.values()];
  }
  succeededCents() {
    return this.list().filter((r) => r.status === 'succeeded').reduce((c, r) => c + r.amount.cents, 0);
  }
  advance(ms: number) {
    this.now = new Date(this.now.getTime() + ms);
  }
}

const req = (over: Partial<RequestRefundInput> = {}): RequestRefundInput => ({
  scope: REFUND_CREATE_SCOPE, key: 'admin-req-0001', paymentId: PAYMENT_ID, amount: { kind: 'full' }, reason: 'exceptional_refund',
  requestedBy: { type: 'admin', userProfileId: ADMIN }, ...over,
});
const partial = (cents: number, key: string, approvedBy: string | null = ADMIN) => req({ key, amount: { kind: 'partial', amount: money(cents) }, approvedBy });
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

// ---------------------------------------------------------------------------------------------------------------------

describe('Reembolsos · total y parcial', () => {
  it('reembolso total: X-Idempotency-Key = id del reembolso, sin importe (total), succeeded solo con approved y el pago pasa a refunded', async () => {
    const w = new World();
    const r = await w.useCases.requestRefund(req());
    expect(r).toMatchObject({ outcome: 'created', action: 'submitted', refund: { status: 'succeeded', amount: '650.00', peiFeeShare: '100.00', doctorShare: '550.00', providerStatus: 'approved' } });
    expect(w.createCalls).toEqual([{ providerPaymentId: MP_PAYMENT, idempotencyKey: r.refund!.refundId, amount: null }]);
    expect(w.list()[0]).toMatchObject({ providerRefundId: '101', processedAt: T0, approvedBy: null });
    expect(w.payment.status).toBe('refunded');
  });

  it('reembolso parcial aprobado en la solicitud: se envía el importe exacto y el pago queda partially_refunded', async () => {
    const w = new World();
    const r = await w.useCases.requestRefund(partial(10_000, 'admin-req-0002'));
    expect(r).toMatchObject({ action: 'submitted', refund: { status: 'succeeded', amount: '100.00', peiFeeShare: '15.38', doctorShare: '84.62', approvedBy: ADMIN } });
    expect(w.createCalls[0].amount).toEqual(money(10_000));
    expect(w.payment.status).toBe('partially_refunded');
  });

  it('parcial sin aprobación: queda requested sin llamar al proveedor; aprobar lo envía; repetir la aprobación es idempotente', async () => {
    const w = new World();
    const r = await w.useCases.requestRefund(partial(10_000, 'admin-req-0003', null));
    expect(r).toMatchObject({ outcome: 'created', action: 'awaiting_approval', refund: { status: 'requested', awaitingApproval: true } });
    expect(w.createCalls).toEqual([]);
    expect(await w.useCases.recover()).toMatchObject({ examined: 0 }); // no avanza solo
    const a = await w.useCases.approveRefund(r.refund!.refundId, ADMIN);
    expect(a).toMatchObject({ action: 'submitted', refund: { status: 'succeeded', approvedBy: ADMIN } });
    expect((await w.useCases.approveRefund(r.refund!.refundId, ADMIN)).action).toBe('terminal');
    expect(w.createCalls).toHaveLength(1);
    await expect(w.useCases.approveRefund(r.refund!.refundId, 'otro-admin')).rejects.toBeInstanceOf(RefundApprovalError);
  });

  it('rechazar un parcial pendiente de aprobación lo cancela y libera su importe', async () => {
    const w = new World();
    const r = await w.useCases.requestRefund(partial(60_000, 'admin-req-0004', null));
    expect((await w.useCases.rejectRefund(r.refund!.refundId, 'no_procede')).refund.status).toBe('canceled');
    expect((await w.useCases.requestRefund(req({ key: 'admin-req-0005' }))).refund!.status).toBe('succeeded');
  });

  it('un reembolso total no admite aprobación (no es parcial)', async () => {
    const w = new World();
    const r = await w.useCases.requestRefund(req());
    await expect(w.useCases.approveRefund(r.refund!.refundId, ADMIN)).rejects.toMatchObject({ reason: 'not_partial' });
  });
});

describe('Reembolsos · importes y acumulados', () => {
  it('importe superior al disponible: error sin crear nada', async () => {
    const w = new World();
    await expect(w.useCases.requestRefund(partial(65_001, 'admin-req-0010'))).rejects.toBeInstanceOf(RefundExceedsAvailableError);
    expect(w.list()).toEqual([]);
  });

  it('acumulados: parciales que suman el pago; uno más es rechazado; la prorrata suma exactamente F y N', async () => {
    const w = new World();
    for (const [i, cents] of [20_000, 20_000, 25_000].entries()) await w.useCases.requestRefund(partial(cents, `admin-req-002${i}`));
    expect(w.succeededCents()).toBe(65_000);
    expect(w.list().reduce((c, r) => c + r.peiFeeShare.cents, 0)).toBe(10_000);
    expect(w.list().reduce((c, r) => c + r.doctorShare.cents, 0)).toBe(55_000);
    expect(w.payment.status).toBe('refunded');
    await expect(w.useCases.requestRefund(partial(1, 'admin-req-0029'))).rejects.toBeInstanceOf(PaymentNotRefundableError);
  });

  it('un reembolso en curso cuenta para el disponible (aunque no haya terminado)', async () => {
    const w = new World();
    w.createStatus = 'processing';
    await w.useCases.requestRefund(partial(60_000, 'admin-req-0030'));
    await expect(w.useCases.requestRefund(partial(5_001, 'admin-req-0031'))).rejects.toMatchObject({ available: '50.00' });
  });

  it('"total" con reembolsos previos supera el disponible; un reembolso fallido no cuenta', async () => {
    const w = new World();
    w.createBehaviour.push(async () => {
      throw new PaymentProviderError('rejected_request', 'rechazado', 400, '2063');
    });
    const failed = await w.useCases.requestRefund(partial(10_000, 'admin-req-0040'));
    expect(failed).toMatchObject({ action: 'rejected', refund: { status: 'failed', failureReason: 'provider:rejected_request:2063' } });
    expect((await w.useCases.requestRefund(req({ key: 'admin-req-0041' }))).refund!.status).toBe('succeeded');
    await expect(w.useCases.requestRefund(req({ key: 'admin-req-0042' }))).rejects.toBeInstanceOf(PaymentNotRefundableError);
  });

  it('pago no reembolsable (pendiente, en disputa) o de otro tipo', async () => {
    for (const status of ['pending', 'processing', 'in_dispute', 'charged_back'] as const) {
      const w = new World();
      w.payments.set(PAYMENT_ID, paymentRecord({ status }));
      await expect(w.useCases.requestRefund(req())).rejects.toBeInstanceOf(PaymentNotRefundableError);
      expect(w.createCalls).toEqual([]);
    }
  });
});

describe('Reembolsos · idempotencia, duplicados y concurrencia', () => {
  it('solicitud duplicada (misma clave): mismo reembolso, sin otro envío; otra solicitud con la misma clave es conflicto', async () => {
    const w = new World();
    const a = await w.useCases.requestRefund(req());
    const b = await w.useCases.requestRefund(req());
    expect(b).toMatchObject({ outcome: 'existing', action: 'terminal', refund: { refundId: a.refund!.refundId } });
    expect(w.list()).toHaveLength(1);
    expect(w.createCalls).toHaveLength(1);
    await expect(w.useCases.requestRefund(partial(100, 'admin-req-0001'))).rejects.toBeInstanceOf(IdempotencyKeyConflictError);
  });

  it('dos solicitudes simultáneas con la misma clave: un solo reembolso', async () => {
    const w = new World();
    const [a, b] = await Promise.all([w.useCases.requestRefund(req()), w.useCases.requestRefund(req())]);
    expect(a.refund!.refundId).toBe(b.refund!.refundId);
    expect(w.list()).toHaveLength(1);
    expect(w.succeededCents()).toBe(65_000);
  });

  it('dos parciales simultáneos distintos que juntos superan el pago: el bloqueo del pago serializa y solo uno pasa', async () => {
    const w = new World();
    const results = await Promise.allSettled([w.useCases.requestRefund(partial(40_000, 'admin-req-0050')), w.useCases.requestRefund(partial(40_000, 'admin-req-0051'))]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(RefundExceedsAvailableError);
    expect(w.list()).toHaveLength(1);
  });

  it('muchas solicitudes concurrentes del saldo: nunca se reembolsa más que el pago', async () => {
    const w = new World();
    await Promise.allSettled(Array.from({ length: 6 }, (_, i) => w.useCases.requestRefund(req({ key: `admin-rem-${i}`, amount: { kind: 'remaining' } }))));
    expect(w.succeededCents()).toBe(65_000);
    expect(w.list().filter((r) => r.status !== 'failed')).toHaveLength(1);
  });

  it('un error al registrar la clave revierte el reembolso (rollback)', async () => {
    const w = new World();
    const original = w.keysRepo.insert;
    w.keysRepo.insert = async () => {
      throw new Error('conexión perdida');
    };
    await expect(w.useCases.requestRefund(req())).rejects.toThrow('conexión perdida');
    expect(w.list()).toEqual([]);
    w.keysRepo.insert = original;
    expect((await w.useCases.requestRefund(req())).refund!.status).toBe('succeeded');
  });
});

describe('Reembolsos · respuestas del proveedor, reintentos y recuperación', () => {
  it('respuesta pendiente (in_process): processing con el id del proveedor, nunca succeeded; la sincronización aplica el estado real', async () => {
    const w = new World();
    w.createStatus = 'processing';
    const r = await w.useCases.requestRefund(req());
    expect(r.refund).toMatchObject({ status: 'processing', providerRefundId: '101', providerStatus: 'in_process', processedAt: null });
    expect(w.payment.status).toBe('succeeded');
    // Sigue en proceso.
    expect((await w.useCases.advance(r.refund!.refundId)).refund.status).toBe('processing');
    // El proveedor lo aprueba.
    w.mpByKey.set(r.refund!.refundId, { ...w.mpByKey.get(r.refund!.refundId)!, status: 'succeeded', providerStatus: 'approved' });
    w.advance(REFUND_RECOVERY_IDLE_MS + 1);
    expect(await w.useCases.recover()).toEqual({ examined: 1, byAction: { synced: 1 } });
    expect(w.list()[0]).toMatchObject({ status: 'succeeded', providerStatus: 'approved' });
    expect(w.payment.status).toBe('refunded');
    expect(w.createCalls).toHaveLength(1);
  });

  it('el proveedor rechaza después de aceptarlo: processing → failed, el importe queda disponible otra vez', async () => {
    const w = new World();
    w.createStatus = 'processing';
    const r = await w.useCases.requestRefund(req());
    w.getBehaviour.push(async (id) => ({ ...w.mpByKey.get(r.refund!.refundId)!, providerRefundId: id, status: 'failed', providerStatus: 'rejected' }));
    expect((await w.useCases.advance(r.refund!.refundId)).refund).toMatchObject({ status: 'failed', failureReason: 'provider_status:rejected' });
    expect(w.payment.status).toBe('succeeded');
  });

  it('respuesta fallida definitiva (4xx o pago inexistente): failed sin reintentar', async () => {
    for (const kind of ['rejected_request', 'not_found'] as const) {
      const w = new World();
      w.createBehaviour.push(async () => {
        throw new PaymentProviderError(kind, 'x', kind === 'not_found' ? 404 : 400);
      });
      const r = await w.useCases.requestRefund(req());
      expect(r).toMatchObject({ action: 'rejected', refund: { status: 'failed' } });
      w.advance(REFUND_RECOVERY_IDLE_MS + 1);
      expect(await w.useCases.recover()).toMatchObject({ examined: 0 });
    }
  });

  it.each(['unavailable', 'timeout', 'unexpected_response', 'unauthorized'] as const)('error recuperable (%s): queda pending y el reintento usa la MISMA clave', async (kind) => {
    const w = new World();
    w.createBehaviour.push(async () => {
      throw new PaymentProviderError(kind, 'x');
    });
    const r = await w.useCases.requestRefund(req());
    expect(r).toMatchObject({ action: 'retry_later', refund: { status: 'pending', providerRefundId: null } });
    w.advance(REFUND_RECOVERY_IDLE_MS + 1);
    expect(await w.useCases.recover()).toEqual({ examined: 1, byAction: { submitted: 1 } });
    expect(w.createCalls.map((c) => c.idempotencyKey)).toEqual([r.refund!.refundId, r.refund!.refundId]);
    expect(w.list()[0].status).toBe('succeeded');
  });

  it('respuesta perdida tras crearse en el proveedor: el reenvío con la misma clave no reembolsa dos veces', async () => {
    const w = new World();
    w.createBehaviour.push(async (r) => {
      w.mpByKey.set(r.idempotencyKey, w.mpRefund(r)); // Mercado Pago sí lo creó…
      throw new PaymentProviderError('timeout', 'sin respuesta'); // …pero la respuesta se perdió.
    });
    const r = await w.useCases.requestRefund(req());
    expect(r.refund!.status).toBe('pending');
    // Inmediatamente después: el envío podría seguir en curso en otro proceso → no se reenvía.
    expect((await w.useCases.requestRefund(req())).action).toBe('in_flight');
    w.advance(REFUND_IN_FLIGHT_MS + 1);
    const again = await w.useCases.requestRefund(req()); // reintento del cliente con la misma clave
    expect(again).toMatchObject({ outcome: 'existing', refund: { status: 'succeeded', providerRefundId: '101' } });
    expect(w.mpByKey.size).toBe(1);
  });

  it('interrupción tras registrar (requested) o tras pasar a pending: la recuperación lo completa', async () => {
    const w = new World();
    // El proceso cayó justo después del COMMIT del alta: se simula dejando el reembolso en requested.
    const advance = w.useCases.advance.bind(w.useCases);
    w.useCases.advance = async () => {
      throw new Error('proceso detenido');
    };
    await expect(w.useCases.requestRefund(req())).rejects.toThrow('proceso detenido');
    w.useCases.advance = advance;
    expect(w.list()[0].status).toBe('requested');
    w.advance(REFUND_RECOVERY_IDLE_MS + 1);
    expect(await w.useCases.recover()).toEqual({ examined: 1, byAction: { submitted: 1 } });
    expect(w.list()[0].status).toBe('succeeded');
    // Un parcial sin aprobación NO lo recoge la recuperación.
    const w2 = new World();
    await w2.useCases.requestRefund(partial(100, 'admin-req-0060', null));
    w2.advance(REFUND_RECOVERY_IDLE_MS + 1);
    expect(await w2.useCases.recover()).toMatchObject({ examined: 0 });
  });

  it('fuera de la ventana segura de reenvío: no se reenvía (posible clave caducada) y queda para revisión manual', async () => {
    const w = new World();
    w.createBehaviour.push(async () => {
      throw new PaymentProviderError('unavailable', 'x');
    });
    const r = await w.useCases.requestRefund(req());
    w.advance(REFUND_RESUBMIT_WINDOW_MS + 1);
    expect(await w.useCases.recover()).toEqual({ examined: 1, byAction: { manual_review: 1 } });
    expect(w.createCalls).toHaveLength(1);
    expect(w.list()[0].status).toBe('pending');
    expect(w.warnings.join()).toMatch(/revisión manual/);
    expect((await w.useCases.getRefund(r.refund!.refundId)).status).toBe('pending');
  });

  it('respuesta incoherente del proveedor (otro importe u otro pago): no se aplica y queda para revisión', async () => {
    const w = new World();
    w.createBehaviour.push(async (r) => ({ ...w.mpRefund(r), amount: money(1) }));
    const r = await w.useCases.requestRefund(req());
    expect(r).toMatchObject({ action: 'manual_review', refund: { status: 'pending', providerRefundId: null } });
  });

  it('dos recuperaciones simultáneas del mismo reembolso: un solo id del proveedor y sin errores', async () => {
    const w = new World();
    w.createBehaviour.push(async () => {
      throw new PaymentProviderError('timeout', 'x');
    });
    const r = await w.useCases.requestRefund(req());
    w.advance(REFUND_RECOVERY_IDLE_MS + 1);
    // Ambos leen pending fuera de la ventana «en curso» antes de que ninguno reciba respuesta.
    const gate = deferred<void>();
    const original = w.provider.createRefund;
    w.provider.createRefund = async (x) => {
      await gate.promise;
      return original(x);
    };
    const both = Promise.all([w.useCases.advance(r.refund!.refundId), w.useCases.advance(r.refund!.refundId)]);
    gate.resolve();
    const results = await both;
    expect(results.map((x) => x.refund.status)).toEqual(['succeeded', 'succeeded']);
    expect(w.mpByKey.size).toBe(1);
  });

  it('si falla la consulta del pago tras el reembolso, el reembolso exitoso se conserva', async () => {
    const w = new World();
    w.paymentProvider.getPayment = async () => {
      throw new PaymentProviderError('unavailable', 'x');
    };
    expect((await w.useCases.requestRefund(req())).refund!.status).toBe('succeeded');
    expect(w.payment.status).toBe('succeeded'); // lo actualizará el webhook de pago o la sincronización
    expect(w.warnings.join()).toMatch(/provider:unavailable/);
  });
});

describe('Reembolsos · comisión del proveedor y conciliación', () => {
  it('la comisión no se supone devuelta: se conserva la original y el neto posterior queda desconocido', async () => {
    const w = new World();
    await w.useCases.requestRefund(partial(10_000, 'admin-req-0070'));
    const { reconciliation, refunds } = await w.useCases.refundsForPayment(PAYMENT_ID);
    expect(refunds).toHaveLength(1);
    expect(reconciliation).toEqual({
      gross: money(65_000), refundedSucceeded: money(10_000), refundedInFlight: money(0), providerFeeActual: money(2_536),
      providerFeeReturned: null, netReceived: money(62_464), netAfterRefunds: null,
    });
    expect(w.list()[0]).toMatchObject({ providerFeeReturned: null, unrecoveredProviderFee: null });
    // Las reglas de comisión de PEI no cambian: la comisión fija se reparte a prorrata (refund_guard).
    expect(w.list()[0]).toMatchObject({ peiFeeShare: money(1_538), doctorShare: money(8_462) });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// M08: AppointmentCanceled y pago aprobado con cita no confirmable
// ---------------------------------------------------------------------------------------------------------------------

// Ruta en memoria: el evento de M08 adaptado a la entrada común.
function canceled(over: Partial<{ appointmentId: string; canceledBy: 'patient' | 'doctor'; refundOutcome: 'full_refund' | 'no_refund' }> = {}) {
  return noticeFromCanceledEvent({
    type: 'AppointmentCanceled', appointmentId: over.appointmentId ?? 'apt-1', patientProfileId: 'pat-1', doctorProfileId: 'doc-1',
    occurredAt: T0.toISOString(), canceledBy: over.canceledBy ?? 'patient', reason: null, refundOutcome: over.refundOutcome ?? 'full_refund',
  });
}

type Lookup = (id: string) => Promise<{ paymentId: string; rootAppointmentId: string } | null>;
// RootPaymentLookup doble con la regla AP-27a: el pago capturado de consulta ligado a la raíz.
const capturedLookup = (w: World): Lookup => async (root) => {
  const p = [...w.payments.values()].find((x) => x.appointmentId === root && ['succeeded', 'partially_refunded', 'refunded', 'in_dispute', 'charged_back'].includes(x.status));
  return p ? { paymentId: p.id, rootAppointmentId: root } : null;
};

function handlerFor(w: World, ledger: Lookup = async () => ({ paymentId: PAYMENT_ID, rootAppointmentId: 'apt-1' }), rootPayments: Lookup = capturedLookup(w)) {
  return new AppointmentCanceledRefundHandler({
    ledger: { paymentForAppointment: ledger }, rootPayments: { paymentForRootAppointment: rootPayments }, payments: w.paymentsRepo, refunds: w.useCases,
    warn: (m) => w.warnings.push(m),
  });
}

describe('M08 · AppointmentCanceled', () => {
  it('pago aprobado sin reembolsos: reembolso total enviado; el motivo refleja quién cancela', async () => {
    const w = new World();
    const r = await handlerFor(w).handle(canceled({ canceledBy: 'doctor' }));
    expect(r).toMatchObject({ outcome: 'requested', action: 'submitted', refund: { status: 'succeeded', amount: '650.00', reason: 'doctor_cancellation' } });
    expect(w.list()[0]).toMatchObject({ requestedByType: 'doctor', requestedByUserProfileId: null });
  });

  it('no_refund (paciente fuera de plazo): no se reembolsa', async () => {
    const w = new World();
    expect(await handlerFor(w).handle(canceled({ refundOutcome: 'no_refund' }))).toEqual({ outcome: 'no_refund' });
    expect(w.list()).toEqual([]);
  });

  it('evento de cancelación duplicado: el mismo reembolso, nunca otro', async () => {
    const w = new World();
    const h = handlerFor(w);
    const [a, b] = await Promise.all([h.handle(canceled()), h.handle(canceled())]);
    const again = await h.handle(canceled());
    expect(w.list()).toHaveLength(1);
    expect([a, b, again].filter((x) => x.outcome === 'requested')).toHaveLength(1);
    // El concurrente vio la clave ya registrada (existing); el tardío, el pago ya refunded.
    expect([a, b].map((x) => x.outcome).sort()).toEqual(['existing', 'requested']);
    expect(again).toEqual({ outcome: 'already_covered' });
    expect(w.succeededCents()).toBe(65_000);
  });

  it('cita reagendada: el reembolso se hace sobre el pago de la raíz (PaymentLedgerPort)', async () => {
    const w = new World();
    const asked: string[] = [];
    const r = await handlerFor(w, async (id) => (asked.push(id), { paymentId: PAYMENT_ID, rootAppointmentId: 'apt-1' })).handle(canceled({ appointmentId: 'apt-hija' }));
    expect(asked).toEqual(['apt-hija']);
    expect(r.outcome).toBe('requested');
  });

  it('pago con reembolso parcial previo: el saldo es un parcial y espera aprobación (PAY-17)', async () => {
    const w = new World();
    await w.useCases.requestRefund(partial(10_000, 'admin-req-0080'));
    const r = await handlerFor(w).handle(canceled());
    expect(r).toMatchObject({ outcome: 'requested', action: 'awaiting_approval', refund: { amount: '550.00', status: 'requested', awaitingApproval: true } });
    expect(w.createCalls).toHaveLength(1);
  });

  it('pago ya reembolsado del todo: nada que hacer', async () => {
    const w = new World();
    await w.useCases.requestRefund(req());
    expect(await handlerFor(w).handle(canceled())).toEqual({ outcome: 'already_covered' });
    expect(w.list()).toHaveLength(1);
  });

  it('reembolso ya solicitado o en proceso que cubre el pago: no se crea otro', async () => {
    const w = new World();
    w.createStatus = 'processing';
    await w.useCases.requestRefund(req());
    expect(await handlerFor(w).handle(canceled())).toEqual({ outcome: 'already_covered' });
    const w2 = new World();
    await w2.useCases.requestRefund(partial(65_000 - 1, 'admin-req-0081', null)); // requested, sin aprobar
    expect(await handlerFor(w2).handle(canceled())).toMatchObject({ outcome: 'requested', action: 'awaiting_approval', refund: { amount: '0.01' } });
    expect(w2.list()).toHaveLength(2);
  });

  it('cita sin pago capturado (p. ej. pago todavía pendiente): no hay reembolso y se registra la anomalía', async () => {
    const w = new World();
    w.payments.set(PAYMENT_ID, paymentRecord({ status: 'pending' }));
    expect(await handlerFor(w, async () => null).handle(canceled())).toEqual({ outcome: 'no_payment' });
    expect(w.warnings.join()).toMatch(/sin pago capturado/);
    expect(w.list()).toEqual([]);
  });

  it('pago en disputa: no se reembolsa automáticamente', async () => {
    const w = new World();
    w.payments.set(PAYMENT_ID, paymentRecord({ status: 'in_dispute' }));
    expect(await handlerFor(w).handle(canceled())).toEqual({ outcome: 'not_refundable', paymentStatus: 'in_dispute' });
  });
});

describe('Pago aprobado con cita no confirmable (CC-4, AP-8, C-29)', () => {
  const APPOINTMENT: AppointmentForPayment = { appointmentId: 'apt-1', patientId: 'pat-1', doctorId: 'doc-1', status: 'pending_payment', price: money(65_000), paymentHoldExpiresAt: null };
  const confirmDeps = (w: World, results: ConfirmationResult[]) => ({
    appointments: { findForPayment: async () => APPOINTMENT },
    confirmation: { confirmPaid: async () => results.shift() ?? results[0] ?? { result: 'not_confirmable' as const, reason: 'expired' as const } },
    refunds: w.useCases,
  });

  it('retención vencida: reembolso total una sola vez aunque lleguen webhooks duplicados o concurrentes', async () => {
    const w = new World();
    const nc: ConfirmationResult = { result: 'not_confirmable', reason: 'expired' };
    const deps = confirmDeps(w, [nc, nc, nc, nc]);
    await Promise.all([confirmCapturedPayment(deps, w.payment), confirmCapturedPayment(deps, w.payment)]);
    await confirmCapturedPayment(deps, w.payment);
    expect(w.list()).toHaveLength(1);
    expect(w.list()[0]).toMatchObject({ reason: 'payment_error', status: 'succeeded', requestedByType: 'system', amount: money(65_000) });
    expect(w.createCalls).toHaveLength(1);
  });

  it('importe distinto: también se reembolsa', async () => {
    const w = new World();
    await confirmCapturedPayment(confirmDeps(w, [{ result: 'not_confirmable', reason: 'amount_mismatch' }]), w.payment);
    expect(w.list()[0].reason).toBe('payment_error');
  });

  it('invalid_state (cita que ya se confirmó y cambió después): NO se reembolsa', async () => {
    const w = new World();
    await confirmCapturedPayment(confirmDeps(w, [{ result: 'not_confirmable', reason: 'invalid_state' }]), w.payment);
    expect(w.list()).toEqual([]);
  });

  it('recuperable: si el proveedor no responde queda pending y la recuperación lo termina; un nuevo webhook no duplica', async () => {
    const w = new World();
    w.createBehaviour.push(async () => {
      throw new PaymentProviderError('unavailable', 'x');
    });
    const deps = confirmDeps(w, [{ result: 'not_confirmable', reason: 'expired' }, { result: 'not_confirmable', reason: 'expired' }]);
    await confirmCapturedPayment(deps, w.payment);
    expect(w.list()[0].status).toBe('pending');
    w.advance(REFUND_IN_FLIGHT_MS + 1);
    await confirmCapturedPayment(deps, w.payment); // webhook repetido: reenvía el MISMO reembolso
    expect(w.list()).toHaveLength(1);
    expect(w.list()[0].status).toBe('succeeded');
    expect(new Set(w.createCalls.map((c) => c.idempotencyKey)).size).toBe(1);
  });

  it('si el reembolso fallido del proveedor se rechazó, un nuevo intento crea otro (el anterior ya no está activo)', async () => {
    const w = new World();
    w.createBehaviour.push(async () => {
      throw new PaymentProviderError('rejected_request', 'x', 400);
    });
    const deps = confirmDeps(w, [{ result: 'not_confirmable', reason: 'expired' }, { result: 'not_confirmable', reason: 'expired' }]);
    await confirmCapturedPayment(deps, w.payment);
    // La clave refund.payment_error ya apunta al fallido: se devuelve ese (decisión documentada; reintento manual).
    await confirmCapturedPayment(deps, w.payment);
    expect(w.list().map((r) => r.status)).toEqual(['failed']);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// A.25: barrido duradero de cancelaciones (CanceledAppointmentFeedService REAL de M08 con un lector doble) + F5.
// INTEGRACIÓN SIMULADA: ni PostgreSQL ni Mercado Pago reales.
// ---------------------------------------------------------------------------------------------------------------------

const auditUuid = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
const SCHEDULED_AT = new Date('2026-11-30T15:00:00Z');

// M08 simulado: lo que la transacción de cancelación persiste (fila de auditoría + cita) y la cadena de reagendamientos.
class M08Sim {
  rows: CanceledAppointmentAuditRow[] = [];
  chain: Record<string, string | null> = {};
  reads = 0;
  failNextRead = false;
  private n = 0;

  cancel(appointmentId: string, opts: { at?: Date; by?: 'patient' | 'doctor'; outcome?: string; from?: string | null; scheduledAt?: Date } = {}) {
    const at = opts.at ?? new Date(T0.getTime() + ++this.n * 1000);
    this.chain[appointmentId] = opts.from ?? null;
    const position = at.toISOString().replace('Z', '000Z');
    this.rows.push({
      auditId: auditUuid(this.rows.length + 1), position, auditCreatedAt: at, appointmentId,
      // Como la transacción de cancelación: hoursBefore con el mismo instante que cancelled_at y el historial con el
      // mismo now() que la auditoría.
      metadata: { actorType: opts.by ?? 'patient', refundOutcome: opts.outcome ?? 'full_refund', hoursBefore: auditedHoursBefore(opts.scheduledAt ?? SCHEDULED_AT, at) },
      canceledHistory: { count: 1, position },
      appointment: { status: 'canceled', scheduledAt: opts.scheduledAt ?? SCHEDULED_AT, cancelledAt: at, cancelledByType: opts.by ?? 'patient', rescheduledFromAppointmentId: opts.from ?? null, refundDeadlineHours: 24 },
    });
  }

  feed() {
    const key = (r: { position: string; auditId: string }) => `${r.position}|${r.auditId}`;
    return new CanceledAppointmentFeedService(
      {
        listAfter: async (after, limit) => {
          this.reads += 1;
          if (this.failNextRead) {
            this.failNextRead = false;
            throw new Error('lectura fallida');
          }
          return [...this.rows].sort((a, b) => key(a).localeCompare(key(b))).filter((r) => !after || key(r) > key(after)).slice(0, limit);
        },
      },
      { findById: async (id: string) => (id in this.chain ? ({ id, rescheduledFromAppointmentId: this.chain[id] } as never) : null) },
    );
  }
}

function sweep(w: World, m08: M08Sim) {
  const handler = handlerFor(w, async () => {
    throw new Error('la ruta duradera no usa PaymentLedgerPort: M08 ya resolvió la raíz');
  });
  return { handler, reconcile: new ReconcileCanceledAppointmentRefundsUseCase({ feed: m08.feed(), handler }) };
}

function addPayment(w: World, n: number) {
  const id = `00000000-0000-4000-8000-${String(100 + n).padStart(12, '0')}`;
  w.payments.set(id, paymentRecord({ id, appointmentId: `apt-${100 + n}`, providerPaymentId: String(900000000 + n) }));
  return { id, appointmentId: `apt-${100 + n}` };
}

describe('A.25 · barrido duradero de cancelaciones', () => {
  it('caída entre el COMMIT de M08 y el listener: el evento en memoria se perdió y el barrido registra el reembolso', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.cancel('apt-1'); // COMMIT de la cancelación; el proceso cae antes de despachar AppointmentCanceled
    const s = await sweep(w, m08).reconcile.execute();
    expect(s).toMatchObject({ complete: true, examined: 1, byOutcome: { requested: 1 }, anomalies: 0 });
    expect(w.list()).toEqual([expect.objectContaining({ reason: 'patient_cancellation', status: 'succeeded', amount: money(65_000) })]);
  });

  it('no_refund: no llama al manejador ni crea reembolsos', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.cancel('apt-1', { at: new Date('2026-11-30T05:00:00Z'), outcome: 'no_refund' }); // 10 h antes, plazo 24 h
    const { handler, reconcile } = sweep(w, m08);
    const spy = jest.spyOn(handler, 'handle');
    expect(await reconcile.execute()).toMatchObject({ examined: 1, byOutcome: { no_refund: 1 }, anomalies: 0 });
    expect(spy).not.toHaveBeenCalled();
    expect(w.list()).toEqual([]);
  });

  it('paginación: recorre todas las páginas y reembolsa cada cancelación una vez', async () => {
    const w = new World();
    const m08 = new M08Sim();
    const ps = [1, 2, 3, 4, 5].map((n) => addPayment(w, n));
    ps.forEach((p) => m08.cancel(p.appointmentId));
    const s = await sweep(w, m08).reconcile.execute({ pageSize: 2 });
    expect(s).toMatchObject({ pages: 3, examined: 5, byOutcome: { requested: 5 }, complete: true });
    expect(new Set(w.list().map((r) => r.paymentId))).toEqual(new Set(ps.map((p) => p.id)));
  });

  it('cancelaciones antiguas: se recuperan sin horizonte', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.cancel('apt-1', { at: new Date('2023-03-01T10:00:00Z'), scheduledAt: new Date('2023-03-10T10:00:00Z') });
    expect((await sweep(w, m08).reconcile.execute()).byOutcome).toEqual({ requested: 1 });
  });

  it('ruta rápida y barrido concurrentes: un solo reembolso y un solo reembolso creado en el proveedor', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.cancel('apt-1');
    const fast = handlerFor(w);
    const [event, s] = await Promise.all([fast.handle(canceled()), sweep(w, m08).reconcile.execute()]);
    expect(w.list()).toHaveLength(1);
    expect(w.mpByKey.size).toBe(1);
    expect(w.succeededCents()).toBe(65_000);
    const outcomes = [event.outcome, ...Object.keys(s.byOutcome)];
    expect(outcomes.filter((o) => o === 'requested')).toHaveLength(1);
  });

  it('cita reagendada y cancelada: el reembolso se hace sobre el pago de la raíz', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.chain['apt-1'] = null;
    m08.cancel('apt-2', { from: 'apt-1' });
    expect((await sweep(w, m08).reconcile.execute()).byOutcome).toEqual({ requested: 1 });
    expect(w.list()[0].paymentId).toBe(PAYMENT_ID);
  });

  it('cadena de varias citas: la raíz la resuelve M08 a través de toda la cadena', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.chain['apt-1'] = null;
    m08.chain['apt-2'] = 'apt-1';
    m08.cancel('apt-3', { from: 'apt-2' });
    expect((await sweep(w, m08).reconcile.execute()).byOutcome).toEqual({ requested: 1 });
    expect(w.list()[0].paymentId).toBe(PAYMENT_ID);
  });

  it('discrepancia entre auditoría y reglas: excluida como anomalía, sin reembolso', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.cancel('apt-1', { at: new Date('2026-11-30T05:00:00Z') }); // literal full_refund, pero las reglas dan no_refund
    const s = await sweep(w, m08).reconcile.execute();
    expect(s).toMatchObject({ examined: 0, anomalies: 1, anomalySample: [{ eventId: 'appointment-canceled:apt-1', reason: 'outcome_mismatch' }] });
    expect(w.list()).toEqual([]);
  });

  it('sin pago capturado: no_payment, sin reembolso y sin avisos caso por caso (D-3)', async () => {
    const w = new World();
    w.payments.set(PAYMENT_ID, paymentRecord({ status: 'pending' }));
    const m08 = new M08Sim();
    m08.cancel('apt-1');
    expect((await sweep(w, m08).reconcile.execute()).byOutcome).toEqual({ no_payment: 1 });
    expect(w.list()).toEqual([]);
    expect(w.warnings).toEqual([]);
  });

  it('reembolso parcial previo: el saldo queda esperando aprobación (PAY-17) y se cuenta', async () => {
    const w = new World();
    await w.useCases.requestRefund(partial(10_000, 'admin-req-0090'));
    const m08 = new M08Sim();
    m08.cancel('apt-1');
    const s = await sweep(w, m08).reconcile.execute();
    expect(s).toMatchObject({ byOutcome: { requested: 1 }, awaitingApproval: 1 });
    expect(w.list().map((r) => [r.amount.cents, r.status])).toEqual([[10_000, 'succeeded'], [55_000, 'requested']]);
  });

  it('reejecución del CLI: ninguna operación financiera se duplica', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.cancel('apt-1');
    const second = addPayment(w, 1);
    m08.cancel(second.appointmentId, { by: 'doctor' });
    const { reconcile } = sweep(w, m08);
    expect((await reconcile.execute()).byOutcome).toEqual({ requested: 2 });
    expect((await reconcile.execute()).byOutcome).toEqual({ already_covered: 2 });
    expect((await reconcile.execute()).byOutcome).toEqual({ already_covered: 2 });
    expect(w.list()).toHaveLength(2);
    expect(w.createCalls).toHaveLength(2);
  });

  it('caída a mitad del procesamiento: un error no detiene el barrido y la siguiente ejecución lo completa', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.cancel('apt-1');
    const other = addPayment(w, 2);
    m08.cancel(other.appointmentId);
    const original = w.locks.lockById;
    let failures = 1;
    w.locks.lockById = async (id: string) => {
      if (id === PAYMENT_ID && failures-- > 0) throw new Error('conexión perdida');
      return original(id);
    };
    const { reconcile } = sweep(w, m08);
    expect(await reconcile.execute()).toMatchObject({ complete: true, byOutcome: { error: 1, requested: 1 }, errorSample: ['appointment-canceled:apt-1 (Error)'] });
    expect((await reconcile.execute()).byOutcome).toEqual({ requested: 1, already_covered: 1 });
    expect(w.list()).toHaveLength(2);
  });

  it('caída después de registrar el reembolso y antes de la respuesta del proveedor: queda pending y se completa sin duplicar', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.cancel('apt-1');
    w.createBehaviour.push(async () => {
      throw new PaymentProviderError('timeout', 'x');
    });
    const { reconcile } = sweep(w, m08);
    expect((await reconcile.execute()).byOutcome).toEqual({ requested: 1 });
    expect(w.list()[0].status).toBe('pending');
    w.advance(REFUND_IN_FLIGHT_MS + 1);
    expect((await reconcile.execute()).byOutcome).toEqual({ existing: 1 });
    expect(w.list()).toEqual([expect.objectContaining({ status: 'succeeded' })]);
    expect(new Set(w.createCalls.map((c) => c.idempotencyKey)).size).toBe(1);
  });

  it('un error de lectura de M08 detiene el barrido sin avanzar; la siguiente ejecución lo hace completo', async () => {
    const w = new World();
    const m08 = new M08Sim();
    m08.cancel('apt-1');
    m08.failNextRead = true;
    const { reconcile } = sweep(w, m08);
    await expect(reconcile.execute()).rejects.toThrow('lectura fallida');
    expect((await reconcile.execute()).byOutcome).toEqual({ requested: 1 });
  });

  it('un cursor que no avanza se detecta (sin bucle infinito)', async () => {
    const stuck = { position: '2026-11-20T12:00:00.000000Z', auditId: auditUuid(1) };
    const reconcile = new ReconcileCanceledAppointmentRefundsUseCase({
      feed: { listCanceled: async () => ({ items: [], anomalies: [], next: stuck }) },
      handler: { handle: async () => ({ outcome: 'no_refund' as const }) },
    });
    await expect(reconcile.execute()).rejects.toBeInstanceOf(CancellationFeedStalledError);
  });

  it('límite de páginas: el resumen indica que el barrido quedó incompleto', async () => {
    const w = new World();
    const m08 = new M08Sim();
    [1, 2, 3].forEach((n) => m08.cancel(addPayment(w, n).appointmentId));
    expect(await sweep(w, m08).reconcile.execute({ pageSize: 1, maxPages: 2 })).toMatchObject({ complete: false, pages: 2 });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Videoconsulta (decisión 10): reembolso por inasistencia, con los mismos dobles. El flujo de cancelaciones no cambia.

type OutcomeStatusT = OutcomeRecordedNotice['status'];
const REFUND_BY_STATUS: Record<OutcomeStatusT, 'full_refund' | 'no_refund'> = { completed: 'no_refund', no_show_patient: 'no_refund', no_show_doctor: 'full_refund', no_show_both: 'full_refund' };
const outcomeEvent = (status: OutcomeStatusT = 'no_show_doctor', appointmentId = 'apt-1') => noticeFromOutcomeEvent({
  type: 'AppointmentOutcomeRecorded', appointmentId, patientProfileId: 'pat-1', doctorProfileId: 'doc-1', occurredAt: T0.toISOString(), status, refundOutcome: REFUND_BY_STATUS[status],
});
const outcomeNotice = (status: OutcomeStatusT = 'no_show_doctor', appointmentId = 'apt-1'): OutcomeRecordedNotice => ({
  version: 1, eventId: `appointment-outcome:${appointmentId}`, appointmentId, rootAppointmentId: 'apt-1', status, refundOutcome: REFUND_BY_STATUS[status], occurredAt: T0.toISOString(),
});
function noShowHandlerFor(w: World) {
  return new AppointmentNoShowRefundHandler({
    ledger: { paymentForAppointment: async () => ({ paymentId: PAYMENT_ID, rootAppointmentId: 'apt-1' }) }, rootPayments: { paymentForRootAppointment: capturedLookup(w) },
    payments: w.paymentsRepo, refunds: w.useCases, warn: (m) => w.warnings.push(m),
  });
}
const feedOf = (notices: OutcomeRecordedNotice[]) => ({ listOutcomes: async () => ({ items: notices, anomalies: [], next: null }) });

describe('Videoconsulta · reembolso por inasistencia (RN-025, RN-030)', () => {
  it.each(['no_show_doctor', 'no_show_both'] as const)('[TC-VID-170] %s: reembolso total del pago de la raíz, solicitado por el sistema', async (status) => {
    const w = new World();
    const r = await noShowHandlerFor(w).handle(outcomeEvent(status));
    expect(r).toMatchObject({ outcome: 'requested', action: 'submitted', refund: { status: 'succeeded', amount: '650.00', reason: status } });
    expect(w.list()[0]).toMatchObject({ requestedByType: 'system', requestedByUserProfileId: null });
  });

  it.each(['completed', 'no_show_patient'] as const)('[TC-VID-171] %s: sin reembolso', async (status) => {
    const w = new World();
    expect(await noShowHandlerFor(w).handle(outcomeEvent(status))).toEqual({ outcome: 'no_refund' });
    expect(w.list()).toEqual([]);
  });

  it('[TC-VID-172] el evento y el barrido simultáneos producen UN solo reembolso (misma clave y mismo hash)', async () => {
    const w = new World();
    const handler = noShowHandlerFor(w);
    const sweep = new ReconcileNoShowRefundsUseCase({ feed: feedOf([outcomeNotice()]), handler });
    const [event, summary] = await Promise.all([handler.handle(outcomeEvent()), sweep.execute()]);
    expect(w.list()).toHaveLength(1);
    expect(w.succeededCents()).toBe(65_000);
    expect(w.createCalls).toHaveLength(1);
    expect([event.outcome, Object.keys(summary.byOutcome)[0]].sort()).toEqual(['existing', 'requested']);
    // Repetir el barrido no hace nada más.
    expect((await sweep.execute()).byOutcome).toEqual({ already_covered: 1 });
    expect(w.list()).toHaveLength(1);
  });

  it('[TC-VID-177][huecos A2 y B2] repetir el evento no_show_doctor no crea un segundo reembolso', async () => {
    const w = new World();
    const handler = noShowHandlerFor(w);
    expect(await handler.handle(outcomeEvent('no_show_doctor'))).toMatchObject({ outcome: 'requested', refund: { amount: '650.00', reason: 'no_show_doctor' } });
    const again = await handler.handle(outcomeEvent('no_show_doctor'));
    expect(again.outcome).not.toBe('requested');
    expect(w.list()).toHaveLength(1);
    expect(w.createCalls).toHaveLength(1);
    expect(w.succeededCents()).toBe(65_000);
  });

  it('[TC-VID-173] un pago ya reembolsado por cancelación no se reembolsa otra vez por inasistencia', async () => {
    const w = new World();
    await handlerFor(w).handle(canceled({ canceledBy: 'doctor' }));
    expect(await noShowHandlerFor(w).handle(outcomeEvent('no_show_doctor'))).toEqual({ outcome: 'already_covered' });
    expect(w.list()).toHaveLength(1);
    expect(w.succeededCents()).toBe(65_000);
  });

  it('[TC-VID-174] con un parcial previo, el saldo queda pendiente de aprobación (PAY-17), igual que en cancelaciones', async () => {
    const w = new World();
    await w.useCases.requestRefund(partial(10_000, 'admin-req-0090'));
    expect(await noShowHandlerFor(w).handle(outcomeEvent('no_show_both'))).toMatchObject({ outcome: 'requested', action: 'awaiting_approval', refund: { amount: '550.00', reason: 'no_show_both' } });
  });

  it('[TC-VID-175] el barrido cuenta no_refund sin llamar al manejador y no se detiene por un error', async () => {
    const w = new World();
    const handled: string[] = [];
    const sweep = new ReconcileNoShowRefundsUseCase({
      feed: feedOf([outcomeNotice('completed', 'apt-a'), outcomeNotice('no_show_doctor', 'apt-b'), outcomeNotice('no_show_both', 'apt-c')]),
      handler: { handle: async (n) => (handled.push(n.appointmentId), n.appointmentId === 'apt-b' ? Promise.reject(new TypeError('x')) : noShowHandlerFor(w).handle(n)) },
    });
    const s = await sweep.execute();
    expect(handled).toEqual(['apt-b', 'apt-c']);
    expect(s).toMatchObject({ examined: 3, complete: true, byOutcome: { no_refund: 1, error: 1, requested: 1 } });
    expect(noticeFromOutcomeFeed(outcomeNotice()).source).toBe('feed');
  });
});
