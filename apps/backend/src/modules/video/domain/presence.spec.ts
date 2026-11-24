import { advanceLastSeen, expiredPresence, firstJoinAt, isPresentAt, PRESENCE_TIMEOUT_SECONDS, type SessionEvent } from './presence';

const T = new Date('2026-11-20T16:00:00.000Z');
const s = (seconds: number) => new Date(T.getTime() + seconds * 1000);
const ev = (type: SessionEvent['type'], at: number): SessionEvent => ({ participant: 'patient', type, at: s(at) });

describe('Presencia lógica (decisión 5)', () => {
  it('[TC-VID-040] sin latido durante más de 45 s se registra `left` con la hora del último latido', () => {
    const events = [ev('joined', 0)];
    expect(expiredPresence(events, 'patient', s(30), s(30 + PRESENCE_TIMEOUT_SECONDS))).toBeNull();
    expect(expiredPresence(events, 'patient', s(30), s(30 + PRESENCE_TIMEOUT_SECONDS + 1))).toEqual({ participant: 'patient', type: 'left', at: s(30) });
  });

  it('[TC-VID-041] nunca hay dos `left` seguidos: una presencia ya cerrada no vuelve a cerrarse', () => {
    expect(expiredPresence([ev('joined', 0), ev('left', 30)], 'patient', s(30), s(500))).toBeNull();
    expect(expiredPresence([ev('joined', 0), ev('left_voluntarily', 30)], 'patient', s(30), s(500))).toBeNull();
  });

  it('[TC-VID-042] un latido atrasado nunca retrocede la hora registrada', () => {
    expect(advanceLastSeen(s(60), s(45))).toEqual(s(60));
    expect(advanceLastSeen(s(60), s(75))).toEqual(s(75));
    expect(advanceLastSeen(null, s(5))).toEqual(s(5));
  });

  it('[TC-VID-043] la presencia y la primera entrada se leen de los eventos, en orden', () => {
    const events = [ev('joined', 10), ev('left', 40), ev('joined', 70)];
    expect(firstJoinAt(events, 'patient')).toEqual(s(10));
    expect(isPresentAt(events, 'patient', s(50))).toBe(false);
    expect(isPresentAt(events, 'patient', s(70))).toBe(true);
    expect(isPresentAt(events, 'doctor', s(70))).toBe(false);
  });
});
