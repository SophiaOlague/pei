import { sql } from 'drizzle-orm';
import { getDbContext } from '../../src/db/transaction-context';
import type { Actor } from '../../src/common/application/actor';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import { DrizzleAuditTrail } from '../../src/modules/audit/infrastructure/drizzle-audit-trail';
import { DrizzleDoctorIdentityGateway } from '../../src/modules/identity/infrastructure/persistence/drizzle-doctor-identity.gateway';
import { DrizzleDoctorProfileRepository } from '../../src/modules/doctors/infrastructure/persistence/drizzle-doctor-profile.repository';
import { DrizzleDoctorReviewRepository } from '../../src/modules/doctors/infrastructure/persistence/drizzle-doctor-review.repository';
import { DrizzleSpecialtyRepository } from '../../src/modules/doctors/infrastructure/persistence/drizzle-specialty.repository';
import { DoctorStatusService } from '../../src/modules/doctors/application/doctor-status.service';
import { DoctorIdentityDocumentPurger } from '../../src/modules/doctors/application/use-cases/doctor-identity-document-purger';
import { RegisterDoctorProfileUseCase } from '../../src/modules/doctors/application/use-cases/register-doctor-profile.use-case';
import { GetDoctorProfileUseCase, UpdateDoctorProfileUseCase } from '../../src/modules/doctors/application/use-cases/doctor-profile.use-cases';
import { ChangeDoctorIdentityUseCase, ChangeDoctorSpecialtyUseCase } from '../../src/modules/doctors/application/use-cases/doctor-changes.use-cases';
import { SubmitDoctorIdentityVerificationUseCase, SubmitDoctorLicenseVerificationUseCase } from '../../src/modules/doctors/application/use-cases/doctor-submissions.use-cases';
import { GetDoctorStatusUseCase } from '../../src/modules/doctors/application/use-cases/doctor-status.use-cases';
import {
  GetDoctorReviewDetailUseCase, ListPendingDoctorReviewsUseCase, OpenDoctorReviewDocumentUseCase, PurgeTerminalDoctorIdentityDocumentsUseCase,
  ReviewDoctorVerificationUseCase,
} from '../../src/modules/doctors/application/use-cases/admin/doctor-review.use-cases';
import { ListDoctorsUseCase } from '../../src/modules/doctors/application/use-cases/admin/doctor-admin.use-cases';
import { DoctorOperationalPolicy } from '../../src/modules/doctors/application/policies/doctor-operational.policy';
import { FakeDocumentStorage } from './identity-in-memory';
import { insertAuthUser, publishLegalDocument, sessionActor } from './identity-integration';
import { syntheticCurp } from './synthetic-identity';

// M03 B8: casos de uso del médico con los adaptadores REALES de PostgreSQL (repositorios Drizzle, gateway de Identity,
// UnitOfWork y AuditTrail). R2 se reemplaza por un doble. Solo dentro de withRollback.

export const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
export const PDF = Buffer.from('%PDF-1.7\n% sintetico M03\n');

