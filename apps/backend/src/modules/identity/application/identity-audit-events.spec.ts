import { AuditActor } from '../../audit/domain/audit-actor';
import { IDENTITY_AUDIT_ACTIONS, IdentityAuditEvents } from './identity-audit-events';

const actor = AuditActor.fromActor({
  userId: 'user-1',
  userProfileId: '11111111-1111-4111-8111-111111111111',
  role: 'admin',
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
});
const ID = '22222222-2222-4222-8222-222222222222';

describe('Eventos de auditoría de Identity (DT-14, RN-122)', () => {
  it('[TC-M02-050][DT-14] acciones, entidad y metadata mínima de cada evento', () => {
    const events = [
      [IdentityAuditEvents.profileCreated(actor, ID), IDENTITY_AUDIT_ACTIONS.profileCreated, 'patient_profile', null],
      [IdentityAuditEvents.profileUpdated(actor, ID, ['phone', 'address']), IDENTITY_AUDIT_ACTIONS.profileUpdated, 'patient_profile', { fields: ['address', 'phone'] }],
      [IdentityAuditEvents.verificationSubmitted(actor, ID, 2), IDENTITY_AUDIT_ACTIONS.verificationSubmitted, 'patient_identity_verification', { attempt: 2 }],
      [IdentityAuditEvents.verificationReviewed(actor, ID, 'approved', 2), IDENTITY_AUDIT_ACTIONS.verificationApproved, 'patient_identity_verification', { attempt: 2 }],
      [IdentityAuditEvents.verificationReviewed(actor, ID, 'rejected', 1), IDENTITY_AUDIT_ACTIONS.verificationRejected, 'patient_identity_verification', { attempt: 1 }],
      [IdentityAuditEvents.documentViewed(actor, ID, 'back'), IDENTITY_AUDIT_ACTIONS.documentViewed, 'patient_identity_verification', { side: 'back' }],
    ] as const;
    for (const [event, action, entityType, metadata] of events) {
      expect(event).toMatchObject({ action, entityType, entityId: ID, metadata });
    }
  });

  it('[TC-M02-051][DT-12] admin.bootstrapped con actor sistema y su proceso', () => {
    const event = IdentityAuditEvents.adminBootstrapped(AuditActor.system('cli.admin-bootstrap'), ID);
    expect(event).toMatchObject({
      action: 'identity.admin.bootstrapped',
      entityType: 'user_profile',
      entityId: ID,
      metadata: { systemProcess: 'cli.admin-bootstrap' },
    });
    expect(event.actor.type).toBe('system');
  });

  it('[TC-M02-052][DT-14] las acciones son exactamente las aprobadas: no existe "resubmitted"', () => {
    expect(Object.values(IDENTITY_AUDIT_ACTIONS).sort()).toEqual([
      'identity.admin.bootstrapped',
      'identity.identity_document.viewed',
      'identity.identity_verification.approved',
      'identity.identity_verification.rejected',
      'identity.identity_verification.submitted',
      'identity.patient_profile.created',
      'identity.patient_profile.updated',
    ]);
  });

  it('[TC-M02-053][RN-122] la metadata no contiene datos personales, claves de objetos ni URLs', () => {
    const all = [
      IdentityAuditEvents.profileCreated(actor, ID),
      IdentityAuditEvents.profileUpdated(actor, ID, ['phone', 'photo']),
      IdentityAuditEvents.verificationSubmitted(actor, ID, 1),
      IdentityAuditEvents.verificationReviewed(actor, ID, 'rejected', 1),
      IdentityAuditEvents.documentViewed(actor, ID, 'front'),
    ];
    for (const event of all) {
      const serialized = JSON.stringify(event.metadata ?? {});
      expect(serialized).not.toMatch(/curp|http|identity\/|profile-photos\/|@|reason|name/i);
    }
  });
});
