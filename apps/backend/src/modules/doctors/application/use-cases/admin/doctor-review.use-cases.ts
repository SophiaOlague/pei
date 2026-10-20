import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../../audit/domain/audit-actor';
import { contentTypeForObjectKey } from '../../../../private-storage/domain/object-key';
import { PRIVATE_OBJECT_STORAGE, type PrivateObjectStorage, type StoredObject } from '../../../../private-storage/application/ports/private-object-storage';
import { DOCTOR_IDENTITY_GATEWAY, type DoctorIdentityGateway } from '../../../../identity/application/ports/doctor-identity.gateway';
import { resolveReview, type ReviewDecision, type ReviewStatus } from '../../../domain/review';
import type { DoctorStatus } from '../../../domain/doctor-status';
import type { LicenseReviewReason } from '../../../domain/sensitive-change';
import type { DocumentSide } from '../../../domain/object-keys';
import {
  AdminRequiredError, DoctorIdentityDocumentUnavailableError, DoctorNotFoundError, DoctorReviewNotFoundError, LicenseDocumentUnavailableError,
  ReviewNotPendingError,
} from '../../../domain/doctor.errors';
import { DOCTOR_PROFILE_REPOSITORY, type DoctorProfileRecord, type DoctorProfileRepository } from '../../ports/doctor-profile.repository';
import { DOCTOR_REVIEW_REPOSITORY, type DoctorReviewRepository, type IdentityReviewRecord, type LicenseReviewRecord } from '../../ports/doctor-review.repository';
import { SPECIALTY_REPOSITORY, type SpecialtyRepository } from '../../ports/specialty.repository';
import { DoctorAuditEvents } from '../../doctor-audit-events';
import { DoctorStatusService } from '../../doctor-status.service';
import { DoctorIdentityDocumentPurger } from '../doctor-identity-document-purger';

// M03 B6 (RF-06, RN-005, D-16, D-22, D-25, D-27, R-2, E.5): revisión del administrador. Solo admin (no existe un rol
// revisor); las rutas exigen @Roles('admin') y los casos de uso también fallan cerrado. Ninguna respuesta incluye claves
// de objetos ni URLs.

export type ReviewLine = 'identity' | 'license';

export function requireAdmin(actor: Actor): string {
  if (actor.role !== 'admin' || !actor.userProfileId) throw new AdminRequiredError();
  return actor.userProfileId;
}

const maxAttempt = (rows: readonly { attempt: number }[]) => rows.reduce((m, r) => Math.max(m, r.attempt), 0);

// E.5: vigente = versión de la línea igual a la del perfil y último intento del médico en esa línea.
const isCurrentIdentity = (review: IdentityReviewRecord, profile: DoctorProfileRecord, all: IdentityReviewRecord[]) =>
  review.revision === profile.identityRevision && review.attempt === maxAttempt(all);
const isCurrentLicense = (review: LicenseReviewRecord, profile: DoctorProfileRecord, all: LicenseReviewRecord[]) =>
  review.revision === profile.professionalRevision && review.attempt === maxAttempt(all);

interface ReviewSummary {
  id: string;
  doctorProfileId: string;
  attempt: number;
  revision: number;
  status: ReviewStatus;
  submittedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
}
const summary = (r: IdentityReviewRecord | LicenseReviewRecord): ReviewSummary => ({
  id: r.id, doctorProfileId: r.doctorId, attempt: r.attempt, revision: r.revision, status: r.status,
  submittedAt: r.createdAt, reviewedAt: r.reviewedAt, rejectionReason: r.rejectionReason,
});

// Colas de revisiones pendientes, en orden de llegada y sin documentos.
@Injectable()
export class ListPendingDoctorReviewsUseCase {
  constructor(@Inject(DOCTOR_REVIEW_REPOSITORY) private readonly reviews: DoctorReviewRepository) {}

  async execute(actor: Actor, line: ReviewLine, page: number, pageSize: number) {
    requireAdmin(actor);
    if (line === 'identity') {
      const { items, total } = await this.reviews.listPendingIdentity(page, pageSize);
      return { items: items.map(summary), total };
    }
    const { items, total } = await this.reviews.listPendingLicense(page, pageSize);
    return { items: items.map((r) => ({ ...summary(r), reason: r.reason })), total };
  }
}