export function doctorUseCases() {
  const uow = new DrizzleUnitOfWork();
  const audit = new DrizzleAuditTrail();
  const storage = new FakeDocumentStorage();
  const gateway = new DrizzleDoctorIdentityGateway();
  const profiles = new DrizzleDoctorProfileRepository();
  const reviews = new DrizzleDoctorReviewRepository();
  const specialties = new DrizzleSpecialtyRepository();
  const status = new DoctorStatusService(gateway, reviews);
  const purger = new DoctorIdentityDocumentPurger(storage, reviews);
  return {
    storage, gateway, profiles, reviews, specialties, status,
    register: new RegisterDoctorProfileUseCase(uow, audit, gateway, profiles, specialties),
    getProfile: new GetDoctorProfileUseCase(profiles, gateway, specialties),
    update: new UpdateDoctorProfileUseCase(uow, profiles, gateway),
    changeIdentity: new ChangeDoctorIdentityUseCase(uow, audit, gateway, profiles, reviews, status, purger),
    changeSpecialty: new ChangeDoctorSpecialtyUseCase(uow, audit, profiles, reviews, specialties, status),
    submitIne: new SubmitDoctorIdentityVerificationUseCase(uow, audit, storage, profiles, reviews, status, purger),
    submitLicense: new SubmitDoctorLicenseVerificationUseCase(uow, audit, storage, profiles, reviews, status),
    getStatus: new GetDoctorStatusUseCase(profiles, status),
    queue: new ListPendingDoctorReviewsUseCase(reviews),
    detail: new GetDoctorReviewDetailUseCase(reviews, profiles, gateway, specialties),
    review: new ReviewDoctorVerificationUseCase(uow, audit, reviews, profiles, status, purger),
    documents: new OpenDoctorReviewDocumentUseCase(uow, audit, storage, reviews, profiles),
    purgeCli: new PurgeTerminalDoctorIdentityDocumentsUseCase(reviews, purger),
    list: new ListDoctorsUseCase(profiles, gateway, specialties, status),
    policy: new DoctorOperationalPolicy(profiles, status),
  };
}
export type DoctorUseCases = ReturnType<typeof doctorUseCases>;

export async function specialtyId(code: string): Promise<string> {
  const { rows } = await getDbContext().execute<{ id: string }>(sql`select id from specialty where code = ${code}`);
  return rows[0].id;
}

// Publica (una vez por transacción) el régimen del médico y lo acepta para el user_profile. legal_document tiene
// UNIQUE(type, published_at) y now() es fijo en la transacción: un segundo médico reutiliza los documentos publicados.
export async function acceptDoctorRegime(userProfileId: string): Promise<void> {
  for (const type of ['privacy_policy', 'doctor_terms'] as const) {
    const { rows } = await getDbContext().execute<{ id: string }>(sql`select id from legal_document where type = ${type} and published_at = now() limit 1`);
    const id = rows[0]?.id ?? (await publishLegalDocument(type));
    await getDbContext().execute(sql`insert into user_legal_acceptance (user_profile_id, legal_document_id) values (${userProfileId}, ${id})`);
  }
}

export async function createDoctor(uc: DoctorUseCases, curp = syntheticCurp()): Promise<Actor & { doctorProfileId: string; userProfileId: string }> {
  const userId = await insertAuthUser();
  const actor = sessionActor(userId);
  const { doctorProfileId, userProfileId } = await uc.register.execute(actor, {
    firstName: 'Médica', lastName: 'Sintética', curp, specialtyId: await specialtyId('medicina_general'),
  });
  await acceptDoctorRegime(userProfileId);
  return { ...actor, userProfileId, role: 'doctor', doctorProfileId };
}

// Acciones de auditoría de las entidades indicadas (ordenadas: en una transacción todas comparten created_at).
export async function doctorAuditActions(entityIds: string[]): Promise<string[]> {
  const { rows } = await getDbContext().execute<{ action: string }>(
    sql`select action from audit_log where entity_id in (${sql.join(entityIds.map((id) => sql`${id}::uuid`), sql`, `)}) order by action`,
  );
  return rows.map((r) => r.action);
}

// Conteos totales de las tablas de M03 (solo lectura) para comparar antes y después de cada archivo.
export async function countM03Residue(): Promise<Record<string, number>> {
  const { rows } = await getDbContext().execute<Record<string, string>>(sql`
    select
      (select count(*) from specialty) as specialty,
      (select count(*) from doctor_profile) as doctor_profile,
      (select count(*) from doctor_identity_verification) as doctor_identity_verification,
      (select count(*) from doctor_license_verification) as doctor_license_verification,
      (select count(*) from audit_log where action like 'doctor.%' or action like 'catalog.%') as doctor_audit_log
  `);
  return Object.fromEntries(Object.entries(rows[0]).map(([table, count]) => [table, Number(count)]));
}
