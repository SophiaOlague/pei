import { canTransition, isReachable } from '../../domain/payment-transitions';
import type { Clock } from '../../../../common/application/ports/clock';
import type { UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import type { PaymentProviderPort, ProviderPaymentSnapshot } from '../ports/payment-provider.port';
import type { PaymentLockRepository, PaymentProviderUpdate, PaymentRecord, PaymentRepository } from '../ports/payments.repositories';
import { ProviderStateConflictError } from '../payments-use-case.errors';
import { assertSnapshotIdentity, providerUpdateFor } from './payments.use-cases';

// F3.3: qué hacer con un snapshot del proveedor sobre el pago BLOQUEADO (lockById). Se evalúa dentro de la misma
// transacción que escribe, así que dos sincronizaciones concurrentes del mismo pago se serializan:
// - apply: hay algo nuevo (estado, estado del proveedor o datos de conciliación aún no fijados).
// - unchanged: el pago ya refleja el snapshot (webhook repetido, reintento, segundo webhook concurrente).
// - stale: el snapshot es ANTERIOR a lo ya registrado (otro proceso leyó y aplicó un estado más reciente). No se
//   retrocede ni se considera conflicto.
// Lanza ProviderStateConflictError si el snapshot no es de este pago (referencia, importe u otro id del proveedor),
// si contradice un dato ya fijado o si el cambio no es una transición posible (p. ej. failed → succeeded).
export type SnapshotDecision =
  | { kind: 'apply'; update: PaymentProviderUpdate }
  | { kind: 'unchanged' }
  | { kind: 'stale' };

export function decideSnapshot(record: PaymentRecord, s: ProviderPaymentSnapshot, now: Date): SnapshotDecision {
  assertSnapshotIdentity(record, s);
  if (!canTransition(record.status, s.status)) {
    if (isReachable(s.status, record.status)) return { kind: 'stale' };
    throw new ProviderStateConflictError(`transición ${record.status} → ${s.status} no permitida`);
  }
  // Flujo bloqueado: el único que concilia la comisión (H-3).
  const update = providerUpdateFor(record, s, now, { reconcile: true });
  const changed =
    update.status !== record.status ||
    update.providerStatus !== record.providerStatus ||
    update.providerPaymentId !== undefined ||
    update.providerFeeActual !== undefined ||
    update.netReceived !== undefined ||
    update.moneyReleaseDate !== undefined ||
    update.feeReconciledAt !== undefined;
  return changed ? { kind: 'apply', update } : { kind: 'unchanged' };
}

export interface ApplySnapshotDeps {
  uow: UnitOfWork;
  clock: Clock;
  locks: PaymentLockRepository;
  payments: Pick<PaymentRepository, 'update'>;
}

// Aplica el snapshot sobre el pago BLOQUEADO, en una transacción (lo usan el webhook y los reembolsos). null si el
// pago no existe. `onLocked` recibe el id en cuanto se bloquea (para trazar un fallo posterior).
export async function applyProviderSnapshot(
  deps: ApplySnapshotDeps,
  paymentId: string,
  snapshot: ProviderPaymentSnapshot,
  onLocked?: (id: string) => void,
): Promise<{ id: string; changed: boolean } | null> {
  return deps.uow.runInTransaction(async () => {
    const record = await deps.locks.lockById(paymentId);
    if (!record) return null;
    onLocked?.(record.id);
    const decision = decideSnapshot(record, snapshot, deps.clock.now());
    if (decision.kind === 'apply') await deps.payments.update(record.id, decision.update);
    return { id: record.id, changed: decision.kind === 'apply' };
  });
}

// Consulta el estado real del pago en el proveedor y lo aplica (p. ej. tras un reembolso: partially_refunded/refunded).
export async function refreshPaymentFromProvider(
  deps: ApplySnapshotDeps & { provider: Pick<PaymentProviderPort, 'getPayment'>; reader: Pick<PaymentRepository, 'findById'> },
  paymentId: string,
): Promise<boolean> {
  const record = await deps.reader.findById(paymentId);
  if (!record?.providerPaymentId) return false;
  const snapshot = await deps.provider.getPayment(record.providerPaymentId);
  return (await applyProviderSnapshot(deps, record.id, snapshot))?.changed ?? false;
}
