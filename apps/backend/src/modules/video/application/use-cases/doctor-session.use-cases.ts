import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { AFTER_COMMIT, type AfterCommit } from '../../../../common/application/ports/after-commit';
import { CLOCK, type Clock } from '../../../../common/application/ports/clock';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AppointmentSessionService } from '../../../appointments/application/integration/appointment-integration.services';
import { InvalidAppointmentStateError } from '../../../appointments/domain/appointments.errors';
import { expiredPresence, isPresentAt } from '../../domain/presence';
import { DoctorBusyError, DoctorNotInRoomError, PatientNotWaitingError, SessionEndedError, SessionNotActiveError } from '../../domain/video.errors';
import {
  DOCTOR_OPERATIONAL_CHECK, MEETING_REPOSITORY, VIDEO_PROVIDER, type DoctorOperationalCheck, type MeetingRepository, type VideoProvider,
} from '../ports/video.ports';
import { lastSeenOf, SessionEngine, type SessionContext, type SessionStateView } from '../session-engine';
import { AuditActor, VideoAuditEvents } from '../video-audit-events';
import { SessionAccess } from './session-access';

// Operaciones del médico en la sala (RF-18, RF-19, RF-22; CC-9).
//
// RN-140 y RN-004: entrar, enviar latidos, salir, admitir y pedir credenciales exigen un médico habilitado (canOperate).
// Excepción aprobada (decisión 11, C-33): FINALIZAR una consulta que ya está activa y es suya no exige canOperate. No
// abre ninguna otra operación: no admite, no inicia consultas ni emite credenciales. La lectura del estado no es una
// operación protegida (igual que GET /me/doctor/appointments en M08).
//
// Una consulta activa nunca se cierra sola (decisión 12): solo la finaliza el médico.

export interface DoctorSessionSummary {
  appointmentId: string;
  scheduledAt: string;
  phase: 'waiting' | 'active';
  patientPresent: boolean;
  startedAt: string | null;
}

