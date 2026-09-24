import { Inject, Injectable } from '@nestjs/common';
import { LEGAL_DOCUMENT_REPOSITORY } from '../../domain/repositories/legal-document.repository';
import type { LegalDocumentRepository } from '../../domain/repositories/legal-document.repository';

@Injectable()
export class RegisterLegalAcceptanceUseCase {
  constructor(
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly legalDocumentRepository: LegalDocumentRepository,
  ) {}

  async execute(input: { userProfileId: string }): Promise<void> {
    const privacyNotice = await this.legalDocumentRepository.findLatestByType('privacy_notice');
    const termsAndConditions = await this.legalDocumentRepository.findLatestByType('terms_and_conditions');

    if (!privacyNotice || !termsAndConditions) {
      throw new Error('No hay aviso de privacidad o términos y condiciones publicados');
    }

    await this.legalDocumentRepository.recordAcceptance(input.userProfileId, privacyNotice.id);
    await this.legalDocumentRepository.recordAcceptance(input.userProfileId, termsAndConditions.id);
  }
}