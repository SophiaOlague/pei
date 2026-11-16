// M08 DA-3 y DA-5: ocupación de la agenda por las citas.
//
// El bloque es una unidad de planeación de la agenda, no la duración de la consulta (RN-022, RN-023). Su fin solo
// sirve para saber qué horarios están ocupados; nunca limita ni corta una videoconsulta (el fin oficial es
// meeting.ended_at; AP-23). La reserva y el reagendamiento guardan `appointment.agenda_block_ends_at` (0013) con la
// duración del médico vigente en ese momento, y la ocupación usa siempre el valor guardado (NOT NULL desde 0015,
// M-1c). occupancyOf solo calcula el bloque de una cita nueva.

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

const MS_PER_MINUTE = 60_000;

export function occupancyOf(scheduledAt: Date, durationMinutes: number): Interval {
  return { startsAt: scheduledAt, endsAt: new Date(scheduledAt.getTime() + durationMinutes * MS_PER_MINUTE) };
}

// Bloque ocupado por una cita existente: de su inicio al fin guardado.
export function blockOf(a: { scheduledAt: Date; agendaBlockEndsAt: Date }): Interval {
  return { startsAt: a.scheduledAt, endsAt: a.agendaBlockEndsAt };
}

// Intervalos semiabiertos [inicio, fin): dos bloques contiguos no se cruzan.
export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

// DA-5: M08 filtra los horarios de M07 sin modificar M07.
export function excludeBusy<T extends { startsAt: string; endsAt: string }>(slots: readonly T[], busy: readonly Interval[]): T[] {
  return slots.filter((s) => {
    const slot = { startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) };
    return !busy.some((b) => overlaps(slot, b));
  });
}
