import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { createAdminActor, createPatient, identityUseCases } from '../support/identity-integration';
import {
  assertReservationCopiesImmutable, assertSchemaHasM1, attempt, DOWN_A, drizzleColumnsMissingInDb, expectVersionedConfigGuarded, fingerprint,
  hasM1PartA, hasM1PartB, IMMUTABLE_COPY, insertAppointment, legalAcceptance, M1_A_SHA256, M1_B_SHA256, message, partB, patientUserProfileId,
  rawFixtures, run, transitionMismatches, tryInsertWithAcceptances, tx, UP_A, VALIDATE, versionedConfigOutcomes, withIsolatedRollback,
} from '../support/m08-m1-sql';

// Salvaguarda de destino: solo contra la rama de pruebas mediante C2.
assertC2BranchTarget();

// M-1 partes A (0013) y B (0014, AP-26) YA APLICADAS de forma persistente en C2: las garantías de la BD sobre el
// esquema real, sin aplicarlas. Complementa a m08-m1-migration.int-spec.ts y m08-m1-part-b.int-spec.ts, que prueban
// las migraciones desde 0000–0012 en una rama aislada. Si el esquema conectado no tiene 0013 y 0014, el spec FALLA en
// beforeAll (hasta que 0014 se aplique en C2 con autorización, este spec no puede pasar). Todo ocurre en transacciones revertidas sobre
// conexiones propias; afterAll comprueba con la huella del esquema que C2 sigue exactamente igual.

