import type { AppointmentStatus, PatientAppointmentDetail } from "@/lib/api";

// Estado de M08 tal como lo devuelve el backend (una retención vencida ya llega como `expired`). La interfaz no
// deriva estados: solo los nombra y separa las citas próximas de las demás.
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending_payment: "Pendiente de pago",
  expired: "Reserva vencida",
  confirmed: "Confirmada",
  completed: "Completada",
  canceled: "Cancelada",
  no_show_patient: "No asististe",
  no_show_doctor: "El médico no asistió",
  no_show_both: "Sin asistencia",
  rescheduled: "Reagendada",
};

export const statusLabel = (status: string) =>
  APPOINTMENT_STATUS_LABELS[status as AppointmentStatus] ?? status;

// Próximas: confirmadas o pendientes de pago con horario futuro (orden ascendente). Las demás, de la más reciente.
export function splitAppointments(
  appointments: PatientAppointmentDetail[],
  now: Date = new Date(),
): {
  upcoming: PatientAppointmentDetail[];
  past: PatientAppointmentDetail[];
} {
  const upcoming: PatientAppointmentDetail[] = [];
  const past: PatientAppointmentDetail[] = [];
  for (const a of appointments) {
    const future = new Date(a.scheduledAt).getTime() > now.getTime();
    if (future && (a.status === "confirmed" || a.status === "pending_payment"))
      upcoming.push(a);
    else past.push(a);
  }
  const at = (a: PatientAppointmentDetail) => new Date(a.scheduledAt).getTime();
  upcoming.sort((a, b) => at(a) - at(b));
  past.sort((a, b) => at(b) - at(a));
  return { upcoming, past };
}

// Próxima consulta confirmada (para el inicio del paciente), o null.
export function nextConfirmed(
  appointments: PatientAppointmentDetail[],
  now: Date = new Date(),
): PatientAppointmentDetail | null {
  return (
    splitAppointments(appointments, now).upcoming.find(
      (a) => a.status === "confirmed",
    ) ?? null
  );
}
