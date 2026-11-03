import { sql } from 'drizzle-orm';
import { transactionStorage } from '../../src/db/transaction-context';
import type { Actor } from '../../src/common/application/actor';
import { computeRegistrationStatus } from '../../src/modules/identity/domain/registration-status';
import {
  InvalidLegalPublicationError,
  LegalDocumentNotCurrentError,
  LegalDocumentNotRequiredForRoleError,
  LegalDocumentsNotPublishedError,
} from '../../src/modules/identity/domain/identity.errors';
import { evaluateLegalAcceptance } from '../../src/modules/identity/domain/legal-requirements';
import { captureError, withRollback, type Tx } from '../support/with-rollback';
import { insertUserWithProfile } from '../support/fixtures';
import { countM00Residue, countM02Residue } from '../support/residue';
import { auditRows, createPatient, identityUseCases, publishLegalDocument } from '../support/identity-integration';
import { assertC2BranchTarget } from '../support/c2-target-guard';

// Salvaguarda de destino: solo contra la rama temporal mediante C2. Ejecutado de otra forma, src/db usaría el
// DATABASE_URL del .env (rama `production`): falla al cargar el módulo, antes de cualquier consulta.
assertC2BranchTarget();

// M03 A2: documentos legales por rol contra la BD de PEI (plan v2 §6.5). Todo se revierte con withRollback.
// REQUIERE 0006_m02_legal_document_types_by_role aplicada: publica privacy_policy, patient_terms y doctor_terms
// dentro de la transacción de prueba (un valor nuevo de enum no se puede usar en la transacción que lo agrega).
// Los documentos históricos v1 de la BD no se modifican: cada prueba publica sus propias versiones sintéticas.

const db = () => transactionStorage.getStore()!;

async function legacyAcceptedPatient(useCases: ReturnType<typeof identityUseCases>) {
  const patient = await createPatient(useCases);
  const privacy = await publishLegalDocument('privacy_notice', sql`now() - interval '2 seconds'`);
  const terms = await publishLegalDocument('terms_and_conditions', sql`now() - interval '2 seconds'`);
  await useCases.acceptLegal.execute(patient, [privacy, terms]);
  return { patient, privacy, terms };
}

async function doctorActor(tx: Tx): Promise<Actor> {
  const { user, profile } = await insertUserWithProfile(tx, 'doctor');
  return { userId: user.id, userProfileId: profile.id, role: 'doctor', ipAddress: '203.0.113.9', userAgent: 'PEI-M03-int' };
}

