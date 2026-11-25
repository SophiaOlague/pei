import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { InvalidAppointmentStateError } from '../../../appointments/domain/appointments.errors';
import { waitingRoomOpensAt } from '../../domain/session-policy';
import { SessionEndedError, SessionNotOpenError } from '../../domain/video.errors';
import { SessionEngine, type SessionStateView } from '../session-engine';
import { SessionAccess } from './session-access';

// Operaciones del paciente en la sala (RF-19, C-30). RN-140 solo restringe al paciente para agendar: estas operaciones
// no exigen la aceptación legal vigente.
@Injectable()
export class PatientSessionUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly engine: SessionEngine,
    private readonly access: SessionAccess,
  ) {}

  // Estado de la sesión. También evalúa las inasistencias (evaluación perezosa en cada llamada).
  state(actor: Actor, appointmentId: string): Promise<SessionStateView> {
    return this.uow.runInTransaction(async () => {
      const patient = await this.access.patientOf(actor);
      return this.engine.view(await this.engine.open(appointmentId, this.access.ownedByPatient(patient)));
    });
  }

  // Entrada a la sala desde T0 − 15 (C-30). También sirve para volver tras una desconexión o una salida voluntaria.
  enter(actor: Actor, appointmentId: string): Promise<SessionStateView> {
    return this.uow.runInTransaction(async () => {
      const patient = await this.access.patientOf(actor);
      const ctx = await this.engine.open(appointmentId, this.access.ownedByPatient(patient));
      if (ctx.meeting?.status === 'ended') throw new SessionEndedError();
      if (ctx.meeting?.status !== 'active') {
        if (ctx.session.status !== 'confirmed') throw new InvalidAppointmentStateError(ctx.session.status);
        const opensAt = waitingRoomOpensAt(ctx.scheduledAt);
        if (ctx.now < opensAt) throw new SessionNotOpenError(opensAt);
      }
      await this.engine.join(ctx, 'patient');
      return this.engine.view(ctx);
    });
  }

  presence(actor: Actor, appointmentId: string): Promise<SessionStateView> {
    return this.uow.runInTransaction(async () => {
      const patient = await this.access.patientOf(actor);
      const ctx = await this.engine.open(appointmentId, this.access.ownedByPatient(patient));
      await this.engine.heartbeat(ctx, 'patient');
      return this.engine.view(ctx);
    });
  }

  leave(actor: Actor, appointmentId: string): Promise<SessionStateView> {
    return this.uow.runInTransaction(async () => {
      const patient = await this.access.patientOf(actor);
      const ctx = await this.engine.open(appointmentId, this.access.ownedByPatient(patient));
      await this.engine.leave(ctx, 'patient');
      return this.engine.view(ctx);
    });
  }

  token(actor: Actor, appointmentId: string): Promise<{ provider: string; authToken: string }> {
    return this.uow.runInTransaction(async () => {
      const patient = await this.access.patientOf(actor);
      const ctx = await this.engine.open(appointmentId, this.access.ownedByPatient(patient));
      return this.access.issueToken(ctx, 'patient');
    });
  }
}
