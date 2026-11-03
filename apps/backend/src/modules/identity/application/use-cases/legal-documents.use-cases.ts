import { createHash, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import {
  isLegalAudience,
  LEGACY_LEGAL_DOCUMENT_TYPES,
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
  assertPublicationAuthorized,
  assertPublicationConfirmation,
  createPublicationConfirmation,
  planLegalPublication,
  verifyDatabaseTarget,
  type DeclaredDatabaseTarget,
  type LegalPublicationPlan,
  type PublicationAuthorizations,
} from '../../domain/legal-publication';
import {
  DATABASE_TARGET_READER,
  LEGAL_DOCUMENT_REPOSITORY,
  type CurrentLegalDocumentRecord,
  type DatabaseTargetReader,
  type LegalDocumentRepository,
  type PublishedLegalDocument,
} from '../ports/legal-document.repository';
import { IdentityAuditEvents, type LegalPublicationAudit } from '../identity-audit-events';

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

export interface LegalPublicationRequest {
  audience: LegalAudience;
  documents: { type: LegalDocumentType; version: string; content: string }[];
  publishedAt: Date;
  pastDateReason?: string;
  declaredTarget: DeclaredDatabaseTarget;
}

// CLI legal:publish (plan v2 §6.2, §6.4). `simulate` no escribe. `execute` repite el plan dentro de la transacción, con
// un candado que serializa las publicaciones, y solo publica si coincide con lo simulado. No existe otra vía de escritura.
@Injectable()
export class PublishLegalDocumentsUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(LEGAL_DOCUMENT_REPOSITORY) private readonly legalDocuments: LegalDocumentRepository,
    @Inject(DATABASE_TARGET_READER) private readonly target: DatabaseTargetReader,
  ) {}

  private hashed(request: LegalPublicationRequest) {
    return request.documents.map((doc) => {
      if (!doc.content?.trim()) throw new InvalidLegalPublicationError(`El contenido de ${doc.type} está vacío`);
      return { ...doc, contentHash: createHash('sha256').update(doc.content).digest('hex') };
    });
  }

  private async plan(request: LegalPublicationRequest, documents: ReturnType<PublishLegalDocumentsUseCase['hashed']>) {
    const target = verifyDatabaseTarget(await this.target.read(), request.declaredTarget);
    const { now, versions, usersByRole } = await this.legalDocuments.inspectPublication();
    const plan = planLegalPublication({
      audience: request.audience, documents, publishedAt: request.publishedAt, pastDateReason: request.pastDateReason, now, versions, usersByRole, target,
    });
    return { plan, now };
  }

  async simulate(request: LegalPublicationRequest): Promise<{ plan: LegalPublicationPlan; confirmation: string }> {
    const { plan, now } = await this.plan(request, this.hashed(request));
    return { plan, confirmation: createPublicationConfirmation(plan, now) };
  }

  async execute(
    request: LegalPublicationRequest & { confirmation: string; authorizations: PublicationAuthorizations },
  ): Promise<{ plan: LegalPublicationPlan; published: PublishedLegalDocument[] }> {
    const documents = this.hashed(request);
    return this.unitOfWork.runInTransaction(async () => {
      await this.legalDocuments.lockPublication();
      const { plan, now } = await this.plan(request, documents);
      assertPublicationConfirmation(plan, request.confirmation, now);
      assertPublicationAuthorized(plan, request.authorizations);
      const published = await this.legalDocuments.publish(
        documents.map((doc) => ({ type: doc.type, version: doc.version.trim(), content: doc.content, contentHash: doc.contentHash, publishedAt: request.publishedAt })),
      );
      const publication: LegalPublicationAudit = {
        publicationId: randomUUID(),
        result: 'published',
        audience: plan.audience,
        publishedAt: plan.publishedAt.toISOString(),
        targetKind: plan.target.kind,
        neonProject: plan.target.project,
        neonBranch: plan.target.branch,
        neonEndpoint: plan.target.endpoint,
        documents: plan.documents.map(({ type, version }) => ({ type, version })),
        authorizationsUsed: plan.requirements,
        ...(plan.pastDateReason ? { pastDateReason: plan.pastDateReason } : {}),
        impactScope: 'operation_total',
        patientProfilesPotentiallyAffected: plan.roles.find((role) => role.role === 'patient')?.potentiallyAffectedProfiles ?? 0,
        doctorProfilesPotentiallyAffected: plan.roles.find((role) => role.role === 'doctor')?.potentiallyAffectedProfiles ?? 0,
        regimeTransitions: plan.roles.filter((role) => role.regimeTransition).map((role) => role.role),
        scheduledRegimeTransitions: plan.scheduledChanges
          .filter((change) => change.regimeTransition)
          .map((change) => ({ at: change.at.toISOString(), role: change.role, alteredByPublication: change.alteredByPublication })),
      };
      for (const doc of published) {
        await this.auditTrail.record(
          IdentityAuditEvents.legalDocumentPublished(AuditActor.system(LEGAL_PUBLISH_PROCESS), doc.id, doc.type, doc.version, publication),
        );
      }
      return { plan, published };
    });
  }
}
