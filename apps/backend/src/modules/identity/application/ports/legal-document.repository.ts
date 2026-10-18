import type { LegalDocumentType } from '../../domain/legal-requirements';

export interface CurrentLegalDocumentRecord {
  id: string;
  type: LegalDocumentType;
  version: string;
  publishedAt: Date;
  content: string;
}

export interface LegalDocumentRepository {
  // Versión vigente de cada tipo publicado: la de published_at más reciente que no sea futura.
  findCurrent(): Promise<CurrentLegalDocumentRecord[]>;
  // Idempotente: aceptar de nuevo la misma versión no duplica la evidencia.
  // Devuelve los ids de los documentos cuya aceptación se registró en esta llamada.
  recordAcceptances(input: {
    userProfileId: string;
    legalDocumentIds: string[];
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<string[]>;
  // Inserta nuevas versiones (legal_document es append-only). published_at lo fija quien publica.
  publish(documents: NewLegalDocument[]): Promise<PublishedLegalDocument[]>;
}

export interface NewLegalDocument {
  type: LegalDocumentType;
  version: string;
  content: string;
  contentHash: string;
  // Fecha común de publicación; sin valor, la BD usa now() (inicio de la transacción).
  publishedAt?: Date;
}

export interface PublishedLegalDocument {
  id: string;
  type: LegalDocumentType;
  version: string;
  publishedAt: Date;
}

export const LEGAL_DOCUMENT_REPOSITORY = Symbol('LEGAL_DOCUMENT_REPOSITORY');
