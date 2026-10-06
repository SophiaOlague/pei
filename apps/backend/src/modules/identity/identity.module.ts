import { Module } from '@nestjs/common';
import { IdentityController, MeController } from './identity.controller';
import { CompleteProfileUseCase } from './application/use-cases/complete-profile.use-case';
import { USER_PROFILE_REPOSITORY } from './domain/repositories/user-profile.repository';
import { PATIENT_PROFILE_REPOSITORY } from './domain/repositories/patient-profile.repository';
import { LEGAL_DOCUMENT_REPOSITORY } from './domain/repositories/legal-document.repository';
import { FILE_STORAGE } from './domain/ports/file-storage';
import { DrizzleUserProfileRepository } from './infrastructure/persistence/drizzle-user-profile.repository';
import { DrizzlePatientProfileRepository } from './infrastructure/persistence/drizzle-patient-profile.repository';
import { DrizzleLegalDocumentRepository } from './infrastructure/persistence/drizzle-legal-document.repository';
import { R2FileStorage } from './infrastructure/storage/r2-file-storage';

// UNIT_OF_WORK lo provee CommonModule (global).
@Module({
  controllers: [IdentityController, MeController],
  providers: [
    CompleteProfileUseCase,
    { provide: USER_PROFILE_REPOSITORY, useClass: DrizzleUserProfileRepository },
    { provide: PATIENT_PROFILE_REPOSITORY, useClass: DrizzlePatientProfileRepository },
    { provide: LEGAL_DOCUMENT_REPOSITORY, useClass: DrizzleLegalDocumentRepository },
    { provide: FILE_STORAGE, useClass: R2FileStorage },
  ],
})
export class IdentityModule {}