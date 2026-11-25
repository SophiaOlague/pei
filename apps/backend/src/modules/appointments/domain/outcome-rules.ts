import type { AppointmentStatus } from './appointment-status';
import type { RefundOutcome } from './cancellation-rules';

// Resultado final de una cita confirmada que registra videoconsulta (CC-9, AP-15) y su consecuencia de reembolso. Lo
// decide M08 y lo audita en la misma transacción que el cambio de estado; pagos solo lo ejecuta (no recalcula reglas).
// - no_show_doctor y no_show_both: reembolso del 100 % y sin importe liquidable (RN-025, RN-030).
// - no_show_patient: sin reembolso; el médico es elegible para su pago (RN-033).
// - completed: consulta atendida; sin reembolso.

export const OUTCOME_STATUSES = ['completed', 'no_show_patient', 'no_show_doctor', 'no_show_both'] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];

const REFUND_BY_OUTCOME: Record<OutcomeStatus, RefundOutcome> = {
  completed: 'no_refund',
  no_show_patient: 'no_refund',
  no_show_doctor: 'full_refund',
  no_show_both: 'full_refund',
};

export const isOutcomeStatus = (status: string): status is OutcomeStatus => (OUTCOME_STATUSES as readonly string[]).includes(status);

export function outcomeRefund(status: AppointmentStatus | OutcomeStatus): RefundOutcome {
  if (!isOutcomeStatus(status)) throw new RangeError(`${status} no es un resultado de videoconsulta`);
  return REFUND_BY_OUTCOME[status];
}