export interface IdentityReviewDetail extends ReviewSummary {
  isCurrent: boolean;
  documentsAvailable: boolean;
  // 7ter.4: el admin compara la INE con el nombre legal y la CURP VIGENTES del médico.
  doctor: { firstName: string; lastName: string; curp: string };
}

export interface LicenseReviewDetail extends ReviewSummary {
  isCurrent: boolean;
  reason: LicenseReviewReason;
  licenseNumber: string;
  specialty: { id: string; code: string; name: string } | null;
  // 7ter.1 punto 6: el nombre legal vigente para verificar que concuerde con la cédula.
  doctor: { firstName: string; lastName: string };
}

@Injectable()
export class GetDoctorReviewDetailUseCase {
  constructor(
    @Inject(DOCTOR_REVIEW_REPOSITORY) private readonly reviews: DoctorReviewRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    @Inject(DOCTOR_IDENTITY_GATEWAY) private readonly identity: DoctorIdentityGateway,
    @Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository,
  ) {}

  async identityDetail(actor: Actor, id: string): Promise<IdentityReviewDetail> {
    requireAdmin(actor);
    const review = await this.reviews.findIdentityById(id);
    if (!review) throw new DoctorReviewNotFoundError();
    const { profile, legal } = await this.doctorOf(review.doctorId);
    const current = isCurrentIdentity(review, profile, await this.reviews.listIdentity(profile.id));
    return {
      ...summary(review), isCurrent: current,
      documentsAvailable: review.status === 'pending' && current && review.frontObjectKey !== null && review.backObjectKey !== null,
      doctor: { firstName: legal.firstName, lastName: legal.lastName, curp: legal.curp },
    };
  }

  async licenseDetail(actor: Actor, id: string): Promise<LicenseReviewDetail> {
    requireAdmin(actor);
    const review = await this.reviews.findLicenseById(id);
    if (!review) throw new DoctorReviewNotFoundError();
    const { profile, legal } = await this.doctorOf(review.doctorId);
    const specialty = await this.specialties.findById(review.specialtyId);
    return {
      ...summary(review),
      isCurrent: isCurrentLicense(review, profile, await this.reviews.listLicense(profile.id)),
      reason: review.reason,
      licenseNumber: review.licenseNumber,
      specialty: specialty ? { id: specialty.id, code: specialty.code, name: specialty.name } : null,
      doctor: { firstName: legal.firstName, lastName: legal.lastName },
    };
  }

  private async doctorOf(doctorId: string) {
    const profile = await this.profiles.findById(doctorId);
    if (!profile) throw new DoctorNotFoundError();
    const legal = await this.identity.findLegalIdentity(profile.userProfileId);
    if (!legal) throw new DoctorNotFoundError();
    return { profile, legal };
  }
}

// RF-06, D-25, D-27, R-2, E.5 (plan v2 §9): aprobar o rechazar una revisión pendiente y vigente. Candados: perfil del
// médico FOR UPDATE y después la revisión FOR UPDATE; la escritura es condicional (WHERE status = 'pending'). La INE se
// purga después del commit (D-19, DT-5); la cédula se conserva (D-16).
@Injectable()
export class ReviewDoctorVerificationUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(DOCTOR_REVIEW_REPOSITORY) private readonly reviews: DoctorReviewRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    private readonly statusService: DoctorStatusService,
    private readonly purger: DoctorIdentityDocumentPurger,
  ) {}

  async execute(
    actor: Actor,
    line: ReviewLine,
    id: string,
    decision: ReviewDecision,
  ): Promise<{ reviewId: string; status: 'approved' | 'rejected'; attempt: number; doctorStatus: DoctorStatus; documentsDeleted: boolean | null }> {
    const reviewerId = requireAdmin(actor);
    // Valida el motivo antes de abrir la transacción (D-25).
    resolveReview('pending', true, decision);

    const result = await this.unitOfWork.runInTransaction(async () => {
      const found = line === 'identity' ? await this.reviews.findIdentityById(id) : await this.reviews.findLicenseById(id);
      if (!found) throw new DoctorReviewNotFoundError();
      const profile = await this.profiles.lockById(found.doctorId);
      if (!profile) throw new DoctorNotFoundError();
      const locked = line === 'identity' ? await this.reviews.lockIdentity(id) : await this.reviews.lockLicense(id);
      if (!locked) throw new DoctorReviewNotFoundError();

      const isCurrent = line === 'identity'
        ? isCurrentIdentity(locked as IdentityReviewRecord, profile, await this.reviews.listIdentity(profile.id))
        : isCurrentLicense(locked as LicenseReviewRecord, profile, await this.reviews.listLicense(profile.id));
      const resolved = resolveReview(locked.status, isCurrent, decision);
      const update = { id, status: resolved.status, reviewedBy: reviewerId, rejectionReason: resolved.rejectionReason };
      const reviewed = line === 'identity' ? await this.reviews.markIdentityReviewed(update) : await this.reviews.markLicenseReviewed(update);
      // Bajo el FOR UPDATE no debería ocurrir; si ocurre, nada cambió.
      if (!reviewed) throw new ReviewNotPendingError();
      await this.auditTrail.record(DoctorAuditEvents.reviewed(AuditActor.fromActor(actor), line, reviewed.id, resolved.status, reviewed.attempt));
      const after = await this.statusService.read(profile);
      return { reviewed, status: resolved.status, doctorStatus: after.status };
    });

    const documentsDeleted = line === 'identity' ? await this.purger.purge(result.reviewed as IdentityReviewRecord) : null;
    return { reviewId: result.reviewed.id, status: result.status, attempt: result.reviewed.attempt, doctorStatus: result.doctorStatus, documentsDeleted };
  }
}

