import { DrizzleAuditTrail } from './drizzle-audit-trail';
import { transactionStorage } from '../../../db/transaction-context';
import { auditLog } from '../../../db/schema';
import { AuditEvent } from '../domain/audit-event';
import { AuditActor } from '../domain/audit-actor';
import { AuditOutsideTransactionError } from '../domain/audit.errors';
import { BusinessRuleViolationError } from '../../../common/domain/persistence.errors';

// Pruebas sin base de datos: una transacción falsa captura lo que el adaptador inserta.
// El comportamiento real contra PostgreSQL está en test/integration/audit-trail.int-spec.ts.

const PROFILE_ID = '2f1d6c1e-8a4b-4c3d-9e2f-1a2b3c4d5e6f';
const ENTITY_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function fakeTransaction(insertResult: Promise<unknown> = Promise.resolve()) {
  const values = jest.fn().mockReturnValue(insertResult);
  const insert = jest.fn().mockReturnValue({ values });
  return { tx: { insert }, insert, values };
}

const userEvent = AuditEvent.create({
  actor: AuditActor.fromActor({
    userId: 'user-admin',
    userProfileId: PROFILE_ID,
    role: 'admin',
    ipAddress: '203.0.113.9',
    userAgent: 'PEI-Web/1.0',
  }),
  action: 'identity.doctor.approved',
  entity: { type: 'doctor_profile', id: ENTITY_ID },
  metadata: { reason: 'Cédula verificada' },
});

describe('DrizzleAuditTrail (sin BD)', () => {
  const auditTrail = new DrizzleAuditTrail();

  it('[TC-M01-010][RT-M01-01] fuera de una UnitOfWork → AuditOutsideTransactionError', async () => {
    await expect(auditTrail.record(userEvent)).rejects.toBeInstanceOf(AuditOutsideTransactionError);
  });

  it('[TC-M01-011][RF-52][RN-121] inserta en audit_log el actor usuario con IP y user-agent, sin created_at', async () => {
    const { tx, insert, values } = fakeTransaction();

    await transactionStorage.run(tx as any, () => auditTrail.record(userEvent));

    expect(insert).toHaveBeenCalledWith(auditLog);
    const row = values.mock.calls[0][0];
    expect(row).toEqual({
      actorType: 'user',
      actorUserId: 'user-admin',
      actorUserProfileId: PROFILE_ID,
      action: 'identity.doctor.approved',
      entityType: 'doctor_profile',
      entityId: ENTITY_ID,
      metadata: { reason: 'Cédula verificada' },
      ipAddress: '203.0.113.9',
      userAgent: 'PEI-Web/1.0',
    });
    expect(row).not.toHaveProperty('createdAt');
  });

  it('[TC-M01-011][RN-120] actor sistema → sin usuario, perfil, IP ni user-agent', async () => {
    const { tx, values } = fakeTransaction();
    const event = AuditEvent.create({ actor: AuditActor.system('scheduler.reminders'), action: 'notifications.reminder.sent' });

    await transactionStorage.run(tx as any, () => auditTrail.record(event));

    expect(values.mock.calls[0][0]).toEqual({
      actorType: 'system',
      actorUserId: null,
      actorUserProfileId: null,
      action: 'notifications.reminder.sent',
      entityType: null,
      entityId: null,
      metadata: { systemProcess: 'scheduler.reminders' },
      ipAddress: null,
      userAgent: null,
    });
  });

  it('[TC-M01-013][RT-M01-01] un error de PostgreSQL al insertar se traduce a error de dominio', async () => {
    const pgError = Object.assign(new Error('trigger'), { code: 'P0001', severity: 'ERROR', message: 'regla' });
    const { tx } = fakeTransaction(Promise.reject(Object.assign(new Error('Failed query'), { cause: pgError })));

    await expect(transactionStorage.run(tx as any, () => auditTrail.record(userEvent))).rejects.toBeInstanceOf(
      BusinessRuleViolationError,
    );
  });
});
