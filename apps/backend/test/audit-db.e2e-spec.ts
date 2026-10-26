import { INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import type { IncomingHttpHeaders } from 'http';
import { db } from '../src/db';
import { auditLog, user, userProfile } from '../src/db/schema';
import { transactionStorage } from '../src/db/transaction-context';
import { AuthModule } from '../src/auth/auth.module';
import { SESSION_PROVIDER, type AuthSession, type SessionProvider } from '../src/auth/ports/session-provider';
import { ACTOR_PROFILE_READER } from '../src/auth/ports/actor-profile-reader';
import { UNIT_OF_WORK, type UnitOfWork } from '../src/common/application/ports/unit-of-work';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { AuditModule } from '../src/modules/audit/audit.module';
import { ApproveProbeUseCase, AuditProbeController, PROBE_ACTION } from './support/audit-probe';
import { RollbackSignal, TEST_EMAIL_DOMAIN, testTag } from './support/with-rollback';
import { assertC2BranchTarget } from './support/c2-target-guard';

// Salvaguarda de destino: solo contra la rama temporal mediante C2. Ejecutado de otra forma, src/db usaría el
// DATABASE_URL del .env (rama `production`): falla al cargar el módulo, antes de cualquier consulta.
assertC2BranchTarget();

// E2E con PostgreSQL real y el DrizzleAuditTrail real, SIN commits: la UnitOfWork de esta prueba
// crea el usuario de prueba, ejecuta el caso de uso, lee la fila de audit_log y hace ROLLBACK.
// Requiere las migraciones 0002_audit_log_actor y 0003_audit_log_guards.

const TEST_USER_ID = testTag();
const TEST_PROFILE_ID = randomUUID();
const ENTITY_ID = randomUUID();

type AuditRow = typeof auditLog.$inferSelect & { createdAtIsTransactionNow: boolean };

@Injectable()
class RollbackOnlyUnitOfWork implements UnitOfWork {
  captured: AuditRow[] = [];

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    let result!: T;
    try {
      await db.transaction(async (tx) => {
        await tx.insert(user).values({ id: TEST_USER_ID, name: 'Usuario E2E M01', email: `${TEST_USER_ID}@${TEST_EMAIL_DOMAIN}` });
        await tx.insert(userProfile).values({ id: TEST_PROFILE_ID, userId: TEST_USER_ID, role: 'admin', firstName: 'E2E', lastName: 'M01' });

        result = await transactionStorage.run(tx as any, work);

        const rows = await tx.select().from(auditLog).where(eq(auditLog.action, PROBE_ACTION));
        const { rows: now } = await tx.execute<{ now: Date }>(sql`select now() as now`);
        this.captured = rows.map((row) => ({ ...row, createdAtIsTransactionNow: row.createdAt.getTime() === new Date(now[0].now).getTime() }));
        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
    return result;
  }
}

class FixedSessionProvider implements SessionProvider {
  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    if (headers['x-test-session'] !== 'admin') return null;
    return {
      user: { id: TEST_USER_ID, email: 'e2e@test', name: 'E2E', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      session: { id: 'session-e2e', expiresAt: new Date(Date.now() + 3_600_000) },
    };
  }
}

describe('Auditoría desde HTTP con PostgreSQL real y rollback (E2E)', () => {
  let app: INestApplication;
  const unitOfWork = new RollbackOnlyUnitOfWork();
  const countRows = async (where: ReturnType<typeof sql>) =>
    Number((await db.execute<{ n: string }>(sql`select count(*) as n from ${where}`)).rows[0].n);
  let auditBefore: number;

  beforeAll(async () => {
    auditBefore = await countRows(sql`audit_log`);
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, AuditModule],
      controllers: [AuditProbeController],
      providers: [ApproveProbeUseCase, { provide: UNIT_OF_WORK, useValue: unitOfWork }],
    })
      .overrideProvider(SESSION_PROVIDER)
      .useClass(FixedSessionProvider)
      .overrideProvider(ACTOR_PROFILE_READER)
      .useValue({ findByUserId: async () => ({ userProfileId: TEST_PROFILE_ID, role: 'admin' }) })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    expect(await countRows(sql`audit_log`)).toBe(auditBefore);
    expect(Number((await db.execute<{ n: string }>(sql`select count(*) as n from "user" where id = ${TEST_USER_ID}`)).rows[0].n)).toBe(0);
    await db.$client.end();
  });

  it('[TC-M01-204][RF-52][RN-120][RN-121][RT-M01-03] la fila real de audit_log tiene el actor, IP y user-agent del request y created_at de la BD', async () => {
    const res = await request(app.getHttpServer())
      .post(`/audit-probe/${ENTITY_ID}/approve`)
      .set('x-test-session', 'admin')
      .set('User-Agent', 'PEI-Movil/1.0 (Android)');

    expect(res.status).toBe(201);
    expect(unitOfWork.captured).toHaveLength(1);
    expect(unitOfWork.captured[0]).toMatchObject({
      actorType: 'user',
      actorUserId: TEST_USER_ID,
      actorUserProfileId: TEST_PROFILE_ID,
      action: PROBE_ACTION,
      entityType: 'audit_probe',
      entityId: ENTITY_ID,
      metadata: { reason: 'prueba E2E' },
      ipAddress: '127.0.0.1',
      userAgent: 'PEI-Movil/1.0 (Android)',
      createdAtIsTransactionNow: true,
    });
  });
});
