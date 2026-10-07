import type { LegalDocumentType } from '../../domain/registration-status';

export interface CurrentLegalDocumentRecord {
  id: string;
  type: LegalDocumentType;
  version: string;
  publishedAt: Date;
  content: string;
}

export interface LegalDocumentRepository {
  // Versión vigente de cada tipo: la de published_at más reciente que no sea futura.
  findCurrent(): Promise<CurrentLegalDocumentRecord[]>;
  // Idempotente: aceptar de nuevo la misma versión no duplica la evidencia.
  recordAcceptances(input: {
    userProfileId: string;
    legalDocumentIds: string[];
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void>;
}

export const LEGAL_DOCUMENT_REPOSITORY = Symbol('LEGAL_DOCUMENT_REPOSITORY');
