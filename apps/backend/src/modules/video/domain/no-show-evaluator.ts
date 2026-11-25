import { addMinutes, doctorDeadline, patientToleranceEndsAt, totalLimitAt, type DoctorAvailability, type SessionPolicy } from './session-policy';
import { eventsOf, firstJoinAt, isPresentAt, lastEventAt, type SessionEvent } from './presence';

// Evaluador de inasistencias (RF-21; RN-025, RN-026, RN-030, RN-032, RN-033; C-26; AP-24, AP-25). Función pura.
//
// Reglas (Video-diseno.md §5; escenarios N1–N13 de M08-diseno.md A.11.3):
// - R1 (RN-026, inmediata): en T0 + Tol, el paciente nunca se conectó y el médico está en la sala de esta cita.
// - R2 (RN-026, RN-030): el médico entra a esta cita antes de D, después de la tolerancia, y el paciente nunca se conectó.
// - R3 (RN-030, AP-25): en D, el paciente no fue puntual y el médico no entró antes de D → no_show_both.
// - R4 (RN-025, RN-032, AP-24): en D, el paciente fue puntual, no hubo admisión, y además está disponible o el médico no
//   entró antes de D → no_show_doctor.
// - R5 (RN-033, escenario N13): el paciente puntual se retiró, el médico entró antes de D y el paciente no volvió al
//   terminar la ventana del médico contada desde su llegada.
// - R6 (AP-25, N8): los dos presentes antes de D → consulta normal; la decide la admisión.
// - R7 (hueco A, aprobado 2026-11-25; AP-24, A.11.2, RN-033): si el plazo de R5 pasa de T0 + L, se decide en T0 + L.
//   Paciente no disponible → no_show_patient (A1); disponible y sin admisión → no_show_doctor (A2).
// - R8 (hueco B1, aprobado 2026-11-25; AP-25, RN-026): paciente tardío ausente cuando entra el médico (antes de D) y sin
//   admisión → no_show_patient en D.
// - R9 (hueco B2, aprobado 2026-11-25; AP-25, RN-025): paciente tardío presente cuando entra el médico (antes de D) y
//   sin admisión → no_show_doctor en D. La admisión solo cabe antes de D.
//
// Lo que el Maestro no define NO se clasifica: queda `pending` con su motivo y la cita sigue confirmed.
// - no_rule: cualquier combinación que ninguna regla cubre.
//
// La evaluación es histórica: cada regla se mira en su propio instante, sin los eventos posteriores. Por eso el
// resultado no depende de cuándo se ejecute (al entrar a la sala, en un latido o en el barrido del CLI).

export type NoShowOutcome = 'patient' | 'doctor' | 'both';
export type NoShowRule = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R7' | 'R8' | 'R9';
export type PendingReason = 'no_rule';

export type Evaluation =
  | { kind: 'started' }
  | { kind: 'waiting' }
  | { kind: 'determined'; outcome: NoShowOutcome; rule: NoShowRule; at: Date }
  | { kind: 'pending'; reason: PendingReason; since: Date };

export interface EvaluationInput {
  scheduledAt: Date;
  policy: SessionPolicy;
  doctor: DoctorAvailability;
  events: readonly SessionEvent[];
  // meeting.started_at: con admisión ya no cabe inasistencia (RN-025: «sin inicio»).
  startedAt: Date | null;
  now: Date;
}

type Candidate = { at: Date; result: Exclude<Evaluation, { kind: 'started' } | { kind: 'waiting' }> };

// Disponibilidad del paciente en `t` (A.9.2, AP-6): se conectó a tiempo y en `t` está conectado, o lleva menos de G
// desconectado de forma involuntaria. Tras una salida voluntaria no está disponible hasta que vuelve.
export function patientAvailableAt(events: readonly SessionEvent[], punctual: boolean, graceMinutes: number, t: Date): boolean {
  if (!punctual) return false;
  const last = lastEventAt(events, 'patient', t);
  if (!last) return false;
  if (last.type === 'joined') return true;
  if (last.type === 'left') return t.getTime() < addMinutes(last.at, graceMinutes).getTime();
  return false;
}

