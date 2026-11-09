import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { getDbContext } from '../../src/db/transaction-context';
import type { LegalDocumentType } from '../../src/modules/identity/domain/legal-requirements';
import { DrizzleBookingLegalAcceptanceReader } from '../../src/modules/identity/infrastructure/persistence/drizzle-booking-legal-acceptance.reader';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { withRollback } from '../support/with-rollback';
import { insertUserWithProfile } from '../support/fixtures';
import { countM00Residue, countM02Residue } from '../support/residue';
import { createPatient, identityUseCases, publishLegalDocument } from '../support/identity-integration';

// Salvaguarda de destino: solo contra la rama de pruebas mediante C2.
assertC2BranchTarget();

// AP-26 (M08-diseno A.17.1): el adaptador Drizzle de BOOKING_LEGAL_ACCEPTANCE_READER contra PostgreSQL. Todo dentro de
// withRollback: cada prueba publica sus propios documentos sintéticos (versión = testTag) con published_at poco antes
// del inicio de la transacción, así que son los vigentes solo dentro de ella. No se modifica ningún documento existente
// (legal_document y user_legal_acceptance son de solo inserción) y nada se confirma.

const reader = new DrizzleBookingLegalAcceptanceReader();

// Publica un documento sintético `secondsAgo` segundos antes de now() (legal_document es único por tipo y published_at).
async function publish(type: LegalDocumentType, secondsAgo: number) {
  const id = await publishLegalDocument(type, sql`now() - make_interval(secs => ${secondsAgo})`);
  const { rows } = await getDbContext().execute<{ version: string }>(sql`select version from legal_document where id = ${id}`);
  return { id, version: rows[0].version };
}

async function accept(userProfileId: string, legalDocumentId: string) {
  const { rows } = await getDbContext().execute<{ id: string }>(sql`
    insert into user_legal_acceptance (user_profile_id, legal_document_id) values (${userProfileId}, ${legalDocumentId}) returning id`);
  return rows[0].id;
}

async function patientProfileId() {
  const patient = await createPatient(identityUseCases());
  return patient.userProfileId!;
}

// Tipos con al menos una versión vigente (published_at <= now()) en la transacción actual.
async function currentTypes(): Promise<Set<string>> {
  const { rows } = await getDbContext().execute<{ type: string }>(sql`select distinct type::text as type from legal_document where published_at <= now()`);
  return new Set(rows.map((r) => r.type));
}

describe('Lector de aceptaciones legales para reservas contra PostgreSQL (AP-26, rollback)', () => {
  let m00Before: Record<string, number>;
  let m02Before: Record<string, number>;

  beforeAll(async () => {
    m00Before = await countM00Residue();
    m02Before = await countM02Residue();
  });

  afterAll(async () => {
    try {
      expect(await countM00Residue()).toEqual(m00Before);
      expect(await countM02Residue()).toEqual(m02Before);
    } finally {
      await db.$client.end();
      expect(db.$client.totalCount).toBe(0);
    }
  });

  it('[TC-M02-257][AP-26] régimen actual: devuelve privacy_policy y patient_terms con los ids de sus filas de aceptación', () =>
    withRollback(async () => {
      const userProfileId = await patientProfileId();
      const privacy = await publish('privacy_policy', 2);
      const terms = await publish('patient_terms', 2);
      const privacyAcceptance = await accept(userProfileId, privacy.id);
      const termsAcceptance = await accept(userProfileId, terms.id);
      expect(await reader.currentFor(userProfileId)).toEqual({
        regime: 'current',
        privacy: { acceptanceId: privacyAcceptance, legalDocumentId: privacy.id, type: 'privacy_policy', version: privacy.version },
        terms: { acceptanceId: termsAcceptance, legalDocumentId: terms.id, type: 'patient_terms', version: terms.version },
      });
    }));

  // PENDIENTE DE ENTORNO: el régimen anterior solo rige si la rama NO tiene vigente el régimen actual completo
  // (privacy_policy y patient_terms). Los documentos son de solo inserción: no se pueden retirar ni despublicar, y la
  // rama C2 persistente puede tener ya el régimen actual. Jest no permite omitir una prueba según una lectura de la BD
  // hecha en tiempo de ejecución, así que el caso queda omitido de forma estática (it.skip): Jest lo reporta como
  // «skipped», nunca como aprobado ni como fallido. Para validarlo, en una base desechable o una rama aislada preparada
  // con el régimen anterior, se cambia it.skip por it en una revisión explícita. Su primera aserción comprueba la
  // precondición dentro de la transacción y falla con un mensaje claro si no se cumple, para no dar un resultado falso.
  it.skip('[TC-M02-258][AP-26][PENDIENTE DE ENTORNO] régimen anterior: devuelve privacy_notice y terms_and_conditions', () =>
    withRollback(async () => {
      const types = await currentTypes();
      expect({ privacy_policy: types.has('privacy_policy'), patient_terms: types.has('patient_terms') }).not.toEqual({ privacy_policy: true, patient_terms: true });
      const userProfileId = await patientProfileId();
      const privacy = await publish('privacy_notice', 2);
      const terms = await publish('terms_and_conditions', 2);
      const privacyAcceptance = await accept(userProfileId, privacy.id);
      const termsAcceptance = await accept(userProfileId, terms.id);
      expect(await reader.currentFor(userProfileId)).toEqual({
        regime: 'legacy',
        privacy: { acceptanceId: privacyAcceptance, legalDocumentId: privacy.id, type: 'privacy_notice', version: privacy.version },
        terms: { acceptanceId: termsAcceptance, legalDocumentId: terms.id, type: 'terms_and_conditions', version: terms.version },
      });
    }));

  it('[TC-M02-259][AP-26] falta una aceptación del régimen vigente: null', () =>
    withRollback(async () => {
      const userProfileId = await patientProfileId();
      const privacy = await publish('privacy_policy', 2);
      await publish('patient_terms', 2);
      await accept(userProfileId, privacy.id);
      expect(await reader.currentFor(userProfileId)).toBeNull();
    }));

  it('[TC-M02-260][AP-26] se publica una versión nueva que el paciente no aceptó: null', () =>
    withRollback(async () => {
      const userProfileId = await patientProfileId();
      const privacy = await publish('privacy_policy', 3);
      const terms = await publish('patient_terms', 3);
      await accept(userProfileId, privacy.id);
      await accept(userProfileId, terms.id);
      expect(await reader.currentFor(userProfileId)).not.toBeNull();
      await publish('patient_terms', 1);
      expect(await reader.currentFor(userProfileId)).toBeNull();
    }));

  it('[TC-M02-261][AP-26] perfil inexistente o que no es de paciente: null', () =>
    withRollback(async (tx) => {
      expect(await reader.currentFor(randomUUID())).toBeNull();
      const { profile } = await insertUserWithProfile(tx, 'doctor');
      const privacy = await publish('privacy_policy', 2);
      const terms = await publish('patient_terms', 2);
      await accept(profile.id, privacy.id);
      await accept(profile.id, terms.id);
      expect(await reader.currentFor(profile.id)).toBeNull();
    }));
});
