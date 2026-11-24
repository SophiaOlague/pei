// Presencia lógica en la sala de PEI (decisión 5 del diseño de videoconsulta). Es la única base de las inasistencias:
// la conexión real al proveedor de video solo existe después de la admisión y nunca decide un resultado.
//
// - El cliente envía un latido cada PRESENCE_HEARTBEAT_SECONDS. Si pasan más de PRESENCE_TIMEOUT_SECONDS sin latido,
//   la desconexión es involuntaria: se registra `left` con la hora del último latido.
// - `left_voluntarily` es la acción «Salir de la sala» (RN-026): el participante deja de estar disponible hasta que
//   vuelve a entrar.
// - Las horas son siempre del servidor. Un latido nunca reabre la presencia: solo `enter` lo hace.
// Los dos valores son parámetros técnicos aprobados (no están en el Maestro).

export const PRESENCE_HEARTBEAT_SECONDS = 15;
export const PRESENCE_TIMEOUT_SECONDS = 45;

export type Participant = 'patient' | 'doctor';
export type SessionEventType = 'joined' | 'left' | 'left_voluntarily';

export interface SessionEvent {
  participant: Participant;
  type: SessionEventType;
  at: Date;
}

// Eventos de un participante, en orden cronológico estable (a igual hora, el orden de registro).
export function eventsOf(events: readonly SessionEvent[], participant: Participant): SessionEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.participant === participant)
    .sort((a, b) => a.e.at.getTime() - b.e.at.getTime() || a.i - b.i)
    .map(({ e }) => e);
}

// Último evento del participante en o antes de `at` (null si no hay).
export function lastEventAt(events: readonly SessionEvent[], participant: Participant, at: Date): SessionEvent | null {
  let last: SessionEvent | null = null;
  for (const e of eventsOf(events, participant)) {
    if (e.at > at) break;
    last = e;
  }
  return last;
}

export const isPresentAt = (events: readonly SessionEvent[], participant: Participant, at: Date): boolean =>
  lastEventAt(events, participant, at)?.type === 'joined';

export function firstJoinAt(events: readonly SessionEvent[], participant: Participant): Date | null {
  return eventsOf(events, participant).find((e) => e.type === 'joined')?.at ?? null;
}

// ¿Venció el latido de un participante que sigue presente? Devuelve el `left` que hay que registrar (con la hora del
// último latido), o null. Así nunca hay dos `left` seguidos: solo se cierra una presencia abierta.
export function expiredPresence(
  events: readonly SessionEvent[],
  participant: Participant,
  lastSeenAt: Date | null,
  now: Date,
): SessionEvent | null {
  const last = lastEventAt(events, participant, now);
  if (last?.type !== 'joined') return null;
  const seen = lastSeenAt && lastSeenAt > last.at ? lastSeenAt : last.at;
  if (now.getTime() - seen.getTime() <= PRESENCE_TIMEOUT_SECONDS * 1000) return null;
  return { participant, type: 'left', at: seen };
}

// El latido solo avanza (un latido atrasado nunca retrocede la hora registrada).
export const advanceLastSeen = (current: Date | null, now: Date): Date => (current && current > now ? current : now);
