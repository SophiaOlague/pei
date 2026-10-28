import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { currentReview, type DoctorStatus } from '../../domain/doctor-status';
import { specialtyChangeEffects, type ChangeEffects } from '../../domain/sensitive-change';
import { DoctorProfileRequiredError, NoChangesError, SpecialtyInactiveError, SpecialtyNotFoundError } from '../../domain/doctor.errors';
import { DOCTOR_PROFILE_REPOSITORY, type DoctorProfileRecord, type DoctorProfileRepository } from '../ports/doctor-profile.repository';
import { DOCTOR_REVIEW_REPOSITORY, type DoctorReviewRepository, type IdentityReviewRecord, type LicenseReviewRecord } from '../ports/doctor-review.repository';
import { SPECIALTY_REPOSITORY, type SpecialtyRepository } from '../ports/specialty.repository';
import { DoctorAuditEvents, type DoctorChangeCause } from '../doctor-audit-events';
import { DoctorStatusService, recordStatusTransition, requireDoctor, type DoctorState } from '../doctor-status.service';

export interface ChangeResult {
  status: DoctorStatus;
  identityRevision: number;
  professionalRevision: number;
}

// Pasos comunes de un cambio sensible bajo el candado del perfil (plan v2 §7ter.2 pasos 6–8): versiones, superseded de
// cada línea y revisión automática de la cédula que reutiliza el documento de la revisión vigente.
async function applyEffects(
  deps: { profiles: DoctorProfileRepository; reviews: DoctorReviewRepository; auditTrail: AuditTrail },
  actor: Actor,
  profile: DoctorProfileRecord,
  before: DoctorState,
  effects: ChangeEffects,
  cause: DoctorChangeCause,
  change: { specialtyId?: string } = {},
): Promise<{ updated: DoctorProfileRecord; supersededIdentity: IdentityReviewRecord | null }> {
  const auditActor = AuditActor.fromActor(actor);
  // La revisión vigente de la cédula ANTES del cambio (regla de reutilización, 7bis.1).
  const reusable: LicenseReviewRecord | null = effects.automaticLicenseReview ? currentReview(before.licenseReviews, profile.professionalRevision) : null;

  const updated = await deps.profiles.applyRevisions({
    id: profile.id,
    identityBump: effects.identityRevisionBump,
    professionalBump: effects.professionalRevisionBump,
    ...(change.specialtyId !== undefined ? { specialtyId: change.specialtyId } : {}),
  });

  const supersededIdentity = effects.supersedeIdentityPending ? await deps.reviews.supersedePendingIdentity(profile.id) : null;
  if (supersededIdentity) await deps.auditTrail.record(DoctorAuditEvents.identitySuperseded(auditActor, supersededIdentity.id, supersededIdentity.attempt, cause));
  const supersededLicense = effects.supersedeLicensePending ? await deps.reviews.supersedePendingLicense(profile.id) : null;
  if (supersededLicense) await deps.auditTrail.record(DoctorAuditEvents.licenseSuperseded(auditActor, supersededLicense.id, supersededLicense.attempt, cause));

  if (effects.automaticLicenseReview && reusable) {
    const attempt = before.licenseReviews.reduce((max, r) => Math.max(max, r.attempt), 0) + 1;
    const review = await deps.reviews.insertLicense({
      id: randomUUID(),
      doctorId: profile.id,
      attempt,
      revision: updated.professionalRevision,
      reason: effects.automaticLicenseReview,
      licenseNumber: updated.licenseNumber ?? reusable.licenseNumber,
      specialtyId: updated.specialtyId,
      documentObjectKey: reusable.documentObjectKey,
    });
    await deps.auditTrail.record(DoctorAuditEvents.licenseSubmitted(auditActor, review.id, attempt, updated.professionalRevision, review.reason));
  }
  return { updated, supersededIdentity };
}

// D-5, D-21, D-33 (diseño v3 §E.3): cambio de especialidad. Debe estar activa (FOR SHARE). La versión profesional sube
// y, si la cédula vigente era approved o pending, se crea specialty_changed con el mismo documento.
@Injectable()
export class ChangeDoctorSpecialtyUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    @Inject(DOCTOR_REVIEW_REPOSITORY) private readonly reviews: DoctorReviewRepository,
    @Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository,
    private readonly statusService: DoctorStatusService,
  ) {}

  async execute(actor: Actor, specialtyId: string): Promise<ChangeResult> {
    const userProfileId = requireDoctor(actor);
    return this.unitOfWork.runInTransaction(async () => {
      const profile = await this.profiles.lockByUserProfileId(userProfileId);
      if (!profile) throw new DoctorProfileRequiredError();
      if (profile.specialtyId === specialtyId) throw new NoChangesError();
      const specialty = await this.specialties.lockForShare(specialtyId);
      if (!specialty) throw new SpecialtyNotFoundError();
      if (!specialty.isActive) throw new SpecialtyInactiveError();

      const before = await this.statusService.read(profile);
      const effects = specialtyChangeEffects(before.status.professional, before.licenseReviews.length > 0);
      const { updated } = await applyEffects(
        { profiles: this.profiles, reviews: this.reviews, auditTrail: this.auditTrail }, actor, profile, before, effects, 'specialty_changed', { specialtyId },
      );
      await this.auditTrail.record(DoctorAuditEvents.specialtyChanged(AuditActor.fromActor(actor), profile.id, profile.specialtyId, specialtyId));
      const after = await this.statusService.read(updated);
      await recordStatusTransition(this.auditTrail, actor, profile.id, before.status, after.status, 'specialty_changed');
      return { status: after.status, identityRevision: updated.identityRevision, professionalRevision: updated.professionalRevision };
    });
  }
}
