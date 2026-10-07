import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { REQUIRED_LEGAL_DOCUMENT_TYPES } from '../../domain/registration-status';
import { LegalDocumentNotCurrentError, LegalDocumentsNotPublishedError, PatientProfileRequiredError } from '../../domain/identity.errors';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type CurrentLegalDocumentRecord,
  type LegalDocumentRepository,
} from '../ports/legal-document.repository';

// RF-03, RF-04: documentos legales vigentes (aviso de privacidad y términos y condiciones).
@Injectable()
export class GetCurrentLegalDocumentsUseCase {
  constructor(@Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly legalDocuments: LegalDocumentRepository) {}

  async execute(): Promise<CurrentLegalDocumentRecord[]> {
    const current = await this.legalDocuments.findCurrent();
    const published = new Set(current.map((doc) => doc.type));
    if (!REQUIRED_LEGAL_DOCUMENT_TYPES.every((type) => published.has(type))) {
      throw new LegalDocumentsNotPublishedError();
    }
    return current;
  }
}

// RF-03, RF-04, RN-006, RNF-12: el paciente acepta la versión VIGENTE de cada documento.
// La evidencia es user_legal_acceptance (con IP y user-agent); no hay evento de auditoría (DT-14).
@Injectable()
export class AcceptLegalDocumentsUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly legalDocuments: LegalDocumentRepository,
  ) {}

  async execute(actor: Actor, documentIds: string[]): Promise<{ accepted: { documentId: string; type: string; version: string }[] }> {
    if (actor.role !== 'patient' || !actor.userProfileId) throw new PatientProfileRequiredError();
    const userProfileId = actor.userProfileId;

    return this.unitOfWork.runInTransaction(async () => {
      const current = new Map((await this.legalDocuments.findCurrent()).map((doc) => [doc.id, doc]));
      // Una versión obsoleta, futura o inexistente invalida toda la petición: no se guarda nada.
      const documents = documentIds.map((id) => current.get(id));
      if (documents.some((doc) => !doc)) throw new LegalDocumentNotCurrentError();

      await this.legalDocuments.recordAcceptances({
        userProfileId,
        legalDocumentIds: documentIds,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      });
      return {
        accepted: documents.map((doc) => ({ documentId: doc!.id, type: doc!.type, version: doc!.version })),
      };
    });
  }
}
