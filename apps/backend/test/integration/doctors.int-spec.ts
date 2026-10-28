import { sql } from 'drizzle-orm';
import { transactionStorage } from '../../src/db/transaction-context';
import { RegistrationDataConflictError } from '../../src/modules/identity/domain/identity.errors';
import {
  DoctorIdentityDocumentUnavailableError, ReviewNotCurrentError, SpecialtyInactiveError,
} from '../../src/modules/doctors/domain/doctor.errors';
import { withRollback } from '../support/with-rollback';
import { countM00Residue, countM02Residue } from '../support/residue';
import { syntheticCurp } from '../support/synthetic-identity';
import { createAdminActor, identityUseCases } from '../support/identity-integration';
import {
  countM03Residue, createDoctor, doctorAuditActions, doctorUseCases, JPEG, PDF, specialtyId, type DoctorUseCases,
} from '../support/doctors-integration';
import { assertC2BranchTarget } from '../support/c2-target-guard';

// Salvaguarda de destino: solo contra la rama temporal mediante C2. Ejecutado de otra forma, src/db usaría el
// DATABASE_URL del .env (rama `production`): falla al cargar el módulo, antes de cualquier consulta.
assertC2BranchTarget();

// M03 B8: casos de uso del médico (B5–B7) contra PostgreSQL con los adaptadores Drizzle reales y los triggers de 0012.
// Todo dentro de withRollback. REQUIERE 0009–0012 aplicadas (rama temporal). R2 se sustituye por un doble.

const tx = () => transactionStorage.getStore()!;
const REASON = 'Documento ilegible, envía otra imagen';

async function approved(uc: DoctorUseCases) {
  const admin = await createAdminActor(identityUseCases());
  const d = await createDoctor(uc);
  const ine = await uc.submitIne.execute(d, { front: JPEG, back: JPEG });
  const lic = await uc.submitLicense.execute(d, { licenseNumber: `INT${Math.floor(Math.random() * 1e9)}`, document: PDF });
  await uc.review.execute(admin, 'identity', ine.reviewId, { decision: 'approve' });
  await uc.review.execute(admin, 'license', lic.reviewId, { decision: 'approve' });
  return { d, admin, ine, lic };
}

