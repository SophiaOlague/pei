import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { transactionStorage } from '../../src/db/transaction-context';
import { RegistrationDataConflictError } from '../../src/modules/identity/domain/identity.errors';
import { captureError, RollbackSignal, withRollback } from '../support/with-rollback';
import { insertUserWithProfile } from '../support/fixtures';
import { countM00Residue, countM02Residue } from '../support/residue';
import { syntheticCurp } from '../support/synthetic-identity';
import { createPatient, identityUseCases, insertAuthUser, sessionActor } from '../support/identity-integration';
import { assertC2BranchTarget } from '../support/c2-target-guard';

// Salvaguarda de destino: solo contra la rama temporal mediante C2. Ejecutado de otra forma, src/db usaría el
// DATABASE_URL del .env (rama `production`): falla al cargar el módulo, antes de cualquier consulta.
assertC2BranchTarget();

// M03 A3: la CURP vive en user_profile (R-12), única entre roles (D-20, D-35) y obligatoria para paciente y médico.
// REQUIERE 0007_m02_user_profile_curp aplicada. Contra la BD con rollback; CURP sintéticas.

const tx = () => transactionStorage.getStore()!;

async function expectViolation(statement: ReturnType<typeof sql>, code: string, constraint: string) {
  const error = (await captureError(
    db.transaction(async (t) => {
      await t.execute(statement);
      throw new RollbackSignal();
    }),
  )) as { cause?: { code?: string; constraint?: string } };
  expect(error).not.toBeInstanceOf(RollbackSignal);
  expect(error?.cause?.code).toBe(code);
  expect(error?.cause?.constraint).toBe(constraint);
}

const newUserProfile = (role: string, curp: string | null) => sql`
  with u as (insert into "user" (id, name, email)
             values (gen_random_uuid()::text, 'x', gen_random_uuid()::text || '@m00.test.invalid') returning id)
  insert into user_profile (user_id, role, first_name, last_name, curp) select id, ${role}::role_enum, 'x', 'y', ${curp} from u`;

describe('CURP en user_profile (M03 A3, BD de desarrollo con rollback)', () => {
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

  it('[TC-M03-055][R-12] el registro guarda la CURP en user_profile y patient_profile ya no tiene la columna', () =>
    withRollback(async () => {
      const curp = syntheticCurp();
      const patient = await createPatient(identityUseCases(), curp);
      const { rows } = await tx().execute<{ curp: string }>(sql`select curp from user_profile where id = ${patient.userProfileId}`);
      expect(rows[0].curp).toBe(curp);
      const { rows: columns } = await tx().execute(
        sql`select 1 from information_schema.columns where table_name = 'patient_profile' and column_name = 'curp'`,
      );
      expect(columns).toHaveLength(0);
    }));

  it('[TC-M03-056][D-20][D-35] una CURP de médico bloquea el registro de un paciente: 409 genérico, sin escribir ni auditar', () =>
    withRollback(async (t) => {
      const { profile: doctor } = await insertUserWithProfile(t, 'doctor');
      const { rows } = await tx().execute<{ curp: string }>(sql`select curp from user_profile where id = ${doctor.id}`);
      const takenCurp = rows[0].curp;
      const auditBefore = await tx().execute<{ n: string }>(sql`select count(*) as n from audit_log`);

      const useCases = identityUseCases();
      const actor = sessionActor(await insertAuthUser());
      const error = await captureError(
        useCases.register.execute(actor, { firstName: 'Otra', lastName: 'Persona', curp: takenCurp, birthDate: '1990-01-01' }),
      );
      expect(error).toBeInstanceOf(RegistrationDataConflictError);
      expect((error as Error).message).not.toContain(takenCurp);
      const { rows: profiles } = await tx().execute(sql`select 1 from user_profile where user_id = ${actor.userId}`);
      expect(profiles).toHaveLength(0);
      const auditAfter = await tx().execute<{ n: string }>(sql`select count(*) as n from audit_log`);
      expect(auditAfter.rows[0].n).toBe(auditBefore.rows[0].n);
    }));

  it('[TC-M03-057][D-1] paciente o médico sin CURP → 23514 user_profile_curp_required_chk', async () => {
    await expectViolation(newUserProfile('patient', null), '23514', 'user_profile_curp_required_chk');
    await expectViolation(newUserProfile('doctor', null), '23514', 'user_profile_curp_required_chk');
  });

  it('[TC-M03-058][D-20] CURP repetida entre roles → 23505 user_profile_curp_unique', () =>
    withRollback(async () => {
      const curp = syntheticCurp();
      await tx().execute(newUserProfile('patient', curp));
      const error = (await captureError(tx().transaction(async (savepoint) => savepoint.execute(newUserProfile('doctor', curp))))) as {
        cause?: { code?: string; constraint?: string };
      };
      expect(error?.cause?.code).toBe('23505');
      expect(error?.cause?.constraint).toBe('user_profile_curp_unique');
    }));

  it('[TC-M03-059][R-12] admin sin CURP se acepta, y varios NULL no chocan con la unicidad', () =>
    withRollback(async () => {
      await tx().execute(newUserProfile('admin', null));
      await tx().execute(newUserProfile('admin', null));
      const { rows } = await tx().execute<{ n: string }>(sql`select count(*) as n from user_profile where role = 'admin' and curp is null`);
      expect(Number(rows[0].n)).toBeGreaterThanOrEqual(2);
    }));
});
