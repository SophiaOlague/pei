import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { createPatient, identityUseCases, publishLegalDocument } from '../support/identity-integration';
import { attempt, DOWN_A, file, fingerprint, hasM1PartA, message, rawFixtures, run, tx, UP_A, withIsolatedRollback, type RawFixtures } from '../support/m08-m1-sql';
import type { LegalDocumentType } from '../../src/modules/identity/domain/legal-requirements';

// Salvaguarda de destino: solo contra una rama de pruebas mediante C2.
assertC2BranchTarget();

// M-1 parte B (0014; AP-26: las dos aceptaciones legales de la cita, privacidad y términos; depende de M02): NO
// AUTORIZADA. Este spec aplica 0014 (dentro de una transacción revertida), así que queda BLOQUEADO hasta que se autorice
// expresamente: exige M08_PART_B_AUTHORIZED=0014, una variable que el lanzador C2 no transmite (entorno de lista
// blanca). Ningún otro spec lee los archivos de 0014. Como el spec de migración, requiere un esquema 0000–0012 (rama
// aislada).
if (process.env.M08_PART_B_AUTHORIZED !== '0014') {
  throw new Error('m08-m1-part-b aplica 0014, que no está autorizada: el spec no se ejecuta (falta M08_PART_B_AUTHORIZED=0014).');
}

const UP_B = file('0014_m08_m1_legal_acceptance.up.sql');
const DOWN_B = file('0014_m08_m1_legal_acceptance.down.sql');

// md5 de la definición vigente de gst_appointment_guard (pg_get_functiondef).
async function guardMd5(): Promise<string> {
  const { rows } = await tx().execute<{ h: string }>(sql`select md5(pg_get_functiondef('gst_appointment_guard'::regproc)) as h`);
  return rows[0].h;
}

// Documento sintético publicado `secondsAgo` segundos antes de now() (único por tipo y published_at) y su aceptación.
async function acceptance(userProfileId: string, type: LegalDocumentType, secondsAgo = 2): Promise<string> {
  const documentId = await publishLegalDocument(type, sql`now() - make_interval(secs => ${secondsAgo})`);
  const { rows } = await tx().execute<{ id: string }>(sql`
    insert into user_legal_acceptance (user_profile_id, legal_document_id) values (${userProfileId}, ${documentId}) returning id`);
  return rows[0].id;
}

async function patientUserProfileId(f: RawFixtures): Promise<string> {
  const { rows } = await tx().execute<{ id: string }>(sql`select user_profile_id as id from patient_profile where id = ${f.patientId}`);
  return rows[0].id;
}

let slot = 0;
// Cita confirmada con las dos referencias (o nulas) insertadas por SQL directo, en un horario propio.
async function insertWithAcceptances(f: RawFixtures, privacyId: string | null, termsId: string | null) {
  slot++;
  const { rows } = await tx().execute<{ id: string }>(sql`
    insert into appointment (patient_id, doctor_id, type, status, scheduled_at, reason, price, cancellation_policy_id, agenda_block_ends_at,
                             privacy_legal_acceptance_id, terms_legal_acceptance_id)
    values (${f.patientId}, ${f.doctorId}, 'scheduled', 'confirmed', now() + make_interval(days => 500, mins => ${slot * 30}),
            'm08-m1-parte-b', 200.00, ${f.policyId}, now() + make_interval(days => 500, mins => ${slot * 30 + 30}),
            ${privacyId}, ${termsId}) returning id`);
  return rows[0].id;
}

// Igual que insertWithAcceptances, pero dentro de un SAVEPOINT: devuelve el error (o null) sin abortar la transacción.
const tryInsert = (f: RawFixtures, privacyId: string | null, termsId: string | null) =>
  attempt(`insert into appointment (patient_id, doctor_id, type, status, scheduled_at, reason, price, cancellation_policy_id, agenda_block_ends_at,
                                    privacy_legal_acceptance_id, terms_legal_acceptance_id)
           values ('${f.patientId}', '${f.doctorId}', 'scheduled', 'confirmed', now() + make_interval(days => 600, mins => ${++slot * 30}),
                   'm08-m1-parte-b', 200.00, '${f.policyId}', now() + make_interval(days => 600, mins => ${slot * 30 + 30}),
                   ${privacyId === null ? 'null' : `'${privacyId}'`}, ${termsId === null ? 'null' : `'${termsId}'`})`);

// 0013 y 0014 aplicadas y los fixtures mínimos, todo dentro de una transacción revertida con conexión propia.
function withPartB<T>(work: (f: RawFixtures, patient: string) => Promise<T>): Promise<T> {
  return withIsolatedRollback(async () => {
    await run(UP_A);
    await run(UP_B);
    const f = await rawFixtures();
    return work(f, await patientUserProfileId(f));
  });
}

