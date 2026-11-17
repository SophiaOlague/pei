import { AGENDA_TIME_ZONE } from "@/lib/api";

// Fechas del agendamiento. Las agendas están en el centro de México (AGENDA_TIME_ZONE); el rango de horarios se
// calcula con la fecha de esa zona, no con la del navegador.

export const SLOT_DAYS = 14;

const isoDate = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

// Fecha civil AAAA-MM-DD sumando días sin depender de la zona del navegador.
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

export function slotRange(
  now: Date = new Date(),
  timeZone: string = AGENDA_TIME_ZONE,
): { from: string; to: string } {
  const from = isoDate(now, timeZone);
  return { from, to: addDays(from, SLOT_DAYS - 1) };
}

const MONTHS_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

// Fecha civil de un horario (AAAA-MM-DD) para los botones de fecha.
export function dateChip(date: string): { day: string; month: string } {
  const [, m, d] = date.split("-");
  return { day: String(Number(d)), month: MONTHS_SHORT[Number(m) - 1] ?? "" };
}

const longDate = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "full",
  timeZone: "UTC",
});
export const formatSlotDate = (date: string) =>
  longDate.format(new Date(`${date}T00:00:00Z`));

// Fecha y hora de una cita en la zona de la agenda.
export function formatAppointmentDate(
  iso: string,
  timeZone: string = AGENDA_TIME_ZONE,
): { date: string; time: string } {
  const at = new Date(iso);
  return {
    date: new Intl.DateTimeFormat("es-MX", {
      dateStyle: "long",
      timeZone,
    }).format(at),
    time: new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone,
    }).format(at),
  };
}
