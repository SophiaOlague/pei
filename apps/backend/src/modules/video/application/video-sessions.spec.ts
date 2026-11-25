import { randomUUID } from 'crypto';
import type { Actor } from '../../../common/application/actor';
import { FixedClock, InMemoryAppointmentsUnitOfWork, InMemoryAppointmentsWorld, DoctorNotOperationalTestError } from '../../../../test/support/appointments-in-memory';
import { FakeVideoProvider, InMemoryMeetingRepository, SequentialIds, VideoTestUnitOfWork, WorldDoctorOperationalCheck } from '../../../../test/support/video-in-memory';
import { AppointmentSessionService } from '../../appointments/application/integration/appointment-integration.services';
import { CancellationPolicyService } from '../../appointments/application/use-cases/configuration.use-cases';
import { APPOINTMENT_AUDIT_ACTIONS } from '../../appointments/application/appointments-audit-events';
import { AppointmentNotFoundError, InvalidAppointmentStateError } from '../../appointments/domain/appointments.errors';
import { INITIAL_POLICY } from '../../appointments/domain/cancellation-policy';
import { DoctorBusyError, DoctorNotInRoomError, PatientNotWaitingError, SessionEndedError, SessionNotActiveError, SessionNotOpenError, VideoProviderUnavailableError } from '../domain/video.errors';
import { SessionEngine } from './session-engine';
import { DoctorSessionUseCases } from './use-cases/doctor-session.use-cases';
import { EvaluateSessionsUseCase } from './use-cases/evaluate-sessions.use-case';
import { PatientSessionUseCases } from './use-cases/patient-session.use-cases';
import { SessionAccess } from './use-cases/session-access';
import { VIDEO_AUDIT_ACTIONS } from './video-audit-events';
import type { VideoProvider } from './ports/video.ports';
import { RealtimeKitVideoProvider } from '../infrastructure/provider/realtimekit-video-provider';
import { FakeRealtimeKitApi, respond, RTK_SETTINGS } from '../../../../test/support/realtimekit-fake';

// Casos de uso de videoconsulta con dobles en memoria (sin BD ni proveedor real). La política aplicada es la
// configuración inicial aprobada (AP-22): W = 30, Tol = 15, L = 60, G = 5.

const T0 = new Date('2026-11-20T16:00:00.000Z');
const at = (minutes: number, seconds = 0) => new Date(T0.getTime() + minutes * 60_000 + seconds * 1000);
const actor = (role: 'patient' | 'doctor' | 'admin', userProfileId: string = randomUUID()): Actor => ({
  userId: `u-${userProfileId}`, userProfileId, role, ipAddress: '203.0.113.9', userAgent: 'PEI-video-test',
});

async function setup() {
  return build(new FakeVideoProvider());
}

async function build<P extends VideoProvider>(provider: P) {
  const world = new InMemoryAppointmentsWorld();
  const inner = new InMemoryAppointmentsUnitOfWork(world);
  const meetings = new InMemoryMeetingRepository(world);
  const uow = new VideoTestUnitOfWork(inner, meetings);
  const clock = new FixedClock(new Date('2026-11-01T12:00:00Z'));
  await new CancellationPolicyService(uow, world, world.policies, clock).publish(actor('admin'), { ...INITIAL_POLICY }, 'initial_setup');
  const sessions = new AppointmentSessionService(uow, world, world, world.policies, clock, inner.events);
  const operational = new WorldDoctorOperationalCheck(world);
  const engine = new SessionEngine(meetings, new SequentialIds(), clock, sessions);
  const access = new SessionAccess(meetings, provider);
  const env = {
    world, inner, meetings, uow, clock, sessions, provider,
    patientUc: new PatientSessionUseCases(uow, engine, access),
    doctorUc: new DoctorSessionUseCases(uow, uow, world, clock, meetings, provider, operational, sessions, engine, access),
    sweep: new EvaluateSessionsUseCase(uow, meetings, clock, engine),
  };
  return env;
}
type Env = Awaited<ReturnType<typeof setup>>;
type BaseEnv = Awaited<ReturnType<typeof build<VideoProvider>>>;