describe('M-1 de M08, parte B (0014, AP-26), desde 0000–0012 (rama aislada, revertida)', () => {
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

  it('[TC-M08-307][C-32][AP-26] 0014 requiere 0013 y no se aplica dos veces', () =>
    withIsolatedRollback(async () => {
      expect(message(await attempt(UP_B))).toMatch(/requiere 0013/);
      await run(UP_A);
      await run(UP_B);
      expect(message(await attempt(UP_B))).toMatch(/ya está aplicada/);
    }));

  it('[TC-M08-307][AP-26] las dos referencias o ninguna; se admiten el régimen actual y el anterior', () =>
    withPartB(async (f, patient) => {
      const current = { privacy: await acceptance(patient, 'privacy_policy'), terms: await acceptance(patient, 'patient_terms') };
      const legacy = { privacy: await acceptance(patient, 'privacy_notice'), terms: await acceptance(patient, 'terms_and_conditions') };
      expect(await tryInsert(f, current.privacy, current.terms)).toBeNull();
      expect(await tryInsert(f, legacy.privacy, legacy.terms)).toBeNull();
      expect(await tryInsert(f, null, null)).toBeNull();
      expect(message(await tryInsert(f, current.privacy, null))).toMatch(/appointment_legal_acceptances_chk/);
      expect(message(await tryInsert(f, null, current.terms))).toMatch(/appointment_legal_acceptances_chk/);
    }));

  it('[TC-M08-307][AP-26] rechaza aceptaciones de otro paciente, de un tipo incorrecto o de regímenes distintos', () =>
    withPartB(async (f, patient) => {
      const mine = { privacy: await acceptance(patient, 'privacy_policy', 3), terms: await acceptance(patient, 'patient_terms', 3) };
      const other = (await createPatient(identityUseCases())).userProfileId!;
      const othersTerms = await acceptance(other, 'patient_terms', 2);
      expect(message(await tryInsert(f, mine.privacy, othersTerms))).toMatch(/no pertenecen a su paciente/);
      expect(message(await tryInsert(f, mine.terms, mine.privacy))).toMatch(/no es de un aviso o una política de privacidad/);
      const legacyTerms = await acceptance(patient, 'terms_and_conditions', 2);
      expect(message(await tryInsert(f, mine.privacy, legacyTerms))).toMatch(/regímenes distintos/);
    }));

  it('[TC-M08-307][AP-26] las dos referencias son inmutables desde el INSERT, también de NULL a un valor', () =>
    withPartB(async (f, patient) => {
      const privacy = await acceptance(patient, 'privacy_policy', 3);
      const terms = await acceptance(patient, 'patient_terms', 3);
      const otherPrivacy = await acceptance(patient, 'privacy_policy', 2);
      const withRefs = await insertWithAcceptances(f, privacy, terms);
      const withoutRefs = await insertWithAcceptances(f, null, null);
      const immutable = /no pueden cambiar después de reservar/;
      expect(message(await attempt(`update appointment set privacy_legal_acceptance_id = '${otherPrivacy}' where id = '${withRefs}'`))).toMatch(immutable);
      expect(message(await attempt(`update appointment set privacy_legal_acceptance_id = null, terms_legal_acceptance_id = null where id = '${withRefs}'`))).toMatch(immutable);
      expect(message(await attempt(`update appointment set privacy_legal_acceptance_id = '${privacy}', terms_legal_acceptance_id = '${terms}' where id = '${withoutRefs}'`))).toMatch(immutable);
      // Las transiciones legítimas siguen permitidas con las referencias intactas.
      expect(await attempt(`update appointment set status = 'completed' where id = '${withRefs}'`)).toBeNull();
    }));

  it('[TC-M08-307][AP-26] 0013 down se niega con 0014 aplicada; 0014 down restaura el guard exacto de 0013 (md5)', () =>
    withIsolatedRollback(async () => {
      const original = await fingerprint(tx());
      await run(UP_A);
      const afterA = await fingerprint(tx());
      const guardOf0013 = await guardMd5();
      await run(UP_B);
      expect(await guardMd5()).not.toBe(guardOf0013);
      expect(message(await attempt(DOWN_A))).toMatch(/Revierta primero 0014/);
      await run(DOWN_B);
      expect(await guardMd5()).toBe(guardOf0013);
      expect(await fingerprint(tx())).toEqual(afterA);
      expect(message(await attempt(DOWN_B))).toMatch(/0014 no está aplicada/);
      await run(DOWN_A);
      expect(await fingerprint(tx())).toEqual(original);
    }));
});
