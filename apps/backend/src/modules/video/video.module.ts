import { Module } from '@nestjs/common';
import { AppointmentsModule } from '../appointments/appointments.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { DOCTOR_OPERATIONAL_CHECK, MEETING_REPOSITORY, VIDEO_ID_GENERATOR, VIDEO_PROVIDER } from './application/ports/video.ports';
import { SessionEngine } from './application/session-engine';
import { DoctorSessionUseCases } from './application/use-cases/doctor-session.use-cases';
import { EvaluateSessionsUseCase } from './application/use-cases/evaluate-sessions.use-case';
import { PatientSessionUseCases } from './application/use-cases/patient-session.use-cases';
import { SessionAccess } from './application/use-cases/session-access';
import { PolicyDoctorOperationalCheck, RandomUuidGenerator } from './infrastructure/doctor-operational.adapter';
import { DrizzleMeetingRepository } from './infrastructure/persistence/drizzle-meeting.repository';
import { UnconfiguredVideoProvider } from './infrastructure/provider/unconfigured-video-provider';
import { DoctorSessionController, DoctorSessionsListController, PatientSessionController } from './presentation/video.controllers';

// Videoconsulta (RF-18 a RF-22), primera entrega: sala de espera de PEI, presencia, admisión, finalización, duración
// real e inasistencias. De M08 usa solo AppointmentSessionService (getForSession, markCompleted, markNoShow); de M03, solo
// DoctorOperationalPolicy. El proveedor de video queda sin configurar (decisión 13): falla cerrado.
@Module({
  imports: [AppointmentsModule, DoctorsModule],
  controllers: [PatientSessionController, DoctorSessionController, DoctorSessionsListController],
  providers: [
    SessionEngine,
    SessionAccess,
    PatientSessionUseCases,
    DoctorSessionUseCases,
    EvaluateSessionsUseCase,
    { provide: MEETING_REPOSITORY, useClass: DrizzleMeetingRepository },
    { provide: VIDEO_PROVIDER, useClass: UnconfiguredVideoProvider },
    { provide: DOCTOR_OPERATIONAL_CHECK, useClass: PolicyDoctorOperationalCheck },
    { provide: VIDEO_ID_GENERATOR, useClass: RandomUuidGenerator },
  ],
  exports: [EvaluateSessionsUseCase],
})
export class VideoModule {}
