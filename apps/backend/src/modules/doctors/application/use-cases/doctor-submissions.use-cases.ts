import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { RegistrationDataConflictError } from '../../../identity/domain/identity.errors';
import { validateFile, validateImage } from '../../../private-storage/domain/file-signature';
import { PRIVATE_OBJECT_STORAGE, type PrivateObjectStorage } from '../../../private-storage/application/ports/private-object-storage';
import { parseLicenseNumber } from '../../domain/license-number';
import { identitySubmissionEffects, licenseSubmission, type LicenseReviewReason } from '../../domain/sensitive-change';
import { doctorIdentityKey, doctorLicenseKey, LICENSE_FILE_RULE } from '../../domain/object-keys';
import type { DoctorStatus } from '../../domain/doctor-status';
import { DoctorProfileRequiredError } from '../../domain/doctor.errors';
import { DOCTOR_PROFILE_REPOSITORY, type DoctorProfileRepository } from '../ports/doctor-profile.repository';
import { DOCTOR_REVIEW_REPOSITORY, type DoctorReviewRepository, type IdentityReviewRecord } from '../ports/doctor-review.repository';
import { DoctorAuditEvents } from '../doctor-audit-events';
import { DoctorStatusService, recordStatusTransition, requireDoctor } from '../doctor-status.service';
import { DoctorIdentityDocumentPurger } from './doctor-identity-document-purger';

const nextAttempt = (reviews: readonly { attempt: number }[]) => reviews.reduce((max, r) => Math.max(max, r.attempt), 0) + 1;

async function compensate(storage: PrivateObjectStorage, logger: Logger, keys: string[]): Promise<void> {
  for (const key of keys) await storage.delete(key).catch(() => logger.warn('doctor_upload_compensation_failed'));
}

// D-19, R-14, D-21 (diseño v3 §E.1): envío de la INE del médico (frente y reverso, JPEG/PNG de 5 MB). Un envío nuevo con
// uno pendiente es un cambio: el pendiente pasa a superseded (difiere a propósito de M02, que responde 409). Las claves
// las genera el servidor; si la BD falla después de subir, se eliminan los objetos (DT-6).
@Injectable()
export class SubmitDoctorIdentityVerificationUseCase {
  private readonly logger = new Logger('SubmitDoctorIdentityVerification');

  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    @Inject(DOCTOR_REVIEW_REPOSITORY) private readonly reviews: DoctorReviewRepository,
    private readonly statusService: DoctorStatusService,
    private readonly purger: DoctorIdentityDocumentPurger,
  ) {}

  async execute(actor: Actor, files: { front?: Buffer; back?: Buffer }): Promise<{ reviewId: string; attempt: number; status: DoctorStatus }> {
    const userProfileId = requireDoctor(actor);
    const front = validateImage(files.front);
    const back = validateImage(files.back);
    const profile = await this.profiles.findByUserProfileId(userProfileId);
    if (!profile) throw new DoctorProfileRequiredError();

    const reviewId = randomUUID();
    const frontKey = doctorIdentityKey(profile.id, reviewId, 'front', front.extension);
    const backKey = doctorIdentityKey(profile.id, reviewId, 'back', back.extension);
    const uploaded: string[] = [];
    let outcome: { attempt: number; status: DoctorStatus; superseded: IdentityReviewRecord | null };
    try {
      await this.storage.put(frontKey, front.bytes, front.contentType);
      uploaded.push(frontKey);
      await this.storage.put(backKey, back.bytes, back.contentType);
      uploaded.push(backKey);

      outcome = await this.unitOfWork.runInTransaction(async () => {
        const locked = await this.profiles.lockByUserProfileId(userProfileId);
        if (!locked) throw new DoctorProfileRequiredError();
        const before = await this.statusService.read(locked);
        const auditActor = AuditActor.fromActor(actor);
        const superseded = identitySubmissionEffects().supersedeIdentityPending ? await this.reviews.supersedePendingIdentity(locked.id) : null;
        if (superseded) await this.auditTrail.record(DoctorAuditEvents.identitySuperseded(auditActor, superseded.id, superseded.attempt, 'identity_resubmitted'));
        const attempt = nextAttempt(before.identityReviews);
        await this.reviews.insertIdentity({ id: reviewId, doctorId: locked.id, attempt, revision: locked.identityRevision, frontObjectKey: frontKey, backObjectKey: backKey });
        await this.auditTrail.record(DoctorAuditEvents.identitySubmitted(auditActor, reviewId, attempt, locked.identityRevision));
        const after = await this.statusService.read(locked);
        await recordStatusTransition(this.auditTrail, actor, locked.id, before.status, after.status, 'identity_resubmitted');
        return { attempt, status: after.status, superseded };
      });
    } catch (error) {
      await compensate(this.storage, this.logger, uploaded);
      throw error;
    }
    if (outcome.superseded) await this.purger.purge(outcome.superseded);
    return { reviewId, attempt: outcome.attempt, status: outcome.status };
  }
}

