import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { AppointmentNotFoundError, DoctorProfileRequiredError, PatientProfileRequiredError } from '../../../appointments/domain/appointments.errors';
import type { SessionView } from '../../../appointments/application/integration/appointment-integration.services';
import type { Participant } from '../../domain/presence';
import { SessionNotActiveError, VideoProviderUnavailableError } from '../../domain/video.errors';
import { MEETING_REPOSITORY, VIDEO_PROVIDER, type MeetingRepository, type VideoProvider } from '../ports/video.ports';
import type { SessionContext } from '../session-engine';

// Identidad del actor frente a la cita y emisión de credenciales del proveedor, comunes al paciente y al médico.

@Injectable()
export class SessionAccess {
  constructor(
    @Inject(MEETING_REPOSITORY) private readonly meetings: MeetingRepository,
    @Inject(VIDEO_PROVIDER) private readonly provider: VideoProvider,
  ) {}

  // El perfil sale siempre de la sesión. La cita de otra persona responde igual que una inexistente (como en M08).
  async patientOf(actor: Actor): Promise<string> {
    if (actor?.role !== 'patient' || !actor.userProfileId) throw new PatientProfileRequiredError();
    const id = await this.meetings.findPatientProfileId(actor.userProfileId);
    if (!id) throw new PatientProfileRequiredError();
    return id;
  }

  async doctorOf(actor: Actor): Promise<string> {
    if (actor?.role !== 'doctor' || !actor.userProfileId) throw new DoctorProfileRequiredError();
    const id = await this.meetings.findDoctorProfileId(actor.userProfileId);
    if (!id) throw new DoctorProfileRequiredError();
    return id;
  }

  ownedByPatient = (patientProfileId: string) => (s: SessionView) => {
    if (s.patientProfileId !== patientProfileId) throw new AppointmentNotFoundError();
  };

  ownedByDoctor = (doctorProfileId: string) => (s: SessionView) => {
    if (s.doctorProfileId !== doctorProfileId) throw new AppointmentNotFoundError();
  };

  // Credencial del proveedor solo con la consulta en curso (tras la admisión). La sala del proveedor se crea con el
  // primer token, no antes: la espera no depende del proveedor (decisión 4).
  async issueToken(ctx: SessionContext, participant: Participant): Promise<{ provider: string; authToken: string }> {
    const meeting = ctx.meeting;
    if (!meeting || meeting.status !== 'active') throw new SessionNotActiveError();
    let roomId = meeting.roomId;
    if (!roomId) {
      roomId = (await providerCall(() => this.provider.createRoom({ appointmentId: meeting.appointmentId }))).roomId;
      await this.meetings.update(meeting.id, { roomId });
      meeting.roomId = roomId;
    }
    const room = roomId;
    const existing = participant === 'patient' ? meeting.patientProviderParticipantId : meeting.doctorProviderParticipantId;
    const issued = await providerCall(() =>
      this.provider.issueToken({ roomId: room, participant, customParticipantId: `${meeting.appointmentId}:${participant}`, existingParticipantId: existing }),
    );
    const patch = participant === 'patient' ? { patientProviderParticipantId: issued.participantId } : { doctorProviderParticipantId: issued.participantId };
    await this.meetings.update(meeting.id, patch);
    Object.assign(meeting, patch);
    return { provider: this.provider.name, authToken: issued.token };
  }
}

// Un fallo del proveedor se informa sin detalles internos; los errores de la base de datos se propagan tal cual.
async function providerCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof VideoProviderUnavailableError) throw error;
    throw new VideoProviderUnavailableError();
  }
}
