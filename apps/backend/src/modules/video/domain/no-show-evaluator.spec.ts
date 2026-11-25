import { evaluateNoShow, type Evaluation } from './no-show-evaluator';
import type { SessionEvent } from './presence';
import { doctorDeadline, waitingRoomOpensAt, type DoctorAvailability, type SessionPolicy } from './session-policy';

// Escenarios N1–N13 (M08-diseno.md A.11.3, AP-25) y espera protegida E5–E11 (A.10.3, AP-24), con la configuración
// inicial aprobada (AP-22): W = 30, Tol = 15, L = 60, G = 5. Sin consulta previa salvo que se indique.

const T0 = new Date('2026-11-20T16:00:00.000Z');
const m = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const POLICY: SessionPolicy = { doctorWaitMinutes: 30, patientToleranceMinutes: 15, maxProtectedWaitMinutes: 60, reconnectGraceMinutes: 5 };
const FREE: DoctorAvailability = { kind: 'free', freeSince: null };

const p = (type: SessionEvent['type'], at: number): SessionEvent => ({ participant: 'patient', type, at: m(at) });
const d = (type: SessionEvent['type'], at: number): SessionEvent => ({ participant: 'doctor', type, at: m(at) });

function evaluate(events: SessionEvent[], nowMinutes: number, doctor: DoctorAvailability = FREE, startedAt: Date | null = null): Evaluation {
  return evaluateNoShow({ scheduledAt: T0, policy: POLICY, doctor, events, startedAt, now: m(nowMinutes) });
}
const determined = (outcome: string, rule: string, at: number) => ({ kind: 'determined', outcome, rule, at: m(at) });
const pending = (reason: string, since: number) => ({ kind: 'pending', reason, since: m(since) });

describe('Evaluador de inasistencias · N1–N13 (A.11.3, AP-25)', () => {
  it.each<[string, SessionEvent[], ReturnType<typeof determined> | { kind: string }]>([
    ['N1 · paciente nunca; médico en T0+5 → no_show_patient en T0+15 (R1)', [d('joined', 5)], determined('patient', 'R1', 15)],
    ['N2 · paciente nunca; médico en T0+20 → no_show_patient en T0+20 (R2)', [d('joined', 20)], determined('patient', 'R2', 20)],
    ['N3 · nadie entra → no_show_both en T0+30 (R3)', [], determined('both', 'R3', 30)],
    ['N4 · paciente nunca; médico en T0+40 → no_show_both en T0+30 (R3)', [d('joined', 40)], determined('both', 'R3', 30)],
    ['N5 · paciente en T0+5; médico nunca → no_show_doctor en T0+30 (R4)', [p('joined', 5)], determined('doctor', 'R4', 30)],
    ['N6 · paciente en T0+5; médico en T0+40 → no_show_doctor en T0+30 (R4)', [p('joined', 5), d('joined', 40)], determined('doctor', 'R4', 30)],
    ['N7 · paciente en T0+20; médico en T0+5 → no_show_patient en T0+15 (R1)', [d('joined', 5), p('joined', 20)], determined('patient', 'R1', 15)],
    ['N8 · paciente en T0+20; médico en T0+25 → sin inasistencia antes de D (R6)', [p('joined', 20), d('joined', 25)], { kind: 'waiting' }],
    ['N9 · paciente en T0+20; médico nunca → no_show_both en T0+30 (R3, AP-25)', [p('joined', 20)], determined('both', 'R3', 30)],
    ['N10 · paciente en T0+20; médico en T0+40 → no_show_both en T0+30 (R3, AP-25)', [p('joined', 20), d('joined', 40)], determined('both', 'R3', 30)],
    ['N11 · paciente en T0+35; médico nunca → no_show_both en T0+30 (R3)', [p('joined', 35)], determined('both', 'R3', 30)],
    ['N12 · paciente a tiempo, sale en T0+10; médico nunca → no_show_doctor (R4, RN-032)', [p('joined', 0), p('left_voluntarily', 10)], determined('doctor', 'R4', 30)],
    ['N13 · paciente a tiempo, sale en T0+10 y no vuelve; médico en T0+20 → no_show_patient en T0+50 (R5, RN-033)', [p('joined', 0), p('left_voluntarily', 10), d('joined', 20)], determined('patient', 'R5', 50)],
  ])('[TC-VID-001] %s', (_label, events, expected) => {
    const now = expected.kind === 'waiting' ? 29 : 90;
    expect(evaluate(events, now)).toEqual(expected);
  });

  it('[TC-VID-002][AP-25] N8 con admisión es una consulta normal: con started_at no se determina nada', () => {
    expect(evaluate([p('joined', 20), d('joined', 25)], 90, FREE, m(26))).toEqual({ kind: 'started' });
  });

  it('[TC-VID-003] antes del instante de cada regla no se determina nada (la sala sigue en espera)', () => {
    expect(evaluate([d('joined', 5)], 14)).toEqual({ kind: 'waiting' });
    expect(evaluate([], 29)).toEqual({ kind: 'waiting' });
    expect(evaluate([p('joined', 0), p('left_voluntarily', 10), d('joined', 20)], 49)).toEqual({ kind: 'waiting' });
  });

  it('[TC-VID-004] la evaluación es histórica: una llegada posterior al instante de la regla no la cambia', () => {
    // N7 evaluado tarde, con el paciente ya conectado, sigue siendo no_show_patient en T0+15.
    expect(evaluate([d('joined', 5), p('joined', 20)], 25)).toEqual(determined('patient', 'R1', 15));
    // N4 evaluado después de que llegue el médico: no_show_both en T0+30.
    expect(evaluate([d('joined', 40)], 45)).toEqual(determined('both', 'R3', 30));
  });
});