function appointmentWith(env: BaseEnv, opts: { scheduledAt?: Date; doctor?: { id: string; actor: Actor } } = {}) {
  const policyId = env.world.state.policies[0].id;
  const doctor = opts.doctor ?? (() => {
    const a = actor('doctor');
    const id = randomUUID();
    env.world.addDoctor({ id, userProfileId: a.userProfileId! });
    return { id, actor: a };
  })();
  const p = actor('patient');
  const patientId = randomUUID();
  env.world.addPatient({ id: patientId, userProfileId: p.userProfileId! });
  const id = randomUUID();
  env.world.seedAppointment({ id, patientId, doctorId: doctor.id, scheduledAt: opts.scheduledAt ?? T0, cancellationPolicyId: policyId });
  return { id, doctor, patient: { id: patientId, actor: p } };
}
const statusOf = (env: BaseEnv, id: string) => env.world.state.appointments.find((a) => a.id === id)!.status;
const now = (env: BaseEnv, minutes: number, seconds = 0) => {
  env.clock.current = at(minutes, seconds);
};
// Latidos cada 15 s de los participantes indicados, desde el minuto `from` hasta el minuto `to` (incluido).
async function keepAlive(env: Env, c: { id: string; patient?: { actor: Actor }; doctor?: { actor: Actor } }, from: number, to: number) {
  for (let t = from * 60; t <= to * 60; t += 15) {
    env.clock.current = new Date(T0.getTime() + t * 1000);
    if (c.patient) await env.patientUc.presence(c.patient.actor, c.id);
    if (c.doctor) await env.doctorUc.presence(c.doctor.actor, c.id);
  }
}

describe('Videoconsulta · sala de espera del paciente (RF-19, C-30)', () => {
  it('[TC-VID-120][C-30] la sala abre en T0 − 15: antes responde 409 con la hora de apertura y no crea la sala', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, -15, -1);
    const error = await env.patientUc.enter(c.patient.actor, c.id).catch((e) => e);
    expect(error).toBeInstanceOf(SessionNotOpenError);
    expect(error.details).toEqual({ opensAt: at(-15).toISOString() });
    expect(env.meetings.state.meetings).toEqual([]);
    now(env, -15);
    const view = await env.patientUc.enter(c.patient.actor, c.id);
    expect(view).toMatchObject({ phase: 'waiting', patient: { present: true, joinedAt: at(-15).toISOString() } });
  });

  it('[TC-VID-121] la cita de otra persona responde 404 y no escribe nada', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    const other = appointmentWith(env);
    now(env, 0);
    await expect(env.patientUc.enter(other.patient.actor, c.id)).rejects.toThrow(AppointmentNotFoundError);
    await expect(env.doctorUc.enter(other.doctor.actor, c.id)).rejects.toThrow(AppointmentNotFoundError);
    expect(env.meetings.state.meetings).toEqual([]);
  });

  it('[TC-VID-122] entrar dos veces no duplica el evento `joined`', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 0);
    await env.patientUc.enter(c.patient.actor, c.id);
    await env.patientUc.enter(c.patient.actor, c.id);
    expect(env.meetings.state.events.map((e) => e.type)).toEqual(['joined']);
  });

  it('[TC-VID-123][decisión 5] sin latido 45 s se registra `left` con la hora del último latido; un latido tardío no reabre la presencia', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 0);
    await env.patientUc.enter(c.patient.actor, c.id);
    now(env, 0, 15);
    await env.patientUc.presence(c.patient.actor, c.id);
    now(env, 1, 10); // 55 s sin latido
    const late = await env.patientUc.presence(c.patient.actor, c.id);
    expect(late.patient.present).toBe(false);
    expect(late.deadlines.reconnectGraceEndsAt).toBe(at(5, 15).toISOString());
    expect(env.meetings.state.events.map((e) => [e.type, e.at.toISOString()])).toEqual([['joined', at(0).toISOString()], ['left', at(0, 15).toISOString()]]);
    const back = await env.patientUc.enter(c.patient.actor, c.id);
    expect(back.patient.present).toBe(true);
    expect(env.meetings.state.events.map((e) => e.type)).toEqual(['joined', 'left', 'joined']);
  });

  it('[TC-VID-124][RN-026] la salida voluntaria se registra como left_voluntarily y no cancela la cita', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 0);
    await env.patientUc.enter(c.patient.actor, c.id);
    const view = await env.patientUc.leave(c.patient.actor, c.id);
    expect(view.patient.present).toBe(false);
    expect(env.meetings.state.events.map((e) => e.type)).toEqual(['joined', 'left_voluntarily']);
    expect(statusOf(env, c.id)).toBe('confirmed');
  });
});

