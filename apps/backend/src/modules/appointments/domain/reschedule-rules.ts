import { RescheduleDeadlinePassedError, RescheduleLimitReachedError } from './appointments.errors';
import { hoursUntil } from './cancellation-rules';

// M08 DA-6, DA-7 y DA-8 (AP-7): reglas del reagendamiento, siempre con la política aplicada a la cita original.
// - Plazo: al menos refund_deadline_hours antes del inicio de la cita original (el mismo plazo que el reembolso).
// - Límite: reagendamientos previos de la cadena (profundidad desde la raíz) por debajo de max_reschedules.
// La cita nueva conserva precio, política, motivo y las dos referencias legales (RN-018, AP-26); no hay cobro ni
// reembolso, y el pago sigue ligado a la cita raíz.

export function assertReschedulable(input: {
  originalScheduledAt: Date;
  now: Date;
  refundDeadlineHours: number;
  previousReschedules: number;
  maxReschedules: number;
}): void {
  if (hoursUntil(input.originalScheduledAt, input.now) < input.refundDeadlineHours) throw new RescheduleDeadlinePassedError(input.refundDeadlineHours);
  if (input.previousReschedules >= input.maxReschedules) throw new RescheduleLimitReachedError(input.maxReschedules);
}
