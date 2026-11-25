import type { AppointmentOutcomeRecorded } from '../../../appointments/application/appointment-events';
import type { PaymentLedgerPort, RootPaymentLookup } from '../../../appointments/application/integration/appointment-chain.services';
import type { OutcomeRecordedNotice } from '../../../appointments/application/integration/outcome-recorded-feed';
import { REFUNDABLE_PAYMENT_STATUSES } from '../../domain/refund';
import type { PaymentRepository } from '../ports/payments.repositories';
import { REFUND_NO_SHOW_SCOPE, type AdvanceAction, type RefundsUseCases, type RefundView } from './refunds.use-cases';

// Videoconsulta (RF-20, RF-21; RN-025, RN-030; decisión 10): reacción de pagos a un resultado registrado por M08. Es un
// manejador APARTE del de cancelaciones, que no cambia. Dos rutas con la misma entrada:
// - 'event': AppointmentOutcomeRecorded en memoria después del COMMIT. Optimización: rápida, pero NO durable.
// - 'feed': OutcomeRecordedFeedService, consulta duradera de solo lectura. Es la garantía de durabilidad.
// Las dos llegan al mismo reembolso idempotente (scope refund.appointment_no_show, key = payment.id, pago bloqueado) con
// la MISMA solicitud (motivo según el estado, solicitante system), así que su hash coincide y una encuentra lo que creó
// la otra. Pagos no recalcula reglas: usa el refundOutcome que decidió M08.
// - completed y no_show_patient → no_refund (nada).
// - no_show_doctor y no_show_both → el pago de la RAÍZ se reembolsa por el SALDO restante (igual que cancelaciones).
// Un pago nunca se reembolsa dos veces: cancelación e inasistencia son estados finales que se excluyen, y aunque
// coincidieran, el saldo restante calculado con el pago bloqueado sería cero (nothing_to_refund).

export interface NoShowRefundNotice {
  eventId: string;
  appointmentId: string;
  // Raíz ya resuelta por M08 (ruta duradera). null en la ruta en memoria: se resuelve con PaymentLedgerPort.
  rootAppointmentId: string | null;
  status: OutcomeRecordedNotice['status'];
  refundOutcome: 'full_refund' | 'no_refund';
  occurredAt: string;
  source: 'event' | 'feed';
}

export const noticeFromOutcomeEvent = (e: AppointmentOutcomeRecorded): NoShowRefundNotice => ({
  eventId: `appointment-outcome:${e.appointmentId}`,
  appointmentId: e.appointmentId,
  rootAppointmentId: null,
  status: e.status,
  refundOutcome: e.refundOutcome,
  occurredAt: e.occurredAt,
  source: 'event',
});

export const noticeFromOutcomeFeed = (n: OutcomeRecordedNotice): NoShowRefundNotice => ({
  eventId: n.eventId,
  appointmentId: n.appointmentId,
  rootAppointmentId: n.rootAppointmentId,
  status: n.status,
  refundOutcome: n.refundOutcome,
  occurredAt: n.occurredAt,
  source: 'feed',
});

export type NoShowRefundOutcome =
  | { outcome: 'no_refund' }
  | { outcome: 'no_payment' }
  | { outcome: 'not_refundable'; paymentStatus: string }
  | { outcome: 'already_covered' }
  | { outcome: 'requested' | 'existing'; refund: RefundView; action: AdvanceAction };

export interface AppointmentNoShowRefundDeps {
  ledger: PaymentLedgerPort;
  rootPayments: RootPaymentLookup;
  payments: Pick<PaymentRepository, 'findById'>;
  refunds: Pick<RefundsUseCases, 'requestRefund'>;
  warn?: (message: string) => void;
}

export class AppointmentNoShowRefundHandler {
  constructor(private readonly d: AppointmentNoShowRefundDeps) {}

  async handle(notice: NoShowRefundNotice): Promise<NoShowRefundOutcome> {
    if (notice.refundOutcome !== 'full_refund') return { outcome: 'no_refund' };
    // Solo las dos inasistencias con reembolso total tienen motivo propio (0019); cualquier otra combinación es un error.
    if (notice.status !== 'no_show_doctor' && notice.status !== 'no_show_both') throw new Error(`Resultado ${notice.status} con reembolso total: no previsto`);
    const warn = notice.source === 'event' ? this.d.warn : undefined;

    const ref = notice.rootAppointmentId
      ? await this.d.rootPayments.paymentForRootAppointment(notice.rootAppointmentId)
      : await this.d.ledger.paymentForAppointment(notice.appointmentId);
    if (!ref) {
      warn?.(`Cita ${notice.appointmentId} con inasistencia reembolsable sin pago capturado en su raíz: requiere conciliación`);
      return { outcome: 'no_payment' };
    }
    const payment = await this.d.payments.findById(ref.paymentId);
    if (!payment) return { outcome: 'no_payment' };
    if (payment.status === 'refunded') return { outcome: 'already_covered' };
    if (!REFUNDABLE_PAYMENT_STATUSES.includes(payment.status)) {
      warn?.(`Pago ${payment.id} (${payment.status}) de una cita con inasistencia reembolsable: requiere revisión manual`);
      return { outcome: 'not_refundable', paymentStatus: payment.status };
    }

    const r = await this.d.refunds.requestRefund({
      scope: REFUND_NO_SHOW_SCOPE,
      key: payment.id,
      paymentId: payment.id,
      amount: { kind: 'remaining' },
      reason: notice.status,
      requestedBy: { type: 'system', userProfileId: null },
    });
    if (r.outcome === 'nothing_to_refund' || !r.refund || !r.action) return { outcome: 'already_covered' };
    return { outcome: r.outcome === 'created' ? 'requested' : 'existing', refund: r.refund, action: r.action };
  }
}
