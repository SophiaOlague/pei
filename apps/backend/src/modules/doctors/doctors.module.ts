import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SpecialtiesController } from './presentation/specialties.controller';
import { AdminSpecialtiesController } from './presentation/admin-specialties.controller';
import { MeDoctorController } from './presentation/me-doctor.controller';
import {
  AdminDoctorIdentityVerificationsController, AdminDoctorLicenseVerificationsController, AdminDoctorsController,
} from './presentation/admin-doctors.controller';
import { GetDoctorDetailUseCase, ListDoctorsUseCase } from './application/use-cases/admin/doctor-admin.use-cases';
import {
  GetDoctorReviewDetailUseCase, ListPendingDoctorReviewsUseCase, OpenDoctorReviewDocumentUseCase, PurgeTerminalDoctorIdentityDocumentsUseCase,
  ReviewDoctorVerificationUseCase,
} from './application/use-cases/admin/doctor-review.use-cases';
import { DEFAULT_DOCTOR_RATE_LIMIT_RULES, DOCTOR_RATE_LIMIT_RULES, DoctorRateLimitGuard } from './presentation/rate-limit';
import {
  ChangeSpecialtyActivationUseCase,
  CreateSpecialtyUseCase,
  ListActiveSpecialtiesUseCase,
  ListAllSpecialtiesUseCase,
  UpdateSpecialtyUseCase,
} from './application/use-cases/specialties/specialty.use-cases';
import { RegisterDoctorProfileUseCase } from './application/use-cases/register-doctor-profile.use-case';
import { GetDoctorProfileUseCase, OpenDoctorPhotoUseCase, UpdateDoctorPhotoUseCase, UpdateDoctorProfileUseCase } from './application/use-cases/doctor-profile.use-cases';
import { ChangeDoctorIdentityUseCase, ChangeDoctorSpecialtyUseCase } from './application/use-cases/doctor-changes.use-cases';
import { SubmitDoctorIdentityVerificationUseCase, SubmitDoctorLicenseVerificationUseCase } from './application/use-cases/doctor-submissions.use-cases';
import { GetDoctorStatusUseCase, GetDoctorVerificationHistoryUseCase, OpenOwnLicenseDocumentUseCase } from './application/use-cases/doctor-status.use-cases';
import { DoctorIdentityDocumentPurger } from './application/use-cases/doctor-identity-document-purger';
import { DoctorStatusService } from './application/doctor-status.service';
import { DoctorOperationalPolicy } from './application/policies/doctor-operational.policy';
import { DoctorProfileSectionProvider } from './application/doctor-profile-section.provider';
import { SPECIALTY_REPOSITORY } from './application/ports/specialty.repository';
import { DOCTOR_PROFILE_REPOSITORY } from './application/ports/doctor-profile.repository';
import { DOCTOR_REVIEW_REPOSITORY } from './application/ports/doctor-review.repository';
import { DrizzleSpecialtyRepository } from './infrastructure/persistence/drizzle-specialty.repository';
import { DrizzleDoctorProfileRepository } from './infrastructure/persistence/drizzle-doctor-profile.repository';
import { DrizzleDoctorReviewRepository } from './infrastructure/persistence/drizzle-doctor-review.repository';

// M03 Médicos. B1: catálogo de especialidades. B5: registro, perfil, cambios sensibles y envíos del médico.
// B6: revisión del admin (colas, detalle, documentos auditados, aprobar/rechazar) y purga de la INE.
// B7: política operativa para M07/M08 y sección del médico en GET /me.
// UNIT_OF_WORK lo provee CommonModule; AUDIT_TRAIL, AuditModule; PRIVATE_OBJECT_STORAGE, PrivateStorageModule;
// AUTH_INSTANCE y los guards, AuthModule (todos globales). De IdentityModule: DOCTOR_IDENTITY_GATEWAY y RATE_LIMITER.
@Module({
  imports: [IdentityModule],
  controllers: [
    SpecialtiesController, AdminSpecialtiesController, MeDoctorController,
    AdminDoctorsController, AdminDoctorIdentityVerificationsController, AdminDoctorLicenseVerificationsController,
  ],
  providers: [
    ListActiveSpecialtiesUseCase,
    ListAllSpecialtiesUseCase,
    CreateSpecialtyUseCase,
    UpdateSpecialtyUseCase,
    ChangeSpecialtyActivationUseCase,
    RegisterDoctorProfileUseCase,
    GetDoctorProfileUseCase,
    UpdateDoctorProfileUseCase,
    UpdateDoctorPhotoUseCase,
    OpenDoctorPhotoUseCase,
    ChangeDoctorIdentityUseCase,
    ChangeDoctorSpecialtyUseCase,
    SubmitDoctorIdentityVerificationUseCase,
    SubmitDoctorLicenseVerificationUseCase,
    GetDoctorStatusUseCase,
    GetDoctorVerificationHistoryUseCase,
    OpenOwnLicenseDocumentUseCase,
    DoctorIdentityDocumentPurger,
    ListDoctorsUseCase,
    GetDoctorDetailUseCase,
    ListPendingDoctorReviewsUseCase,
    GetDoctorReviewDetailUseCase,
    ReviewDoctorVerificationUseCase,
    OpenDoctorReviewDocumentUseCase,
    PurgeTerminalDoctorIdentityDocumentsUseCase,
    DoctorStatusService,
    DoctorOperationalPolicy,
    DoctorProfileSectionProvider,
    DoctorRateLimitGuard,
    { provide: DOCTOR_RATE_LIMIT_RULES, useValue: DEFAULT_DOCTOR_RATE_LIMIT_RULES },
    { provide: SPECIALTY_REPOSITORY, useClass: DrizzleSpecialtyRepository },
    { provide: DOCTOR_PROFILE_REPOSITORY, useClass: DrizzleDoctorProfileRepository },
    { provide: DOCTOR_REVIEW_REPOSITORY, useClass: DrizzleDoctorReviewRepository },
  ],
  // M07 y M08 aplicarán DoctorOperationalPolicy dentro de sus casos de uso (B7). La purga la usa la CLI.
  exports: [DoctorOperationalPolicy, PurgeTerminalDoctorIdentityDocumentsUseCase],
})
export class DoctorsModule {}
