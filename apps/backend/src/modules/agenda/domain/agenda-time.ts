// D-1: zona horaria única de la plataforma. Las franjas semanales se guardan como hora local del centro de México y los
// periodos no disponibles y los horarios generados como instantes UTC. Las conversiones usan Intl, sin suponer que la
// zona carece de horario de verano (aunque no lo tiene desde 2022).
export const AGENDA_TIME_ZONE = 'America/Mexico_City';
export const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;

export interface LocalDate {
  year: number;
  month: number; // 1–12
  day: number;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: AGENDA_TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function zonedParts(instant: Date) {
  const parts: Record<string, number> = {};
  for (const p of formatter.formatToParts(instant)) if (p.type !== 'literal') parts[p.type] = Number(p.value);
  return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

// Diferencia (ms) entre la hora local de la zona y UTC en ese instante.
function offsetAt(instant: Date): number {
  const p = zonedParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function parseLocalDate(value: unknown): LocalDate | null {
  if (typeof value !== 'string') return null;
  const m = DATE.exec(value);
  if (!m) return null;
  const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (check.getUTCFullYear() !== date.year || check.getUTCMonth() !== date.month - 1 || check.getUTCDate() !== date.day) return null;
  return date;
}

export function formatLocalDate(d: LocalDate): string {
  return `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

export function addDays(d: LocalDate, days: number): LocalDate {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day) + days * MS_PER_DAY);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / MS_PER_DAY);
}

// 0 = domingo … 6 = sábado (igual que Date#getDay y que la columna weekday).
export function weekdayOf(d: LocalDate): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
}

export function localDateOf(instant: Date): LocalDate {
  const p = zonedParts(instant);
  return { year: p.year, month: p.month, day: p.day };
}

// Instante UTC de la hora local `minutes` (0–1440) del día local `d`; 1440 es la medianoche del día siguiente.
export function localToUtc(d: LocalDate, minutes: number): Date {
  const naive = Date.UTC(d.year, d.month - 1, d.day) + minutes * MS_PER_MINUTE;
  const first = naive - offsetAt(new Date(naive));
  // Segunda pasada por si el desfase cambia entre la estimación y el resultado.
  return new Date(naive - offsetAt(new Date(first)));
}

export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
