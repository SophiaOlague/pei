import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { payment, refund } from '../../../../db/schema';
import { fromDecimalString, toDecimalString, type Money } from '../../domain/money';
import type { RefundStatus } from '../../domain/refund';
import type { NewRefundRecord, RecoverableRefundQuery, RefundRecord, RefundRepository, RefundUpdate } from '../../application/ports/refunds.port';

// F5: `refund` (0017). Respeta refund_guard y refund_within_payment (que vuelven a validar la prorrata, el acumulado,
// las transiciones y los datos fijados una vez). Los importes viajan como numeric (texto), sin coma flotante.

type Row = typeof refund.$inferSelect;
const t = refund;
const moneyOrNull = (v: string | null) => (v === null ? null : fromDecimalString(v));

export function toRefundRecord(r: Row): RefundRecord {
  return {
    id: r.id,
    paymentId: r.paymentId,
    amount: fromDecimalString(r.amount),
    reason: r.reason as RefundRecord['reason'],
    status: r.status,
    provider: r.provider,
    providerRefundId: r.providerRefundId,
    providerStatus: r.providerStatus,
    peiFeeShare: fromDecimalString(r.peiFeeShare),
    doctorShare: fromDecimalString(r.doctorShare),
    providerFeeReturned: moneyOrNull(r.providerFeeReturned),
    unrecoveredProviderFee: moneyOrNull(r.unrecoveredProviderFee),
    requestedByType: r.requestedByType,
    requestedByUserProfileId: r.requestedByUserProfileId,
    approvedBy: r.approvedBy,
    requestedAt: r.requestedAt,
    processedAt: r.processedAt,
    failureReason: r.failureReason,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toRefundInsert(r: NewRefundRecord): typeof refund.$inferInsert {
  return {
    id: r.id,
    paymentId: r.paymentId,
    amount: toDecimalString(r.amount),
    currency: r.amount.currency,
    reason: r.reason,
    status: 'requested',
    provider: r.provider,
    peiFeeShare: toDecimalString(r.peiFeeShare),
    doctorShare: toDecimalString(r.doctorShare),
    requestedByType: r.requestedByType,
    requestedByUserProfileId: r.requestedByUserProfileId,
    approvedBy: r.approvedBy,
    notes: r.notes,
    requestedAt: r.requestedAt,
    createdAt: r.requestedAt,
    updatedAt: r.requestedAt,
  };
}

export function toRefundSet(c: RefundUpdate): Partial<typeof refund.$inferInsert> {
  const set: Partial<typeof refund.$inferInsert> = { updatedAt: c.updatedAt };
  const dec = (m: Money) => toDecimalString(m);
  if (c.status !== undefined) set.status = c.status;
  if (c.providerRefundId !== undefined) set.providerRefundId = c.providerRefundId;
  if (c.providerStatus !== undefined) set.providerStatus = c.providerStatus;
  if (c.approvedBy !== undefined) set.approvedBy = c.approvedBy;
  if (c.processedAt !== undefined) set.processedAt = c.processedAt;
  if (c.failureReason !== undefined) set.failureReason = c.failureReason;
  if (c.providerFeeReturned !== undefined) set.providerFeeReturned = dec(c.providerFeeReturned);
  if (c.unrecoveredProviderFee !== undefined) set.unrecoveredProviderFee = dec(c.unrecoveredProviderFee);
  return set;
}

@Injectable()
export class DrizzleRefundRepository implements RefundRepository {
  async insert(record: NewRefundRecord): Promise<void> {
    await getDbContext().insert(t).values(toRefundInsert(record));
  }

  async findById(id: string): Promise<RefundRecord | null> {
    const [row] = await getDbContext().select().from(t).where(eq(t.id, id)).limit(1);
    return row ? toRefundRecord(row) : null;
  }

  async lockById(id: string): Promise<RefundRecord | null> {
    const [row] = await getDbContext().select().from(t).where(eq(t.id, id)).for('update').limit(1);
    return row ? toRefundRecord(row) : null;
  }

  async listByPayment(paymentId: string): Promise<RefundRecord[]> {
    const rows = await getDbContext().select().from(t).where(eq(t.paymentId, paymentId)).orderBy(asc(t.requestedAt), asc(t.id));
    return rows.map(toRefundRecord);
  }

  // UPDATE … WHERE id AND status = esperado: dos procesos no aplican la misma transición.
  async update(id: string, expectedStatus: RefundStatus, changes: RefundUpdate): Promise<boolean> {
    const rows = await getDbContext().update(t).set(toRefundSet(changes)).where(and(eq(t.id, id), eq(t.status, expectedStatus))).returning({ id: t.id });
    return rows.length > 0;
  }

  // Abiertos sin actividad reciente: pending y processing siempre; requested solo si puede avanzar solo, es decir, si
  // es total (amount = payment.amount) o ya está aprobado. Un parcial sin aprobación espera a un administrador.
  async findRecoverable(q: RecoverableRefundQuery): Promise<string[]> {
    const rows = await getDbContext().select({ id: t.id }).from(t)
      .innerJoin(payment, eq(payment.id, t.paymentId))
      .where(and(
        lt(t.updatedAt, q.idleBefore),
        or(inArray(t.status, ['pending', 'processing']), and(eq(t.status, 'requested'), or(isNotNull(t.approvedBy), eq(t.amount, payment.amount)))),
      ))
      .orderBy(asc(t.updatedAt))
      .limit(q.limit);
    return rows.map((r) => r.id);
  }
}
