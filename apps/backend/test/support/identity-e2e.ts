import { Controller, INestApplication, Post, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { IncomingHttpHeaders } from 'http';
import { AuthModule } from '../../src/auth/auth.module';
import { CommonModule } from '../../src/common/common.module';
import { AuditModule } from '../../src/modules/audit/audit.module';
import { IdentityModule } from '../../src/modules/identity/identity.module';
import { PrivateStorageModule } from '../../src/modules/private-storage/private-storage.module';
import { AUTH_INSTANCE } from '../../src/auth/auth.config';
import { SESSION_PROVIDER, type AuthSession, type SessionProvider } from '../../src/auth/ports/session-provider';
import { ACTOR_PROFILE_READER, type ActorProfileReader } from '../../src/auth/ports/actor-profile-reader';
import { SessionGuard } from '../../src/auth/session.guard';
import { RolesGuard } from '../../src/auth/roles.guard';
import { Roles } from '../../src/auth/roles.decorator';
import { CurrentActor } from '../../src/auth/current-actor.decorator';
import type { Actor } from '../../src/common/application/actor';
import { UNIT_OF_WORK } from '../../src/common/application/ports/unit-of-work';
import { AUDIT_TRAIL } from '../../src/modules/audit/application/ports/audit-trail';
import { USER_PROFILE_REPOSITORY } from '../../src/modules/identity/application/ports/user-profile.repository';
import { PATIENT_PROFILE_REPOSITORY } from '../../src/modules/identity/application/ports/patient-profile.repository';
import { IDENTITY_VERIFICATION_REPOSITORY } from '../../src/modules/identity/application/ports/identity-verification.repository';
import { LEGAL_DOCUMENT_REPOSITORY } from '../../src/modules/identity/application/ports/legal-document.repository';
import { REGISTRATION_STATUS_READER } from '../../src/modules/identity/application/ports/registration-status-reader';
import { PRIVATE_OBJECT_STORAGE } from '../../src/modules/private-storage/application/ports/private-object-storage';
import { ADMIN_ACCOUNT_PROVISIONER } from '../../src/modules/identity/application/ports/admin-account-provisioner';
import { CanBookAppointmentsPolicy } from '../../src/modules/identity/application/policies/can-book-appointments';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { createValidationPipe } from '../../src/common/validation/create-validation-pipe';
import {
  FakeAdminAccountProvisioner,
  FakeDocumentStorage,
  InMemoryAuditTrail,
  InMemoryIdentityStore,
  InMemoryUnitOfWork,
} from './identity-in-memory';
import { createMemoryAuth } from './better-auth-memory';

// Aplicación de Identity (controllers, guards, pipes y filtro reales) con sesiones simuladas, repositorios
// en memoria y almacenamiento falso: sin BD, sin R2 y sin Better Auth en la red.

export const SESSION_HEADER = 'x-test-session';

class HeaderSessionProvider implements SessionProvider {
  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const userId = headers[SESSION_HEADER];
    if (typeof userId !== 'string') return null;
    return {
      user: { id: userId, email: `${userId}@e2e.test`, name: userId, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      session: { id: `session-${userId}`, expiresAt: new Date(Date.now() + 3_600_000) },
    };
  }
}

// El perfil y el rol salen del mismo almacén que usan los casos de uso.
class StoreActorProfileReader implements ActorProfileReader {
  constructor(private readonly store: InMemoryIdentityStore) {}
  async findByUserId(userId: string) {
    const profile = await this.store.findByUserId(userId);
    return profile ? { userProfileId: profile.id, role: profile.role } : null;
  }
}

// Caso de uso de agendar SOLO para pruebas: M08 llamará la política de la misma forma (DT-21).
@Controller('test-booking')
@UseGuards(SessionGuard, RolesGuard)
class TestBookingController {
  constructor(private readonly policy: CanBookAppointmentsPolicy) {}

  @Post()
  @Roles('patient')
  async book(@CurrentActor() actor: Actor) {
    await this.policy.assertCanBookAppointments(actor);
    return { booked: true };
  }
}

export async function createIdentityApp() {
  const store = new InMemoryIdentityStore();
  const storage = new FakeDocumentStorage();
  const moduleRef = await Test.createTestingModule({
    imports: [CommonModule, AuthModule, AuditModule, PrivateStorageModule, IdentityModule],
    controllers: [TestBookingController],
  })
    .overrideProvider(AUTH_INSTANCE).useValue(createMemoryAuth({ relaxedRateLimit: true }).auth)
    .overrideProvider(SESSION_PROVIDER).useValue(new HeaderSessionProvider())
    .overrideProvider(ACTOR_PROFILE_READER).useValue(new StoreActorProfileReader(store))
    .overrideProvider(UNIT_OF_WORK).useValue(new InMemoryUnitOfWork(store))
    .overrideProvider(AUDIT_TRAIL).useValue(new InMemoryAuditTrail(store))
    .overrideProvider(USER_PROFILE_REPOSITORY).useValue(store)
    .overrideProvider(PATIENT_PROFILE_REPOSITORY).useValue(store.patientProfiles)
    .overrideProvider(IDENTITY_VERIFICATION_REPOSITORY).useValue(store.verifications)
    .overrideProvider(LEGAL_DOCUMENT_REPOSITORY).useValue(store)
    .overrideProvider(REGISTRATION_STATUS_READER).useValue(store)
    .overrideProvider(PRIVATE_OBJECT_STORAGE).useValue(storage)
    .overrideProvider(ADMIN_ACCOUNT_PROVISIONER).useValue(new FakeAdminAccountProvisioner())
    .compile();

  const app: INestApplication = moduleRef.createNestApplication({ logger: false });
  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalPipes(createValidationPipe());
  await app.init();
  return { app, store, storage };
}
