import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { createAdminActor, identityUseCases } from '../support/identity-integration';
import { FixedClock } from '../support/appointments-in-memory';
import { appointmentsUseCases, bookablePatient, firstSlot, operatingDoctor } from '../support/appointments-integration';
import {
  assertReservationCopiesImmutable, attempt, DOWN_A, expectVersionedConfigGuarded, fingerprint, hasM1PartA, IMMUTABLE_COPY,
  insertAppointment, message, rawFixtures, run, transitionMismatches, tx, UP_A, VALIDATE, versionedConfigOutcomes, withIsolatedRollback,
} from '../support/m08-m1-sql';
import { INITIAL_POLICY } from '../../src/modules/appointments/domain/cancellation-policy';
import { addLocalDays, localDateString } from '../../src/modules/appointments/domain/local-date';

// Salvaguarda de destino: solo contra una rama de pruebas mediante C2.
assertC2BranchTarget();

// M-1 (M08) como MIGRACIÓN: aplicación, validación, matriz de transiciones, reversión e integridad desde un esquema
// 0000–0012. Requiere una rama SIN 0013 (rama Neon aislada o desechable creada desde un punto anterior a 0013); en
// C2, que tendrá 0013 persistente, las mismas garantías las cubre m08-m1-schema.int-spec.ts. Si el esquema conectado
// ya tiene 0013, el spec FALLA en beforeAll (no se omite en silencio). TODO ocurre dentro de transacciones revertidas
// (el DDL de PostgreSQL es transaccional): la rama termina con el esquema intacto, y afterAll lo comprueba con una
// huella del esquema tomada fuera de la transacción. La parte B (0014, TC-M08-307) está en m08-m1-part-b.int-spec.ts:
// este spec no lee ni ejecuta 0014.

