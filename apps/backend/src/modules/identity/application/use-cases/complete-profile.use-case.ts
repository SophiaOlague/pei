import { Inject, Injectable } from '@nestjs/common';
import { USER_PROFILE_REPOSITORY } from '../../domain/repositories/user-profile.repository';
import type { UserProfileRepository } from '../../domain/repositories/user-profile.repository';
import { PATIENT_PROFILE_REPOSITORY } from '../../domain/repositories/patient-profile.repository';
import type { PatientProfileRepository } from '../../domain/repositories/patient-profile.repository';
import { LEGAL_DOCUMENT_REPOSITORY } from '../../domain/repositories/legal-document.repository';
import type { LegalDocumentRepository } from '../../domain/repositories/legal-document.repository';
import { UNIT_OF_WORK } from '../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../domain/ports/unit-of-work';
import {
  DuplicateCurpError,
  TermsNotAcceptedError,
  ProfileAlreadyCompletedError,
  MissingIdentityDocumentsError,
  LegalDocumentsNotPublishedError,
} from '../../domain/errors/identity.errors';

export interface CompleteProfileInput {
  userId: string;
  firstName: string;
  lastName: string;
  curp: string;
  phone?: string;
  birthDate?: string;
  photoUrl?: string;
  ineFrontUrl: string;
  ineBackUrl: string;
  acceptedTerms: boolean;
}

@Injectable()
export class CompleteProfileUseCase {
  constructor(
    @Inject(USER_PROFILE_REPOSITORY) private readonly userProfileRepository: UserProfileRepository,
    @Inject(PATIENT_PROFILE_REPOSITORY) private readonly patientProfileRepository: PatientProfileRepository,
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly legalDocumentRepository: LegalDocumentRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: CompleteProfileInput) {
    if (!input.acceptedTerms) {
      throw new TermsNotAcceptedError();
    }
    if (!input.ineFrontUrl || !input.ineBackUrl) {
      throw new MissingIdentityDocumentsError();
    }

    const alreadyCompleted = await this.userProfileRepository.existsByUserId(input.userId);
    if (alreadyCompleted) {
      throw new ProfileAlreadyCompletedError();
    }

    const existingCurp = await this.patientProfileRepository.findByCurp(input.curp);
    if (existingCurp) {
      throw new DuplicateCurpError(input.curp);
    }

    const privacyNotice = await this.legalDocumentRepository.findLatestByType('privacy_notice');
    const termsAndConditions = await this.legalDocumentRepository.findLatestByType('terms_and_conditions');

    if (!privacyNotice || !termsAndConditions) {
      throw new LegalDocumentsNotPublishedError();
    }

    return this.unitOfWork.runInTransaction(async () => {
      const profile = await this.userProfileRepository.create({
        userId: input.userId,
        role: 'patient',
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        birthDate: input.birthDate,
      });

      await this.patientProfileRepository.create({
        userProfileId: profile.id!,
        curp: input.curp,
        photoUrl: input.photoUrl,
        ineFrontUrl: input.ineFrontUrl,
        ineBackUrl: input.ineBackUrl,
      });

      await this.legalDocumentRepository.recordAcceptance(profile.id!, privacyNotice.id);
      await this.legalDocumentRepository.recordAcceptance(profile.id!, termsAndConditions.id);

      return profile;
    });
  }
}