// D-16, D-19, D-22, RNF-08: el admin abre un documento. La INE solo si la revisión está pendiente y es vigente; la cédula
// en cualquier estado (se conserva). Cada lectura se audita en la UoW antes de transmitir; si la transmisión falla
// después, el evento permanece (documenta la autorización del acceso, como en M02).
@Injectable()
export class OpenDoctorReviewDocumentUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    @Inject(DOCTOR_REVIEW_REPOSITORY) private readonly reviews: DoctorReviewRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
  ) {}

  async identity(actor: Actor, id: string, side: DocumentSide): Promise<StoredObject & { contentType: string }> {
    requireAdmin(actor);
    const key = await this.unitOfWork.runInTransaction(async () => {
      const review = await this.reviews.findIdentityById(id);
      if (!review) throw new DoctorReviewNotFoundError();
      const profile = await this.profiles.findById(review.doctorId);
      if (!profile) throw new DoctorNotFoundError();
      const current = isCurrentIdentity(review, profile, await this.reviews.listIdentity(profile.id));
      const key = side === 'front' ? review.frontObjectKey : review.backObjectKey;
      if (review.status !== 'pending' || !current || !key) throw new DoctorIdentityDocumentUnavailableError();
      await this.auditTrail.record(DoctorAuditEvents.identityDocumentViewed(AuditActor.fromActor(actor), review.id, side));
      return key;
    });
    const file = await this.storage.openForRead(key);
    return { ...file, contentType: contentTypeForObjectKey(key) };
  }

  async license(actor: Actor, id: string): Promise<StoredObject & { contentType: string }> {
    requireAdmin(actor);
    const key = await this.unitOfWork.runInTransaction(async () => {
      const review = await this.reviews.findLicenseById(id);
      if (!review) throw new DoctorReviewNotFoundError();
      if (!review.documentObjectKey) throw new LicenseDocumentUnavailableError();
      await this.auditTrail.record(DoctorAuditEvents.licenseDocumentViewed(AuditActor.fromActor(actor), review.id));
      return review.documentObjectKey;
    });
    const file = await this.storage.openForRead(key);
    return { ...file, contentType: contentTypeForObjectKey(key) };
  }
}

// DT-5, DT-6, D-19: CLI de conciliación. Purga las INE de médicos en estado terminal que aún conservan claves.
@Injectable()
export class PurgeTerminalDoctorIdentityDocumentsUseCase {
  constructor(
    @Inject(DOCTOR_REVIEW_REPOSITORY) private readonly reviews: DoctorReviewRepository,
    private readonly purger: DoctorIdentityDocumentPurger,
  ) {}

  async execute(limit = 500): Promise<{ found: number; purged: number; failed: number }> {
    const pending = await this.reviews.findTerminalIdentityWithDocuments(limit);
    let purged = 0;
    for (const review of pending) if (await this.purger.purge(review)) purged++;
    return { found: pending.length, purged, failed: pending.length - purged };
  }
}
