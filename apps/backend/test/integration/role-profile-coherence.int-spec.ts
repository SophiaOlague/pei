import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { transactionStorage } from '../../src/db/transaction-context';
import { captureError, withRollback } from '../support/with-rollback';
import { insertUserWithProfile } from '../support/fixtures';
import { countM00Residue, countM02Residue } from '../support/residue';
import { assertC2BranchTarget } from '../support/c2-target-guard';

// Salvaguarda de destino: solo contra la rama temporal mediante C2. Ejecutado de otra forma, src/db usaría el
// DATABASE_URL del .env (rama `production`): falla al cargar el módulo, antes de cualquier consulta.
assertC2BranchTarget();

// M03 A4 (M02-7, R-10; RN-001, RN-139): patient_profile solo para el rol 'patient' y doctor_profile solo para 'doctor'.
// REQUIERE 0008_m03_role_profile_coherence aplicada. Contra la BD con rollback.

const tx = () => transactionStorage.getStore()!;

// Ejecuta en un SAVEPOINT y devuelve el error de PostgreSQL; la transacción exterior sigue usable.
async function pgError(statement: ReturnType<typeof sql>) {
  return (await captureError(tx().transaction(async (savepoint) => savepoint.execute(statement)))) as {
    cause?: { code?: string; message?: string };
  };
}

const insertPatientProfile = (userProfileId: string) => sql`insert into patient_profile (user_profile_id) values (${userProfileId})`;
const insertDoctorProfile = (userProfileId: string) => sql`
  insert into doctor_profile (user_profile_id, specialty, license_number)
  values (${userProfileId}, 'medicina_general', ${`A4-${userProfileId.slice(0, 8)}`})`;

// El bloque de precondiciones de 0008, leído del archivo de la migración (sin duplicarlo aquí).
function preconditionsBlock(): string {
  const file = readFileSync(join(__dirname, '../../src/db/migrations/0008_m03_role_profile_coherence.sql'), 'utf8');
  const block = file.split('--> statement-breakpoint').find((part) => part.includes('A4/0008 precondiciones'));
  if (!block) throw new Error('0008 sin bloque de precondiciones');
  return block.replace(/^\s*--.*$/gm, '').trim();
}

describe('Coherencia rol-perfil (M03 A4, BD de desarrollo con rollback)', () => {
  let m00Before: Record<string, number>;
  let m02Before: Record<string, number>;

  beforeAll(async () => {
    m00Before = await countM00Residue();
    m02Before = await countM02Residue();
  });

  afterAll(async () => {
    expect(await countM00Residue()).toEqual(m00Before);
    expect(await countM02Residue()).toEqual(m02Before);
  });

  it('[TC-M03-068][R-10] los dos triggers existen y están habilitados', async () => {
    const { rows } = await db.execute<{ tgname: string; tgenabled: string }>(sql`
      select tgname, tgenabled from pg_trigger
       where tgname in ('patient_profile_role_matches', 'doctor_profile_role_matches') and not tgisinternal
       order by tgname`);
    expect(rows).toEqual([
      { tgname: 'doctor_profile_role_matches', tgenabled: 'O' },
      { tgname: 'patient_profile_role_matches', tgenabled: 'O' },
    ]);
  });

  it('[TC-M03-069][R-10][RN-139][D-A4-1] patient_profile sobre un usuario médico → P0001', () =>
    withRollback(async (t) => {
      const { profile } = await insertUserWithProfile(t, 'doctor');
      const error = await pgError(insertPatientProfile(profile.id));
      expect(error?.cause?.code).toBe('P0001');
      expect(error?.cause?.message).not.toContain(profile.id);
    }));

  it('[TC-M03-070][R-10][RN-139][D-A4-1] doctor_profile sobre un usuario paciente → P0001', () =>
    withRollback(async (t) => {
      const { profile } = await insertUserWithProfile(t, 'patient');
      expect((await pgError(insertDoctorProfile(profile.id)))?.cause?.code).toBe('P0001');
    }));

  it.each(['admin', 'organization'] as const)('[TC-M03-071][R-10][RN-001] %s no puede tener perfil de paciente ni de médico', (role) =>
    withRollback(async (t) => {
      const { profile } = await insertUserWithProfile(t, role);
      expect((await pgError(insertPatientProfile(profile.id)))?.cause?.code).toBe('P0001');
      expect((await pgError(insertDoctorProfile(profile.id)))?.cause?.code).toBe('P0001');
    }));

  it('[TC-M03-072][R-10] mover un patient_profile a un usuario médico (UPDATE de user_profile_id) → P0001', () =>
    withRollback(async (t) => {
      const { profile: patient } = await insertUserWithProfile(t, 'patient');
      const { profile: doctor } = await insertUserWithProfile(t, 'doctor');
      await tx().execute(insertPatientProfile(patient.id));
      const error = await pgError(sql`update patient_profile set user_profile_id = ${doctor.id} where user_profile_id = ${patient.id}`);
      expect(error?.cause?.code).toBe('P0001');
    }));

  it('[TC-M03-073][R-10] cada rol con su perfil se acepta', () =>
    withRollback(async (t) => {
      const { profile: patient } = await insertUserWithProfile(t, 'patient');
      const { profile: doctor } = await insertUserWithProfile(t, 'doctor');
      await tx().execute(insertPatientProfile(patient.id));
      await tx().execute(insertDoctorProfile(doctor.id));
      const { rows } = await tx().execute<{ n: string }>(sql`
        select (select count(*) from patient_profile where user_profile_id = ${patient.id})
             + (select count(*) from doctor_profile where user_profile_id = ${doctor.id}) as n`);
      expect(Number(rows[0].n)).toBe(2);
    }));

  // La comprobación negativa (un perfil incoherente hace fallar las precondiciones) exige un dato que los triggers ya
  // impiden: se ejecuta en el ensayo C2 ANTES de aplicar 0008, en una transacción revertida, sin desactivar triggers.
  it('[TC-M03-074][R-10] las precondiciones de 0008 pasan con los datos actuales (solo lectura)', () =>
    withRollback(async () => {
      await tx().execute(sql.raw(preconditionsBlock()));
    }));
});
