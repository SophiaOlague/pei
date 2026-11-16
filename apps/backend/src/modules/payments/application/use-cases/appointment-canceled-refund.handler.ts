import type { AppointmentCanceled } from '../../../appointments/application/appointment-events';
import type { PaymentLedgerPort, RootPaymentLookup } from '../../../appointments/application/integration/appointment-chain.services';
import type { CanceledAppointmentNotice } from '../../../appointments/application/integration/canceled-appointment-feed';
import { REFUNDABLE_PAYMENT_STATUSES } from '../../domain/refund';
import type { PaymentRepository } from '../ports/payments.repositories';
import { REFUND_CANCELLATION_SCOPE, type AdvanceAction, type RefundsUseCases, type RefundView } from './refunds.use-cases';

// F5 (RF-46, RN-013, RN-019, RN-020): reacción de pagos a una cancelación de M08. Una sola entrada común para las dos
// rutas (M08 no cambia):
// - 'event': AppointmentCanceled en memoria después del COMMIT (A.21). Optimización: rápida, pero NO durable.
// - 'feed': CanceledAppointmentFeed (A.25), consulta duradera de solo lectura. Es la garantía de durabilidad.
// Las dos llegan al mismo reembolso idempotente (scope refund.appointment_canceled, key = payment.id, pago bloqueado):
// si coinciden en el tiempo, una lo crea y la otra lo encuentra (existing). Pagos no recalcula las reglas de M08: usa el
// refundOutcome que M08 decidió (el literal auditado, ya verificado, en la ruta duradera).
// - no_refund → nada.
// - full_refund → el pago de la RAÍZ se reembolsa por el SALDO restante:
//     · sin reembolsos previos → total (no requiere aprobación) y se envía al proveedor;
//     · con un parcial previo → el restante es parcial: queda requested esperando aprobación (PAY-17, refund_guard);
//     · ya reembolsado o cubierto por reembolsos en curso → nada (already_covered);
//     · en disputa o no reembolsable → nada automático (not_refundable).
// Una cita solo se cancela desde confirmed, así que su pago siempre está capturado; sin pago capturado → no_payment.

export interface CancellationRefundNotice {
  eventId: string;
  appointmentId: string;
  // Raíz ya resuelta por M08 (ruta duradera). null en la ruta en memoria: se resuelve con PaymentLedgerPort.
  rootAppointmentId: string | null;
  canceledBy: 'patient' | 'doctor';
  refundOutcome: 'full_refund' | 'no_refund';
  occurredAt: string;
  source: 'event' | 'feed';
}

export const noticeFromCanceledEvent = (e: AppointmentCanceled): CancellationRefundNotice => ({
  eventId: `appointment-canceled:${e.appointmentId}`,
  appointmentId: e.appointmentId,
  rootAppointmentId: null,
  canceledBy: e.canceledBy,
  refundOutcome: e.refundOutcome,
  occurredAt: e.occurredAt,
  source: 'event',
});

export const noticeFromFeed = (n: CanceledAppointmentNotice): CancellationRefundNotice => ({
  eventId: n.eventId,
  appointmentId: n.appointmentId,
  rootAppointmentId: n.rootAppointmentId,
  canceledBy: n.canceledBy,
  refundOutcome: n.refundOutcome,
  occurredAt: n.occurredAt,
  source: 'feed',
});

export type CancellationRefundOutcome =
  | { outcome: 'no_refund' }
  | { outcome: 'no_payment' }
  | { outcome: 'not_refundable'; paymentStatus: string }
  | { outcome: 'already_covered' }
  | { outcome: 'requested' | 'existing'; refund: RefundView; action: AdvanceAction };

export interface AppointmentCanceledRefundDeps {
  ledger: PaymentLedgerPort;
  rootPayments: RootPaymentLookup;
  payments: Pick<PaymentRepository, 'findById'>;
  refunds: Pick<RefundsUseCases, 'requestRefund'>;
  // Solo la ruta en memoria avisa caso por caso; el barrido duradero resume (D-3: sin avisos repetidos).
  warn?: (message: string) => void;
}

export class AppointmentCanceledRefundHandler {
  constructor(private readonly d: AppointmentCanceledRefundDeps) {}

  async handle(notice: CancellationRefundNotice): Promise<CancellationRefundOutcome> {
    if (notice.refundOutcome !== 'full_refund') return { outcome: 'no_refund' };
    const warn = notice.source === 'event' ? this.d.warn : undefined;

    const ref = notice.rootAppointmentId
      ? await this.d.rootPayments.paymentForRootAppointment(notice.rootAppointmentId)
      : await this.d.ledger.paymentForAppointment(notice.appointmentId);
    if (!ref) {
      warn?.(`Cita ${notice.appointmentId} cancelada con reembolso total sin pago capturado en su raíz: requiere conciliación`);
      return { outcome: 'no_payment' };
    }
    const payment = await this.d.payments.findById(ref.paymentId);
    if (!payment) return { outcome: 'no_payment' };
    if (payment.status === 'refunded') return { outcome: 'already_covered' };
    if (!REFUNDABLE_PAYMENT_STATUSES.includes(payment.status)) {
      warn?.(`Pago ${payment.id} (${payment.status}) de una cita cancelada con reembolso total: requiere revisión manual`);
      return { outcome: 'not_refundable', paymentStatus: payment.status };
    }

    const r = await this.d.refunds.requestRefund({
      scope: REFUND_CANCELLATION_SCOPE,
      key: payment.id,
      paymentId: payment.id,
      amount: { kind: 'remaining' },
      reason: notice.canceledBy === 'doctor' ? 'doctor_cancellation' : 'patient_cancellation',
      // Ni el evento ni la consulta traen el user_profile: el solicitante queda por tipo.
      requestedBy: { type: notice.canceledBy, userProfileId: null },
    });
    if (r.outcome === 'nothing_to_refund' || !r.refund || !r.action) return { outcome: 'already_covered' };
    return { outcome: r.outcome === 'created' ? 'requested' : 'existing', refund: r.refund, action: r.action };
  }
}
