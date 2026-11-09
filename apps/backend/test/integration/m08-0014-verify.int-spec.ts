import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { INITIAL_POLICY } from '../../src/modules/appointments/domain/cancellation-policy';
import { addLocalDays, localDateString } from '../../src/modules/appointments/domain/local-date';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { captureError, withRollback } from '../support/with-rollback';
import { FixedClock } from '../support/appointments-in-memory';
import { appointmentsUseCases, bookablePatient, countM08Residue, firstSlot, newAdmin, operatingDoctor } from '../support/appointments-integration';
import { getDbContext } from '../../src/db/transaction-context';

// Salvaguarda de destino: solo contra la rama de pruebas mediante C2.
assertC2BranchTarget();

// Prueba permanente y mínima de la persistencia de AP-26 (0014) en C2, ejecutable sin B1 ni B2
// (pnpm c2 run postgres test/integration/m08-0014-verify.int-spec.ts):
// - TC-M08-366: catálogo en una transacción READ ONLY: columnas, FK, índices, CHECK y trigger de 0014.
// - TC-M08-214: la misma prueba que appointments.int-spec.ts (mantener ambas copias iguales), en withRollback.
// afterAll comprueba que los conteos de las tablas que toca la prueba no cambiaron (sin residuo).
// Primera ejecución: c2-20261109140840-9cd4 (2/2), tras aplicar 0014 en C2.

async function residue() {
  const { rows } = await getDbContext().execute<Record<string, string>>(sql`
    select (select count(*) from user_profile) as user_profile, (select count(*) from user_legal_acceptance) as user_legal_acceptance,
           (select count(*) from legal_document) as legal_document, (select count(*) from audit_log) as audit_log`);
  return { ...(await countM08Residue()), ...Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v)])) };
}

async function configured(uc: ReturnType<typeof appointmentsUseCases>) {
  const admin = await newAdmin();
  const current = await captureError(uc.prices.current(admin));
  if (current || (await uc.prices.current(admin)).price !== '200.00') await uc.prices.publish(admin, '200.00', 'initial_setup');
  const policy = await captureError(uc.policies.current(admin));
  if (policy) await uc.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
  else {
    const p = await uc.policies.current(admin);
    if (p.refundDeadlineHours !== 24 || p.maxReschedules !== 2 || p.doctorWaitMinutes !== 30 || p.patientToleranceMinutes !== 15) {
      await uc.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
    }
  }
  return admin;
}

describe('Persistencia de AP-26 (0014) en C2: verificación mínima', () => {
  let before: Record<string, number>;

  beforeAll(async () => {
    before = await withRollback(() => residue());
  });

  afterAll(async () => {
    try {
      expect(await withRollback(() => residue())).toEqual(before);
    } finally {
      await db.$client.end();
    }
  });

  it('[TC-M08-366][AP-26] columnas, FK, índices, CHECK y trigger de 0014 (solo lectura)', () =>
    withRollback(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      const { rows } = await tx.execute<{ f: Record<string, unknown> }>(sql`
        select json_build_object(
          'columns', (select json_agg(json_build_array(column_name, udt_name, is_nullable) order by column_name) from information_schema.columns
                       where table_schema = 'public' and table_name = 'appointment' and column_name in ('privacy_legal_acceptance_id', 'terms_legal_acceptance_id')),
          'fks', (select json_agg(json_build_array(conname, pg_get_constraintdef(oid)) order by conname) from pg_constraint
                   where conrelid = 'appointment'::regclass and conname in ('appointment_privacy_legal_acceptance_fk', 'appointment_terms_legal_acceptance_fk')),
          'check', (select json_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid = 'appointment'::regclass and conname = 'appointment_legal_acceptances_chk'),
          'indexes', (select json_agg(indexname order by indexname) from pg_indexes
                       where tablename = 'appointment' and indexname in ('appointment_privacy_legal_acceptance_idx', 'appointment_terms_legal_acceptance_idx')),
          'trigger', (select json_agg(json_build_array(t.tgname, p.proname, t.tgenabled)) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
                       where t.tgrelid = 'appointment'::regclass and t.tgname = 'appointment_legal_acceptances_check')
        ) as f`);
      const f = rows[0].f;
      console.log(`0014 catálogo: ${JSON.stringify(f)}`);
      expect(f.columns).toEqual([['privacy_legal_acceptance_id', 'uuid', 'YES'], ['terms_legal_acceptance_id', 'uuid', 'YES']]);
      expect(f.fks).toEqual([
        ['appointment_privacy_legal_acceptance_fk', 'FOREIGN KEY (privacy_legal_acceptance_id) REFERENCES user_legal_acceptance(id)'],
        ['appointment_terms_legal_acceptance_fk', 'FOREIGN KEY (terms_legal_acceptance_id) REFERENCES user_legal_acceptance(id)'],
      ]);
      expect(f.check).toHaveLength(1);
      expect(String((f.check as string[])[0])).toMatch(/privacy_legal_acceptance_id IS NULL\) = \(terms_legal_acceptance_id IS NULL/);
      expect(f.indexes).toEqual(['appointment_privacy_legal_acceptance_idx', 'appointment_terms_legal_acceptance_idx']);
      expect(f.trigger).toEqual([['appointment_legal_acceptances_check', 'gst_appointment_legal_acceptances_check', 'O']]);
    }));

  it('[TC-M08-214][AP-26] la retención guarda las dos aceptaciones legales vigentes del paciente (privacidad y términos)', () =>
    withRollback(async (tx) => {
      const clock = new FixedClock(new Date());
      const uc = appointmentsUseCases(clock);
      const day = addLocalDays(localDateString(clock.now()), 2);
      const admin = await configured(uc);
      const d = await operatingDoctor(uc, admin);
      const p = await bookablePatient(admin);
      const startsAt = await firstSlot(uc, d.doctorProfileId, day);
      const h = await uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt, reason: 'Revisión' });
      const { rows } = await tx.execute<{ privacy_user: string; privacy_type: string; terms_user: string; terms_type: string }>(sql`
        select pa.user_profile_id as privacy_user, pd.type::text as privacy_type, ta.user_profile_id as terms_user, td.type::text as terms_type
          from appointment a
          join user_legal_acceptance pa on pa.id = a.privacy_legal_acceptance_id join legal_document pd on pd.id = pa.legal_document_id
          join user_legal_acceptance ta on ta.id = a.terms_legal_acceptance_id join legal_document td on td.id = ta.legal_document_id
         where a.id = ${h.id}`);
      expect(rows).toHaveLength(1);
      expect(rows[0].privacy_user).toBe(p.userProfileId);
      expect(rows[0].terms_user).toBe(p.userProfileId);
      expect([['privacy_policy', 'patient_terms'], ['privacy_notice', 'terms_and_conditions']]).toContainEqual([rows[0].privacy_type, rows[0].terms_type]);
    }));
});