describe('Evaluador · espera protegida (A.10.3, AP-24, C-26)', () => {
  it('[TC-VID-010] E5 · la consulta previa termina en T0+20 y el médico no admite → no_show_doctor en T0+50', () => {
    expect(evaluate([p('joined', -5)], 90, { kind: 'free', freeSince: m(20) })).toEqual(determined('doctor', 'R4', 50));
  });

  it('[TC-VID-011] E6 · la consulta previa termina en T0+50 → plazo en el tope T0+60', () => {
    expect(evaluate([p('joined', -5)], 59, { kind: 'free', freeSince: m(50) })).toEqual({ kind: 'waiting' });
    expect(evaluate([p('joined', -5)], 60, { kind: 'free', freeSince: m(50) })).toEqual(determined('doctor', 'R4', 60));
  });

  it('[TC-VID-012][AP-24] E7 · el médico sigue en otra consulta después de T0+60 → no_show_doctor en T0+60', () => {
    expect(evaluate([p('joined', 0)], 45, { kind: 'busy' })).toEqual({ kind: 'waiting' });
    expect(evaluate([p('joined', 0)], 60, { kind: 'busy' })).toEqual(determined('doctor', 'R4', 60));
  });

  it('[TC-VID-013] E8 · médico ocupado en T0+15, paciente nunca; el médico entra en T0+20 → no_show_patient en T0+20', () => {
    expect(evaluate([d('joined', 20)], 25, { kind: 'free', freeSince: m(20) })).toEqual(determined('patient', 'R2', 20));
  });

  it('[TC-VID-014] E9 · médico ocupado hasta después de T0+60, paciente nunca → no_show_both en T0+60', () => {
    expect(evaluate([], 60, { kind: 'busy' })).toEqual(determined('both', 'R3', 60));
  });

  it('[TC-VID-015] E10 · desconexión involuntaria en T0+10 y regreso en T0+13: sigue disponible', () => {
    const events = [p('joined', 0), p('left', 10), p('joined', 13)];
    expect(evaluate(events, 30)).toEqual(determined('doctor', 'R4', 30));
  });

  it('[TC-VID-016] E11 · desconexión involuntaria sin regreso; el médico queda libre y entra en T0+20 → no_show_patient en T0+50', () => {
    const events = [p('joined', 0), p('left', 10), d('joined', 20)];
    expect(evaluate(events, 50, { kind: 'free', freeSince: m(20) })).toEqual(determined('patient', 'R5', 50));
  });

  it('[TC-VID-017][RN-026] la gracia G solo cubre la desconexión involuntaria, no la salida voluntaria', () => {
    // Desconexión involuntaria en T0+27: en D (T0+30) lleva 3 min < G → disponible → no_show_doctor.
    expect(evaluate([p('joined', 0), p('left', 27), d('joined', 28)], 30)).toEqual(determined('doctor', 'R4', 30));
    // Salida voluntaria en T0+27 con el médico en la sala: no disponible en D; R5 se decide en T0+58.
    expect(evaluate([p('joined', 0), p('left_voluntarily', 27), d('joined', 28)], 58)).toEqual(determined('patient', 'R5', 58));
  });
});

