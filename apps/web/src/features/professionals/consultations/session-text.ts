import { ApiError, type PendingResolution, type SessionPhase } from "@/lib/api";

// Textos de la sala del médico. Solo describen lo que informa el backend: no recalculan plazos ni resultados.

export const PHASE_LABEL: Record<SessionPhase, string> = {
  not_open: "Sala aún cerrada",
  waiting: "Sala de espera",
  active: "Consulta en curso",
  ended: "Consulta finalizada",
  closed: "Cita cerrada",
};

// Casos que el Maestro todavía no resuelve (Video-diseno.md §6): la cita sigue confirmada y sin resultado.
export const PENDING_LABEL: Record<PendingResolution, string> = {
  r5_beyond_total_limit:
    "El plazo para determinar la inasistencia del paciente supera el límite total de la cita. La cita queda pendiente de resolución.",
  late_patient_left_before_doctor:
    "El paciente se conectó después de su tolerancia y salió antes de que entraras. La cita queda pendiente de resolución.",
  late_patient_not_admitted:
    "El paciente se conectó después de su tolerancia y no ha sido admitido. Todavía puedes admitirlo; si no, la cita queda pendiente de resolución.",
  no_rule:
    "Esta situación no tiene una regla definida. La cita queda pendiente de resolución.",
};

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmada",
  completed: "Completada",
  no_show_patient: "Inasistencia del paciente",
  no_show_doctor: "Inasistencia del médico",
  no_show_both: "Inasistencia de ambos",
  cancelled: "Cancelada",
  rescheduled: "Reagendada",
};

const time = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  hour: "2-digit",
  minute: "2-digit",
});
const dateTime = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min ${s} s`;
}

export const isNotOperational = (e: unknown) =>
  e instanceof ApiError && e.error === "DoctorNotOperationalError";

export function sessionErrorMessage(e: unknown): string {
  if (isNotOperational(e))
    return "Tu registro no está habilitado para atender consultas. Solo puedes finalizar una consulta tuya que ya esté en curso.";
  if (e instanceof ApiError) return e.message;
  return "No se pudo completar la operación. Inténtalo de nuevo.";
}
