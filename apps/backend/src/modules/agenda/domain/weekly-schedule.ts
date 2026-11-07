import { formatMinutes, MINUTES_PER_DAY } from './agenda-time';
import { InvalidWeeklyScheduleError } from './agenda.errors';

// RF-10, D-4: horario semanal recurrente en hora del centro de México. Cada franja pertenece a un solo día (end > start,
// el CHECK de la tabla); un horario que cruza la medianoche se captura como dos franjas: "22:00–24:00" de un día y
// "00:00–02:00" del siguiente. Sin solapamientos dentro de un día y como máximo 6 franjas por día.
export const MAX_WINDOWS_PER_DAY = 6;

export interface WeeklyWindowInput {
  weekday: number;
  start: string;
  end: string;
}

export interface WeeklyWindow {
  weekday: number;
  startMinutes: number;
  endMinutes: number;
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTime(value: unknown, allowMidnightEnd: boolean): number | null {
  if (typeof value !== 'string') return null;
  if (allowMidnightEnd && value === '24:00') return MINUTES_PER_DAY;
  const m = TIME.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function toWindowInput(w: WeeklyWindow): WeeklyWindowInput {
  return { weekday: w.weekday, start: formatMinutes(w.startMinutes), end: formatMinutes(w.endMinutes) };
}

export function sortWindows(windows: WeeklyWindow[]): WeeklyWindow[] {
  return windows.sort((a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes);
}

// Valida y normaliza (ordenado por día y hora). Lanza InvalidWeeklyScheduleError con la primera causa.
export function buildWeeklySchedule(inputs: readonly WeeklyWindowInput[]): WeeklyWindow[] {
  if (!Array.isArray(inputs)) throw new InvalidWeeklyScheduleError('se esperaba una lista de franjas');
  const windows = inputs.map((input, i) => {
    const weekday = input?.weekday;
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new InvalidWeeklyScheduleError(`franja ${i + 1}: el día debe ser un entero de 0 (domingo) a 6 (sábado)`);
    }
    const startMinutes = parseTime(input.start, false);
    const endMinutes = parseTime(input.end, true);
    if (startMinutes === null || endMinutes === null) throw new InvalidWeeklyScheduleError(`franja ${i + 1}: las horas deben tener formato HH:MM`);
    if (endMinutes <= startMinutes) {
      throw new InvalidWeeklyScheduleError(
        `franja ${i + 1}: la hora final debe ser posterior a la inicial (un horario que cruza la medianoche se captura como dos franjas)`,
      );
    }
    return { weekday, startMinutes, endMinutes };
  });
  sortWindows(windows);
  let count = 0;
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const prev = i > 0 ? windows[i - 1] : undefined;
    const sameDay = prev !== undefined && prev.weekday === w.weekday;
    count = sameDay ? count + 1 : 1;
    if (count > MAX_WINDOWS_PER_DAY) throw new InvalidWeeklyScheduleError(`máximo ${MAX_WINDOWS_PER_DAY} franjas por día`);
    if (sameDay && prev && w.startMinutes < prev.endMinutes) {
      throw new InvalidWeeklyScheduleError(
        `franjas solapadas el día ${w.weekday} (${formatMinutes(prev.startMinutes)}–${formatMinutes(prev.endMinutes)} y ${formatMinutes(w.startMinutes)}–${formatMinutes(w.endMinutes)})`,
      );
    }
  }
  return windows;
}
