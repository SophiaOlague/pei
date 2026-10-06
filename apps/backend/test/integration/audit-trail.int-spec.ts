import { randomUUID } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { getDbContext } from '../../src/db/transaction-context';
import { auditLog, medication } from '../../src/db/schema';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import { DrizzleAuditTrail } from '../../src/modules/audit/infrastructure/drizzle-audit-trail';
import { AuditEvent } from '../../src/modules/audit/domain/audit-event';
import { AuditActor } from '../../src/modules/audit/domain/audit-actor';
import { AuditOutsideTransactionError } from '../../src/modules/audit/domain/audit.errors';
import {
  BusinessRuleViolationError,
  IntegrityConstraintViolationError,
} from '../../src/common/domain/persistence.errors';
import { translatePostgresError } from '../../src/common/infrastructure/postgres-error-translator';
import { captureError, deferred, RollbackSignal, testTag, withRollback, type Tx } from '../support/with-rollback';
import { insertUserWithProfile } from '../support/fixtures';
import { countM00Residue } from '../support/residue';

// Requiere las migraciones 0002_audit_log_actor y 0003_audit_log_guards.
// Todas las escrituras ocurren dentro de transacciones que terminan en ROLLBACK.

// Acción de auditoría única por prueba, para leer solo las filas propias.
const testAction = () => `test.audit_probe.${testTag().replace(/-/g, '_').replace(/^gst_m00_test_/, 'r')}`;

async function userActorFor(tx: Tx, ip = '203.0.113.9', ua = 'PEI-Test/1.0') {
  const { user, profile } = await insertUserWithProfile(tx, 'admin');
  return {
    user,
    profile,
    actor: AuditActor.fromActor({ userId: user.id, userProfileId: profile.id, role: 'admin', ipAddress: ip, userAgent: ua }),
  };
}

const rowsFor = (action: string) => getDbContext().select().from(auditLog).where(eq(auditLog.action, action));

