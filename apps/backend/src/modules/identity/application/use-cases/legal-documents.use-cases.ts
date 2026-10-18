import { createHash } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import {
  isLegalAudience,
  LEGACY_LEGAL_DOCUMENT_TYPES,
  LEGAL_REGIMES_BY_AUDIENCE,
  resolveLegalRegime,
  type LegalAudience,
  type LegalDocumentType,
} from '../../domain/legal-requirements';
import {
  DuplicateLegalDocumentIdsError,
  InvalidLegalPublicationError,
  LegalDocumentNotCurrentError,
  LegalDocumentNotRequiredForRoleError,
  LegalDocumentsNotPublishedError,
  PatientProfileRequiredError,
} from '../../domain/identity.errors';
import {
  LEGAL_DOCUMENT_REPOSITORY,
  type CurrentLegalDocumentRecord,
  type LegalDocumentRepository,
  type PublishedLegalDocument,
} from '../ports/legal-document.repository';
import { IdentityAuditEvents } from '../identity-audit-events';

// Documentos vigentes del régimen del rol (plan v2 §6.2): la publicación decide los requisitos, no el enum.
function currentForAudience(audience: LegalAudience, current: CurrentLegalDocumentRecord[]): CurrentLegalDocumentRecord[] {
  const regime = resolveLegalRegime(audience, current.map((doc) => doc.type));
  if (!regime) throw new LegalDocumentsNotPublishedError();
  return current.filter((doc) => regime.includes(doc.type));
}

// RF-03, RF-04: documentos legales vigentes que debe aceptar cada tipo de cuenta (por defecto, paciente).
@Injectable()
export class GetCurrentLegalDocumentsUseCase {
  constructor(@Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly legalDocuments: LegalDocumentRepository) {}

  async execute(audience: LegalAudience = 'patient'): Promise<CurrentLegalDocumentRecord[]> {
    return currentForAudience(audience, await this.legalDocuments.findCurrent());
  }
}

// RF-03, RF-04, RN-006, RNF-12, R-8: el paciente o el médico acepta la versión VIGENTE de cada documento de su régimen.
// La evidencia es user_legal_acceptance (con IP y user-agent); además, cada aceptación nueva queda en audit_log
// dentro de la misma UnitOfWork.
@Injectable()
export class AcceptLegalDocumentsUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly legalDocuments: LegalDocumentRepository,
  ) {}

  async execute(actor: Actor, documentIds: string[]): Promise<{ accepted: { documentId: string; type: string; version: string }[] }> {
    if (!isLegalAudience(actor.role) || !actor.userProfileId) throw new PatientProfileRequiredError();
    // Ids repetidos: la petición se rechaza completa antes de abrir la transacción (no depende solo del DTO).
    if (new Set(documentIds).size !== documentIds.length) throw new DuplicateLegalDocumentIdsError();
    const audience = actor.role;
    const userProfileId = actor.userProfileId;

    return this.unitOfWork.runInTransaction(async () => {
      const allCurrent = await this.legalDocuments.findCurrent();
      const required = new Set(currentForAudience(audience, allCurrent).map((doc) => doc.id));
      const current = new Map(allCurrent.map((doc) => [doc.id, doc]));
      // Una versión obsoleta, futura, inexistente o de otro rol invalida toda la petición: no se guarda nada.
      const documents = documentIds.map((id) => current.get(id));
      if (documents.some((doc) => !doc)) throw new LegalDocumentNotCurrentError();
      const outside = documents.filter((doc) => !required.has(doc!.id));
      // Un tipo de legado después de la transición ya no es vigente; uno del régimen de otro rol no corresponde.
      if (outside.some((doc) => LEGACY_LEGAL_DOCUMENT_TYPES.includes(doc!.type))) throw new LegalDocumentNotCurrentError();
      if (outside.length > 0) throw new LegalDocumentNotRequiredForRoleError();

      const recorded = new Set(
        await this.legalDocuments.recordAcceptances({
          userProfileId,
          legalDocumentIds: documentIds,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        }),
      );
      // A lo más un evento por aceptación insertada en esta llamada, en el orden de la petición: repetir una
      // aceptación ya guardada no la duplica ni genera otro evento, y cada id insertado se consume una sola vez.
      for (const doc of documents) {
        if (!recorded.delete(doc!.id)) continue;
        await this.auditTrail.record(IdentityAuditEvents.legalDocumentAccepted(AuditActor.fromActor(actor), doc!.id, doc!.type, doc!.version));
      }
      return {
        accepted: documents.map((doc) => ({ documentId: doc!.id, type: doc!.type, version: doc!.version })),
      };
    });
  }
}