describe('Videoconsulta · admisión y finalización (RF-18, RF-19, RF-22, CC-9)', () => {
  async function waiting(env: Env, c: ReturnType<typeof appointmentWith>, minutes = 0) {
    now(env, minutes);
    await env.patientUc.enter(c.patient.actor, c.id);
    await env.doctorUc.enter(c.doctor.actor, c.id);
  }

  it('[TC-VID-130] la admisión exige al médico en la sala y al paciente presente; fija started_at y se audita', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 0);
    await env.patientUc.enter(c.patient.actor, c.id);
    await expect(env.doctorUc.admit(c.doctor.actor, c.id)).rejects.toThrow(DoctorNotInRoomError);
    await env.doctorUc.enter(c.doctor.actor, c.id);
    await env.patientUc.leave(c.patient.actor, c.id);
    await expect(env.doctorUc.admit(c.doctor.actor, c.id)).rejects.toThrow(PatientNotWaitingError);
    await env.patientUc.enter(c.patient.actor, c.id);
    now(env, 0, 30);
    const view = await env.doctorUc.admit(c.doctor.actor, c.id);
    expect(view).toMatchObject({ phase: 'active', startedAt: at(0, 30).toISOString() });
    expect(env.world.state.audit.map((e) => e.action)).toContain(VIDEO_AUDIT_ACTIONS.admitted);
    // Repetida con la consulta activa: no hace nada.
    expect((await env.doctorUc.admit(c.doctor.actor, c.id)).startedAt).toBe(at(0, 30).toISOString());
  });

  it('[TC-VID-131][RF-18] un médico con otra consulta activa no puede entrar ni admitir', async () => {
    const env = await setup();
    const first = appointmentWith(env);
    const second = appointmentWith(env, { doctor: first.doctor, scheduledAt: at(30) });
    await waiting(env, first);
    await env.doctorUc.admit(first.doctor.actor, first.id);
    now(env, 20);
    await env.patientUc.enter(second.patient.actor, second.id);
    await expect(env.doctorUc.enter(first.doctor.actor, second.id)).rejects.toThrow(DoctorBusyError);
    const state = await env.patientUc.state(second.patient.actor, second.id);
    expect(state.doctor.busyWithAnotherConsultation).toBe(true);
    expect(state.deadlines.doctorDeadlineAt).toBe(at(90).toISOString()); // T0' + L mientras sigue ocupado
  });

  it('[TC-VID-132][RF-22] finalizar fija ended_at, la duración real, registra completed y revoca el acceso después del COMMIT', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    await waiting(env, c);
    now(env, 0, 40);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    now(env, 2);
    await env.patientUc.token(c.patient.actor, c.id);
    await env.doctorUc.token(c.doctor.actor, c.id);
    now(env, 47, 30);
    const view = await env.doctorUc.end(c.doctor.actor, c.id);
    expect(view).toMatchObject({ phase: 'ended', appointmentStatus: 'completed', startedAt: at(0, 40).toISOString(), endedAt: at(47, 30).toISOString(), durationSeconds: 46 * 60 + 50 });
    expect(statusOf(env, c.id)).toBe('completed');
    expect(env.provider.revoked.map((r) => r.participantId).sort()).toEqual([`participant-${c.id}:doctor`, `participant-${c.id}:patient`]);
    expect(env.inner.published).toEqual([expect.objectContaining({ type: 'AppointmentOutcomeRecorded', status: 'completed' })]);
    // Después de finalizar no hay credenciales nuevas; repetir la finalización no hace nada.
    await expect(env.patientUc.token(c.patient.actor, c.id)).rejects.toThrow(SessionNotActiveError);
    expect((await env.doctorUc.end(c.doctor.actor, c.id)).endedAt).toBe(at(47, 30).toISOString());
  });

  it('[TC-VID-133] la duración no depende del bloque de agenda: la consulta sigue más allá de su fin', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    await waiting(env, c);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    now(env, 125);
    expect((await env.doctorUc.end(c.doctor.actor, c.id)).durationSeconds).toBe(125 * 60);
  });

  it('[TC-VID-134][decisión 12] una consulta activa nunca se cierra sola: el barrido la lista con su inicio, sin plazo', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    await waiting(env, c);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    now(env, 60 * 24 * 3);
    const summary = await env.sweep.execute();
    expect(summary.activeConsultations).toEqual([{ appointmentId: c.id, startedAt: at(0).toISOString() }]);
    expect(statusOf(env, c.id)).toBe('confirmed');
    expect(env.meetings.state.meetings[0].status).toBe('active');
  });

  it('[TC-VID-135] sin proveedor configurado la credencial falla cerrada, pero la sala, la admisión y la finalización funcionan', async () => {
    const env = await setup();
    env.provider.fail = true;
    const c = appointmentWith(env);
    await waiting(env, c);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    await expect(env.patientUc.token(c.patient.actor, c.id)).rejects.toThrow(VideoProviderUnavailableError);
    expect((await env.doctorUc.end(c.doctor.actor, c.id)).appointmentStatus).toBe('completed');
  });
});