describe('AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback)', () => {
  const unitOfWork = new DrizzleUnitOfWork();
  const auditTrail = new DrizzleAuditTrail();
  let residueBefore: Record<string, number>;
  let auditRowsBefore: number;

  const countAuditRows = async () =>
    Number((await db.execute<{ n: string }>(sql`select count(*) as n from audit_log`)).rows[0].n);

  beforeAll(async () => {
    residueBefore = await countM00Residue();
    auditRowsBefore = await countAuditRows();
  });

  afterAll(async () => {
    expect(await countM00Residue()).toEqual(residueBefore);
    expect(await countAuditRows()).toBe(auditRowsBefore);
    await db.$client.end();
  });

  describe('registro dentro de la UnitOfWork', () => {
    it('[TC-M01-100][RF-52][RN-120][RN-121] guarda actor, perfil, IP, user-agent, acción, entidad y metadata', async () => {
      await withRollback(async (tx) => {
        const { user, profile, actor } = await userActorFor(tx);
        const action = testAction();
        const entityId = randomUUID();

        await unitOfWork.runInTransaction(() =>
          auditTrail.record(
            AuditEvent.create({
              actor,
              action,
              entity: { type: 'doctor_profile', id: entityId },
              metadata: { reason: 'Cédula verificada', previous: 'pending' },
              correlationId: 'req-1',
            }),
          ),
        );

        const [row] = await rowsFor(action);
        expect(row).toMatchObject({
          actorType: 'user',
          actorUserId: user.id,
          actorUserProfileId: profile.id,
          action,
          entityType: 'doctor_profile',
          entityId,
          metadata: { reason: 'Cédula verificada', previous: 'pending', correlationId: 'req-1' },
          ipAddress: '203.0.113.9',
          userAgent: 'PEI-Test/1.0',
        });
      });
    });

    it('[TC-M01-105][RF-52][RN-120] actor sistema y metadata JSON anidada se guardan y se leen igual', async () => {
      await withRollback(async () => {
        const action = testAction();
        const metadata = { expired: 3, holds: [{ minutes: 5 }, null], ok: true };

        await unitOfWork.runInTransaction(() =>
          auditTrail.record(AuditEvent.create({ actor: AuditActor.system('scheduler.expire-payment-holds'), action, metadata })),
        );

        const [row] = await rowsFor(action);
        expect(row).toMatchObject({
          actorType: 'system',
          actorUserId: null,
          actorUserProfileId: null,
          ipAddress: null,
          userAgent: null,
          metadata: { ...metadata, systemProcess: 'scheduler.expire-payment-holds' },
        });
      });
    });

    it('[TC-M01-114][RN-120] usuario autenticado sin user_profile queda identificado por actor_user_id', async () => {
      await withRollback(async (tx) => {
        const { user } = await insertUserWithProfile(tx, 'patient');
        const action = testAction();

        await unitOfWork.runInTransaction(() =>
          auditTrail.record(
            AuditEvent.create({
              actor: AuditActor.fromActor({ userId: user.id, userProfileId: null, role: null, ipAddress: null, userAgent: null }),
              action,
            }),
          ),
        );

        expect((await rowsFor(action))[0]).toMatchObject({ actorType: 'user', actorUserId: user.id, actorUserProfileId: null });
      });
    });
  });

  describe('modelo transaccional (D1, D6)', () => {
    it('[TC-M01-101][RT-M01-01] error después de auditar: se revierten la operación y el evento', async () => {
      await withRollback(async (tx) => {
        const { actor } = await userActorFor(tx);
        const action = testAction();
        const name = testTag();

        const error = await captureError(
          unitOfWork.runInTransaction(async () => {
            await getDbContext().insert(medication).values({ name });
            await auditTrail.record(AuditEvent.create({ actor, action }));
            throw new Error('falla posterior del caso de uso');
          }),
        );

        expect((error as Error).message).toBe('falla posterior del caso de uso');
        expect(await rowsFor(action)).toHaveLength(0);
        expect(await getDbContext().select().from(medication).where(eq(medication.name, name))).toHaveLength(0);
      });
    });

    it('[TC-M01-102][RT-M01-01][RN-120] si la auditoría falla, la operación se revierte (perfil de otro usuario)', async () => {
      await withRollback(async (tx) => {
        const owner = await insertUserWithProfile(tx, 'doctor');
        const other = await insertUserWithProfile(tx, 'admin');
        const action = testAction();
        const name = testTag();
        const mismatched = AuditActor.fromActor({
          userId: other.user.id,
          userProfileId: owner.profile.id,
          role: 'admin',
          ipAddress: null,
          userAgent: null,
        });

        const error = await captureError(
          unitOfWork.runInTransaction(async () => {
            await getDbContext().insert(medication).values({ name });
            await auditTrail.record(AuditEvent.create({ actor: mismatched, action }));
          }),
        );

        expect(error).toBeInstanceOf(BusinessRuleViolationError);
        expect((error as Error).message).toContain('no pertenece al usuario actor');
        expect(await getDbContext().select().from(medication).where(eq(medication.name, name))).toHaveLength(0);
      });
    });

    it('[TC-M01-103][RT-M01-01] fuera de una UnitOfWork falla sin escribir', async () => {
      const event = AuditEvent.create({ actor: AuditActor.system('scheduler.test'), action: testAction() });
      await expect(auditTrail.record(event)).rejects.toBeInstanceOf(AuditOutsideTransactionError);
    });

    it('[TC-M01-104][RT-M01-01] UoW anidada que falla: solo se revierte su evento; la externa conserva el suyo', async () => {
      await withRollback(async (tx) => {
        const { actor } = await userActorFor(tx);
        const [outerAction, innerAction] = [testAction(), testAction()];

        await unitOfWork.runInTransaction(async () => {
          await auditTrail.record(AuditEvent.create({ actor, action: outerAction }));
          await captureError(
            unitOfWork.runInTransaction(async () => {
              await auditTrail.record(AuditEvent.create({ actor, action: innerAction }));
              throw new Error('falla interna');
            }),
          );
        });

        expect(await rowsFor(outerAction)).toHaveLength(1);
        expect(await rowsFor(innerAction)).toHaveLength(0);
      });
    });
  });

  describe('protecciones de la BD (migración 0003)', () => {
    it('[TC-M01-106][RN-119][RNF-08] TRUNCATE audit_log → BusinessRuleViolationError', async () => {
      // Precondición de seguridad: sin el trigger no se intenta el TRUNCATE.
      const { rows } = await db.execute<{ n: string }>(
        sql`select count(*) as n from pg_trigger where tgrelid = 'public.audit_log'::regclass and tgname = 'audit_log_no_truncate'`,
      );
      expect(Number(rows[0].n)).toBe(1);

      await withRollback(async () => {
        const error = await captureError(unitOfWork.runInTransaction(() => getDbContext().execute(sql`truncate audit_log`)));
        expect(error).toBeInstanceOf(BusinessRuleViolationError);
        expect((error as Error).message).toBe('La tabla audit_log es de solo inserción: no admite TRUNCATE');
      });
    });

    it('[TC-M01-107][RN-120] CHECK de actor y entidad: combinaciones inválidas → IntegrityConstraintViolationError', async () => {
      await withRollback(async (tx) => {
        const { user, profile } = await insertUserWithProfile(tx, 'admin');
        const invalidRows = {
          'actor user sin actor_user_id': { actorType: 'user' as const, action: testAction() },
          'actor system con actor_user_id': { actorType: 'system' as const, actorUserId: user.id, action: testAction() },
          'actor system con perfil': {
            actorType: 'system' as const,
            actorUserId: user.id,
            actorUserProfileId: profile.id,
            action: testAction(),
          },
          'entity_id sin entity_type': { actorType: 'system' as const, entityId: randomUUID(), action: testAction() },
        };

        for (const [label, row] of Object.entries(invalidRows)) {
          const error = await captureError(unitOfWork.runInTransaction(() => tx.insert(auditLog).values(row)));
          expect({ label, error }).toEqual({ label, error: expect.any(IntegrityConstraintViolationError) });
          expect((error as IntegrityConstraintViolationError).detail.code).toBe('23514');
        }
      });
    });

    it('[TC-M01-108][RT-M01-03] created_at lo fija PostgreSQL (now() de la transacción); el valor de la app se ignora', async () => {
      await withRollback(async (tx) => {
        const action = testAction();
        await tx.insert(auditLog).values({ actorType: 'system', action, createdAt: new Date('2000-01-01T00:00:00Z') });

        const { rows } = await tx.execute<{ same: boolean }>(
          sql`select created_at = now() as same from audit_log where action = ${action}`,
        );
        expect(rows[0].same).toBe(true);
      });
    });

    it('[TC-M01-109][RN-120] perfil que no pertenece al usuario actor → BusinessRuleViolationError (inserción directa)', async () => {
      await withRollback(async (tx) => {
        const owner = await insertUserWithProfile(tx, 'doctor');
        const other = await insertUserWithProfile(tx, 'admin');

        const error = await captureError(
          unitOfWork.runInTransaction(() =>
            tx.insert(auditLog).values({
              actorType: 'user',
              actorUserId: other.user.id,
              actorUserProfileId: owner.profile.id,
              action: testAction(),
            }),
          ),
        );
        expect(error).toBeInstanceOf(BusinessRuleViolationError);
      });
    });
  });

  describe('concurrencia', () => {
    it('[TC-M01-110][RT-M01-02] dos conexiones auditan a la vez sin esperarse; ambas terminan en ROLLBACK', async () => {
      const [actionA, actionB] = [testAction(), testAction()];
      const bothInserted = [deferred(), deferred()];
      const release = deferred();

      const run = (action: string, inserted: { resolve: () => void }) =>
        captureError(
          db.transaction(async (tx) => {
            await tx.execute(sql`set local lock_timeout = '2s'`);
            await tx.insert(auditLog).values({ actorType: 'system', action });
            inserted.resolve();
            await release.promise;
            throw new RollbackSignal();
          }),
        );

      const outcomes = [run(actionA, bothInserted[0]), run(actionB, bothInserted[1])];
      try {
        // Ambas insertan mientras la otra sigue abierta: si una esperara un lock, fallaría por lock_timeout.
        await Promise.race([
          Promise.all(bothInserted.map((d) => d.promise)),
          Promise.all(outcomes).then((errors) => {
            throw new Error(`Una conexión terminó antes de insertar: ${errors.map(String).join(' | ')}`);
          }),
        ]);
      } finally {
        release.resolve();
      }
      const [errorA, errorB] = await Promise.all(outcomes);
      expect(errorA).toBeInstanceOf(RollbackSignal);
      expect(errorB).toBeInstanceOf(RollbackSignal);
      expect(translatePostgresError(errorA)).toBeNull();
    });
  });
});
