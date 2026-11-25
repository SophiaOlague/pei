import type { PatientAppointment } from "@/lib/api";

// Estado de M08 tal como lo devuelve el backend (una retención vencida ya llega como `expired`). La app no deriva
// estados: solo los nombra y separa las citas próximas de las demás. Mismo criterio que apps/web.
export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  canceled: "Cancelada",
  completed: "Completada",
  confirmed: "Confirmada",
  expired: "Reserva vencida",
  no_show_both: "Sin asistencia",
  no_show_doctor: "El médico no asistió",
  no_show_patient: "No asististe",
  pending_payment: "Pendiente de pago",
  rescheduled: "Reagendada",
};

export const statusLabel = (status: string) =>
  APPOINTMENT_STATUS_LABELS[status] ?? status;

// Próximas: confirmadas o pendientes de pago con horario futuro (orden ascendente). Las demás, de la más reciente.
export function splitAppointments(
  appointments: readonly PatientAppointment[],
  now: Date = new Date()
): { upcoming: PatientAppointment[]; past: PatientAppointment[] } {
  const upcoming: PatientAppointment[] = [];
  const past: PatientAppointment[] = [];
  for (const a of appointments) {
    const future = new Date(a.scheduledAt).getTime() > now.getTime();
    if (
      future &&
      (a.status === "confirmed" || a.status === "pending_payment")
    ) {
      upcoming.push(a);
    } else {
      past.push(a);
    }
  }
  const at = (a: PatientAppointment) => new Date(a.scheduledAt).getTime();
  upcoming.sort((a, b) => at(a) - at(b));
  past.sort((a, b) => at(b) - at(a));
  return { past, upcoming };
}

// Una retención de pago todavía vigente: se puede continuar al pago.
export const holdActive = (a: PatientAppointment, now: Date = new Date()) =>
  a.status === "pending_payment" &&
  !!a.holdExpiresAt &&
  new Date(a.holdExpiresAt).getTime() > now.getTime();
