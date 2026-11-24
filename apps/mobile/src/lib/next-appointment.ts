import type { PatientAppointment } from "@/lib/api";

// RF-19 (C-30): el paciente entra a la sala desde 15 minutos antes de la hora programada. El retraso del médico no
// vence la cita, así que la sala no se cierra aquí: el resultado de la cita lo decide el backend.
export const WAITING_ROOM_LEAD_MINUTES = 15;

const MINUTE_MS = 60_000;
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// La próxima cita es la cita `confirmed` con la hora programada más temprana. Una cita confirmada cuya hora ya pasó
// sigue contando: mientras el backend no registre su resultado, el paciente todavía puede estar esperando al médico.
export function pickNextAppointment(
  appointments: readonly PatientAppointment[]
): PatientAppointment | null {
  let next: PatientAppointment | null = null;
  let nextTime = Number.POSITIVE_INFINITY;
  for (const appointment of appointments) {
    const time = Date.parse(appointment.scheduledAt);
    if (
      appointment.status === "confirmed" &&
      !Number.isNaN(time) &&
      time < nextTime
    ) {
      next = appointment;
      nextTime = time;
    }
  }
  return next;
}

export type WaitingRoomAccess = {
  open: boolean;
  opensAt: Date;
};

// null si la fecha no es válida: nunca se inventa una hora.
export function waitingRoomAccess(
  scheduledAt: string,
  now: Date
): WaitingRoomAccess | null {
  const time = Date.parse(scheduledAt);
  if (Number.isNaN(time)) {
    return null;
  }
  const opensAt = new Date(time - WAITING_ROOM_LEAD_MINUTES * MINUTE_MS);
  return { open: now.getTime() >= opensAt.getTime(), opensAt };
}

// Fecha y hora en la zona horaria del dispositivo.
export function formatAppointmentDate(date: Date): string {
  return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

export function formatAppointmentTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
