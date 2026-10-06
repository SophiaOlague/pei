import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { IncomingHttpHeaders } from 'http';
import { AuthModule } from '../src/auth/auth.module';
import { SESSION_PROVIDER, type AuthSession, type SessionProvider } from '../src/auth/ports/session-provider';
import { ACTOR_PROFILE_READER, type ActorProfile, type ActorProfileReader } from '../src/auth/ports/actor-profile-reader';
import { UNIT_OF_WORK, type UnitOfWork } from '../src/common/application/ports/unit-of-work';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { createValidationPipe } from '../src/common/validation/create-validation-pipe';
import { AUDIT_TRAIL, type AuditTrail } from '../src/modules/audit/application/ports/audit-trail';
import type { AuditEvent } from '../src/modules/audit/domain/audit-event';
import { AuditOutsideTransactionError } from '../src/modules/audit/domain/audit.errors';
import { ApproveProbeUseCase, AuditProbeController, PROBE_ACTION } from './support/audit-probe';

// E2E de la cadena HTTP → SessionGuard → RolesGuard → caso de uso → AuditTrail, sin base de datos.
// La UnitOfWork y el AuditTrail son dobles que reproducen el contrato: los eventos solo se
// "confirman" si la unidad termina bien. La escritura real en PostgreSQL está en audit-db.e2e-spec.ts.

const SESSION_HEADER = 'x-test-session';
const ADMIN_PROFILE_ID = '9b2e1f0a-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const PATIENT_PROFILE_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const ENTITY_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

class FakeSessionProvider implements SessionProvider {
  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const userId = headers[SESSION_HEADER];
    if (typeof userId !== 'string') return null;
    return {
      user: { id: userId, email: `${userId}@e2e.test`, name: userId, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      session: { id: `session-${userId}`, expiresAt: new Date(Date.now() + 3_600_000) },
    };
  }
}

const PROFILES: Record<string, ActorProfile> = {
  'user-admin': { userProfileId: ADMIN_PROFILE_ID, role: 'admin' },
  'user-patient': { userProfileId: PATIENT_PROFILE_ID, role: 'patient' },
};

class FakeActorProfileReader implements ActorProfileReader {
  async findByUserId(userId: string) {
    return PROFILES[userId] ?? null;
  }
}

// Doble de UnitOfWork + AuditTrail con semántica de commit/rollback.
class InMemoryAuditStore implements UnitOfWork, AuditTrail {
  committed: AuditEvent[] = [];
  private pending: AuditEvent[] | null = null;

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.pending = [];
    try {
      const result = await work();
      this.committed.push(...this.pending);
      return result;
    } finally {
      this.pending = null; // rollback: lo pendiente se descarta
    }
  }

  async record(event: AuditEvent): Promise<void> {
    if (!this.pending) throw new AuditOutsideTransactionError();
    this.pending.push(event);
  }
}

describe('Auditoría desde una acción HTTP (E2E con dobles, sin BD)', () => {
  let app: INestApplication;
  const store = new InMemoryAuditStore();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [AuditProbeController],
      providers: [
        ApproveProbeUseCase,
        { provide: UNIT_OF_WORK, useValue: store },
        { provide: AUDIT_TRAIL, useValue: store },
      ],
    })
      .overrideProvider(SESSION_PROVIDER)
      .useClass(FakeSessionProvider)
      .overrideProvider(ACTOR_PROFILE_READER)
      .useClass(FakeActorProfileReader)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    store.committed = [];
  });

  const approve = (userId?: string, query = '') => {
    const req = request(app.getHttpServer()).post(`/audit-probe/${ENTITY_ID}/approve${query}`).set('User-Agent', 'PEI-Web/2.0');
    return userId ? req.set(SESSION_HEADER, userId) : req;
  };

  it('[TC-M01-200][RF-52][RN-120][RN-121] acción autenticada → un evento con el actor, perfil, IP y user-agent del request', async () => {
    const res = await approve('user-admin');

    expect(res.status).toBe(201);
    expect(store.committed).toHaveLength(1);
    const [event] = store.committed;
    expect(event.action).toBe(PROBE_ACTION);
    expect(event.entityType).toBe('audit_probe');
    expect(event.entityId).toBe(ENTITY_ID);
    expect(event.actor).toEqual({
      type: 'user',
      userId: 'user-admin',
      userProfileId: ADMIN_PROFILE_ID,
      ipAddress: '127.0.0.1',
      userAgent: 'PEI-Web/2.0',
    });
  });

  it('[TC-M01-201][RNF-01] sin sesión → 401 y ningún evento', async () => {
    expect((await approve()).status).toBe(401);
    expect(store.committed).toHaveLength(0);
  });

  it('[TC-M01-202][RF-02] rol sin permiso → 403 y ningún evento', async () => {
    expect((await approve('user-patient')).status).toBe(403);
    expect(store.committed).toHaveLength(0);
  });

  it('[TC-M01-203][RT-M01-01] el caso de uso falla después de auditar → 422 y el evento no se confirma', async () => {
    const res = await approve('user-admin', '?fail=1');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('ProbeRuleError');
    expect(store.committed).toHaveLength(0);
  });
});