// D-1, D-3, D-4, D-16, R-5, R-6 (plan v2 §7bis): envío de la cédula. El documento es SIEMPRE obligatorio en este camino
// y el motivo lo deduce el caso de uso bajo el candado. El número del perfil es único (D-17: 409 genérico). El documento
// se conserva (sin purga).
@Injectable()
export class SubmitDoctorLicenseVerificationUseCase {
  private readonly logger = new Logger('SubmitDoctorLicenseVerification');

  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    @Inject(DOCTOR_REVIEW_REPOSITORY) private readonly reviews: DoctorReviewRepository,
    private readonly statusService: DoctorStatusService,
  ) {}

  async execute(
    actor: Actor,
    input: { licenseNumber: string; document?: Buffer },
  ): Promise<{ reviewId: string; attempt: number; reason: LicenseReviewReason; status: DoctorStatus }> {
    const userProfileId = requireDoctor(actor);
    const licenseNumber = parseLicenseNumber(input.licenseNumber);
    const document = validateFile(input.document, LICENSE_FILE_RULE);
    const profile = await this.profiles.findByUserProfileId(userProfileId);
    if (!profile) throw new DoctorProfileRequiredError();

    const reviewId = randomUUID();
    const key = doctorLicenseKey(profile.id, reviewId, document.extension);
    let uploaded = false;
    try {
      await this.storage.put(key, document.bytes, document.contentType);
      uploaded = true;
      return await this.unitOfWork.runInTransaction(async () => {
        const locked = await this.profiles.lockByUserProfileId(userProfileId);
        if (!locked) throw new DoctorProfileRequiredError();
        const before = await this.statusService.read(locked);
        const { reason, effects } = licenseSubmission({
          professionalBefore: before.status.professional,
          hasLicenseHistory: before.licenseReviews.length > 0,
          profileLicenseNumber: locked.licenseNumber,
          submittedLicenseNumber: licenseNumber,
        });
        const auditActor = AuditActor.fromActor(actor);
        const superseded = effects.supersedeLicensePending ? await this.reviews.supersedePendingLicense(locked.id) : null;
        if (superseded) await this.auditTrail.record(DoctorAuditEvents.licenseSuperseded(auditActor, superseded.id, superseded.attempt, 'license_resubmitted'));

        const numberChanges = locked.licenseNumber !== licenseNumber;
        const updated = effects.professionalRevisionBump
          ? await this.profiles.applyRevisions({ id: locked.id, identityBump: 0, professionalBump: 1, ...(numberChanges ? { licenseNumber } : {}) })
          : locked;
        const revisions = { identityRevision: updated.identityRevision, professionalRevision: updated.professionalRevision };
        if (numberChanges && locked.licenseNumber !== null) await this.auditTrail.record(DoctorAuditEvents.licenseNumberChanged(auditActor, locked.id, revisions));

        const attempt = nextAttempt(before.licenseReviews);
        await this.reviews.insertLicense({
          id: reviewId, doctorId: locked.id, attempt, revision: updated.professionalRevision, reason,
          licenseNumber, specialtyId: updated.specialtyId, documentObjectKey: key,
        });
        await this.auditTrail.record(DoctorAuditEvents.licenseSubmitted(auditActor, reviewId, attempt, updated.professionalRevision, reason));
        const after = await this.statusService.read(updated);
        await recordStatusTransition(this.auditTrail, actor, locked.id, before.status, after.status, 'license_resubmitted');
        return { reviewId, attempt, reason, status: after.status };
      });
    } catch (error) {
      if (uploaded) await compensate(this.storage, this.logger, [key]);
      if (error instanceof UniqueConstraintViolationError && error.detail.constraint === 'doctor_profile_license_number_unique') {
        // D-17 / P2: genérico; la causa solo en un log sin datos.
        this.logger.warn('registration_conflict field=license_number');
        throw new RegistrationDataConflictError('license_number');
      }
      throw error;
    }
  }
}
