import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { user } from '../../src/db/schema';
import { getDbContext } from '../../src/db/transaction-context';
import type { Actor } from '../../src/common/application/actor';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import { DrizzleAuditTrail } from '../../src/modules/audit/infrastructure/drizzle-audit-trail';
import { DrizzleUserProfileRepository } from '../../src/modules/identity/infrastructure/persistence/drizzle-user-profile.repository';
import { DrizzlePatientProfileRepository } from '../../src/modules/identity/infrastructure/persistence/drizzle-patient-profile.repository';
import { DrizzleIdentityVerificationRepository } from '../../src/modules/identity/infrastructure/persistence/drizzle-identity-verification.repository';
import { DrizzleLegalDocumentRepository } from '../../src/modules/identity/infrastructure/persistence/drizzle-legal-document.repository';
import { DrizzleRegistrationStatusReader } from '../../src/modules/identity/infrastructure/persistence/drizzle-registration-status.reader';
import type { AdminAccountProvisioner } from '../../src/modules/identity/application/ports/admin-account-provisioner';
import { RegisterPatientProfileUseCase } from '../../src/modules/identity/application/use-cases/register-patient-profile.use-case';
import { SubmitIdentityVerificationUseCase } from '../../src/modules/identity/application/use-cases/submit-identity-verification.use-case';
import { IdentityDocumentPurger } from '../../src/modules/identity/application/use-cases/identity-document-purger';
import {
  OpenIdentityDocumentUseCase,
  PurgeReviewedIdentityDocumentsUseCase,
  ReviewIdentityVerificationUseCase,
} from '../../src/modules/identity/application/use-cases/identity-verification-admin.use-cases';
import { AcceptLegalDocumentsUseCase, PublishLegalDocumentsUseCase } from '../../src/modules/identity/application/use-cases/legal-documents.use-cases';
import type { LegalDocumentType } from '../../src/modules/identity/domain/legal-requirements';
import { BootstrapAdminUseCase } from '../../src/modules/identity/application/use-cases/bootstrap-admin.use-case';
import { FakeDocumentStorage } from './identity-in-memory';
import { syntheticCurp } from './synthetic-identity';
import { TEST_EMAIL_DOMAIN, testTag } from './with-rollback';

// Casos de uso de Identity con los adaptadores REALES de PostgreSQL (repositorios Drizzle, UnitOfWork y
// AuditTrail). R2 y Better Auth se reemplazan por dobles. Solo deben usarse dentro de withRollback o de una
// transacción de prueba que termine en ROLLBACK.

// Cuenta de Better Auth de prueba (sin perfil), creada en la transacción actual.
export async function insertAuthUser(): Promise<string> {
  const tag = testTag();
  await getDbContext().insert(user).values({ id: tag, name: 'Usuario de prueba M02', email: `${tag}@${TEST_EMAIL_DOMAIN}` });
  return tag;
}

export const sessionActor = (userId: string): Actor => ({ userId, userProfileId: null, role: null, ipAddress: '203.0.113.7', userAgent: 'PEI-M02-int' });

// Provisioner falso que crea la cuenta en la tabla "user" de la transacción actual.
export class TxAdminAccountProvisioner implements AdminAccountProvisioner {
  passwordSetups: string[] = [];
  async assertPasswordSetupConfigured() {}
  async findUserIdByEmail(email: string) {
    const { rows } = await getDbContext().execute<{ id: string }>(sql`select id from "user" where email = ${email}`);
    return rows[0]?.id ?? null;
  }
  // Mismo criterio que BetterAuthAdminAccountProvisioner: cuenta "credential" del usuario con contraseña.
  async hasPasswordCredential(userId: string) {
    const { rows } = await getDbContext().execute<{ id: string }>(
      sql`select id from account where user_id = ${userId} and account_id = ${userId} and provider_id = 'credential' and password is not null and password <> ''`,
    );
    return rows.length > 0;
  }
  async createAccount(input: { email: string; name: string }) {
    const id = testTag();
    await getDbContext().insert(user).values({ id, name: input.name, email: input.email });
    return id;
  }
  async sendPasswordSetup(email: string) {
    this.passwordSetups.push(email);
  }
}

export function identityUseCases() {
  const uow = new DrizzleUnitOfWork();
  const audit = new DrizzleAuditTrail();
  const storage = new FakeDocumentStorage();
  const userProfiles = new DrizzleUserProfileRepository();
  const patientProfiles = new DrizzlePatientProfileRepository();
  const verifications = new DrizzleIdentityVerificationRepository();
  const legalDocuments = new DrizzleLegalDocumentRepository();
  const reader = new DrizzleRegistrationStatusReader();
  const purger = new IdentityDocumentPurger(uow, storage, verifications);
  const provisioner = new TxAdminAccountProvisioner();
  return {
    storage,
    userProfiles,
    patientProfiles,
    verifications,
    legalDocuments,
    reader,
    provisioner,
    register: new RegisterPatientProfileUseCase(uow, audit, { now: () => new Date() }, userProfiles, patientProfiles),
    acceptLegal: new AcceptLegalDocumentsUseCase(uow, audit, legalDocuments),
    publishLegal: new PublishLegalDocumentsUseCase(uow, audit, legalDocuments),
    submit: new SubmitIdentityVerificationUseCase(uow, audit, storage, patientProfiles, verifications),
    open: new OpenIdentityDocumentUseCase(uow, audit, storage, verifications),
    review: new ReviewIdentityVerificationUseCase(uow, audit, verifications, purger),
    purge: new PurgeReviewedIdentityDocumentsUseCase(verifications, purger),
    bootstrap: new BootstrapAdminUseCase(uow, audit, userProfiles, provisioner),
  };
}

export type IdentityUseCases = ReturnType<typeof identityUseCases>;

// Paciente con perfil (cuenta + user_profile + patient_profile) creado con el caso de uso real.
export async function createPatient(useCases: IdentityUseCases, curp = syntheticCurp()): Promise<Actor & { patientProfileId: string }> {
  const userId = await insertAuthUser();
  const actor = sessionActor(userId);
  const { userProfileId, patientProfileId } = await useCases.register.execute(actor, {
    firstName: 'Paciente',
    lastName: 'Sintético',
    curp,
    birthDate: '1990-01-01',
  });
  return { ...actor, userProfileId, role: 'patient', patientProfileId };
}

export async function createAdminActor(useCases: IdentityUseCases): Promise<Actor> {
  const userId = await insertAuthUser();
  const userProfileId = await useCases.userProfiles.createAdmin({ userId, firstName: 'Admin', lastName: 'Prueba M02' });
  return { userId, userProfileId, role: 'admin', ipAddress: '203.0.113.8', userAgent: 'PEI-M02-int' };
}

// Documentos legales de prueba publicados "ahora" (now() de la transacción) o en el instante indicado.
export async function publishLegalDocument(type: LegalDocumentType, publishedAt = sql`now()`) {
  const { rows } = await getDbContext().execute<{ id: string }>(sql`
    insert into legal_document (type, version, content, published_at)
    values (${type}, ${testTag()}, 'Texto sintético de prueba M02', ${publishedAt})
    returning id
  `);
  return rows[0].id;
}

export async function auditRows(entityId: string) {
  const { rows } = await getDbContext().execute<{ action: string; actor_type: string; actor_user_profile_id: string | null; metadata: unknown }>(
    sql`select action, actor_type, actor_user_profile_id, metadata from audit_log where entity_id = ${entityId} order by action`,
  );
  return rows;
}

export const newId = () => randomUUID();
export { db };
