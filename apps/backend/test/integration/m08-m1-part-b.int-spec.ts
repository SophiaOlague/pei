import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { attempt, DOWN_A, file, fingerprint, hasM1PartA, insertAppointment, message, rawFixtures, run, tx, UP_A, withIsolatedRollback } from '../support/m08-m1-sql';

// Salvaguarda de destino: solo contra una rama de pruebas mediante C2.
assertC2BranchTarget();

// M-1 parte B (0014, legal_acceptance_id, depende de M02): NO AUTORIZADA. Este spec aplica 0014 (dentro de una
// transacción revertida), así que queda BLOQUEADO hasta que se autorice expresamente: exige
// M08_PART_B_AUTHORIZED=0014, una variable que el lanzador C2 no transmite (entorno de lista blanca). Ningún otro spec
// lee los archivos de 0014. Como el spec de migración, requiere un esquema 0000–0012 (rama aislada).
if (process.env.M08_PART_B_AUTHORIZED !== '0014') {
  throw new Error('m08-m1-part-b aplica 0014, que no está autorizada: el spec no se ejecuta (falta M08_PART_B_AUTHORIZED=0014).');
}

const UP_B = file('0014_m08_m1_legal_acceptance.up.sql');
const DOWN_B = file('0014_m08_m1_legal_acceptance.down.sql');

describe('M-1 de M08, parte B (0014), desde 0000–0012 (rama aislada, revertida)', () => {
  let before: unknown;

  beforeAll(async () => {
    if (await hasM1PartA()) throw new Error('m08-m1-part-b exige un esquema 0000–0012 (sin 0013): ejecútelo en una rama aislada creada antes de 0013.');
    before = await fingerprint();
  });

  afterAll(async () => {
    try {
      if (before !== undefined) expect(await fingerprint()).toEqual(before);
    } finally {
      await db.$client.end();
    }
  });

  it('[TC-M08-307][C-32][M-1] parte B (M02): requiere 0013, se revierte en orden y su referencia es inmutable', () =>
    withIsolatedRollback(async () => {
      const original = await fingerprint(tx());
      expect(message(await attempt(UP_B))).toMatch(/requiere 0013/);
      await run(UP_A);
      await run(UP_B);
      const f = await rawFixtures();
      const id = await insertAppointment(f, 'confirmed');
      const { rows: acc } = await tx().execute<{ id: string }>(sql`
        select ula.id from user_legal_acceptance ula join doctor_profile d on d.user_profile_id = ula.user_profile_id where d.id = ${f.doctorId} limit 1`);
      await run(`update appointment set legal_acceptance_id = '${acc[0].id}' where id = '${id}'`);
      expect(message(await attempt(`update appointment set legal_acceptance_id = null where id = '${id}'`))).toMatch(/aceptación legal/);
      expect(message(await attempt(DOWN_A))).toMatch(/Revierta primero 0014/);
      await run(DOWN_B);
      await run(DOWN_A);
      expect(await fingerprint(tx())).toEqual(original);
    }));
});
