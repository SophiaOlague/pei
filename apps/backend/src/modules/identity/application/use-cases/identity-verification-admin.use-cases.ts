import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import {
  assertDocumentsViewable,
  resolveReview,
  type DocumentSide,
  type ReviewDecision,
} from '../../domain/identity-verification';
import { contentTypeForKey, isManagedObjectKey } from '../../domain/object-keys';
import {
  AdminRequiredError,
  IdentityDocumentUnavailableError,
  IdentityVerificationAlreadyReviewedError,
  IdentityVerificationNotFoundError,
  StoredFileNotFoundError,
} from '../../domain/identity.errors';
import { DOCUMENT_STORAGE, type DocumentStorage, type StoredFile } from '../ports/document-storage';
import {
  IDENTITY_VERIFICATION_REPOSITORY,
  type IdentityVerificationDetail,
  type IdentityVerificationRepository,
  type PendingIdentityVerificationItem,
} from '../ports/identity-verification.repository';
import { IdentityAuditEvents } from '../identity-audit-events';
import { IdentityDocumentPurger } from './identity-document-purger';

// Las rutas ya exigen @Roles('admin'); los casos de uso también fallan cerrado.
function requireAdmin(actor: Actor): string {
  if (actor.role !== 'admin' || !actor.userProfileId) throw new AdminRequiredError();
  return actor.userProfileId;
}

// RF-07: cola de envíos pendientes, en orden de llegada y sin documentos.
@Injectable()
export class ListPendingIdentityVerificationsUseCase {
  constructor(@Inject(IDENTITY_VERIFICATION_REPOSITORY) private readonly verifications: IdentityVerificationRepository) {}

  async execute(actor: Actor, page: number, pageSize: number): Promise<{ items: PendingIdentityVerificationItem[]; total: number }> {
    requireAdmin(actor);
    return this.verifications.listPending(page, pageSize);
  }
}

// RF-07: datos para comparar con el INE (nombre legal, CURP, fecha de nacimiento), sin claves ni URLs.
@Injectable()
export class GetIdentityVerificationDetailUseCase {
  constructor(@Inject(IDENTITY_VERIFICATION_REPOSITORY) private readonly verifications: IdentityVerificationRepository) {}

  async execute(actor: Actor, id: string): Promise<IdentityVerificationDetail> {
    requireAdmin(actor);
    const detail = await this.verifications.findDetail(id);
    if (!detail) throw new IdentityVerificationNotFoundError();
    return detail;
  }
}

// DP-15, DT-1, RNF-08: el administrador ve un documento de un envío 'pending'. Cada lectura se audita
// (un evento por lado) en la UnitOfWork; después del commit el backend transmite el objeto.
// Si la transmisión falla después del commit, el evento permanece: documenta la autorización del acceso.
@Injectable()
export class OpenIdentityDocumentUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(IDENTITY_VERIFICATION_REPOSITORY) private readonly verifications: IdentityVerificationRepository,
  ) {}

  async execute(actor: Actor, id: string, side: DocumentSide): Promise<StoredFile & { contentType: string }> {
    requireAdmin(actor);
    const key = await this.unitOfWork.runInTransaction(async () => {
      const record = await this.verifications.findById(id);
      if (!record) throw new IdentityVerificationNotFoundError();
      assertDocumentsViewable(record.status);
      const key = side === 'front' ? record.frontObjectKey : record.backObjectKey;
      if (!key) throw new IdentityDocumentUnavailableError();
      await this.auditTrail.record(IdentityAuditEvents.documentViewed(AuditActor.fromActor(actor), record.id, side));
      return key;
    });

    // Una fila anterior a M02 con una URL en lugar de clave no tiene objeto en el bucket privado (DT-3).
    if (!isManagedObjectKey(key)) throw new StoredFileNotFoundError();
    const file = await this.storage.openForRead(key);
    return { ...file, contentType: contentTypeForKey(key) };
  }
}

// RF-07, RNF-08, DT-5: aprobar o rechazar un envío pendiente y, después del commit, eliminar sus documentos.
@Injectable()
export class ReviewIdentityVerificationUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(IDENTITY_VERIFICATION_REPOSITORY) private readonly verifications: IdentityVerificationRepository,
    private readonly purger: IdentityDocumentPurger,
  ) {}

  async execute(
    actor: Actor,
    id: string,
    review: ReviewDecision,
  ): Promise<{ submissionId: string; status: 'approved' | 'rejected'; attempt: number; documentsDeleted: boolean }> {
    const reviewerId = requireAdmin(actor);
    // Valida el motivo antes de abrir la transacción.
    resolveReview('pending', review);

    const reviewed = await this.unitOfWork.runInTransaction(async () => {
      const record = await this.verifications.findById(id);
      if (!record) throw new IdentityVerificationNotFoundError();
      const decision = resolveReview(record.status, review);
      // UPDATE ... WHERE status = 'pending': si otro administrador revisó primero, no cambia nada.
      const updated = await this.verifications.markReviewed({ id, reviewedBy: reviewerId, ...decision });
      if (!updated) throw new IdentityVerificationAlreadyReviewedError();
      await this.auditTrail.record(
        IdentityAuditEvents.verificationReviewed(AuditActor.fromActor(actor), updated.id, decision.status, updated.attempt),
      );
      return updated;
    });

    // Después del commit: si la eliminación fallara antes, un envío aún 'pending' se quedaría sin documentos.
    const documentsDeleted = await this.purger.purge(reviewed);
    return {
      submissionId: reviewed.id,
      status: reviewed.status as 'approved' | 'rejected',
      attempt: reviewed.attempt,
      documentsDeleted,
    };
  }
}

// DT-5, DT-6: CLI de purga y conciliación para envíos revisados que aún conservan documentos.
@Injectable()
export class PurgeReviewedIdentityDocumentsUseCase {
  constructor(
    @Inject(IDENTITY_VERIFICATION_REPOSITORY) private readonly verifications: IdentityVerificationRepository,
    private readonly purger: IdentityDocumentPurger,
  ) {}

  async execute(limit = 500): Promise<{ found: number; purged: number; failed: number }> {
    const pending = await this.verifications.findReviewedWithDocuments(limit);
    let purged = 0;
    for (const record of pending) {
      if (await this.purger.purge(record)) purged++;
    }
    return { found: pending.length, purged, failed: pending.length - purged };
  }
}
