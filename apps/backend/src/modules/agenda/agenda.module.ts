import { Module } from '@nestjs/common';
import { DoctorsModule } from '../doctors/doctors.module';
import { MeAgendaController } from './presentation/me-agenda.controller';
import {
  AddTimeOffUseCase, AgendaService, AgendaWriteGuard, ChangeAppointmentDurationUseCase, GetMyAgendaUseCase, PreviewMySlotsUseCase,
  RemoveTimeOffUseCase, ReplaceWeeklyAvailabilityUseCase,
} from './application/use-cases/agenda.use-cases';
import { AGENDA_REPOSITORY } from './application/ports/agenda.repository';
import { BUSY_INTERVALS_PROVIDER, NoBusyIntervalsProvider } from './application/ports/busy-intervals.provider';
import { DrizzleAgendaRepository } from './infrastructure/persistence/drizzle-agenda.repository';

// M07 Agenda médica (RF-10, RF-11). De M03 usa solo DoctorOperationalPolicy (exportada por DoctorsModule).
// UNIT_OF_WORK y CLOCK los provee CommonModule; AUDIT_TRAIL, AuditModule; los guards, AuthModule (globales).
// Exporta AgendaService (generación de horarios) y el punto de extensión BUSY_INTERVALS_PROVIDER para M08.
@Module({
  imports: [DoctorsModule],
  controllers: [MeAgendaController],
  providers: [
    AgendaWriteGuard,
    AgendaService,
    GetMyAgendaUseCase,
    PreviewMySlotsUseCase,
    ReplaceWeeklyAvailabilityUseCase,
    ChangeAppointmentDurationUseCase,
    AddTimeOffUseCase,
    RemoveTimeOffUseCase,
    { provide: AGENDA_REPOSITORY, useClass: DrizzleAgendaRepository },
    { provide: BUSY_INTERVALS_PROVIDER, useClass: NoBusyIntervalsProvider },
  ],
  exports: [AgendaService, BUSY_INTERVALS_PROVIDER],
})
export class AgendaModule {}
