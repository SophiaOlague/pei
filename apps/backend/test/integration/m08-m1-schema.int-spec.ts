import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { createAdminActor, identityUseCases } from '../support/identity-integration';
import {
  assertReservationCopiesImmutable, assertSchemaHasM1PartA, attempt, DOWN_A, drizzleColumnsMissingInDb, expectVersionedConfigGuarded, fingerprint,
  hasM1PartA, IMMUTABLE_COPY, insertAppointment, M1_A_SHA256, message, rawFixtures, run, transitionMismatches, tx, UP_A, VALIDATE,
  versionedConfigOutcomes, withIsolatedRollback,
} from '../support/m08-m1-sql';

// Salvaguarda de destino: solo contra la rama de pruebas mediante C2.
assertC2BranchTarget();

// M-1 parte A (0013) YA APLICADA de forma persistente en C2: las garantías de la BD sobre el esquema real, sin
// aplicarla. Complementa a m08-m1-migration.int-spec.ts, que prueba la migración desde 0000–0012 en una rama aislada.
// Si el esquema conectado no tiene 0013, el spec FALLA en beforeAll. Todo ocurre en transacciones revertidas sobre
// conexiones propias; afterAll comprueba con la huella del esquema que C2 sigue exactamente igual.

describe('M-1 de M08 sobre el esquema persistente de C2 (0013 aplicada, rollback)', () => {
  let before: unknown;

  beforeAll(async () => {
    await assertSchemaHasM1PartA();
    before = await fingerprint();
  });

  afterAll(async () => {
    try {
      if (before !== undefined) expect(await fingerprint()).toEqual(before);
    } finally {
      await db.$client.end();
    }
  });

  it('[TC-M08-310][M-1] 0013 está registrada con su hash, la validación pasa completa y no se aplica dos veces', () =>
    withIsolatedRollback(async () => {
      const { rows: last } = await tx().execute<{ hash: string }>(sql`select hash from drizzle.__drizzle_migrations order by created_at desc limit 1`);
      expect(last[0]?.hash).toBe(M1_A_SHA256);
      const { rows } = await run(VALIDATE) as unknown as { rows: { check: string; ok: boolean }[] };
      expect(rows.filter((r) => !r.ok)).toEqual([]);
      const { rows: filled } = await tx().execute<{ n: string; filled: string }>(sql`select count(*) as n, count(agenda_block_ends_at) as filled from appointment`);
      expect(filled[0].filled).toBe(filled[0].n);
      expect(message(await attempt(UP_A))).toMatch(/ya está aplicada/);
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

  it('[TC-M08-315][M-1] reversión y reaplicación sobre los datos reales de C2: esquema y datos idénticos', () =>
    withIsolatedRollback(async () => {
      const original = await fingerprint(tx());
      // agenda_block_ends_at no entra en la comparación: DOWN_A elimina la columna y UP_A la vuelve a rellenar con la
      // duración ACTUAL del médico (no con la copia original). Se comprueba aparte que todas las citas quedan rellenas.
      const snapshot = async () => (await tx().execute<{ id: string; status: string }>(sql`
        select id, status::text as status from appointment order by id`)).rows;
      const history = async () => Number((await tx().execute<{ n: string }>(sql`select count(*) as n from appointment_status_history`)).rows[0].n);
      const rowsBefore = await snapshot();
      const historyBefore = await history();
      await run(DOWN_A);
      expect(await hasM1PartA(tx())).toBe(false);
      expect(await history()).toBe(historyBefore);
      await run(UP_A);
      expect(await fingerprint(tx())).toEqual(original);
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
});