describe('Videoconsulta · RN-140 y la excepción de la decisión 11', () => {
  async function activeConsultation() {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 0);
    await env.patientUc.enter(c.patient.actor, c.id);
    await env.doctorUc.enter(c.doctor.actor, c.id);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    return { env, c };
  }

  it('[TC-VID-140][RN-140] sin canOperate el médico no puede entrar, enviar latidos, salir, admitir ni pedir credenciales, y nada se escribe', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 0);
    await env.patientUc.enter(c.patient.actor, c.id);
    env.world.operating.delete(c.doctor.id);
    const before = structuredClone(env.meetings.state);
    for (const op of ['enter', 'presence', 'leave', 'admit', 'token'] as const) {
      await expect(env.doctorUc[op](c.doctor.actor, c.id)).rejects.toThrow(DoctorNotOperationalTestError);
    }
    expect(env.meetings.state).toEqual(before);
  });

  it('[TC-VID-141][decisión 11] sin canOperate SÍ puede finalizar su propia consulta activa; queda auditado como excepción', async () => {
    const { env, c } = await activeConsultation();
    env.world.operating.delete(c.doctor.id);
    now(env, 30);
    const view = await env.doctorUc.end(c.doctor.actor, c.id);
    expect(view.phase).toBe('ended');
    const ended = env.world.state.audit.find((e) => e.action === VIDEO_AUDIT_ACTIONS.ended);
    expect(ended?.metadata).toMatchObject({ doctorCanOperate: false, outcomeRecorded: true });
  });

  it('[TC-VID-142][decisión 11] la excepción no abre nada más: sin canOperate no admite, no pide credenciales y no finaliza una sala que no está activa', async () => {
    const { env, c } = await activeConsultation();
    env.world.operating.delete(c.doctor.id);
    await expect(env.doctorUc.token(c.doctor.actor, c.id)).rejects.toThrow(DoctorNotOperationalTestError);
    await expect(env.doctorUc.admit(c.doctor.actor, c.id)).rejects.toThrow(DoctorNotOperationalTestError);
    const other = appointmentWith(env, { doctor: c.doctor, scheduledAt: at(60) });
    now(env, 50);
    await env.patientUc.enter(other.patient.actor, other.id);
    await expect(env.doctorUc.end(c.doctor.actor, other.id)).rejects.toThrow(SessionNotActiveError);
    await expect(env.doctorUc.enter(c.doctor.actor, other.id)).rejects.toThrow(DoctorNotOperationalTestError);
  });

  it('[TC-VID-143][decisión 11] un médico no puede finalizar la consulta de otro médico (404)', async () => {
    const { env, c } = await activeConsultation();
    const intruder = appointmentWith(env).doctor;
    await expect(env.doctorUc.end(intruder.actor, c.id)).rejects.toThrow(AppointmentNotFoundError);
    expect(env.meetings.state.meetings[0].status).toBe('active');
  });

  it('[TC-VID-144] la lectura del estado no exige canOperate (como GET /me/doctor/appointments)', async () => {
    const { env, c } = await activeConsultation();
    env.world.operating.delete(c.doctor.id);
    expect((await env.doctorUc.state(c.doctor.actor, c.id)).phase).toBe('active');
    expect((await env.doctorUc.sessionsOf(c.doctor.actor)).sessions).toEqual([expect.objectContaining({ appointmentId: c.id, phase: 'active' })]);
  });
});

