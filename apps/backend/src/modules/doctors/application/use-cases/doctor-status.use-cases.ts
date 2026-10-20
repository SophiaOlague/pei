import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { contentTypeForObjectKey } from '../../../private-storage/domain/object-key';
import { PRIVATE_OBJECT_STORAGE, type PrivateObjectStorage, type StoredObject } from '../../../private-storage/application/ports/private-object-storage';
import { currentReview, type DoctorStatus } from '../../domain/doctor-status';
import { LicenseDocumentUnavailableError } from '../../domain/doctor.errors';
import type { ReviewStatus } from '../../domain/review';
import type { LicenseReviewReason } from '../../domain/sensitive-change';
import { DOCTOR_PROFILE_REPOSITORY, type DoctorProfileRepository } from '../ports/doctor-profile.repository';
import { DoctorStatusService } from '../doctor-status.service';
import { loadDoctorProfile } from './doctor-profile.use-cases';

export interface DoctorStatusView extends DoctorStatus {
  // D-25: el médico ve el motivo de un rechazo vigente para poder corregirlo.
  identityRejectionReason: string | null;
  licenseRejectionReason: string | null;
}

// D-13, D-23, R-7: el médico consulta su estado derivado (también si no está approved).
@Injectable()
export class GetDoctorStatusUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    private readonly statusService: DoctorStatusService,
  ) {}

  async execute(actor: Actor): Promise<DoctorStatusView> {
    const profile = await loadDoctorProfile(actor, this.profiles);
    const { status, identityReviews, licenseReviews } = await this.statusService.read(profile);
    const identity = currentReview(identityReviews, profile.identityRevision);
    const license = currentReview(licenseReviews, profile.professionalRevision);
    return {
      ...status,
      identityRejectionReason: identity?.status === 'rejected' ? identity.rejectionReason : null,
      licenseRejectionReason: license?.status === 'rejected' ? license.rejectionReason : null,
    };
  }
}

export interface VerificationHistoryItem {
  attempt: number;
  revision: number;
  status: ReviewStatus;
  submittedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
}

// D-4: historial de envíos y revisiones de ambas líneas. Sin claves de objetos, URLs ni el número de otra persona.
@Injectable()
export class GetDoctorVerificationHistoryUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    private readonly statusService: DoctorStatusService,
  ) {}

  async execute(actor: Actor): Promise<{ identity: VerificationHistoryItem[]; license: (VerificationHistoryItem & { reason: LicenseReviewReason })[] }> {
    const profile = await loadDoctorProfile(actor, this.profiles);
    const { identityReviews, licenseReviews } = await this.statusService.read(profile);
    const item = (r: { attempt: number; revision: number; status: ReviewStatus; createdAt: Date; reviewedAt: Date | null; rejectionReason: string | null }) => ({
      attempt: r.attempt, revision: r.revision, status: r.status, submittedAt: r.createdAt, reviewedAt: r.reviewedAt, rejectionReason: r.rejectionReason,
    });
    return {
      identity: identityReviews.map(item),
      license: licenseReviews.map((r) => ({ ...item(r), reason: r.reason })),
    };
  }
}

// D-16, D-22: el médico dueño ve su cédula (la del último envío). Transmitida por el backend; no se audita (diseño v3 §I).
@Injectable()
export class OpenOwnLicenseDocumentUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    private readonly statusService: DoctorStatusService,
  ) {}

  async execute(actor: Actor): Promise<StoredObject & { contentType: string }> {
    const profile = await loadDoctorProfile(actor, this.profiles);
    const { licenseReviews } = await this.statusService.read(profile);
    const latest = licenseReviews.reduce<(typeof licenseReviews)[number] | null>((a, b) => (!a || b.attempt > a.attempt ? b : a), null);
    if (!latest) throw new LicenseDocumentUnavailableError();
    const file = await this.storage.openForRead(latest.documentObjectKey);
    return { ...file, contentType: contentTypeForObjectKey(latest.documentObjectKey) };
  }
}