const doctorJoins = (events: readonly SessionEvent[]) => eventsOf(events, 'doctor').filter((e) => e.type === 'joined').map((e) => e.at);

export function evaluateNoShow(input: EvaluationInput): Evaluation {
  if (input.startedAt) return { kind: 'started' };
  const { scheduledAt: t0, policy, events, now } = input;
  const tolEnd = patientToleranceEndsAt(t0, policy);
  const deadline = doctorDeadline(t0, input.doctor, policy);
  const cap = totalLimitAt(t0, policy);
  const firstPatient = firstJoinAt(events, 'patient');
  const punctual = firstPatient !== null && firstPatient <= tolEnd;
  const neverJoinedBy = (t: Date) => firstPatient === null || firstPatient > t;
  const joins = doctorJoins(events);
  const doctorJoinedBefore = (t: Date) => joins.some((j) => j < t);
  const available = (t: Date) => patientAvailableAt(events, punctual, policy.reconnectGraceMinutes, t);

  const candidates: Candidate[] = [];
  const determined = (at: Date, outcome: NoShowOutcome, rule: NoShowRule) => candidates.push({ at, result: { kind: 'determined', outcome, rule, at } });
  const pending = (at: Date, reason: PendingReason) => candidates.push({ at, result: { kind: 'pending', reason, since: at } });

  // R1: en T0 + Tol, con el médico en la sala de esta cita y el paciente sin haberse conectado.
  if (isPresentAt(events, 'doctor', tolEnd) && neverJoinedBy(tolEnd)) determined(tolEnd, 'patient', 'R1');

  // R2: la primera entrada del médico después de la tolerancia y antes de D, con el paciente sin haberse conectado.
  const lateDoctor = joins.find((j) => j > tolEnd && j < deadline);
  if (lateDoctor && neverJoinedBy(lateDoctor)) determined(lateDoctor, 'patient', 'R2');

  if (!punctual && !doctorJoinedBefore(deadline)) {
    determined(deadline, 'both', 'R3');
  } else if (punctual && (available(deadline) || !doctorJoinedBefore(deadline))) {
    determined(deadline, 'doctor', 'R4');
  } else if (punctual) {
    // El médico entró antes de D y el paciente no está disponible en D: RN-033 si el paciente ya se había retirado.
    const arrival = joins.find((j) => j > firstPatient! && j < deadline && !available(j));
    if (!arrival) {
      pending(deadline, 'no_rule');
    } else {
      const r5 = addMinutes(arrival, policy.doctorWaitMinutes);
      // R7 (hueco A): el tope T0 + L recorta la ventana del médico; no hay espera adicional.
      if (r5 > cap) determined(cap, available(cap) ? 'doctor' : 'patient', 'R7');
      else if (available(r5)) pending(r5, 'no_rule');
      else determined(r5, 'patient', 'R5');
    }
  } else if (firstPatient === null) {
    // Paciente sin conexión y médico que entró antes de D sin que R1 ni R2 lo cubran (por ejemplo, entró y salió antes
    // de la tolerancia y no volvió).
    pending(deadline, 'no_rule');
  } else {
    // Hueco B: paciente tardío y médico que entró antes de D, sin admisión antes de D. N8 (los dos presentes y
    // admitidos) es consulta normal; sin admisión: R9 si el paciente estaba presente al entrar el médico, si no R8.
    const presentAtDoctorArrival = joins.some((j) => j >= firstPatient && j < deadline && isPresentAt(events, 'patient', j));
    if (presentAtDoctorArrival) determined(deadline, 'doctor', 'R9');
    else determined(deadline, 'patient', 'R8');
  }

  const due = candidates.filter((c) => c.at <= now).sort((a, b) => a.at.getTime() - b.at.getTime());
  // A igual hora, un resultado determinado precede a un pendiente (el orden de inserción ya lo garantiza).
  return due[0]?.result ?? { kind: 'waiting' };
}
