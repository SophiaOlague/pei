import { AuditEvent } from '../../audit/domain/audit-event';
import type { AuditActor } from '../../audit/domain/audit-actor';

// Eventos de auditoría de M03 (D-10; plan v2 §11). Se registran con AuditTrail dentro de la UnitOfWork del caso de uso.
// La metadata es mínima: nunca CURP, nombres, números de cédula, claves de objetos ni URLs.

export const DOCTOR_AUDIT_ACTIONS = {
  profileCreated: 'doctor.profile.created',
  registrationCompleted: 'doctor.registration.completed',
  identitySubmitted: 'doctor.identity_verification.submitted',
  identitySuperseded: 'doctor.identity_verification.superseded',
  licenseSubmitted: 'doctor.license_verification.submitted',
  licenseSuperseded: 'doctor.license_verification.superseded',
  licenseNumberChanged: 'doctor.license_number.changed',
  specialtyChanged: 'doctor.specialty.changed',
  returnedToPending: 'doctor.status.returned_to_pending',
  identityApproved: 'doctor.identity_verification.approved',
  identityRejected: 'doctor.identity_verification.rejected',
  licenseApproved: 'doctor.license_verification.approved',
  licenseRejected: 'doctor.license_verification.rejected',
  identityDocumentViewed: 'doctor.identity_document.viewed',
  licenseDocumentViewed: 'doctor.license_document.viewed',
  specialtyCreated: 'catalog.specialty.created',
  specialtyUpdated: 'catalog.specialty.updated',
  specialtyDeactivated: 'catalog.specialty.deactivated',
  specialtyActivated: 'catalog.specialty.activated',
} as const;

export type SpecialtyEditableField = 'name';

const specialtyEntity = (id: string) => ({ type: 'specialty', id });
const doctorEntity = (id: string) => ({ type: 'doctor_profile', id });

// Por qué una revisión pendiente pasó a superseded, o por qué el médico volvió a pending (diseño v3 §I).
export type DoctorChangeCause = 'specialty_changed' | 'identity_resubmitted' | 'license_resubmitted';
export interface Revisions {
  identityRevision: number;
  professionalRevision: number;
}

