import { AGENDA_TIME_ZONE } from "@/lib/api";

// Conversión entre la hora del centro de México y UTC (D-1), con Intl para no suponer el desfase.
const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: AGENDA_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zoned(instant: Date) {
  const p: Record<string, number> = {};
  for (const x of parts.formatToParts(instant))
    if (x.type !== "literal") p[x.type] = Number(x.value);
  return p as Record<
    "year" | "month" | "day" | "hour" | "minute" | "second",
    number
  >;
}

function offsetAt(instant: Date): number {
  const p = zoned(instant);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    Math.floor(instant.getTime() / 1000) * 1000
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

// "AAAA-MM-DDTHH:MM" en hora del centro de México → ISO UTC. null si el valor no es válido.
export function mexicoCityToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(naive)) return null;
  const first = naive - offsetAt(new Date(naive));
  return new Date(naive - offsetAt(new Date(first))).toISOString();
}

// Fecha de hoy (AAAA-MM-DD) en el centro de México, más `days` días.
export function mexicoCityDate(now: Date, days = 0): string {
  const p = zoned(now);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const display = new Intl.DateTimeFormat("es-MX", {
  timeZone: AGENDA_TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatMexicoCity(iso: string): string {
  return display.format(new Date(iso));
}

const dayTitle = new Intl.DateTimeFormat("es-MX", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
});

// "2026-11-09" → "lunes, 9 de noviembre" (la fecha ya es local; se formatea sin desplazarla).
export function formatLocalDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return dayTitle.format(new Date(Date.UTC(y, m - 1, d)));
}
