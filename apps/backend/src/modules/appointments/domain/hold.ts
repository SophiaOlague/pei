import type { AppointmentStatus } from './appointment-status';

// RN-009: el horario se retiene 5 minutos durante el checkout. Es un valor del Maestro, no un parámetro configurable.
// RN-010: salir de la pantalla no libera la retención; solo vence por tiempo, por un pago fallido o porque el paciente
// la libera. DA-9: vencimiento perezoso; una retención vencida no ocupa el horario aunque su fila siga en pending_payment.
export const HOLD_MINUTES = 5;
const MS_PER_MINUTE = 60_000;

export function holdExpiresAt(now: Date): Date {
  return new Date(now.getTime() + HOLD_MINUTES * MS_PER_MINUTE);
}

export function isHoldActive(a: { status: AppointmentStatus; paymentHoldExpiresAt: Date | null }, now: Date): boolean {
  return a.status === 'pending_payment' && a.paymentHoldExpiresAt !== null && a.paymentHoldExpiresAt.getTime() > now.getTime();
}

// Una cita ocupa horario si está confirmada o si su retención sigue vigente.
export function occupiesSchedule(a: { status: AppointmentStatus; paymentHoldExpiresAt: Date | null }, now: Date): boolean {
  return a.status === 'confirmed' || isHoldActive(a, now);
}
