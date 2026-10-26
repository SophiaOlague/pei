import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../common/application/actor';
import { AuditActor } from '../../audit/domain/audit-actor';
import type { AuditTrail } from '../../audit/application/ports/audit-trail';
import { isValidCurp } from '../../identity/domain/curp';
import { DOCTOR_IDENTITY_GATEWAY, type DoctorIdentityGateway } from '../../identity/application/ports/doctor-identity.gateway';
import { deriveDoctorStatus, type DoctorStatus } from '../domain/doctor-status';
import { DoctorProfileRequiredError } from '../domain/doctor.errors';
import { DOCTOR_REVIEW_REPOSITORY, type DoctorReviewRepository, type IdentityReviewRecord, type LicenseReviewRecord } from './ports/doctor-review.repository';
import type { DoctorProfileRecord } from './ports/doctor-profile.repository';
import { DoctorAuditEvents, type DoctorChangeCause } from './doctor-audit-events';

export interface DoctorState {
  status: DoctorStatus;
  identityReviews: IdentityReviewRecord[];
  licenseReviews: LicenseReviewRecord[];
}

// Las rutas ya exigen @Roles('doctor'); los casos de uso también fallan cerrado.
export function requireDoctor(actor: Actor): string {
  if (actor.role !== 'doctor' || !actor.userProfileId) throw new DoctorProfileRequiredError();
  return actor.userProfileId;
}

// Arma el snapshot del estado derivado (diseño v3 §D.6) dentro de la transacción de quien llama. No persiste nada.
@Injectable()
export class DoctorStatusService {
  constructor(
    @Inject(DOCTOR_IDENTITY_GATEWAY) private readonly identity: DoctorIdentityGateway,
    @Inject(DOCTOR_REVIEW_REPOSITORY) private readonly reviews: DoctorReviewRepository,
  ) {}

  async read(profile: DoctorProfileRecord): Promise<DoctorState> {
    const [legalIdentity, legalAccepted, identityReviews, licenseReviews] = await Promise.all([
      this.identity.findLegalIdentity(profile.userProfileId),
      this.identity.doctorLegalAccepted(profile.userProfileId),
      this.reviews.listIdentity(profile.id),
      this.reviews.listLicense(profile.id),
    ]);
    const status = deriveDoctorStatus({
      hasDoctorProfile: legalIdentity !== null,
      legalNameComplete: !!legalIdentity?.firstName.trim() && !!legalIdentity?.lastName.trim(),
      curpValid: !!legalIdentity && isValidCurp(legalIdentity.curp),
      specialtyAssigned: !!profile.specialtyId,
      identityRevision: profile.identityRevision,
      professionalRevision: profile.professionalRevision,
      identityReviews: identityReviews.map(({ attempt, revision, status: s }) => ({ attempt, revision, status: s })),
      licenseReviews: licenseReviews.map(({ attempt, revision, status: s }) => ({ attempt, revision, status: s })),
      legalAccepted,
    });
    return { status, identityReviews, licenseReviews };
  }
}

// Eventos que dependen del antes y el después (diseño v3 §I): registro completado y vuelta a pending.
export async function recordStatusTransition(
  auditTrail: AuditTrail,
  actor: Actor,
  doctorProfileId: string,
  before: DoctorStatus,
  after: DoctorStatus,
  cause: DoctorChangeCause,
): Promise<void> {
  const auditActor = AuditActor.fromActor(actor);
  if (!before.registrationComplete && after.registrationComplete) {
    await auditTrail.record(DoctorAuditEvents.registrationCompleted(auditActor, doctorProfileId));
  }
  if ((before.status === 'approved' || before.status === 'rejected') && after.status === 'pending') {
    await auditTrail.record(DoctorAuditEvents.returnedToPending(auditActor, doctorProfileId, before.status, cause));
  }
}