export const DoctorAuditEvents = {
  profileCreated: (actor: AuditActor, doctorProfileId: string) =>
    AuditEvent.create({ actor, action: DOCTOR_AUDIT_ACTIONS.profileCreated, entity: doctorEntity(doctorProfileId) }),

  // Cuando registrationComplete pasa de false a true (D-24).
  registrationCompleted: (actor: AuditActor, doctorProfileId: string) =>
    AuditEvent.create({ actor, action: DOCTOR_AUDIT_ACTIONS.registrationCompleted, entity: doctorEntity(doctorProfileId) }),

  // attempt > 1 indica reenvío; la versión liga la INE nueva con el cambio que la originó (7ter.4).
  identitySubmitted: (actor: AuditActor, reviewId: string, attempt: number, identityRevision: number) =>
    AuditEvent.create({
      actor, action: DOCTOR_AUDIT_ACTIONS.identitySubmitted, entity: { type: 'doctor_identity_verification', id: reviewId },
      metadata: { attempt, identityRevision },
    }),

  identitySuperseded: (actor: AuditActor, reviewId: string, attempt: number, cause: DoctorChangeCause) =>
    AuditEvent.create({
      actor, action: DOCTOR_AUDIT_ACTIONS.identitySuperseded, entity: { type: 'doctor_identity_verification', id: reviewId },
      metadata: { attempt, cause },
    }),

  licenseSubmitted: (actor: AuditActor, reviewId: string, attempt: number, professionalRevision: number, reason: string) =>
    AuditEvent.create({
      actor, action: DOCTOR_AUDIT_ACTIONS.licenseSubmitted, entity: { type: 'doctor_license_verification', id: reviewId },
      metadata: { attempt, professionalRevision, reason },
    }),

  licenseSuperseded: (actor: AuditActor, reviewId: string, attempt: number, cause: DoctorChangeCause) =>
    AuditEvent.create({
      actor, action: DOCTOR_AUDIT_ACTIONS.licenseSuperseded, entity: { type: 'doctor_license_verification', id: reviewId },
      metadata: { attempt, cause },
    }),

  licenseNumberChanged: (actor: AuditActor, doctorProfileId: string, revisions: Revisions) =>
    AuditEvent.create({ actor, action: DOCTOR_AUDIT_ACTIONS.licenseNumberChanged, entity: doctorEntity(doctorProfileId), metadata: { ...revisions } }),

  specialtyChanged: (actor: AuditActor, doctorProfileId: string, fromSpecialtyId: string, toSpecialtyId: string) =>
    AuditEvent.create({ actor, action: DOCTOR_AUDIT_ACTIONS.specialtyChanged, entity: doctorEntity(doctorProfileId), metadata: { fromSpecialtyId, toSpecialtyId } }),

  // Solo si el estado anterior era approved o rejected y el nuevo es pending.
  returnedToPending: (actor: AuditActor, doctorProfileId: string, from: 'approved' | 'rejected', cause: DoctorChangeCause) =>
    AuditEvent.create({ actor, action: DOCTOR_AUDIT_ACTIONS.returnedToPending, entity: doctorEntity(doctorProfileId), metadata: { from, cause } }),

  // B6: el motivo de un rechazo queda en la tabla, no en la auditoría.
  reviewed: (actor: AuditActor, line: 'identity' | 'license', reviewId: string, status: 'approved' | 'rejected', attempt: number) =>
    AuditEvent.create({
      actor,
      action: line === 'identity'
        ? (status === 'approved' ? DOCTOR_AUDIT_ACTIONS.identityApproved : DOCTOR_AUDIT_ACTIONS.identityRejected)
        : (status === 'approved' ? DOCTOR_AUDIT_ACTIONS.licenseApproved : DOCTOR_AUDIT_ACTIONS.licenseRejected),
      entity: { type: line === 'identity' ? 'doctor_identity_verification' : 'doctor_license_verification', id: reviewId },
      metadata: { attempt },
    }),

  // D-16, D-22, RNF-08: cada lectura de un documento por el admin genera un evento (un evento por lado de la INE).
  identityDocumentViewed: (actor: AuditActor, reviewId: string, side: 'front' | 'back') =>
    AuditEvent.create({ actor, action: DOCTOR_AUDIT_ACTIONS.identityDocumentViewed, entity: { type: 'doctor_identity_verification', id: reviewId }, metadata: { side } }),

  licenseDocumentViewed: (actor: AuditActor, reviewId: string) =>
    AuditEvent.create({ actor, action: DOCTOR_AUDIT_ACTIONS.licenseDocumentViewed, entity: { type: 'doctor_license_verification', id: reviewId } }),

  // El catálogo no tiene datos personales; el code identifica la especialidad en la historia.
  specialtyCreated: (actor: AuditActor, specialtyId: string, code: string) =>
    AuditEvent.create({
      actor,
      action: DOCTOR_AUDIT_ACTIONS.specialtyCreated,
      entity: specialtyEntity(specialtyId),
      metadata: { code },
    }),

  // Solo los nombres de los campos (diseño v3 §I).
  specialtyUpdated: (actor: AuditActor, specialtyId: string, fields: SpecialtyEditableField[]) =>
    AuditEvent.create({
      actor,
      action: DOCTOR_AUDIT_ACTIONS.specialtyUpdated,
      entity: specialtyEntity(specialtyId),
      metadata: { fields: [...fields].sort() },
    }),

  // Z-2: el historial de activaciones vive en audit_log.
  specialtyActivationChanged: (actor: AuditActor, specialtyId: string, active: boolean) =>
    AuditEvent.create({
      actor,
      action: active ? DOCTOR_AUDIT_ACTIONS.specialtyActivated : DOCTOR_AUDIT_ACTIONS.specialtyDeactivated,
      entity: specialtyEntity(specialtyId),
    }),
};