describe('Videoconsulta · inasistencias registradas por el motor (RF-21)', () => {
  it('[TC-VID-150] N5: el paciente espera y el médico no llega → no_show_doctor en D, registrado por M08 con reembolso total', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 5);
    await env.patientUc.enter(c.patient.actor, c.id);
    // Sigue en la sala con latidos: hasta T0+29 no se determina nada.
    await keepAlive(env, { id: c.id, patient: c.patient }, 5, 29);
    expect(statusOf(env, c.id)).toBe('confirmed');
    now(env, 30);
    const view = await env.patientUc.presence(c.patient.actor, c.id);
    expect(view).toMatchObject({ phase: 'closed', appointmentStatus: 'no_show_doctor' });
    expect(env.world.state.audit.find((e) => e.action === APPOINTMENT_AUDIT_ACTIONS.outcomeRecorded)?.metadata).toMatchObject({ status: 'no_show_doctor', refundOutcome: 'full_refund' });
  });

  it('[TC-VID-151] N3 sin que nadie entre: lo determina el barrido del CLI en D y repetirlo no cambia nada', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 29);
    expect((await env.sweep.execute()).waiting).toBe(1);
    now(env, 30);
    expect((await env.sweep.execute()).determined).toEqual({ both: 1 });
    expect(statusOf(env, c.id)).toBe('no_show_both');
    expect((await env.sweep.execute()).examined).toBe(0);
  });

  it('[TC-VID-152][hueco B2] paciente tardío presente sin admisión: no_show_doctor en D y ya no se puede admitir', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 20);
    await env.patientUc.enter(c.patient.actor, c.id);
    await keepAlive(env, { id: c.id, patient: c.patient }, 20, 25);
    now(env, 25);
    await env.doctorUc.enter(c.doctor.actor, c.id);
    await keepAlive(env, c, 25, 30);
    // El latido de T0+30 (= D) ya evalúa y registra el resultado; el barrido posterior no lo repite.
    expect(statusOf(env, c.id)).toBe('no_show_doctor');
    const summary = await env.sweep.execute();
    expect(summary.examined).toBe(0);
    expect(summary.pending).toEqual([]);
    expect(statusOf(env, c.id)).toBe('no_show_doctor');
    // M08 auditó y publicó UNA vez el resultado con reembolso total (lo consume pagos, TC-VID-170 y 177).
    expect(env.world.state.audit.filter((e) => e.action === APPOINTMENT_AUDIT_ACTIONS.outcomeRecorded).map((e) => e.metadata)).toEqual([expect.objectContaining({ status: 'no_show_doctor', refundOutcome: 'full_refund' })]);
    const outcomes = () => env.inner.published.filter((e) => e.type === 'AppointmentOutcomeRecorded');
    expect(outcomes()).toEqual([expect.objectContaining({ appointmentId: c.id, status: 'no_show_doctor', refundOutcome: 'full_refund' })]);
    // La admisión solo cabe antes de D.
    await expect(env.doctorUc.admit(c.doctor.actor, c.id)).rejects.toThrow(InvalidAppointmentStateError);
    expect(statusOf(env, c.id)).toBe('no_show_doctor');
    // Evaluar otra vez (estado, barrido) no registra ni publica un segundo resultado.
    await env.patientUc.state(c.patient.actor, c.id);
    await env.sweep.execute();
    expect(outcomes()).toHaveLength(1);
  });

  it('[TC-VID-153] una cita ya con resultado no admite volver a entrar', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 30);
    await env.sweep.execute();
    await expect(env.patientUc.enter(c.patient.actor, c.id)).rejects.toThrow(InvalidAppointmentStateError);
  });

  it('[TC-VID-154] orden de candados: médico antes que la meeting y que la cita (DA-2)', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, 0);
    env.world.locks.length = 0;
    await env.patientUc.enter(c.patient.actor, c.id);
    expect(env.world.locks.slice(0, 2)).toEqual([`video:doctor:${c.doctor.id}`, `video:meeting:${c.id}`]);
  });
});