@Injectable()
export class DoctorSessionUseCases {
  private readonly logger = new Logger('VideoSessions');

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AFTER_COMMIT) private readonly afterCommit: AfterCommit,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(MEETING_REPOSITORY) private readonly meetings: MeetingRepository,
    @Inject(VIDEO_PROVIDER) private readonly provider: VideoProvider,
    @Inject(DOCTOR_OPERATIONAL_CHECK) private readonly operational: DoctorOperationalCheck,
    private readonly sessions: AppointmentSessionService,
    private readonly engine: SessionEngine,
    private readonly access: SessionAccess,
  ) {}

  state(actor: Actor, appointmentId: string): Promise<SessionStateView> {
    return this.uow.runInTransaction(async () => {
      const doctor = await this.access.doctorOf(actor);
      return this.engine.view(await this.engine.open(appointmentId, this.access.ownedByDoctor(doctor)));
    });
  }

  enter(actor: Actor, appointmentId: string): Promise<SessionStateView> {
    return this.uow.runInTransaction(async () => {
      const ctx = await this.openOperational(actor, appointmentId);
      if (ctx.meeting?.status === 'ended') throw new SessionEndedError();
      if (ctx.meeting?.status !== 'active') {
        if (ctx.session.status !== 'confirmed') throw new InvalidAppointmentStateError(ctx.session.status);
        // Mientras atiende otra consulta, el médico no cuenta como conectado a esta cita (espera protegida, A.11.3).
        if (await this.meetings.hasOtherActiveMeeting(ctx.session.doctorProfileId, appointmentId)) throw new DoctorBusyError();
      }
      await this.engine.join(ctx, 'doctor');
      return this.engine.view(ctx);
    });
  }

  presence(actor: Actor, appointmentId: string): Promise<SessionStateView> {
    return this.uow.runInTransaction(async () => {
      const ctx = await this.openOperational(actor, appointmentId);
      await this.engine.heartbeat(ctx, 'doctor');
      return this.engine.view(ctx);
    });
  }

  leave(actor: Actor, appointmentId: string): Promise<SessionStateView> {
    return this.uow.runInTransaction(async () => {
      const ctx = await this.openOperational(actor, appointmentId);
      await this.engine.leave(ctx, 'doctor');
      return this.engine.view(ctx);
    });
  }

  // Admisión (CC-9): cita confirmed sin resultado, médico de la cita y en su sala, sin otra consulta activa, y paciente
  // presente. Fija started_at (RF-22) sin depender del proveedor. Repetirla con la consulta ya activa no hace nada.
  admit(actor: Actor, appointmentId: string): Promise<SessionStateView> {
    return this.uow.runInTransaction(async () => {
      const ctx = await this.openOperational(actor, appointmentId);
      const meeting = ctx.meeting;
      if (meeting?.status === 'active') return this.engine.view(ctx);
      if (meeting?.status === 'ended') throw new SessionEndedError();
      if (ctx.session.status !== 'confirmed') throw new InvalidAppointmentStateError(ctx.session.status);
      if (!meeting || !isPresentAt(ctx.events, 'doctor', ctx.now)) throw new DoctorNotInRoomError();
      if (!isPresentAt(ctx.events, 'patient', ctx.now)) throw new PatientNotWaitingError();
      if (await this.meetings.hasOtherActiveMeeting(ctx.session.doctorProfileId, appointmentId)) throw new DoctorBusyError();
      const patch = { status: 'active' as const, startedAt: ctx.now };
      await this.meetings.update(meeting.id, patch);
      Object.assign(meeting, patch);
      ctx.evaluation = { kind: 'started' };
      await this.audit.record(VideoAuditEvents.admitted(AuditActor.fromActor(actor), appointmentId, meeting.id));
      return this.engine.view(ctx);
    });
  }

  // Finalización (RF-18, RN-023): fija ended_at y la duración real (RF-22), registra completed en M08 y revoca el acceso
  // al proveedor después del COMMIT. Es la ÚNICA operación del médico que no exige canOperate (decisión 11).
  end(actor: Actor, appointmentId: string): Promise<SessionStateView> {
    return this.uow.runInTransaction(async () => {
      const doctor = await this.access.doctorOf(actor);
      const ctx = await this.engine.open(appointmentId, this.access.ownedByDoctor(doctor));
      const meeting = ctx.meeting;
      if (meeting?.status === 'ended') return this.engine.view(ctx);
      if (!meeting || meeting.status !== 'active' || !meeting.startedAt) throw new SessionNotActiveError();
      const doctorCanOperate = await this.operational.canOperate(doctor);
      const endedAt = this.clock.now();
      await this.meetings.update(meeting.id, { status: 'ended', endedAt });
      Object.assign(meeting, { status: 'ended', endedAt });
      // Si la cita ya no está confirmed (por ejemplo, se canceló durante la consulta), se cierra la sala sin registrar
      // un resultado: M08 solo admite resultados desde confirmed.
      const outcomeRecorded = ctx.session.status === 'confirmed';
      if (outcomeRecorded) {
        await this.sessions.markCompleted(appointmentId);
        ctx.session = await this.sessions.getForSession(appointmentId);
      }
      const durationSeconds = Math.floor((endedAt.getTime() - meeting.startedAt.getTime()) / 1000);
      await this.audit.record(VideoAuditEvents.ended(AuditActor.fromActor(actor), appointmentId, { meetingId: meeting.id, durationSeconds, doctorCanOperate, outcomeRecorded }));
      this.scheduleRevocation(meeting.roomId, [meeting.patientProviderParticipantId, meeting.doctorProviderParticipantId]);
      return this.engine.view(ctx);
    });
  }

  token(actor: Actor, appointmentId: string): Promise<{ provider: string; authToken: string }> {
    return this.uow.runInTransaction(async () => {
      const ctx = await this.openOperational(actor, appointmentId);
      return this.access.issueToken(ctx, 'doctor');
    });
  }

  // Citas del médico con sala abierta (espera o consulta en curso). Solo lectura: no evalúa ni escribe. Una consulta
  // activa aparece con su hora de inicio aunque lleve mucho tiempo: nunca se cierra sola (decisión 12).
  async sessionsOf(actor: Actor): Promise<{ sessions: DoctorSessionSummary[] }> {
    const doctor = await this.access.doctorOf(actor);
    const now = this.clock.now();
    const open = await this.meetings.listDoctorOpenSessions(doctor);
    return {
      sessions: open.map((s) => ({
        appointmentId: s.appointmentId,
        scheduledAt: s.scheduledAt.toISOString(),
        phase: s.meeting.status === 'active' ? 'active' : 'waiting',
        patientPresent: isPresentAt(s.events, 'patient', now) && !expiredPresence(s.events, 'patient', lastSeenOf(s.meeting, 'patient'), now),
        startedAt: s.meeting.startedAt?.toISOString() ?? null,
      })),
    };
  }

  private async openOperational(actor: Actor, appointmentId: string): Promise<SessionContext> {
    const doctor = await this.access.doctorOf(actor);
    await this.operational.assertCanOperate(doctor);
    return this.engine.open(appointmentId, this.access.ownedByDoctor(doctor));
  }

  // Revocación (decisión 7) después del COMMIT: un fallo del proveedor no deshace la finalización; se registra en el log.
  // Su eficacia sobre una llamada en curso NO está verificada: requiere una prueba con una llamada real.
  private scheduleRevocation(roomId: string | null, participantIds: (string | null)[]): void {
    if (!roomId) return;
    const ids = participantIds.filter((id): id is string => !!id);
    if (ids.length === 0) return;
    this.afterCommit.afterCommit(async () => {
      for (const participantId of ids) {
        try {
          await this.provider.revokeAccess({ roomId, participantId });
        } catch {
          this.logger.error(`No se pudo revocar el acceso de un participante de la sala ${roomId}`);
        }
      }
    });
  }
}
