import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { IdentityModule } from '../identity/identity.module';
import { AppointmentConfirmationService, AppointmentSessionService } from './application/integration/appointment-integration.services';
import { AppointmentChainService } from './application/integration/appointment-chain.services';
import { CANCELED_APPOINTMENT_AUDIT_READER, CanceledAppointmentFeedService } from './application/integration/canceled-appointment-feed';
import { DrizzleCanceledAppointmentAuditReader } from './infrastructure/persistence/drizzle-canceled-appointment-audit.reader';
import { OUTCOME_RECORDED_AUDIT_READER, OutcomeRecordedFeedService } from './application/integration/outcome-recorded-feed';
import { DrizzleOutcomeRecordedAuditReader } from './infrastructure/persistence/drizzle-outcome-recorded-audit.reader';
import { AfterCommitAppointmentEventPublisher, APPOINTMENT_EVENT_PUBLISHER, AppointmentEventSubscribers } from './application/appointment-events';
import {
  DoctorAppointmentsQuery, DoctorOccupancyService, GetDoctorSlotsForPatientUseCase, HoldSlotUseCase, ListBookableDoctorsUseCase, PatientAppointmentsQuery,
  PatientSlotsService, ReleaseHoldUseCase,
} from './application/use-cases/booking.use-cases';
import { CancelByDoctorUseCase, CancelByPatientUseCase } from './application/use-cases/cancellation.use-cases';
import { CancellationPolicyService, ConsultationPriceService } from './application/use-cases/configuration.use-cases';
import { RescheduleByPatientUseCase } from './application/use-cases/reschedule.use-cases';
import {
  APPOINTMENT_REPOSITORY, BOOKABLE_DOCTORS_READER, BOOKING_ELIGIBILITY, BOOKING_FEATURE, BOOKING_LEGAL_ACCEPTANCES, CANCELLATION_POLICY_REPOSITORY,
  CONSULTATION_PRICE_REPOSITORY,
} from './application/ports/appointments.ports';
import { ReaderBookingLegalAcceptances } from './infrastructure/booking-legal-acceptances.adapter';
import { DrizzleBookableDoctorsReader, EnvBookingFeature, PolicyBookingEligibility } from './infrastructure/adapters';
import { DrizzleAppointmentRepository } from './infrastructure/persistence/drizzle-appointment.repository';
import { DrizzleCancellationPolicyRepository, DrizzleConsultationPriceRepository } from './infrastructure/persistence/drizzle-configuration.repositories';
import {
  AdminAppointmentPolicyController, AdminConsultationPriceController, BookableDoctorsController, DoctorAppointmentsController, PatientAppointmentsController,
} from './presentation/appointments.controllers';

// M08 Citas médicas (RF-12, RF-14, RF-15, RF-16; RF-66 propuesto). De M07 usa solo AgendaService; de M03, solo
// DoctorOperationalPolicy; de M02, solo CanBookAppointmentsPolicy y BOOKING_LEGAL_ACCEPTANCE_READER (AP-26). Ningún módulo anterior depende de este.
// Exporta los contratos internos para pagos y videoconsulta (sin rutas HTTP).
@Module({
  imports: [IdentityModule, DoctorsModule, AgendaModule],
  controllers: [BookableDoctorsController, PatientAppointmentsController, DoctorAppointmentsController, AdminConsultationPriceController, AdminAppointmentPolicyController],
  providers: [
    DoctorOccupancyService,
    PatientSlotsService,
    GetDoctorSlotsForPatientUseCase,
    ListBookableDoctorsUseCase,
    HoldSlotUseCase,
    ReleaseHoldUseCase,
    PatientAppointmentsQuery,
    DoctorAppointmentsQuery,
    CancelByPatientUseCase,
    CancelByDoctorUseCase,
    RescheduleByPatientUseCase,
    ConsultationPriceService,
    CancellationPolicyService,
    AppointmentConfirmationService,
    AppointmentSessionService,
    AppointmentChainService,
    // A.25: consulta duradera de cancelaciones para pagos (solo lectura, sin ruta HTTP).
    CanceledAppointmentFeedService,
    { provide: CANCELED_APPOINTMENT_AUDIT_READER, useClass: DrizzleCanceledAppointmentAuditReader },
    // Videoconsulta (decisión 10): consulta duradera de resultados para pagos (solo lectura, sin ruta HTTP).
    OutcomeRecordedFeedService,
    { provide: OUTCOME_RECORDED_AUDIT_READER, useClass: DrizzleOutcomeRecordedAuditReader },
    AppointmentEventSubscribers,
    { provide: APPOINTMENT_EVENT_PUBLISHER, useClass: AfterCommitAppointmentEventPublisher },
    { provide: APPOINTMENT_REPOSITORY, useClass: DrizzleAppointmentRepository },
    { provide: CONSULTATION_PRICE_REPOSITORY, useClass: DrizzleConsultationPriceRepository },
    { provide: CANCELLATION_POLICY_REPOSITORY, useClass: DrizzleCancellationPolicyRepository },
    { provide: BOOKABLE_DOCTORS_READER, useClass: DrizzleBookableDoctorsReader },
    { provide: BOOKING_ELIGIBILITY, useClass: PolicyBookingEligibility },
    { provide: BOOKING_FEATURE, useClass: EnvBookingFeature },
    { provide: BOOKING_LEGAL_ACCEPTANCES, useClass: ReaderBookingLegalAcceptances },
  ],
  exports: [
    AppointmentConfirmationService, AppointmentSessionService, AppointmentChainService, CanceledAppointmentFeedService, OutcomeRecordedFeedService, AppointmentEventSubscribers, ConsultationPriceService,
    CancellationPolicyService,
  ],
})
export class AppointmentsModule {}
