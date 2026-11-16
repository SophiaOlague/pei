// Fechas locales (AAAA-MM-DD) de la zona de la plataforma (D-1 de M07: America/Mexico_City) para pedir horarios a
// AgendaService.generateSlots, que recibe fechas locales. Solo se usa para construir rangos; la validación del rango
// (31 días, 90 de horizonte) la sigue haciendo M07.
export const PLATFORM_TIME_ZONE = 'America/Mexico_City';

const FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: PLATFORM_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

export function localDateString(instant: Date): string {
  return FORMATTER.format(instant); // en-CA produce AAAA-MM-DD
}

export function addLocalDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// Horizonte del listado de médicos (CC-6): el rango máximo que acepta M07 (31 días, D-5).
export const LISTING_HORIZON_DAYS = 31;
