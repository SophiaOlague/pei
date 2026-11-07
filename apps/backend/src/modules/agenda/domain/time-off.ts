import { InvalidTimeOffError } from './agenda.errors';

// RF-11: periodo no disponible (vacaciones, día libre, ausencia). Intervalo semiabierto [startsAt, endsAt) en UTC.
export const MAX_TIME_OFF_REASON = 200;
export const TIME_OFF_HORIZON_DAYS = 365;

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export interface TimeOffInput {
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}

export function validateTimeOff(input: TimeOffInput, now: Date): TimeOffInput {
  const { startsAt, endsAt } = input;
  if (!(startsAt instanceof Date) || !(endsAt instanceof Date) || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new InvalidTimeOffError('fechas inválidas');
  }
  if (endsAt <= startsAt) throw new InvalidTimeOffError('el fin debe ser posterior al inicio');
  if (endsAt <= now) throw new InvalidTimeOffError('el periodo ya terminó');
  if (startsAt.getTime() > now.getTime() + TIME_OFF_HORIZON_DAYS * 86_400_000) {
    throw new InvalidTimeOffError(`no puede empezar a más de ${TIME_OFF_HORIZON_DAYS} días`);
  }
  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : null;
  if (reason && reason.length > MAX_TIME_OFF_REASON) throw new InvalidTimeOffError(`el motivo admite como máximo ${MAX_TIME_OFF_REASON} caracteres`);
  return { startsAt, endsAt, reason };
}
