import type { Clock } from '../../../../common/application/ports/clock';
import type { UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import type { PaymentProviderPort } from '../ports/payment-provider.port';
import type { FeeReconciliationReader, PaymentLockRepository, PaymentRepository } from '../ports/payments.repositories';
import { refreshPaymentFromProvider } from './provider-snapshot-sync';
import { webhookFailureReason } from './provider-webhook.use-cases';

// H-2/H-3 (autorizado el 2026-11-16): conciliación de la comisión real del procesador.
//
// Recorre los pagos con cobro capturado y sin fee_reconciled_at: los que aún no tienen provider_fee_actual (la comisión
// no estaba disponible al confirmar y el webhook no llegó) y los que la tienen guardada sin marca (backfill). Para cada
// uno vuelve a consultar el PaymentIntent y aplica el snapshot por el flujo transaccional y BLOQUEADO existente
// (refreshPaymentFromProvider → applyProviderSnapshot → decideSnapshot → providerUpdateFor con reconcile):
// - la marca solo se fija con un balance_transaction verificado y con la comisión y el neto iguales a los persistidos
//   (o fijados en esa misma escritura); nunca por la tarifa estimada;
// - ningún importe ya fijado se sobrescribe (providerUpdateFor + payment_guard: conflicto en vez de cambio);
// - si Stripe aún no da un balance_transaction válido, el pago queda pendiente para otra ejecución.
// Un fallo en un pago se registra (solo el id técnico y un código) y no detiene los siguientes. No se ejecuta solo: lo
// invoca el CLI payments-reconcile-fees (sin programación periódica).

export const FEE_RECONCILIATION_MIN_AGE_MS = 5 * 60_000;
export const FEE_RECONCILIATION_DEFAULT_LIMIT = 100;

export interface ReconcileFeesSummary {
  examined: number;
  // Comisión real verificada y marcada en esta ejecución.
  reconciled: number;
  // Stripe todavía no da un balance_transaction válido: sin marca.
  pending: number;
  failed: number;
}

export interface ReconcileProviderFeesDeps {
  uow: UnitOfWork;
  clock: Clock;
  locks: PaymentLockRepository;
  payments: Pick<PaymentRepository, 'findById' | 'update'>;
  provider: Pick<PaymentProviderPort, 'name' | 'getPayment'>;
  pending: FeeReconciliationReader;
  warn?: (message: string) => void;
}

export class ReconcileProviderFeesUseCase {
  constructor(private readonly deps: ReconcileProviderFeesDeps) {}

  async execute(options: { limit?: number } = {}): Promise<ReconcileFeesSummary> {
    const now = this.deps.clock.now();
    const ids = await this.deps.pending.findPendingFeeReconciliation({
      provider: this.deps.provider.name,
      createdBefore: new Date(now.getTime() - FEE_RECONCILIATION_MIN_AGE_MS),
      limit: options.limit ?? FEE_RECONCILIATION_DEFAULT_LIMIT,
    });
    const summary: ReconcileFeesSummary = { examined: ids.length, reconciled: 0, pending: 0, failed: 0 };
    for (const id of ids) {
      try {
        await refreshPaymentFromProvider(
          { uow: this.deps.uow, clock: this.deps.clock, locks: this.deps.locks, payments: this.deps.payments, provider: this.deps.provider, reader: this.deps.payments },
          id,
        );
        const after = await this.deps.payments.findById(id);
        if (after?.feeReconciledAt) summary.reconciled += 1;
        else summary.pending += 1;
      } catch (error) {
        summary.failed += 1;
        this.deps.warn?.(`Conciliación de la comisión del pago ${id} fallida (${webhookFailureReason(error)}); se reintentará en otra ejecución`);
      }
    }
    return summary;
  }
}
