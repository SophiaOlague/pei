import { addDays, AGENDA_TIME_ZONE, localDateOf, localToUtc, parseLocalDate, weekdayOf } from './agenda-time';
import { assertAppointmentDuration, effectiveDuration, isValidAppointmentDuration } from './appointment-duration';
import { InvalidAppointmentDurationError, InvalidSlotRangeError, InvalidTimeOffError, InvalidWeeklyScheduleError } from './agenda.errors';
import { buildWeeklySchedule, toWindowInput } from './weekly-schedule';
import { generateSlots, rangeBounds, resolveSlotRange } from './slot-generator';
import { validateTimeOff } from './time-off';

// Lunes 9 de noviembre de 2026; el centro de México es UTC-6 todo el año.
const MONDAY = parseLocalDate('2026-11-09')!;
const NOW = new Date('2026-11-08T12:00:00Z');

describe('M07 dominio: zona horaria (D-1)', () => {
  it('[TC-M07-001][D-1] la zona es America/Mexico_City y las horas locales se convierten a UTC (UTC-6)', () => {
    expect(AGENDA_TIME_ZONE).toBe('America/Mexico_City');
    expect(localToUtc(MONDAY, 9 * 60).toISOString()).toBe('2026-11-09T15:00:00.000Z');
    expect(localToUtc(MONDAY, 24 * 60).toISOString()).toBe('2026-11-10T06:00:00.000Z');
    expect(localDateOf(new Date('2026-11-10T05:59:00Z'))).toEqual(MONDAY);
    expect(weekdayOf(MONDAY)).toBe(1);
    expect(addDays(parseLocalDate('2026-12-31')!, 1)).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it('[TC-M07-002] fechas inválidas se rechazan', () => {
    for (const v of ['2026-02-30', '2026-13-01', '26-11-09', '', 7]) expect(parseLocalDate(v)).toBeNull();
  });
});

describe('M07 dominio: duración de la consulta (D-3)', () => {
  it.each([15, 30, 45, 120])('[TC-M07-003][D-3][RF-10] %i minutos es válido', (m) => expect(assertAppointmentDuration(m)).toBe(m));
  it.each([10, 14, 17, 125, 0, -5, 30.5, '30', null])('[TC-M07-004][D-3] %p se rechaza', (m) => {
    expect(isValidAppointmentDuration(m)).toBe(false);
    expect(() => assertAppointmentDuration(m)).toThrow(InvalidAppointmentDurationError);
  });
  it('[TC-M07-005][D-3] un valor histórico fuera de rango se trata como 30', () => {
    expect(effectiveDuration(7)).toBe(30);
    expect(effectiveDuration(45)).toBe(45);
  });
});

describe('M07 dominio: horario semanal (RF-10, D-4)', () => {
  it('[TC-M07-006][RF-10] normaliza y ordena; acepta 24:00 como fin', () => {
    const w = buildWeeklySchedule([
      { weekday: 2, start: '16:00', end: '20:00' },
      { weekday: 1, start: '09:00', end: '13:00' },
      { weekday: 1, start: '22:00', end: '24:00' },
      { weekday: 2, start: '00:00', end: '02:00' },
    ]);
    expect(w.map(toWindowInput)).toEqual([
      { weekday: 1, start: '09:00', end: '13:00' },
      { weekday: 1, start: '22:00', end: '24:00' },
      { weekday: 2, start: '00:00', end: '02:00' },
      { weekday: 2, start: '16:00', end: '20:00' },
    ]);
    expect(buildWeeklySchedule([])).toEqual([]);
  });

  it.each([
    [{ weekday: 7, start: '09:00', end: '10:00' }],
    [{ weekday: 1, start: '9:00', end: '10:00' }],
    [{ weekday: 1, start: '24:00', end: '24:00' }],
    [{ weekday: 1, start: '10:00', end: '10:00' }],
    [{ weekday: 1, start: '22:00', end: '02:00' }],
  ])('[TC-M07-007][D-4] franja inválida %p', (w) => {
    expect(() => buildWeeklySchedule([w])).toThrow(InvalidWeeklyScheduleError);
  });

  it('[TC-M07-008][D-4] franjas solapadas el mismo día se rechazan; contiguas no', () => {
    expect(() => buildWeeklySchedule([{ weekday: 3, start: '09:00', end: '12:00' }, { weekday: 3, start: '11:59', end: '14:00' }])).toThrow(/solapadas/);
    expect(buildWeeklySchedule([{ weekday: 3, start: '09:00', end: '12:00' }, { weekday: 3, start: '12:00', end: '14:00' }])).toHaveLength(2);
    expect(buildWeeklySchedule([{ weekday: 3, start: '09:00', end: '12:00' }, { weekday: 4, start: '09:00', end: '12:00' }])).toHaveLength(2);
  });

  it('[TC-M07-009][D-4] máximo 6 franjas por día', () => {
    const day = (n: number) => Array.from({ length: n }, (_, i) => ({ weekday: 5, start: `${String(8 + i).padStart(2, '0')}:00`, end: `${String(8 + i).padStart(2, '0')}:30` }));
    expect(buildWeeklySchedule(day(6))).toHaveLength(6);
    expect(() => buildWeeklySchedule(day(7))).toThrow(/máximo 6/);
  });
});

describe('M07 dominio: periodos no disponibles (RF-11)', () => {
  it('[TC-M07-010][RF-11] valida rango, fin futuro, horizonte y motivo', () => {
    const ok = validateTimeOff({ startsAt: new Date('2026-11-20T06:00:00Z'), endsAt: new Date('2026-11-21T06:00:00Z'), reason: '  Congreso ' }, NOW);
    expect(ok.reason).toBe('Congreso');
    expect(validateTimeOff({ ...ok, reason: '   ' }, NOW).reason).toBeNull();
    expect(() => validateTimeOff({ ...ok, endsAt: ok.startsAt }, NOW)).toThrow(InvalidTimeOffError);
    expect(() => validateTimeOff({ startsAt: new Date('2026-11-01T00:00:00Z'), endsAt: new Date('2026-11-02T00:00:00Z'), reason: null }, NOW)).toThrow(/terminó/);
    expect(() => validateTimeOff({ startsAt: new Date('2028-01-01T00:00:00Z'), endsAt: new Date('2028-01-02T00:00:00Z'), reason: null }, NOW)).toThrow(/365/);
    expect(() => validateTimeOff({ ...ok, reason: 'x'.repeat(201) }, NOW)).toThrow(/200/);
    expect(() => validateTimeOff({ ...ok, startsAt: new Date('nope') }, NOW)).toThrow(/fechas/);
  });
});

describe('M07 dominio: generación de horarios (D-5)', () => {
  const windows = buildWeeklySchedule([{ weekday: 1, start: '09:00', end: '10:00' }]);

  it('[TC-M07-011][RF-10] divide cada franja en bloques completos de la duración', () => {
    const slots = generateSlots({ range: resolveSlotRange('2026-11-09', '2026-11-09', NOW), windows, durationMinutes: 25, timeOff: [], busy: [], now: NOW });
    expect(slots.map((s) => `${s.start}-${s.end}`)).toEqual(['09:00-09:25', '09:25-09:50']);
    expect(slots[0]).toMatchObject({ date: '2026-11-09', startsAt: '2026-11-09T15:00:00.000Z', endsAt: '2026-11-09T15:25:00.000Z' });
  });

  it('[TC-M07-012][RF-11] excluye los que se cruzan con periodos no disponibles u ocupados; los contiguos se conservan', () => {
    const range = resolveSlotRange('2026-11-09', '2026-11-09', NOW);
    const slots = generateSlots({
      range, windows, durationMinutes: 15, now: NOW,
      timeOff: [{ startsAt: new Date('2026-11-09T15:15:00Z'), endsAt: new Date('2026-11-09T15:30:00Z') }],
      busy: [{ startsAt: new Date('2026-11-09T15:40:00Z'), endsAt: new Date('2026-11-09T15:41:00Z') }],
    });
    // 09:15–09:30 no disponible; la cita de 09:40 ocupa el bloque 09:30–09:45.
    expect(slots.map((s) => s.start)).toEqual(['09:00', '09:45']);
  });

  it('[TC-M07-013] excluye horarios que empiezan antes de ahora y recorre varias semanas', () => {
    const now = new Date('2026-11-09T15:10:00Z');
    const slots = generateSlots({ range: resolveSlotRange('2026-11-09', '2026-11-23', now), windows, durationMinutes: 30, timeOff: [], busy: [], now });
    expect(slots.map((s) => `${s.date} ${s.start}`)).toEqual(['2026-11-09 09:30', '2026-11-16 09:00', '2026-11-16 09:30', '2026-11-23 09:00', '2026-11-23 09:30']);
  });

  it('[TC-M07-014][D-4] un horario que cruza la medianoche (dos franjas) genera horarios continuos', () => {
    const night = buildWeeklySchedule([{ weekday: 1, start: '23:00', end: '24:00' }, { weekday: 2, start: '00:00', end: '01:00' }]);
    const slots = generateSlots({ range: resolveSlotRange('2026-11-09', '2026-11-10', NOW), windows: night, durationMinutes: 30, timeOff: [], busy: [], now: NOW });
    expect(slots.map((s) => s.startsAt)).toEqual(['2026-11-10T05:00:00.000Z', '2026-11-10T05:30:00.000Z', '2026-11-10T06:00:00.000Z', '2026-11-10T06:30:00.000Z']);
  });

  it('[TC-M07-015][D-5] rango: formato, orden, 31 días máximo y horizonte de 90 días', () => {
    expect(() => resolveSlotRange('2026/11/09', '2026-11-10', NOW)).toThrow(InvalidSlotRangeError);
    expect(() => resolveSlotRange('2026-11-10', '2026-11-09', NOW)).toThrow(/posterior/);
    expect(() => resolveSlotRange('2026-11-09', '2026-12-10', NOW)).toThrow(/31/);
    expect(resolveSlotRange('2026-11-09', '2026-12-09', NOW).to).toEqual({ year: 2026, month: 12, day: 9 });
    expect(() => resolveSlotRange('2027-02-01', '2027-02-07', NOW)).toThrow(/90/);
    expect(() => resolveSlotRange('2027-02-01', '2027-02-06', NOW)).not.toThrow();
    const b = rangeBounds(resolveSlotRange('2026-11-09', '2026-11-09', NOW));
    expect([b.startsAt.toISOString(), b.endsAt.toISOString()]).toEqual(['2026-11-09T06:00:00.000Z', '2026-11-10T06:00:00.000Z']);
  });
});