describe('Evaluador · huecos A y B (R7, R8, R9; aprobados el 2026-11-25)', () => {
  it('[TC-VID-020][hueco A · A1] el plazo de R5 pasa de T0 + L: no_show_patient en T0 + L (R7), sin espera adicional', () => {
    // Médico ocupado hasta T0+50; el paciente puntual se fue; el médico entra en T0+50 → R5 sería T0+80 > T0+60.
    const events = [p('joined', 0), p('left_voluntarily', 10), d('joined', 50)];
    const doctor: DoctorAvailability = { kind: 'free', freeSince: m(50) };
    expect(evaluate(events, 59, doctor)).toEqual({ kind: 'waiting' });
    expect(evaluate(events, 60, doctor)).toEqual(determined('patient', 'R7', 60));
    expect(evaluate(events, 200, doctor)).toEqual(determined('patient', 'R7', 60));
  });

  it('[TC-VID-024][hueco A · A2] el paciente vuelve y está disponible en T0 + L sin admisión: no_show_doctor (R7)', () => {
    // Médico libre en T0+20 → D = T0+50. Entra en T0+45 con el paciente fuera; R5 sería T0+75 > T0+60.
    const events = [p('joined', 0), p('left_voluntarily', 10), d('joined', 45), p('joined', 55)];
    const doctor: DoctorAvailability = { kind: 'free', freeSince: m(20) };
    expect(evaluate(events, 59, doctor)).toEqual({ kind: 'waiting' });
    expect(evaluate(events, 60, doctor)).toEqual(determined('doctor', 'R7', 60));
    expect(evaluate(events, 300, doctor)).toEqual(determined('doctor', 'R7', 60));
    // Mismo caso sin regreso: A1.
    expect(evaluate(events.slice(0, 3), 60, doctor)).toEqual(determined('patient', 'R7', 60));
  });

  it('[TC-VID-021][hueco B1] paciente tardío que sale antes de que llegue el médico: no_show_patient en D (R8)', () => {
    const events = [p('joined', 20), p('left_voluntarily', 22), d('joined', 25)];
    expect(evaluate(events, 29)).toEqual({ kind: 'waiting' });
    expect(evaluate(events, 30)).toEqual(determined('patient', 'R8', 30));
    expect(evaluate(events, 90)).toEqual(determined('patient', 'R8', 30));
  });

  it('[TC-VID-022][hueco B2] paciente tardío presente al que el médico no admite antes de D: no_show_doctor en D (R9)', () => {
    expect(evaluate([p('joined', 20), d('joined', 25)], 29)).toEqual({ kind: 'waiting' });
    expect(evaluate([p('joined', 20), d('joined', 25)], 30)).toEqual(determined('doctor', 'R9', 30));
    expect(evaluate([p('joined', 20), d('joined', 25)], 500)).toEqual(determined('doctor', 'R9', 30));
    // N8 sigue siendo consulta normal si la admisión ocurre antes de D.
    expect(evaluate([p('joined', 20), d('joined', 25)], 500, FREE, m(29))).toEqual({ kind: 'started' });
  });
});

describe('Evaluador · casos pendientes (sin regla en el Maestro)', () => {
  it('[TC-VID-023] combinaciones que ninguna regla cubre quedan pendientes (no_rule), nunca con un resultado', () => {
    // El médico entra y sale antes de la tolerancia y no vuelve; el paciente nunca se conecta.
    expect(evaluate([d('joined', 5), d('left_voluntarily', 10)], 90)).toEqual(pending('no_rule', 30));
    // N13 en el que el paciente vuelve, pero el médico no lo admite al terminar su ventana.
    expect(evaluate([p('joined', 0), p('left_voluntarily', 10), d('joined', 20), p('joined', 40)], 90)).toEqual(pending('no_rule', 50));
  });
});

describe('Plazos de la sesión (session-policy)', () => {
  it('[TC-VID-030][C-30] la sala abre 15 minutos antes de la hora programada', () => {
    expect(waitingRoomOpensAt(T0)).toEqual(m(-15));
  });

  it('[TC-VID-031][AP-24] D = min(max(T0, F) + W, T0 + L), sin sumar la espera protegida a la ventana', () => {
    expect(doctorDeadline(T0, FREE, POLICY)).toEqual(m(30));
    expect(doctorDeadline(T0, { kind: 'free', freeSince: m(-20) }, POLICY)).toEqual(m(30));
    expect(doctorDeadline(T0, { kind: 'free', freeSince: m(20) }, POLICY)).toEqual(m(50));
    expect(doctorDeadline(T0, { kind: 'free', freeSince: m(45) }, POLICY)).toEqual(m(60));
    expect(doctorDeadline(T0, { kind: 'busy' }, POLICY)).toEqual(m(60));
  });
});