describe('M-1 de M08 como migración desde 0000–0012 (rama aislada, aplicación y reversión revertidas)', () => {
  let before: unknown;

  beforeAll(async () => {
    if (await hasM1PartA()) {
      throw new Error('m08-m1-migration exige un esquema 0000–0012 (sin 0013): ejecútelo en una rama aislada creada antes de 0013. En C2 use m08-m1-schema.int-spec.ts.');
    }
    before = await fingerprint();
  });

  afterAll(async () => {
    try {
      // La rama conserva el esquema de 0000–0012: M-1 no quedó aplicada.
      if (before !== undefined) expect(await fingerprint()).toEqual(before);
    } finally {
      await db.$client.end();
    }
  });

  it('[TC-M08-300][M-1] 0013 se aplica sobre los datos existentes y la validación posterior pasa completa', () =>
    withIsolatedRollback(async () => {
      const { rows: count } = await tx().execute<{ n: string }>(sql`select count(*) as n from appointment`);
      await run(UP_A);
      const { rows } = await run(VALIDATE) as unknown as { rows: { check: string; ok: boolean }[] };
      expect(rows.filter((r) => !r.ok)).toEqual([]);
      const { rows: after } = await tx().execute<{ n: string; filled: string }>(sql`select count(*) as n, count(agenda_block_ends_at) as filled from appointment`);
      expect(after[0]).toEqual({ n: count[0].n, filled: count[0].n });
      expect(message(await attempt(UP_A))).toMatch(/ya está aplicada/);
    }));

  it('[TC-M08-301][H-1] matriz completa de transiciones por SQL directo: solo pasan las permitidas', () =>
    withIsolatedRollback(async () => {
      await run(UP_A);
      expect(await transitionMismatches(await rawFixtures())).toEqual([]);
    }));

  it('[TC-M08-302][H-1][RN-007][RN-018] las copias de la reserva no cambian por SQL directo', () =>
    withIsolatedRollback(async () => {
      await run(UP_A);
      const { results, cancel } = await assertReservationCopiesImmutable(await rawFixtures());
      for (const msg of Object.values(results)) expect(msg).toMatch(IMMUTABLE_COPY);
      // Los campos de cancelación sí se escriben (la cancelación es una transición legítima).
      expect(cancel).toBeNull();
    }));

  it('[TC-M08-303][RN-021][AP-2] versiones de precio y política: solo se cierran una vez; sin DELETE, TRUNCATE ni cambios', () =>
    withIsolatedRollback(async () => {
      await run(UP_A);
      const admin = await createAdminActor(identityUseCases());
      expectVersionedConfigGuarded(await versionedConfigOutcomes(admin.userProfileId));
    }));

  it('[TC-M08-304][CC-4][RN-141] tras M-1, el código actual de M08 sigue funcionando y un pago tardío no reactiva la cita', () =>
    withIsolatedRollback(async () => {
      await run(UP_A);
      const clock = new FixedClock(new Date());
      const uc = appointmentsUseCases(clock);
      const day = addLocalDays(localDateString(clock.now()), 2);
      const admin = await createAdminActor(identityUseCases());
      await uc.prices.publish(admin, '200.00', 'initial_setup').catch(() => undefined);
      await uc.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup').catch(() => undefined);
      const d = await operatingDoctor(uc, admin);
      const p = await bookablePatient(admin);
      const q = await bookablePatient(admin);
      const ok = await uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt: await firstSlot(uc, d.doctorProfileId, day, 0), reason: 'x' });
      expect(await uc.confirmation.confirmPaid(ok.id, 'pay-m1', '200.00')).toEqual({ result: 'confirmed' });
      expect((await uc.cancelPatient.execute(p, ok.id)).status).toBe('canceled');
      const late = await uc.hold.execute(q, { doctorProfileId: d.doctorProfileId, startsAt: await firstSlot(uc, d.doctorProfileId, day, 1), reason: 'x' });
      clock.advanceMinutes(6);
      expect(await uc.confirmation.confirmPaid(late.id, 'pay-late', '200.00')).toEqual({ result: 'not_confirmable', reason: 'expired' });
      // Igual que TC-M08-221 sobre C2 con 0013 persistente: la BD también lo impide.
      expect(message(await attempt(`update appointment set status = 'confirmed' where id = '${late.id}'`))).toMatch(/expired → confirmed/);
      expect(message(await attempt(`update appointment set status = 'pending_payment' where id = '${late.id}'`))).toMatch(/no permitida/);
    }));

  it('[TC-M08-305][M-1] reversión de 0013: esquema idéntico a 0000–0012 y sin pérdida de citas ni historial', () =>
    withIsolatedRollback(async () => {
      const original = await fingerprint(tx());
      await run(UP_A);
      const f = await rawFixtures();
      for (const s of ['pending_payment', 'confirmed', 'canceled', 'no_show_both'] as const) await insertAppointment(f, s);
      const snapshot = async () => (await tx().execute<{ id: string; status: string }>(sql`select id, status::text as status from appointment order by id`)).rows;
      const history = async () => Number((await tx().execute<{ n: string }>(sql`select count(*) as n from appointment_status_history`)).rows[0].n);
      const rowsBefore = await snapshot();
      const historyBefore = await history();
      await run(DOWN_A);
      expect(await fingerprint(tx())).toEqual(original);
      expect(await snapshot()).toEqual(rowsBefore);
      expect(await history()).toBe(historyBefore);
      // Vuelve el comportamiento de 0001 (H-1 reaparece): prueba de que la reversión es exacta.
      const expiredId = await tx().execute<{ id: string }>(sql`
        insert into appointment (patient_id, doctor_id, type, status, scheduled_at, reason, price, cancellation_policy_id)
        values (${f.patientId}, ${f.doctorId}, 'scheduled', 'expired', now() + interval '320 days', 'm08-m1-sintetico', 200.00, ${f.policyId}) returning id`);
      expect(await attempt(`update appointment set status = 'confirmed' where id = '${expiredId.rows[0].id}'`)).toBeNull();
    }));

  it('[TC-M08-306][M-1] la reversión se niega si hay citas rescheduled (el enum no puede perder datos)', () =>
    withIsolatedRollback(async () => {
      await run(UP_A);
      const f = await rawFixtures();
      const id = await insertAppointment(f, 'confirmed');
      await run(`update appointment set status = 'rescheduled' where id = '${id}'`);
      expect(message(await attempt(DOWN_A))).toMatch(/hay citas o historial en rescheduled/);
      const { rows } = await tx().execute<{ status: string }>(sql`select status::text as status from appointment where id = ${id}`);
      expect(rows[0].status).toBe('rescheduled');
    }));

});
