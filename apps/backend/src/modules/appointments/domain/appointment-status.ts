import { InvalidAppointmentStateError } from './appointments.errors';

// M08: estados de la cita (Maestro 6.1) y transiciones que M08 permite. Refleja gst_appointment_guard (0001):
// pending_payment solo pasa a confirmed o expired; expired solo sale de pending_payment. `rescheduled` (M-1, 0013,
// C-25): confirmed → rescheduled al reagendar; estado final (DA-6, AP-7).
// DA-4: ninguna transición desde `confirmed` es automática en M08; todas las inicia un actor explícito.

export const APPOINTMENT_STATUSES = [
  'pending_payment',
  'expired',
  'confirmed',
  'completed',
  'canceled',
  'no_show_patient',
  'no_show_doctor',
  'no_show_both',
  'rescheduled',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export type NoShowKind = 'patient' | 'doctor' | 'both';
export const NO_SHOW_STATUS: Record<NoShowKind, AppointmentStatus> = {
  patient: 'no_show_patient',
  doctor: 'no_show_doctor',
  both: 'no_show_both',
};

const TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  pending_payment: ['confirmed', 'expired'],
  confirmed: ['canceled', 'rescheduled', 'completed', 'no_show_patient', 'no_show_doctor', 'no_show_both'],
  expired: [],
  completed: [],
  canceled: [],
  no_show_patient: [],
  no_show_doctor: [],
  no_show_both: [],
  rescheduled: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransition(from, to)) throw new InvalidAppointmentStateError(from);
}

export function isTerminal(status: AppointmentStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