describe('Documentos legales por rol (M03 A2, BD de desarrollo con rollback)', () => {
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

  it('[TC-M03-040][N1] sin documentos nuevos, el paciente con legado aceptado sigue completo y el médico no tiene régimen', () =>
    withRollback(async (tx) => {
      const useCases = identityUseCases();
      const { patient } = await legacyAcceptedPatient(useCases);
      expect(computeRegistrationStatus(await useCases.reader.read(patient.userId)).legal).toEqual({ accepted: true, pending: [] });

      const doctor = await doctorActor(tx);
      const snapshot = await useCases.reader.read(doctor.userId);
      expect(evaluateLegalAcceptance('doctor', snapshot.currentLegalDocuments)).toEqual({ accepted: false, pending: [] });
      expect(await captureError(useCases.acceptLegal.execute(doctor, []))).toBeInstanceOf(LegalDocumentsNotPublishedError);
    }));

  it('[TC-M03-041][N1][RF-04] al publicar privacy_policy + patient_terms, el paciente pasa a missing legal; al aceptar vuelve a completo; v1 intacto', () =>
    withRollback(async () => {
      const useCases = identityUseCases();
      const { patient, privacy, terms } = await legacyAcceptedPatient(useCases);
      const policy = await publishLegalDocument('privacy_policy', sql`now() - interval '1 second'`);
      const patientTerms = await publishLegalDocument('patient_terms', sql`now() - interval '1 second'`);

      const after = computeRegistrationStatus(await useCases.reader.read(patient.userId));
      expect(after.legal.accepted).toBe(false);
      expect(after.legal.pending.map((d) => d.documentId).sort()).toEqual([policy, patientTerms].sort());
      expect(after.missing).toContain('legal');

      expect(await captureError(useCases.acceptLegal.execute(patient, [privacy]))).toBeInstanceOf(LegalDocumentNotCurrentError);
      await useCases.acceptLegal.execute(patient, [policy, patientTerms]);
      expect(computeRegistrationStatus(await useCases.reader.read(patient.userId)).legal).toEqual({ accepted: true, pending: [] });

      const { rows } = await db().execute<{ legal_document_id: string }>(
        sql`select legal_document_id from user_legal_acceptance where user_profile_id = ${patient.userProfileId} order by accepted_at, legal_document_id`,
      );
      expect(rows.map((r) => r.legal_document_id).sort()).toEqual([privacy, terms, policy, patientTerms].sort());
    }));

  it('[TC-M03-042][N1] una publicación parcial (solo privacy_policy) o futura no cambia los requisitos del paciente', () =>
    withRollback(async () => {
      const useCases = identityUseCases();
      const { patient } = await legacyAcceptedPatient(useCases);
      await publishLegalDocument('privacy_policy', sql`now() - interval '1 second'`);
      expect(computeRegistrationStatus(await useCases.reader.read(patient.userId)).legal.accepted).toBe(true);

      await publishLegalDocument('patient_terms', sql`now() + interval '1 hour'`);
      expect(computeRegistrationStatus(await useCases.reader.read(patient.userId)).legal.accepted).toBe(true);
    }));

  it('[TC-M03-043][D-32][R-8] el médico acepta privacy_policy + doctor_terms y cada aceptación queda en audit_log', () =>
    withRollback(async (tx) => {
      const useCases = identityUseCases();
      const policy = await publishLegalDocument('privacy_policy', sql`now() - interval '1 second'`);
      const doctorTerms = await publishLegalDocument('doctor_terms', sql`now() - interval '1 second'`);
      const patientTerms = await publishLegalDocument('patient_terms', sql`now() - interval '1 second'`);
      const doctor = await doctorActor(tx);

      expect(await captureError(useCases.acceptLegal.execute(doctor, [patientTerms]))).toBeInstanceOf(LegalDocumentNotRequiredForRoleError);
      await useCases.acceptLegal.execute(doctor, [policy, doctorTerms]);
      const snapshot = await useCases.reader.read(doctor.userId);
      expect(evaluateLegalAcceptance('doctor', snapshot.currentLegalDocuments)).toEqual({ accepted: true, pending: [] });

      for (const id of [policy, doctorTerms]) {
        expect(await auditRows(id)).toEqual([
          expect.objectContaining({ action: 'identity.legal_document.accepted', actor_type: 'user', actor_user_profile_id: doctor.userProfileId }),
        ]);
      }
    }));

  // No ejecuta el CLI legal:publish (que abre su propia conexión y confirma): prueba su núcleo,
  // PublishLegalDocumentsUseCase, con DrizzleUnitOfWork dentro de withRollback. La UoW abre un SAVEPOINT en la
  // transacción de la prueba y los repositorios usan esa misma transacción; al final, ROLLBACK.
  it('[TC-M03-044][N1][R-8] PublishLegalDocumentsUseCase (núcleo de legal:publish): mismo published_at, content_hash y evento de sistema; rechaza el legado', () =>
    withRollback(async () => {
      const useCases = identityUseCases();
      const { branch, endpoint } = assertC2BranchTarget();
      const request = {
        audience: 'patient' as const,
        documents: [
          { type: 'privacy_policy' as const, version: 'gst-m03-test-1', content: 'Texto sintético de prueba M03 (aviso)' },
          { type: 'patient_terms' as const, version: 'gst-m03-test-1', content: 'Texto sintético de prueba M03 (términos)' },
        ],
        publishedAt: new Date(Date.now() + 3_600_000),
        declaredTarget: { branch, endpoint },
      };
      const { confirmation } = await useCases.publishLegal.simulate(request);
      const { published } = await useCases.publishLegal.execute({ ...request, confirmation, authorizations: { acceptRegimeTransition: true } });
      expect(new Set(published.map((d) => d.publishedAt.getTime())).size).toBe(1);
      const { rows } = await db().execute<{ content_hash: string | null }>(
        sql`select content_hash from legal_document where id in (${sql.join(published.map((d) => sql`${d.id}`), sql`, `)})`,
      );
      expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.content_hash ?? ''))).toBe(true);
      for (const doc of published) {
        expect(await auditRows(doc.id)).toEqual([expect.objectContaining({ action: 'identity.legal_document.published', actor_type: 'system' })]);
      }

      const legacyAttempt = await captureError(
        useCases.publishLegal.simulate({ ...request, documents: [{ type: 'privacy_notice', version: 'x', content: 'x' }] }),
      );
      expect(legacyAttempt).toBeInstanceOf(InvalidLegalPublicationError);
    }));

  it('[TC-M03-045][R-13][RF-04] una versión nueva de doctor_terms invalida la aceptación anterior del médico', () =>
    withRollback(async (tx) => {
      const useCases = identityUseCases();
      const policy = await publishLegalDocument('privacy_policy', sql`now() - interval '2 seconds'`);
      const terms1 = await publishLegalDocument('doctor_terms', sql`now() - interval '2 seconds'`);
      const doctor = await doctorActor(tx);
      await useCases.acceptLegal.execute(doctor, [policy, terms1]);

      const terms2 = await publishLegalDocument('doctor_terms', sql`now() - interval '1 second'`);
      const status = evaluateLegalAcceptance('doctor', (await useCases.reader.read(doctor.userId)).currentLegalDocuments);
      expect(status.accepted).toBe(false);
      expect(status.pending.map((d) => d.documentId)).toEqual([terms2]);
      await useCases.acceptLegal.execute(doctor, [terms2]);
      expect(evaluateLegalAcceptance('doctor', (await useCases.reader.read(doctor.userId)).currentLegalDocuments).accepted).toBe(true);
    }));
});