describe('Videoconsulta · flujo completo con el adaptador de RealtimeKit (HTTP simulado)', () => {
  async function rtkEnv() {
    const api = new FakeRealtimeKitApi();
    const env = await build(new RealtimeKitVideoProvider(RTK_SETTINGS, api.fetch));
    return { api, env };
  }

  it('[TC-VID-136] reunión, alta con presets, tokens individuales, reconexión y baja de ambos al finalizar', async () => {
    const { api, env } = await rtkEnv();
    const c = appointmentWith(env);
    now(env, 0);
    await env.patientUc.enter(c.patient.actor, c.id);
    await env.doctorUc.enter(c.doctor.actor, c.id);
    // Antes de la admisión no se llama al proveedor (decisión 4).
    expect(api.requests).toEqual([]);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    const patientToken = await env.patientUc.token(c.patient.actor, c.id);
    const doctorToken = await env.doctorUc.token(c.doctor.actor, c.id);
    expect(patientToken.provider).toBe('realtimekit');
    expect(patientToken.authToken).not.toBe(doctorToken.authToken);
    expect(api.meetings.size).toBe(1);
    const meeting = env.meetings.state.meetings[0];
    expect(api.meetings.has(meeting.roomId!)).toBe(true);
    expect(api.participants.get(meeting.patientProviderParticipantId!)?.preset).toBe('preset_patient_test');
    expect(api.participants.get(meeting.doctorProviderParticipantId!)?.preset).toBe('preset_doctor_test');
    // La respuesta al cliente nunca incluye el token de la API.
    expect(JSON.stringify([patientToken, doctorToken])).not.toContain(RTK_SETTINGS.apiToken);

    // Reconexión: mismo participante, token nuevo, sin otra reunión.
    const again = await env.patientUc.token(c.patient.actor, c.id);
    expect(again.authToken).not.toBe(patientToken.authToken);
    expect(env.meetings.state.meetings[0].patientProviderParticipantId).toBe(meeting.patientProviderParticipantId);
    expect(api.meetings.size).toBe(1);

    now(env, 30);
    expect((await env.doctorUc.end(c.doctor.actor, c.id)).appointmentStatus).toBe('completed');
    expect(api.participants.size).toBe(0);
    await expect(env.patientUc.token(c.patient.actor, c.id)).rejects.toThrow(SessionNotActiveError);
  });

  it('[TC-VID-137] si Cloudflare no crea la reunión, no se guarda sala ni participante y la consulta sigue igual', async () => {
    const { api, env } = await rtkEnv();
    const c = appointmentWith(env);
    now(env, 0);
    await env.patientUc.enter(c.patient.actor, c.id);
    await env.doctorUc.enter(c.doctor.actor, c.id);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    api.on((r) => r.path === '/meetings', () => respond(500, { success: false }));
    await expect(env.patientUc.token(c.patient.actor, c.id)).rejects.toThrow(VideoProviderUnavailableError);
    expect(env.meetings.state.meetings[0]).toMatchObject({ roomId: null, patientProviderParticipantId: null });
    // Un nuevo intento funciona.
    await expect(env.patientUc.token(c.patient.actor, c.id)).resolves.toMatchObject({ provider: 'realtimekit' });
  });

  it('[TC-VID-138] si el alta del participante falla, no se persiste un participante ni se devuelve credencial', async () => {
    const { api, env } = await rtkEnv();
    const c = appointmentWith(env);
    now(env, 0);
    await env.patientUc.enter(c.patient.actor, c.id);
    await env.doctorUc.enter(c.doctor.actor, c.id);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    api.on((r) => r.path.endsWith('/participants'), () => 'hang');
    await expect(env.doctorUc.token(c.doctor.actor, c.id)).rejects.toThrow(VideoProviderUnavailableError);
    expect(env.meetings.state.meetings[0].doctorProviderParticipantId).toBeNull();
  });

  it('[TC-VID-139] un fallo de Cloudflare al revocar no deshace la finalización', async () => {
    const { api, env } = await rtkEnv();
    const c = appointmentWith(env);
    now(env, 0);
    await env.patientUc.enter(c.patient.actor, c.id);
    await env.doctorUc.enter(c.doctor.actor, c.id);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    await env.patientUc.token(c.patient.actor, c.id);
    api.on((r) => r.method === 'DELETE', () => 'network', false);
    now(env, 20);
    expect((await env.doctorUc.end(c.doctor.actor, c.id)).appointmentStatus).toBe('completed');
    expect(statusOf(env, c.id)).toBe('completed');
  });
});

