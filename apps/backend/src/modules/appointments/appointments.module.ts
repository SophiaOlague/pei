import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { DoctorsModule } from '../doctors/doctors.module';
import { IdentityModule } from '../identity/identity.module';
import { AppointmentConfirmationService, AppointmentSessionService } from './application/integration/appointment-integration.services';
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
    { provide: APPOINTMENT_REPOSITORY, useClass: DrizzleAppointmentRepository },
    { provide: CONSULTATION_PRICE_REPOSITORY, useClass: DrizzleConsultationPriceRepository },
    { provide: CANCELLATION_POLICY_REPOSITORY, useClass: DrizzleCancellationPolicyRepository },
    { provide: BOOKABLE_DOCTORS_READER, useClass: DrizzleBookableDoctorsReader },
    { provide: BOOKING_ELIGIBILITY, useClass: PolicyBookingEligibility },
    { provide: BOOKING_FEATURE, useClass: EnvBookingFeature },
    { provide: BOOKING_LEGAL_ACCEPTANCES, useClass: ReaderBookingLegalAcceptances },
  ],
  exports: [AppointmentConfirmationService, AppointmentSessionService, ConsultationPriceService, CancellationPolicyService],
})
export class AppointmentsModule {}
