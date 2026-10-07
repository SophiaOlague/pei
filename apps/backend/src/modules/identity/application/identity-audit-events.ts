import { AuditEvent } from '../../audit/domain/audit-event';
import type { AuditActor } from '../../audit/domain/audit-actor';
import type { DocumentSide } from '../domain/identity-verification';

// Eventos de auditoría de Identity (DT-14). Se registran con AuditTrail dentro de la UnitOfWork del caso de uso.
// La metadata es mínima: nunca contenido del INE, claves de objetos, URLs, CURP, nombres ni teléfonos (RN-122).
// No existe un evento "resubmitted": un reenvío es un "submitted" con attempt > 1.

export const IDENTITY_AUDIT_ACTIONS = {
  profileCreated: 'identity.patient_profile.created',
  profileUpdated: 'identity.patient_profile.updated',
  verificationSubmitted: 'identity.identity_verification.submitted',
  verificationApproved: 'identity.identity_verification.approved',
  verificationRejected: 'identity.identity_verification.rejected',
  documentViewed: 'identity.identity_document.viewed',
  adminBootstrapped: 'identity.admin.bootstrapped',
} as const;

export type EditableFieldName = 'phone' | 'address' | 'emergencyContactName' | 'emergencyContactPhone' | 'photo';

export const IdentityAuditEvents = {
  profileCreated: (actor: AuditActor, patientProfileId: string) =>
    AuditEvent.create({
      actor,
      action: IDENTITY_AUDIT_ACTIONS.profileCreated,
      entity: { type: 'patient_profile', id: patientProfileId },
    }),

  // Solo los nombres de los campos, nunca sus valores.
  profileUpdated: (actor: AuditActor, patientProfileId: string, fields: EditableFieldName[]) =>
    AuditEvent.create({
      actor,
      action: IDENTITY_AUDIT_ACTIONS.profileUpdated,
      entity: { type: 'patient_profile', id: patientProfileId },
      metadata: { fields: [...fields].sort() },
    }),

  verificationSubmitted: (actor: AuditActor, submissionId: string, attempt: number) =>
    AuditEvent.create({
      actor,
      action: IDENTITY_AUDIT_ACTIONS.verificationSubmitted,
      entity: { type: 'patient_identity_verification', id: submissionId },
      metadata: { attempt },
    }),

  // El motivo de un rechazo queda en la tabla, no en la auditoría.
  verificationReviewed: (actor: AuditActor, submissionId: string, status: 'approved' | 'rejected', attempt: number) =>
    AuditEvent.create({
      actor,
      action: status === 'approved' ? IDENTITY_AUDIT_ACTIONS.verificationApproved : IDENTITY_AUDIT_ACTIONS.verificationRejected,
      entity: { type: 'patient_identity_verification', id: submissionId },
      metadata: { attempt },
    }),

  documentViewed: (actor: AuditActor, submissionId: string, side: DocumentSide) =>
    AuditEvent.create({
      actor,
      action: IDENTITY_AUDIT_ACTIONS.documentViewed,
      entity: { type: 'patient_identity_verification', id: submissionId },
      metadata: { side },
    }),

  // actor sistema: AuditEvent agrega systemProcess a la metadata.
  adminBootstrapped: (actor: AuditActor, adminUserProfileId: string) =>
    AuditEvent.create({
      actor,
      action: IDENTITY_AUDIT_ACTIONS.adminBootstrapped,
      entity: { type: 'user_profile', id: adminUserProfileId },
    }),
};
