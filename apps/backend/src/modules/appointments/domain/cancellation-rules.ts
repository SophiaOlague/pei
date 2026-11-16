// M08 RF-15: resultado económico de una cancelación. M08 solo lo determina; el reembolso lo ejecuta pagos (RF-46).
// - Paciente con al menos `refundDeadlineHours` de anticipación: reembolso total (RN-019).
// - Paciente con menos, o después del inicio: sin reembolso (RN-020).
// - Médico: siempre reembolso total, sin reasignación (RN-013).
// DA-8: el mismo plazo rige la cancelación con reembolso y el reagendamiento.

export type RefundOutcome = 'full_refund' | 'no_refund';
const MS_PER_HOUR = 3_600_000;

export function hoursUntil(scheduledAt: Date, now: Date): number {
  return (scheduledAt.getTime() - now.getTime()) / MS_PER_HOUR;
}

export function patientCancellationOutcome(scheduledAt: Date, now: Date, refundDeadlineHours: number): RefundOutcome {
  return hoursUntil(scheduledAt, now) >= refundDeadlineHours ? 'full_refund' : 'no_refund';
}

export const DOCTOR_CANCELLATION_OUTCOME: RefundOutcome = 'full_refund';

export const MIN_DOCTOR_REASON = 10;
export const MAX_REASON = 500;
