import { InvalidAppointmentDurationError } from './agenda.errors';

// D-3: de 15 a 120 minutos, en múltiplos de 5; 30 por omisión (DEFAULT de la columna).
export const MIN_APPOINTMENT_DURATION = 15;
export const MAX_APPOINTMENT_DURATION = 120;
export const APPOINTMENT_DURATION_STEP = 5;
export const DEFAULT_APPOINTMENT_DURATION = 30;

export function isValidAppointmentDuration(minutes: unknown): minutes is number {
  return (
    typeof minutes === 'number' && Number.isInteger(minutes) &&
    minutes >= MIN_APPOINTMENT_DURATION && minutes <= MAX_APPOINTMENT_DURATION && minutes % APPOINTMENT_DURATION_STEP === 0
  );
}

export function assertAppointmentDuration(minutes: unknown): number {
  if (!isValidAppointmentDuration(minutes)) throw new InvalidAppointmentDurationError();
  return minutes;
}

// Un valor histórico fuera de rango (la columna no tiene CHECK) se trata como el predeterminado al generar horarios.
export function effectiveDuration(minutes: number): number {
  return isValidAppointmentDuration(minutes) ? minutes : DEFAULT_APPOINTMENT_DURATION;
}
