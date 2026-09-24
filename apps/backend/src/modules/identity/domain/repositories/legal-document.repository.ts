export interface LegalDocumentRecord {
  id: string;
  type: 'privacy_notice' | 'terms_and_conditions';
}

export interface LegalDocumentRepository {
  findLatestByType(type: 'privacy_notice' | 'terms_and_conditions'): Promise<LegalDocumentRecord | null>;
  recordAcceptance(userProfileId: string, legalDocumentId: string): Promise<void>;
}

export const LEGAL_DOCUMENT_REPOSITORY = Symbol('LEGAL_DOCUMENT_REPOSITORY');