export const LEGAL_PUBLISH_PROCESS = 'cli.legal-publish';
const VERSION_MAX = 50;

export interface LegalPublicationInput {
  audience: LegalAudience;
  documents: { type: LegalDocumentType; version: string; content: string }[];
  // Fecha común de publicación; si se omite, la fija la BD (now() de la transacción). Puede ser futura.
  publishedAt?: Date;
}

// CLI legal:publish (plan v2 §6.2, §6.4). Publica nuevas versiones en una sola transacción y con el mismo
// published_at. Después de publicar, el régimen nuevo del rol debe quedar completo: cada tipo del régimen está
// vigente o se publica aquí. Así no hay transiciones parciales. Los tipos de legado no se vuelven a publicar.
@Injectable()
export class PublishLegalDocumentsUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly legalDocuments: LegalDocumentRepository,
  ) {}

  async execute(input: LegalPublicationInput): Promise<PublishedLegalDocument[]> {
    const regime = LEGAL_REGIMES_BY_AUDIENCE[input.audience]?.[0];
    if (!regime) throw new InvalidLegalPublicationError('Tipo de cuenta no válido');
    const types = input.documents.map((doc) => doc.type);
    if (types.length === 0) throw new InvalidLegalPublicationError('No hay documentos que publicar');
    if (new Set(types).size !== types.length) throw new InvalidLegalPublicationError('Un tipo de documento aparece más de una vez');
    if (types.some((type) => LEGACY_LEGAL_DOCUMENT_TYPES.includes(type))) {
      throw new InvalidLegalPublicationError('Los tipos de legado no se vuelven a publicar');
    }
    if (types.some((type) => !regime.includes(type))) {
      throw new InvalidLegalPublicationError(`Solo se publican los tipos del régimen de ${input.audience}: ${regime.join(', ')}`);
    }
    for (const doc of input.documents) {
      if (!doc.version?.trim() || doc.version.trim().length > VERSION_MAX) {
        throw new InvalidLegalPublicationError(`La versión de ${doc.type} debe tener entre 1 y ${VERSION_MAX} caracteres`);
      }
      if (!doc.content?.trim()) throw new InvalidLegalPublicationError(`El contenido de ${doc.type} está vacío`);
    }

    return this.unitOfWork.runInTransaction(async () => {
      const effective = new Set((await this.legalDocuments.findCurrent()).map((doc) => doc.type));
      const missing = regime.filter((type) => !effective.has(type) && !types.includes(type));
      if (missing.length > 0) {
        throw new InvalidLegalPublicationError(`Publicación parcial: falta ${missing.join(', ')} para completar el régimen de ${input.audience}`);
      }
      const published = await this.legalDocuments.publish(
        input.documents.map((doc) => ({
          type: doc.type,
          version: doc.version.trim(),
          content: doc.content,
          contentHash: createHash('sha256').update(doc.content).digest('hex'),
          publishedAt: input.publishedAt,
        })),
      );
      for (const doc of published) {
        await this.auditTrail.record(
          IdentityAuditEvents.legalDocumentPublished(AuditActor.system(LEGAL_PUBLISH_PROCESS), doc.id, doc.type, doc.version),
        );
      }
      return published;
    });
  }
}
