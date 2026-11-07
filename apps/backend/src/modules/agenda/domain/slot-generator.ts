import { addDays, daysBetween, formatLocalDate, formatMinutes, localDateOf, localToUtc, parseLocalDate, weekdayOf, type LocalDate } from './agenda-time';
import { InvalidSlotRangeError } from './agenda.errors';
import { overlaps, type Interval } from './time-off';
import type { WeeklyWindow } from './weekly-schedule';

// D-5: una consulta abarca como máximo 31 días y no pasa de 90 días a partir de hoy (hora del centro de México).
export const MAX_SLOT_RANGE_DAYS = 31;
export const SLOT_HORIZON_DAYS = 90;

export interface Slot {
  startsAt: string; // ISO UTC
  endsAt: string;
  date: string; // fecha local AAAA-MM-DD
  start: string; // hora local HH:MM
  end: string;
}

export interface SlotRange {
  from: LocalDate;
  to: LocalDate;
}

// Valida from/to (fechas locales, inclusivas) frente a "hoy" en la zona de la plataforma.
export function resolveSlotRange(from: unknown, to: unknown, now: Date): SlotRange {
  const f = parseLocalDate(from);
  const t = parseLocalDate(to);
  if (!f || !t) throw new InvalidSlotRangeError('las fechas deben tener formato AAAA-MM-DD');
  const days = daysBetween(f, t);
  if (days < 0) throw new InvalidSlotRangeError('"to" debe ser igual o posterior a "from"');
  if (days + 1 > MAX_SLOT_RANGE_DAYS) throw new InvalidSlotRangeError(`máximo ${MAX_SLOT_RANGE_DAYS} días por consulta`);
  if (daysBetween(localDateOf(now), t) > SLOT_HORIZON_DAYS) {
    throw new InvalidSlotRangeError(`no se pueden consultar más de ${SLOT_HORIZON_DAYS} días hacia adelante`);
  }
  return { from: f, to: t };
}

// Intervalo UTC que cubre el rango local completo (para leer periodos no disponibles y citas).
export function rangeBounds(range: SlotRange): Interval {
  return { startsAt: localToUtc(range.from, 0), endsAt: localToUtc(addDays(range.to, 1), 0) };
}

export interface SlotGenerationInput {
  range: SlotRange;
  windows: readonly WeeklyWindow[];
  durationMinutes: number;
  timeOff: readonly Interval[];
  busy: readonly Interval[]; // M08: citas que ya ocupan horario
  now: Date;
}

// Pura: recorre cada día local del rango, divide cada franja en bloques de `durationMinutes` que caben completos y
// descarta los que empiezan antes de `now` o se cruzan con un periodo no disponible o un intervalo ocupado.
export function generateSlots(input: SlotGenerationInput): Slot[] {
  const { range, windows, durationMinutes, timeOff, busy, now } = input;
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) throw new InvalidSlotRangeError('duración inválida');
  const blocked = [...timeOff, ...busy];
  const slots: Slot[] = [];
  const total = daysBetween(range.from, range.to);
  for (let i = 0; i <= total; i++) {
    const day = addDays(range.from, i);
    const weekday = weekdayOf(day);
    for (const w of windows) {
      if (w.weekday !== weekday) continue;
      for (let start = w.startMinutes; start + durationMinutes <= w.endMinutes; start += durationMinutes) {
        const slot = { startsAt: localToUtc(day, start), endsAt: localToUtc(day, start + durationMinutes) };
        if (slot.startsAt < now) continue;
        if (blocked.some((b) => overlaps(slot, b))) continue;
        slots.push({
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          date: formatLocalDate(day),
          start: formatMinutes(start),
          end: formatMinutes(start + durationMinutes),
        });
      }
    }
  }
  return slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
