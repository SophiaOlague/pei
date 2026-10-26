import { Module } from '@nestjs/common';
import { AuthController } from './presentation/auth.controller';
import { MeController } from './presentation/me.controller';
import { LegalDocumentsController } from './presentation/legal-documents.controller';
import { AdminIdentityVerificationsController } from './presentation/admin-identity-verifications.controller';
import { DEFAULT_IDENTITY_RATE_LIMIT_RULES, IDENTITY_RATE_LIMIT_RULES, RateLimitGuard } from './presentation/rate-limit.guard';
import { RegisterPatientProfileUseCase } from './application/use-cases/register-patient-profile.use-case';
import {
  AcceptLegalDocumentsUseCase,
  GetCurrentLegalDocumentsUseCase,
  PublishLegalDocumentsUseCase,
} from './application/use-cases/legal-documents.use-cases';
import { SubmitIdentityVerificationUseCase } from './application/use-cases/submit-identity-verification.use-case';
import {
  GetIdentityVerificationDetailUseCase,
  ListPendingIdentityVerificationsUseCase,
  OpenIdentityDocumentUseCase,
  PurgeReviewedIdentityDocumentsUseCase,
  ReviewIdentityVerificationUseCase,
} from './application/use-cases/identity-verification-admin.use-cases';
import { IdentityDocumentPurger } from './application/use-cases/identity-document-purger';
import {
  GetMyIdentityVerificationUseCase,
  GetPatientProfileUseCase,
  OpenProfilePhotoUseCase,
  UpdatePatientProfileUseCase,
  UpdateProfilePhotoUseCase,
} from './application/use-cases/patient-profile.use-cases';
import { GetRegistrationStatusUseCase } from './application/use-cases/registration-status.use-cases';
import { BootstrapAdminUseCase } from './application/use-cases/bootstrap-admin.use-case';
import { CanBookAppointmentsPolicy } from './application/policies/can-book-appointments';
import { RoleProfileSectionRegistry } from './application/role-profile-section.registry';
import { USER_PROFILE_REPOSITORY } from './application/ports/user-profile.repository';
import { PATIENT_PROFILE_REPOSITORY } from './application/ports/patient-profile.repository';
import { IDENTITY_VERIFICATION_REPOSITORY } from './application/ports/identity-verification.repository';
import { LEGAL_DOCUMENT_REPOSITORY } from './application/ports/legal-document.repository';
import { REGISTRATION_STATUS_READER } from './application/ports/registration-status-reader';
import { RATE_LIMITER } from './application/ports/rate-limiter';
import { ADMIN_ACCOUNT_PROVISIONER } from './application/ports/admin-account-provisioner';
import { DOCTOR_IDENTITY_GATEWAY } from './application/ports/doctor-identity.gateway';
import { DrizzleUserProfileRepository } from './infrastructure/persistence/drizzle-user-profile.repository';
import { DrizzlePatientProfileRepository } from './infrastructure/persistence/drizzle-patient-profile.repository';
import { DrizzleIdentityVerificationRepository } from './infrastructure/persistence/drizzle-identity-verification.repository';
import { DrizzleLegalDocumentRepository } from './infrastructure/persistence/drizzle-legal-document.repository';
import { DrizzleRegistrationStatusReader } from './infrastructure/persistence/drizzle-registration-status.reader';
import { InMemoryRateLimiter } from './infrastructure/rate-limit/in-memory-rate-limiter';
import { BetterAuthAdminAccountProvisioner } from './infrastructure/auth/better-auth-admin-account.provisioner';
import { DrizzleDoctorIdentityGateway } from './infrastructure/persistence/drizzle-doctor-identity.gateway';

// M02 Identity. UNIT_OF_WORK y CLOCK los provee CommonModule; AUDIT_TRAIL, AuditModule; PRIVATE_OBJECT_STORAGE,
// PrivateStorageModule; AUTH_INSTANCE y los guards, AuthModule (todos globales).
@Module({
  controllers: [AuthController, MeController, LegalDocumentsController, AdminIdentityVerificationsController],
  providers: [
    RegisterPatientProfileUseCase,
    GetCurrentLegalDocumentsUseCase,
    AcceptLegalDocumentsUseCase,
    PublishLegalDocumentsUseCase,
    SubmitIdentityVerificationUseCase,
    GetMyIdentityVerificationUseCase,
    ListPendingIdentityVerificationsUseCase,
    GetIdentityVerificationDetailUseCase,
    OpenIdentityDocumentUseCase,
    ReviewIdentityVerificationUseCase,
    PurgeReviewedIdentityDocumentsUseCase,
    IdentityDocumentPurger,
    GetPatientProfileUseCase,
    UpdatePatientProfileUseCase,
    UpdateProfilePhotoUseCase,
    OpenProfilePhotoUseCase,
    GetRegistrationStatusUseCase,
    BootstrapAdminUseCase,
    CanBookAppointmentsPolicy,
    RoleProfileSectionRegistry,
    RateLimitGuard,
    { provide: USER_PROFILE_REPOSITORY, useClass: DrizzleUserProfileRepository },
    { provide: PATIENT_PROFILE_REPOSITORY, useClass: DrizzlePatientProfileRepository },
    { provide: IDENTITY_VERIFICATION_REPOSITORY, useClass: DrizzleIdentityVerificationRepository },
    { provide: LEGAL_DOCUMENT_REPOSITORY, useClass: DrizzleLegalDocumentRepository },
    { provide: REGISTRATION_STATUS_READER, useClass: DrizzleRegistrationStatusReader },
    { provide: RATE_LIMITER, useClass: InMemoryRateLimiter },
    { provide: IDENTITY_RATE_LIMIT_RULES, useValue: DEFAULT_IDENTITY_RATE_LIMIT_RULES },
    { provide: ADMIN_ACCOUNT_PROVISIONER, useClass: BetterAuthAdminAccountProvisioner },
    { provide: DOCTOR_IDENTITY_GATEWAY, useClass: DrizzleDoctorIdentityGateway },
  ],
  // M08 aplicará la política dentro de su caso de uso de agendar (DT-21). M03 usa el puerto restringido del médico.
  exports: [CanBookAppointmentsPolicy, DOCTOR_IDENTITY_GATEWAY, RATE_LIMITER, RoleProfileSectionRegistry],
})
export class IdentityModule {}