describe('M-1 de M08 sobre el esquema persistente de C2 (0013 y 0014 aplicadas, rollback)', () => {
  let before: unknown;

  beforeAll(async () => {
    await assertSchemaHasM1();
    before = await fingerprint();
  });

  afterAll(async () => {
    try {
      if (before !== undefined) expect(await fingerprint()).toEqual(before);
    } finally {
      await db.$client.end();
    }
  });

  it('[TC-M08-310][M-1][AP-26] 0013 y 0014 registradas con su hash (0014 la última); la validación pasa y no se aplican dos veces', () =>
    withIsolatedRollback(async () => {
      const { rows: last } = await tx().execute<{ hash: string }>(sql`select hash from drizzle.__drizzle_migrations order by created_at desc limit 2`);
      expect(last.map((r) => r.hash)).toEqual([M1_B_SHA256, M1_A_SHA256]);
      const { rows } = await run(VALIDATE) as unknown as { rows: { check: string; ok: boolean }[] };
      expect(rows.filter((r) => !r.ok)).toEqual([]);
      const { rows: filled } = await tx().execute<{ n: string; filled: string }>(sql`select count(*) as n, count(agenda_block_ends_at) as filled from appointment`);
      expect(filled[0].filled).toBe(filled[0].n);
      expect(message(await attempt(UP_A))).toMatch(/ya está aplicada/);
      expect(message(await attempt(partB().up))).toMatch(/ya está aplicada/);
    }));

  it('[TC-M08-311][M-1] los INSERT de Drizzle solo nombran columnas que existen en la BD', async () => {
    expect(await drizzleColumnsMissingInDb()).toEqual([]);
  });

  it('[TC-M08-312][H-1] matriz completa de transiciones por SQL directo: solo pasan las permitidas', () =>
    withIsolatedRollback(async () => {
      expect(await transitionMismatches(await rawFixtures())).toEqual([]);
    }));

  it('[TC-M08-313][H-1][RN-007][RN-018] las copias de la reserva no cambian por SQL directo', () =>
    withIsolatedRollback(async () => {
      const { results, cancel } = await assertReservationCopiesImmutable(await rawFixtures());
      for (const msg of Object.values(results)) expect(msg).toMatch(IMMUTABLE_COPY);
      expect(cancel).toBeNull();
    }));

  it('[TC-M08-314][RN-021][AP-2] versiones de precio y política: solo se cierran una vez; sin DELETE, TRUNCATE ni cambios', () =>
    withIsolatedRollback(async () => {
      const admin = await createAdminActor(identityUseCases());
      expectVersionedConfigGuarded(await versionedConfigOutcomes(admin.userProfileId));
    }));

  it('[TC-M08-315][M-1][AP-26] reversión (0014 y 0013) y reaplicación sobre los datos reales de C2: esquema y datos idénticos', () =>
    withIsolatedRollback(async () => {
      const { up: UP_B, down: DOWN_B } = partB();
      const original = await fingerprint(tx());
      // agenda_block_ends_at no entra en la comparación: DOWN_A elimina la columna y UP_A la vuelve a rellenar con la
      // duración ACTUAL del médico (no con la copia original). Se comprueba aparte que todas las citas quedan rellenas.
      // Las referencias legales tampoco: DOWN_B elimina sus columnas (se pierden) y UP_B las vuelve a crear nulas. Por
      // eso la prueba exige que C2 no tenga todavía citas con referencias; si las tuviera, la reversión no sería fiel.
      const snapshot = async () => (await tx().execute<{ id: string; status: string }>(sql`
        select id, status::text as status from appointment order by id`)).rows;
      const history = async () => Number((await tx().execute<{ n: string }>(sql`select count(*) as n from appointment_status_history`)).rows[0].n);
      const withRefs = async () => Number((await tx().execute<{ n: string }>(sql`
        select count(*) as n from appointment where privacy_legal_acceptance_id is not null`)).rows[0].n);
      expect(await withRefs()).toBe(0);
      const rowsBefore = await snapshot();
      const historyBefore = await history();
      expect(message(await attempt(DOWN_A))).toMatch(/Revierta primero 0014/);
      await run(DOWN_B);
      expect(await hasM1PartB(tx())).toBe(false);
      await run(DOWN_A);
      expect(await hasM1PartA(tx())).toBe(false);
      expect(await history()).toBe(historyBefore);
      await run(UP_A);
      await run(UP_B);
      expect(await fingerprint(tx())).toEqual(original);
      expect(await withRefs()).toBe(0);
      expect(await snapshot()).toEqual(rowsBefore);
      expect(await history()).toBe(historyBefore);
      const { rows } = await tx().execute<{ n: string; filled: string }>(sql`select count(*) as n, count(agenda_block_ends_at) as filled from appointment`);
      expect(rows[0].filled).toBe(rows[0].n);
    }));

  it('[TC-M08-316][M-1] la reversión se niega si hay citas rescheduled (el enum no puede perder datos)', () =>
    withIsolatedRollback(async () => {
      const id = await insertAppointment(await rawFixtures(), 'confirmed');
      await run(`update appointment set status = 'rescheduled' where id = '${id}'`);
      expect(message(await attempt(DOWN_A))).toMatch(/hay citas o historial en rescheduled/);
      const { rows } = await tx().execute<{ status: string }>(sql`select status::text as status from appointment where id = ${id}`);
      expect(rows[0].status).toBe('rescheduled');
    }));

  // AP-26 (0014) sobre el esquema persistente: la BD es la última barrera aunque el código de M08 ya valide.
  it('[TC-M08-317][AP-26] las dos referencias o ninguna (CHECK); las citas históricas con las dos nulas siguen siendo válidas', () =>
    withIsolatedRollback(async () => {
      const f = await rawFixtures();
      const patient = await patientUserProfileId(f);
      const privacy = await legalAcceptance(patient, 'privacy_policy');
      const terms = await legalAcceptance(patient, 'patient_terms');
      expect(await tryInsertWithAcceptances(f, privacy, terms)).toBeNull();
      expect(await tryInsertWithAcceptances(f, null, null)).toBeNull();
      expect(message(await tryInsertWithAcceptances(f, privacy, null))).toMatch(/appointment_legal_acceptances_chk/);
      expect(message(await tryInsertWithAcceptances(f, null, terms))).toMatch(/appointment_legal_acceptances_chk/);
      // Ninguna cita existente de C2 tiene referencias parciales.
      const { rows } = await tx().execute<{ n: string }>(sql`
        select count(*) as n from appointment where (privacy_legal_acceptance_id is null) <> (terms_legal_acceptance_id is null)`);
      expect(Number(rows[0].n)).toBe(0);
    }));

  it('[TC-M08-318][AP-26] rechaza aceptaciones de otro paciente, de tipo incorrecto, de regímenes mezclados o inexistentes', () =>
    withIsolatedRollback(async () => {
      const f = await rawFixtures();
      const patient = await patientUserProfileId(f);
      const privacy = await legalAcceptance(patient, 'privacy_policy', 3);
      const terms = await legalAcceptance(patient, 'patient_terms', 3);
      const other = (await createPatient(identityUseCases())).userProfileId!;
      expect(message(await tryInsertWithAcceptances(f, privacy, await legalAcceptance(other, 'patient_terms')))).toMatch(/no pertenecen a su paciente/);
      expect(message(await tryInsertWithAcceptances(f, terms, privacy))).toMatch(/no es de un aviso o una política de privacidad/);
      expect(message(await tryInsertWithAcceptances(f, privacy, await legalAcceptance(patient, 'terms_and_conditions')))).toMatch(/regímenes distintos/);
      // Un identificador inexistente: lo rechaza el trigger (no hay usuario que coincida) o la FK.
      expect(message(await tryInsertWithAcceptances(f, privacy, '00000000-0000-4000-8000-000000000000'))).toMatch(/no pertenecen a su paciente|appointment_terms_legal_acceptance_fk/);
      // El régimen anterior completo sí es válido.
      expect(await tryInsertWithAcceptances(f, await legalAcceptance(patient, 'privacy_notice'), await legalAcceptance(patient, 'terms_and_conditions'))).toBeNull();
    }));

  it('[TC-M08-319][AP-26] las dos referencias son inmutables después del INSERT, también de NULL a un valor', () =>
    withIsolatedRollback(async () => {
      const f = await rawFixtures();
      const patient = await patientUserProfileId(f);
      const privacy = await legalAcceptance(patient, 'privacy_policy', 3);
      const terms = await legalAcceptance(patient, 'patient_terms', 3);
      const immutable = /no pueden cambiar después de reservar/;
      // Una cita sin referencias (como las históricas) no puede adquirirlas después.
      const withoutRefs = await insertAppointment(f, 'confirmed');
      expect(message(await attempt(`update appointment set privacy_legal_acceptance_id = '${privacy}', terms_legal_acceptance_id = '${terms}' where id = '${withoutRefs}'`))).toMatch(immutable);
      // Y una con referencias no puede perderlas ni cambiarlas.
      expect(await tryInsertWithAcceptances(f, privacy, terms)).toBeNull();
      const { rows } = await tx().execute<{ id: string }>(sql`select id from appointment where privacy_legal_acceptance_id = ${privacy} limit 1`);
      expect(message(await attempt(`update appointment set privacy_legal_acceptance_id = null, terms_legal_acceptance_id = null where id = '${rows[0].id}'`))).toMatch(immutable);
      const otherPrivacy = await legalAcceptance(patient, 'privacy_policy', 2);
      expect(message(await attempt(`update appointment set privacy_legal_acceptance_id = '${otherPrivacy}' where id = '${rows[0].id}'`))).toMatch(immutable);
    }));
});
