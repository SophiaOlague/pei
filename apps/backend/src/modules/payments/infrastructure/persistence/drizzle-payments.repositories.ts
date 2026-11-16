import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { idempotencyKey, payment, peiFeeConfiguration, processorFeeSchedule } from '../../../../db/schema';
import { fromDecimalString, toDecimalString, type Money } from '../../domain/money';
import type { ProcessorFeeSnapshot } from '../../domain/payment-amounts';
import type { ProviderName } from '../../application/ports/payment-provider.port';
import type {
  FeeReconciliationQuery,
  FeeReconciliationReader,
  IdempotencyKeyRecord,
  IdempotencyKeyRepository,
  NewPaymentRecord,
  PaymentLockRepository,
  PaymentProviderUpdate,
  PaymentRecord,
  PaymentRepository,
  PeiFeeConfigurationRepository,
  PeiFeeVersion,
  ProcessorFeeScheduleRepository,
} from '../../application/ports/payments.repositories';

// Repositorios Drizzle de pagos (F2). Solo tablas y columnas de 0017. Los importes viajan como numeric (texto) y se
// convierten a centavos sin coma flotante. Respetan la transacción activa (getDbContext).

const dec = (m: Money) => toDecimalString(m);
const decOrNull = (m: Money | null | undefined) => (m ? toDecimalString(m) : null);
const moneyOrNull = (v: string | null) => (v === null ? null : fromDecimalString(v));

type PaymentRow = typeof payment.$inferSelect;

