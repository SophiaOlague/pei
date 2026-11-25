import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../common/application/ports/clock';
import { AppointmentSessionService, type SessionView } from '../../appointments/application/integration/appointment-integration.services';
import { evaluateNoShow, type Evaluation, type PendingReason } from '../domain/no-show-evaluator';
import { expiredPresence, firstJoinAt, isPresentAt, lastEventAt, type Participant, type SessionEvent } from '../domain/presence';
import { addMinutes, doctorDeadline, patientToleranceEndsAt, waitingRoomOpensAt, type DoctorAvailability, type SessionPolicy } from '../domain/session-policy';
import { MEETING_REPOSITORY, VIDEO_ID_GENERATOR, type IdGenerator, type MeetingRecord, type MeetingRepository } from './ports/video.ports';

// Núcleo común de las operaciones de sala. Cada operación corre dentro de una UnitOfWork y llama primero a `open`:
// 1. lee la cita (M08, getForSession) y comprueba quién la pide ANTES de escribir nada (cita ajena → 404 de M08);
// 2. bloquea al médico (mismo candado que M08) y vuelve a leer la cita: con el médico bloqueado su estado no cambia;
// 3. bloquea la meeting, cierra las presencias con el latido vencido y evalúa las inasistencias (evaluación perezosa,
//    igual que en cada llamada y en el barrido del CLI);
// 4. si una regla determina un resultado, lo registra M08 (markNoShow, en la misma transacción).
// Los casos pendientes (huecos A y B, sin regla) NO se registran: solo se informan en `pendingResolution`.

export interface SessionContext {
  session: SessionView;
  scheduledAt: Date;
  policy: SessionPolicy;
  meeting: MeetingRecord | null;
  events: SessionEvent[];
  availability: DoctorAvailability;
  evaluation: Evaluation | null;
  now: Date;
}

export type SessionPhase = 'not_open' | 'waiting' | 'active' | 'ended' | 'closed';