describe('Videoconsulta · finalizar la consulta para ambos (prueba real del 2026-11-25)', () => {
  // Reproduce la prueba: ambos entran antes de la hora oficial (T0 − 15), el médico admite y finaliza.
  async function endedEarly() {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, -12);
    await env.patientUc.enter(c.patient.actor, c.id);
    now(env, -12, 30);
    await env.doctorUc.enter(c.doctor.actor, c.id);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    await env.patientUc.token(c.patient.actor, c.id);
    await env.doctorUc.token(c.doctor.actor, c.id);
    now(env, -9);
    const ended = await env.doctorUc.end(c.doctor.actor, c.id);
    return { env, c, ended };
  }
  const eventCount = (env: Env) => env.meetings.state.events.length;

  it('[TC-VID-150] la finalización del médico se persiste y ambos la ven terminada; sin reembolso', async () => {
    const { env, c, ended } = await endedEarly();
    expect(ended).toMatchObject({ phase: 'ended', appointmentStatus: 'completed' });
    expect(env.meetings.state.meetings[0].status).toBe('ended');
    expect(await env.patientUc.state(c.patient.actor, c.id)).toMatchObject({ phase: 'ended', appointmentStatus: 'completed' });
    expect(await env.doctorUc.state(c.doctor.actor, c.id)).toMatchObject({ phase: 'ended' });
    // M08 decide no_refund para completed: pagos no reembolsa.
    expect(env.inner.published).toEqual([expect.objectContaining({ type: 'AppointmentOutcomeRecorded', status: 'completed', refundOutcome: 'no_refund' })]);
    expect(env.world.state.audit.find((e) => e.action === APPOINTMENT_AUDIT_ACTIONS.outcomeRecorded)?.metadata).toMatchObject({ refundOutcome: 'no_refund' });
  });

  it('[TC-VID-151] después de finalizar, ni el paciente ni el médico pueden volver a entrar ni pedir credencial', async () => {
    const { env, c } = await endedEarly();
    now(env, -8);
    await expect(env.patientUc.enter(c.patient.actor, c.id)).rejects.toThrow(SessionEndedError);
    await expect(env.doctorUc.enter(c.doctor.actor, c.id)).rejects.toThrow(SessionEndedError);
    await expect(env.patientUc.token(c.patient.actor, c.id)).rejects.toThrow(SessionNotActiveError);
    await expect(env.doctorUc.token(c.doctor.actor, c.id)).rejects.toThrow(SessionNotActiveError);
    await expect(env.doctorUc.admit(c.doctor.actor, c.id)).rejects.toThrow(SessionEndedError);
  });

  it('[TC-VID-152] tras finalizar no se registran más salidas (latidos vencidos ni salidas voluntarias)', async () => {
    const { env, c } = await endedEarly();
    const before = eventCount(env);
    now(env, 30);
    await env.patientUc.state(c.patient.actor, c.id);
    await env.patientUc.presence(c.patient.actor, c.id);
    expect((await env.patientUc.leave(c.patient.actor, c.id)).phase).toBe('ended');
    await env.doctorUc.state(c.doctor.actor, c.id);
    expect(eventCount(env)).toBe(before);
    expect(statusOf(env, c.id)).toBe('completed');
  });

  it('[TC-VID-153] salir voluntariamente durante la consulta no la finaliza', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, -5);
    await env.patientUc.enter(c.patient.actor, c.id);
    await env.doctorUc.enter(c.doctor.actor, c.id);
    await env.doctorUc.admit(c.doctor.actor, c.id);
    now(env, -3);
    expect((await env.patientUc.leave(c.patient.actor, c.id)).phase).toBe('active');
    expect((await env.doctorUc.leave(c.doctor.actor, c.id)).phase).toBe('active');
    expect(env.meetings.state.meetings[0]).toMatchObject({ status: 'active', endedAt: null });
    expect(statusOf(env, c.id)).toBe('confirmed');
    // Ambos pueden volver mientras la consulta siga en curso.
    await expect(env.patientUc.enter(c.patient.actor, c.id)).resolves.toMatchObject({ phase: 'active' });
    await expect(env.doctorUc.enter(c.doctor.actor, c.id)).resolves.toMatchObject({ phase: 'active' });
  });

  it('[TC-VID-154][C-30] la sala admite la entrada desde T0 − 15 y no antes', async () => {
    const env = await setup();
    const c = appointmentWith(env);
    now(env, -15, -1);
    await expect(env.patientUc.enter(c.patient.actor, c.id)).rejects.toThrow(SessionNotOpenError);
    now(env, -15);
    await expect(env.patientUc.enter(c.patient.actor, c.id)).resolves.toMatchObject({ phase: 'waiting' });
    await expect(env.doctorUc.enter(c.doctor.actor, c.id)).resolves.toMatchObject({ phase: 'waiting' });
  });
});