describe('Médicos contra PostgreSQL (M03 B8, rollback)', () => {
  let before: Record<string, Record<string, number>>;

  beforeAll(async () => {
    before = { m00: await countM00Residue(), m02: await countM02Residue(), m03: await withRollback(() => countM03Residue()) };
  });

  afterAll(async () => {
    expect(await countM00Residue()).toEqual(before.m00);
    expect(await countM02Residue()).toEqual(before.m02);
    expect(await withRollback(() => countM03Residue())).toEqual(before.m03);
  });

  it('[TC-M03-172][RF-05][R-10] el registro crea user_profile doctor y doctor_profile (pasa los triggers de 0008) y audita', () =>
    withRollback(async () => {
      const uc = doctorUseCases();
      const d = await createDoctor(uc);
      const { rows } = await tx().execute<{ role: string; identity_revision: number; professional_revision: number; license_number: string | null }>(sql`
        select up.role, dp.identity_revision, dp.professional_revision, dp.license_number
          from doctor_profile dp join user_profile up on up.id = dp.user_profile_id where dp.id = ${d.doctorProfileId}`);
      expect(rows[0]).toEqual({ role: 'doctor', identity_revision: 1, professional_revision: 1, license_number: null });
      expect(await doctorAuditActions([d.doctorProfileId])).toEqual(['doctor.profile.created']);
      expect(await uc.getStatus.execute(d)).toMatchObject({ status: 'pending', identity: 'required', professional: 'required' });
    }));

  it('[TC-M03-173][D-19][0012] INE: el reenvío pasa la anterior a superseded (trigger), intento 2 y purga de la anterior', () =>
    withRollback(async () => {
      const uc = doctorUseCases();
      const d = await createDoctor(uc);
      await uc.submitIne.execute(d, { front: JPEG, back: JPEG });
      await uc.submitIne.execute(d, { front: JPEG, back: JPEG });
      const { rows } = await tx().execute<{ attempt: number; status: string; purged: boolean }>(sql`
        select attempt, status, (documents_deleted_at is not null and ine_front_object_key is null) as purged
          from doctor_identity_verification where doctor_id = ${d.doctorProfileId} order by attempt`);
      expect(rows).toEqual([{ attempt: 1, status: 'superseded', purged: true }, { attempt: 2, status: 'pending', purged: false }]);
    }));

  it('[TC-M03-174][7bis][C-4][0012] cédula: inicial con versión 2, reenvío tras rechazo y cambio de número aceptados por los triggers', () =>
    withRollback(async () => {
      const uc = doctorUseCases();
      const admin = await createAdminActor(identityUseCases());
      const d = await createDoctor(uc);
      const first = await uc.submitLicense.execute(d, { licenseNumber: 'INT-A1', document: PDF });
      await uc.review.execute(admin, 'license', first.reviewId, { decision: 'reject', reason: REASON });
      expect((await uc.submitLicense.execute(d, { licenseNumber: 'INT-A1', document: PDF })).reason).toBe('resubmission');
      expect((await uc.submitLicense.execute(d, { licenseNumber: 'INT-A2', document: PDF })).reason).toBe('license_number_changed');
      const { rows } = await tx().execute<{ attempt: number; professional_revision: number; reason: string; status: string; license_number: string }>(sql`
        select attempt, professional_revision, reason, status, license_number from doctor_license_verification
         where doctor_id = ${d.doctorProfileId} order by attempt`);
      expect(rows).toEqual([
        { attempt: 1, professional_revision: 2, reason: 'initial', status: 'rejected', license_number: 'INT-A1' },
        { attempt: 2, professional_revision: 2, reason: 'resubmission', status: 'superseded', license_number: 'INT-A1' },
        { attempt: 3, professional_revision: 3, reason: 'license_number_changed', status: 'pending', license_number: 'INT-A2' },
      ]);
    }));

  it('[TC-M03-175][D-17] número de cédula de otro médico → 409 genérico (23505 traducido); el perfil no cambia', () =>
    withRollback(async () => {
      const uc = doctorUseCases();
      const a = await createDoctor(uc);
      const b = await createDoctor(uc);
      await uc.submitLicense.execute(a, { licenseNumber: 'INT-DUP', document: PDF });
      await expect(uc.submitLicense.execute(b, { licenseNumber: 'INT-DUP', document: PDF })).rejects.toThrow(RegistrationDataConflictError);
      expect((await uc.profiles.findById(b.doctorProfileId))?.licenseNumber).toBeNull();
    }));

  it('[TC-M03-176][RF-06][D-27][B7] aprobación de ambas: approved, INE purgada, eventos y política operativa', () =>
    withRollback(async () => {
      const uc = doctorUseCases();
      const { d, ine, lic } = await approved(uc);
      expect(await uc.getStatus.execute(d)).toMatchObject({ status: 'approved', registrationComplete: true });
      await expect(uc.policy.assertCanOperate(d.doctorProfileId)).resolves.toBeUndefined();
      expect(await doctorAuditActions([ine.reviewId, lic.reviewId, d.doctorProfileId])).toEqual(expect.arrayContaining([
        'doctor.identity_verification.approved', 'doctor.license_verification.approved', 'doctor.registration.completed',
      ]));
      const { rows } = await tx().execute<{ purged: boolean }>(sql`select documents_deleted_at is not null as purged from doctor_identity_verification where id = ${ine.reviewId}`);
      expect(rows[0].purged).toBe(true);
    }));

  // TC-M03-177 retirado (C-16, RN-138): ya no hay cambio de nombre legal. La reutilización de la clave de la cédula
  // en una revisión automática bajo el trigger de 0012 la sigue cubriendo TC-M03-179 (specialty_changed).

  it('[TC-M03-178][D-17][D-20] CURP de otra cuenta en el registro → 409 genérico', () =>
    withRollback(async () => {
      const uc = doctorUseCases();
      const curp = syntheticCurp();
      const a = await createDoctor(uc, curp);
      await expect(createDoctor(uc, curp)).rejects.toThrow(RegistrationDataConflictError);
      expect(a.doctorProfileId).toBeDefined();
    }));

  it('[TC-M03-179][D-33][0012] especialidad: inactiva → 422; activa → specialty_changed (versión +1, evidencia igual al perfil)', () =>
    withRollback(async () => {
      const uc = doctorUseCases();
      const { d, lic } = await approved(uc);
      const psico = await specialtyId('psicologia');
      await uc.specialties.setActive(psico, false);
      await expect(uc.changeSpecialty.execute(d, psico)).rejects.toThrow(SpecialtyInactiveError);
      await uc.specialties.setActive(psico, true);
      const r = await uc.changeSpecialty.execute(d, psico);
      expect(r.status).toMatchObject({ status: 'pending', professional: 'pending' });
      // C-16: también cubre lo que verificaba TC-M03-177: la revisión automática reutiliza la clave y pasa el trigger.
      const { rows } = await tx().execute<{ reason: string; specialty_ok: boolean; same_key: boolean }>(sql`
        select reason, specialty_id = ${psico} as specialty_ok,
               document_object_key = (select document_object_key from doctor_license_verification where id = ${lic.reviewId}) as same_key
          from doctor_license_verification where doctor_id = ${d.doctorProfileId} and status = 'pending'`);
      expect(rows).toEqual([{ reason: 'specialty_changed', specialty_ok: true, same_key: true }]);
    }));

  it('[TC-M03-180][E.5] una revisión pendiente de una versión anterior no se aprueba; la BD tampoco lo admitiría', () =>
    withRollback(async () => {
      const uc = doctorUseCases();
      const admin = await createAdminActor(identityUseCases());
      const d = await createDoctor(uc);
      const lic = await uc.submitLicense.execute(d, { licenseNumber: 'INT-E5', document: PDF });
      await tx().execute(sql`update doctor_profile set professional_revision = professional_revision + 1 where id = ${d.doctorProfileId}`);
      await expect(uc.review.execute(admin, 'license', lic.reviewId, { decision: 'approve' })).rejects.toThrow(ReviewNotCurrentError);
    }));

  it('[TC-M03-181][D-19][D-22][RNF-08] documentos del admin auditados; INE terminada → 409; colas y lista por estado', () =>
    withRollback(async () => {
      const uc = doctorUseCases();
      const admin = await createAdminActor(identityUseCases());
      const d = await createDoctor(uc);
      const ine = await uc.submitIne.execute(d, { front: JPEG, back: JPEG });
      const lic = await uc.submitLicense.execute(d, { licenseNumber: 'INT-DOC', document: PDF });
      expect((await uc.queue.execute(admin, 'identity', 1, 100)).items.map((i) => i.id)).toContain(ine.reviewId);
      await uc.documents.identity(admin, ine.reviewId, 'front');
      await uc.documents.license(admin, lic.reviewId);
      expect(await doctorAuditActions([ine.reviewId, lic.reviewId])).toEqual(expect.arrayContaining(['doctor.identity_document.viewed', 'doctor.license_document.viewed']));
      expect((await uc.detail.identityDetail(admin, ine.reviewId)).doctor.lastName).toBe('Sintética');
      await uc.review.execute(admin, 'identity', ine.reviewId, { decision: 'reject', reason: REASON });
      await expect(uc.documents.identity(admin, ine.reviewId, 'front')).rejects.toThrow(DoctorIdentityDocumentUnavailableError);
      const pending = await uc.list.execute(admin, { status: 'rejected', page: 1, pageSize: 100 });
      expect(pending.items.map((i) => i.doctorProfileId)).not.toContain(d.doctorProfileId); // cédula pendiente → pending (Z-1)
    }));

  it('[TC-M03-182][D-19][DT-6] si la purga falla, la CLI de conciliación la encuentra y la completa', () =>
    withRollback(async () => {
      const uc = doctorUseCases();
      const admin = await createAdminActor(identityUseCases());
      const d = await createDoctor(uc);
      const ine = await uc.submitIne.execute(d, { front: JPEG, back: JPEG });
      uc.storage.failDelete = true;
      expect((await uc.review.execute(admin, 'identity', ine.reviewId, { decision: 'approve' })).documentsDeleted).toBe(false);
      uc.storage.failDelete = false;
      const result = await uc.purgeCli.execute();
      expect(result.failed).toBe(0);
      expect(result.purged).toBeGreaterThanOrEqual(1);
    }));
});