export interface SessionStateView {
  appointmentId: string;
  appointmentStatus: string;
  phase: SessionPhase;
  serverTime: string;
  scheduledAt: string;
  opensAt: string;
  patient: { present: boolean; joinedAt: string | null };
  doctor: { present: boolean; joinedAt: string | null; busyWithAnotherConsultation: boolean };
  deadlines: { patientToleranceEndsAt: string; doctorDeadlineAt: string; reconnectGraceEndsAt: string | null };
  startedAt: string | null;
  endedAt: string | null;
  // RF-22: duración real = ended_at − started_at.
  durationSeconds: number | null;
  // Caso sin regla en el Maestro (no_rule): la cita sigue confirmed. Los huecos A y B ya se resuelven (R7 a R9).
  pendingResolution: PendingReason | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

@Injectable()
export class SessionEngine {
  constructor(
    @Inject(MEETING_REPOSITORY) private readonly meetings: MeetingRepository,
    @Inject(VIDEO_ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: AppointmentSessionService,
  ) {}

  // `authorize` recibe la cita sin bloquear y debe lanzar si el actor no es su paciente o su médico.
  async open(appointmentId: string, authorize: (s: SessionView) => void | Promise<void>): Promise<SessionContext> {
    const first = await this.sessions.getForSession(appointmentId);
    await authorize(first);
    await this.meetings.lockDoctorProfile(first.doctorProfileId);
    let session = await this.sessions.getForSession(appointmentId);
    const meeting = await this.meetings.lockByAppointmentId(appointmentId);
    const events = meeting ? await this.meetings.listEvents(meeting.id) : [];
    const now = this.clock.now();
    const scheduledAt = new Date(session.scheduledAt);
    const policy: SessionPolicy = {
      doctorWaitMinutes: session.doctorWaitMinutes,
      patientToleranceMinutes: session.patientToleranceMinutes,
      maxProtectedWaitMinutes: session.maxProtectedWaitMinutes,
      reconnectGraceMinutes: session.reconnectGraceMinutes,
    };

    // Una consulta finalizada ya no tiene presencia que vigilar: después de `ended` no se registran más salidas
    // (ni por falta de latidos ni voluntarias). Esos eventos no cambian el resultado y confundirían el historial.
    if (meeting && meeting.status !== 'ended') {
      for (const participant of ['patient', 'doctor'] as const) {
        const left = expiredPresence(events, participant, lastSeenOf(meeting, participant), now);
        if (left) {
          await this.meetings.appendEvent({ meetingId: meeting.id, participant, type: left.type, at: left.at });
          events.push(left);
        }
      }
    }

    const other = await this.meetings.doctorOtherConsultations(session.doctorProfileId, appointmentId, scheduledAt);
    const availability: DoctorAvailability = other.active ? { kind: 'busy' } : { kind: 'free', freeSince: other.lastEndedAt };

    let evaluation: Evaluation | null = null;
    if (session.status === 'confirmed') {
      evaluation = evaluateNoShow({ scheduledAt, policy, doctor: availability, events, startedAt: meeting?.startedAt ?? null, now });
      if (evaluation.kind === 'determined') {
        await this.sessions.markNoShow(appointmentId, evaluation.outcome);
        session = await this.sessions.getForSession(appointmentId);
      }
    }
    return { session, scheduledAt, policy, meeting, events, availability, evaluation, now };
  }

  // Crea la meeting si todavía no existe (la sala de espera nace con la primera entrada).
  async ensureMeeting(ctx: SessionContext): Promise<MeetingRecord> {
    if (ctx.meeting) return ctx.meeting;
    await this.meetings.insertIfAbsent({ id: this.ids.newId(), appointmentId: ctx.session.appointmentId, createdAt: ctx.now });
    const meeting = await this.meetings.lockByAppointmentId(ctx.session.appointmentId);
    if (!meeting) throw new Error('No se pudo crear la sala de la cita');
    ctx.meeting = meeting;
    return meeting;
  }

  // Entrada a la sala (o reconexión): registra `joined` solo si no estaba presente y renueva el latido.
  async join(ctx: SessionContext, participant: Participant): Promise<void> {
    const meeting = await this.ensureMeeting(ctx);
    const patch: Partial<MeetingRecord> = participant === 'patient' ? { patientLastSeenAt: ctx.now } : { doctorLastSeenAt: ctx.now };
    if (!isPresentAt(ctx.events, participant, ctx.now)) {
      await this.meetings.appendEvent({ meetingId: meeting.id, participant, type: 'joined', at: ctx.now });
      ctx.events.push({ participant, type: 'joined', at: ctx.now });
      if (participant === 'patient' && !meeting.patientJoinedAt) patch.patientJoinedAt = ctx.now;
      if (participant === 'doctor' && !meeting.doctorJoinedAt) patch.doctorJoinedAt = ctx.now;
    }
    await this.meetings.update(meeting.id, patch);
    Object.assign(meeting, patch);
  }

  // Latido: solo renueva una presencia abierta; nunca la reabre (para eso está `enter`).
  async heartbeat(ctx: SessionContext, participant: Participant): Promise<void> {
    const meeting = ctx.meeting;
    if (!meeting || meeting.status === 'ended' || !isPresentAt(ctx.events, participant, ctx.now)) return;
    const current = lastSeenOf(meeting, participant);
    const next = current && current > ctx.now ? current : ctx.now;
    const patch: Partial<MeetingRecord> = participant === 'patient' ? { patientLastSeenAt: next } : { doctorLastSeenAt: next };
    await this.meetings.update(meeting.id, patch);
    Object.assign(meeting, patch);
  }

  // Salida voluntaria («Salir de la sala»): deja de estar disponible hasta que vuelva a entrar. No cancela la cita.
  async leave(ctx: SessionContext, participant: Participant): Promise<void> {
    const meeting = ctx.meeting;
    if (!meeting || meeting.status === 'ended' || !isPresentAt(ctx.events, participant, ctx.now)) return;
    await this.meetings.appendEvent({ meetingId: meeting.id, participant, type: 'left_voluntarily', at: ctx.now });
    ctx.events.push({ participant, type: 'left_voluntarily', at: ctx.now });
  }

  view(ctx: SessionContext): SessionStateView {
    const { session, meeting, events, now, scheduledAt, policy } = ctx;
    const opensAt = waitingRoomOpensAt(scheduledAt);
    const lastPatient = lastEventAt(events, 'patient', now);
    const phase: SessionPhase = meeting?.status === 'active'
      ? 'active'
      : meeting?.status === 'ended'
        ? 'ended'
        : session.status !== 'confirmed'
          ? 'closed'
          : now < opensAt ? 'not_open' : 'waiting';
    const durationSeconds = meeting?.startedAt && meeting.endedAt ? Math.floor((meeting.endedAt.getTime() - meeting.startedAt.getTime()) / 1000) : null;
    return {
      appointmentId: session.appointmentId,
      appointmentStatus: session.status,
      phase,
      serverTime: now.toISOString(),
      scheduledAt: scheduledAt.toISOString(),
      opensAt: opensAt.toISOString(),
      patient: { present: isPresentAt(events, 'patient', now), joinedAt: iso(firstJoinAt(events, 'patient')) },
      doctor: {
        present: isPresentAt(events, 'doctor', now),
        joinedAt: iso(firstJoinAt(events, 'doctor')),
        busyWithAnotherConsultation: ctx.availability.kind === 'busy',
      },
      deadlines: {
        patientToleranceEndsAt: patientToleranceEndsAt(scheduledAt, policy).toISOString(),
        doctorDeadlineAt: doctorDeadline(scheduledAt, ctx.availability, policy).toISOString(),
        reconnectGraceEndsAt: lastPatient?.type === 'left' ? addMinutes(lastPatient.at, policy.reconnectGraceMinutes).toISOString() : null,
      },
      startedAt: iso(meeting?.startedAt ?? null),
      endedAt: iso(meeting?.endedAt ?? null),
      durationSeconds,
      pendingResolution: ctx.evaluation?.kind === 'pending' ? ctx.evaluation.reason : null,
    };
  }
}

export const lastSeenOf = (meeting: MeetingRecord, participant: Participant): Date | null =>
  participant === 'patient' ? meeting.patientLastSeenAt : meeting.doctorLastSeenAt;