export function toPaymentRecord(r: PaymentRow): PaymentRecord {
  return {
    id: r.id,
    type: r.type,
    provider: r.provider,
    providerPaymentId: r.providerPaymentId,
    providerStatus: r.providerStatus,
    status: r.status,
    patientId: r.patientId,
    doctorId: r.doctorId,
    appointmentId: r.appointmentId,
    medicationOrderId: r.medicationOrderId,
    gross: fromDecimalString(r.amount),
    peiFeeConfigurationId: r.peiFeeConfigurationId,
    peiFixedFee: moneyOrNull(r.peiFixedFee),
    doctorNet: fromDecimalString(r.doctorNetAmount),
    processorFeeScheduleId: r.processorFeeScheduleId,
    providerFeeEstimated: fromDecimalString(r.providerFeeEstimated),
    providerFeeActual: moneyOrNull(r.providerFeeActual),
    netReceived: moneyOrNull(r.netReceivedAmount),
    moneyReleaseDate: r.moneyReleaseDate,
    feeReconciledAt: r.feeReconciledAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toPaymentInsert(r: NewPaymentRecord): typeof payment.$inferInsert {
  return {
    id: r.id,
    type: r.type,
    provider: r.provider,
    status: r.status,
    patientId: r.patientId,
    doctorId: r.doctorId,
    appointmentId: r.appointmentId,
    medicationOrderId: r.medicationOrderId,
    amount: dec(r.gross),
    currency: r.gross.currency,
    peiFeeConfigurationId: r.peiFeeConfigurationId,
    peiFixedFee: decOrNull(r.peiFixedFee),
    doctorNetAmount: dec(r.doctorNet),
    processorFeeScheduleId: r.processorFeeScheduleId,
    providerFeeEstimated: dec(r.providerFeeEstimated),
    createdAt: r.createdAt,
    updatedAt: r.createdAt,
  };
}

export function toPaymentUpdate(c: PaymentProviderUpdate): Partial<typeof payment.$inferInsert> {
  const set: Partial<typeof payment.$inferInsert> = { updatedAt: c.updatedAt };
  if (c.providerPaymentId !== undefined) set.providerPaymentId = c.providerPaymentId;
  if (c.providerStatus !== undefined) set.providerStatus = c.providerStatus;
  if (c.status !== undefined) set.status = c.status;
  if (c.providerFeeActual !== undefined) set.providerFeeActual = dec(c.providerFeeActual);
  if (c.netReceived !== undefined) set.netReceivedAmount = dec(c.netReceived);
  if (c.moneyReleaseDate !== undefined) set.moneyReleaseDate = c.moneyReleaseDate;
  if (c.feeReconciledAt !== undefined) set.feeReconciledAt = c.feeReconciledAt;
  return set;
}

@Injectable()
export class DrizzlePaymentRepository implements PaymentRepository, PaymentLockRepository, FeeReconciliationReader {
  async insert(record: NewPaymentRecord): Promise<void> {
    await getDbContext().insert(payment).values(toPaymentInsert(record));
  }

  async findById(id: string): Promise<PaymentRecord | null> {
    const [row] = await getDbContext().select().from(payment).where(eq(payment.id, id)).limit(1);
    return row ? toPaymentRecord(row) : null;
  }

  async update(id: string, changes: PaymentProviderUpdate): Promise<void> {
    await getDbContext().update(payment).set(toPaymentUpdate(changes)).where(eq(payment.id, id));
  }

  // F3.3 (PaymentLockRepository): SELECT … FOR UPDATE; solo tiene efecto dentro de una transacción.
  async lockById(id: string): Promise<PaymentRecord | null> {
    const [row] = await getDbContext().select().from(payment).where(eq(payment.id, id)).for('update').limit(1);
    return row ? toPaymentRecord(row) : null;
  }

  // H-2: pagos con cobro capturado del proveedor y sin fee_reconciled_at: los que aún no tienen la comisión real y los
  // que la tienen guardada sin marca (backfill). Solo lectura; el más antiguo primero.
  async findPendingFeeReconciliation(query: FeeReconciliationQuery): Promise<string[]> {
    const rows = await getDbContext().select({ id: payment.id }).from(payment)
      .where(pendingFeeReconciliationCondition(query))
      .orderBy(asc(payment.createdAt), asc(payment.id))
      .limit(query.limit);
    return rows.map((r) => r.id);
  }
}

// Estados con un cobro capturado (y, por tanto, un balance_transaction del cargo que conciliar).
export const FEE_RECONCILABLE_STATUSES = ['succeeded', 'partially_refunded', 'refunded', 'in_dispute', 'charged_back'] as const;

export function pendingFeeReconciliationCondition(query: Pick<FeeReconciliationQuery, 'provider' | 'createdBefore'>) {
  return and(
    eq(payment.provider, query.provider),
    isNotNull(payment.providerPaymentId),
    isNull(payment.feeReconciledAt),
    inArray(payment.status, [...FEE_RECONCILABLE_STATUSES]),
    lt(payment.createdAt, query.createdBefore),
  )!;
}

@Injectable()
export class DrizzleIdempotencyKeyRepository implements IdempotencyKeyRepository {
  async find(scope: string, key: string): Promise<IdempotencyKeyRecord | null> {
    const [row] = await getDbContext().select().from(idempotencyKey)
      .where(and(eq(idempotencyKey.scope, scope), eq(idempotencyKey.key, key))).limit(1);
    return row
      ? { scope: row.scope, key: row.key, requestHash: row.requestHash, paymentId: row.paymentId, refundId: row.refundId, createdAt: row.createdAt, completedAt: row.completedAt }
      : null;
  }

  async insert(record: { scope: string; key: string; requestHash: string; paymentId: string; refundId?: string; createdAt: Date }): Promise<void> {
    await getDbContext().insert(idempotencyKey).values(record);
  }

  // completed_at se fija una sola vez (idempotency_key_guard): solo actualiza si sigue nulo.
  async complete(scope: string, key: string, at: Date): Promise<void> {
    await getDbContext().update(idempotencyKey).set({ completedAt: at })
      .where(and(eq(idempotencyKey.scope, scope), eq(idempotencyKey.key, key), isNull(idempotencyKey.completedAt)));
  }
}

@Injectable()
export class DrizzlePeiFeeConfigurationRepository implements PeiFeeConfigurationRepository {
  async findEffective(at: Date): Promise<PeiFeeVersion | null> {
    const t = peiFeeConfiguration;
    const [row] = await getDbContext().select({ id: t.id, fixedFee: t.fixedFee }).from(t)
      .where(and(lte(t.effectiveFrom, at), or(isNull(t.effectiveUntil), gt(t.effectiveUntil, at))))
      .orderBy(desc(t.effectiveFrom)).limit(1);
    return row ? { id: row.id, fixedFee: fromDecimalString(row.fixedFee) } : null;
  }
}

type ScheduleRow = { id: string; percentageRate: string; fixedFee: string; vatRate: string };
const toSchedule = (r: ScheduleRow): ProcessorFeeSnapshot => ({
  scheduleId: r.id, percentageRate: r.percentageRate, fixedFee: fromDecimalString(r.fixedFee), vatRate: r.vatRate,
});
const SCHEDULE = { id: processorFeeSchedule.id, percentageRate: processorFeeSchedule.percentageRate, fixedFee: processorFeeSchedule.fixedFee, vatRate: processorFeeSchedule.vatRate };

@Injectable()
export class DrizzleProcessorFeeScheduleRepository implements ProcessorFeeScheduleRepository {
  async findEffective(provider: ProviderName, at: Date): Promise<ProcessorFeeSnapshot | null> {
    const t = processorFeeSchedule;
    const [row] = await getDbContext().select(SCHEDULE).from(t)
      .where(and(eq(t.provider, provider), lte(t.effectiveFrom, at), or(isNull(t.effectiveUntil), gt(t.effectiveUntil, at))))
      .orderBy(desc(t.effectiveFrom)).limit(1);
    return row ? toSchedule(row) : null;
  }

  async findById(id: string): Promise<ProcessorFeeSnapshot | null> {
    const [row] = await getDbContext().select(SCHEDULE).from(processorFeeSchedule).where(eq(processorFeeSchedule.id, id)).limit(1);
    return row ? toSchedule(row) : null;
  }
}
