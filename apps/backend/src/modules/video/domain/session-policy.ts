// Videoconsulta (RF-18 a RF-22): parámetros y plazos de una sesión. Todo es puro: recibe la hora y los parámetros, no
// lee la base de datos ni el reloj.
//
// Los cuatro parámetros salen de la versión de la política aplicada a la cita (AppointmentSessionService.getForSession,
// AP-22): no son constantes del sistema. Solo la apertura de la sala (T0 − 15, C-30) es fija en el Maestro.

export const WAITING_ROOM_LEAD_MINUTES = 15;

const MINUTE_MS = 60_000;

export interface SessionPolicy {
  // W: ventana ordinaria de espera del médico (RN-025).
  doctorWaitMinutes: number;
  // Tol: tolerancia del paciente desde la hora programada (RN-026).
  patientToleranceMinutes: number;
  // L: límite total de la espera protegida, contado desde T0 (RF-20, C-26).
  maxProtectedWaitMinutes: number;
  // G: gracia de reconexión tras una desconexión involuntaria (RN-026, C-26).
  reconnectGraceMinutes: number;
}

// Disponibilidad del médico para esta cita, según sus OTRAS consultas (espera protegida, RF-19/RF-20):
// - free: no atendió otra consulta que lo ocupara a partir de T0; `freeSince` es el fin de la última que lo ocupó (F),
//   o null si ninguna.
// - busy: sigue atendiendo otra consulta activa; F todavía no existe.
export type DoctorAvailability = { kind: 'free'; freeSince: Date | null } | { kind: 'busy' };

export const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * MINUTE_MS);

// Apertura de la sala de espera: T0 − 15 (C-30, AP-15). Entrar antes de T0 no consume la tolerancia.
export const waitingRoomOpensAt = (scheduledAt: Date): Date => addMinutes(scheduledAt, -WAITING_ROOM_LEAD_MINUTES);

export const patientToleranceEndsAt = (scheduledAt: Date, p: SessionPolicy): Date => addMinutes(scheduledAt, p.patientToleranceMinutes);

export const totalLimitAt = (scheduledAt: Date, p: SessionPolicy): Date => addMinutes(scheduledAt, p.maxProtectedWaitMinutes);

// Plazo del médico D (fórmula T1, AP-24, A.11.2): min(max(T0, F) + W, T0 + L).
// - Sin consulta previa (F nulo o anterior a T0), D = T0 + W: RN-025 sin cambios.
// - Mientras el médico sigue ocupado, F no existe: la ventana ordinaria no ha empezado y solo rige el tope T0 + L.
export function doctorDeadline(scheduledAt: Date, availability: DoctorAvailability, p: SessionPolicy): Date {
  const cap = totalLimitAt(scheduledAt, p);
  if (availability.kind === 'busy') return cap;
  const start = availability.freeSince && availability.freeSince > scheduledAt ? availability.freeSince : scheduledAt;
  const ordinary = addMinutes(start, p.doctorWaitMinutes);
  return ordinary < cap ? ordinary : cap;
}
