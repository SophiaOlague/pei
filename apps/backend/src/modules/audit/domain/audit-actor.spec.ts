import { AuditActor } from './audit-actor';
import { InvalidAuditEventError } from './audit.errors';
import type { Actor } from '../../../common/application/actor';

const PROFILE_ID = '2f1d6c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f';

const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: 'user-1',
  userProfileId: PROFILE_ID,
  role: 'admin',
  ipAddress: '203.0.113.9',
  userAgent: 'PEI-Web/1.0',
  ...overrides,
});

describe('AuditActor', () => {
  it('[TC-M01-008][RN-120][RN-121] fromActor copia usuario, perfil, IP y user-agent del request', () => {
    expect(AuditActor.fromActor(actor())).toEqual({
      type: 'user',
      userId: 'user-1',
      userProfileId: PROFILE_ID,
      ipAddress: '203.0.113.9',
      userAgent: 'PEI-Web/1.0',
    });
  });

  it('[TC-M01-002][RN-120] usuario autenticado sin user_profile → actor usuario con perfil nulo', () => {
    expect(AuditActor.fromActor(actor({ userProfileId: null, role: null }))).toMatchObject({
      type: 'user',
      userId: 'user-1',
      userProfileId: null,
    });
  });

  it('[TC-M01-003][RN-120] actor sistema con nombre de proceso, sin IP ni user-agent', () => {
    expect(AuditActor.system('scheduler.expire-payment-holds')).toEqual({
      type: 'system',
      process: 'scheduler.expire-payment-holds',
    });
  });

  it.each([
    ['proceso vacío', () => AuditActor.system('')],
    ['proceso en mayúsculas', () => AuditActor.system('Scheduler')],
    ['proceso de más de 100 caracteres', () => AuditActor.system('a'.repeat(101))],
    ['usuario sin userId', () => AuditActor.fromActor(actor({ userId: '' }))],
    ['actor ausente', () => AuditActor.fromActor(undefined as unknown as Actor)],
    ['userProfileId que no es UUID', () => AuditActor.fromActor(actor({ userProfileId: 'profile-1' }))],
  ])('[TC-M01-004][RN-120] %s → InvalidAuditEventError', (_label, build) => {
    expect(build).toThrow(InvalidAuditEventError);
  });

  it('[TC-M01-009] el actor queda congelado', () => {
    const userActor = AuditActor.fromActor(actor());
    expect(Object.isFrozen(userActor)).toBe(true);
    expect(Object.isFrozen(AuditActor.system('scheduler.reminders'))).toBe(true);
  });
});
