import { sql } from 'drizzle-orm';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import { DrizzleLegalDocumentRepository } from '../../src/modules/identity/infrastructure/persistence/drizzle-legal-document.repository';
import { DrizzleDatabaseTargetReader } from '../../src/modules/identity/infrastructure/persistence/drizzle-database-target.reader';
import { PublishLegalDocumentsUseCase } from '../../src/modules/identity/application/use-cases/legal-documents.use-cases';
import { DrizzleAuditTrail } from '../../src/modules/audit/infrastructure/drizzle-audit-trail';
import { InvalidLegalPublicationError } from '../../src/modules/identity/domain/identity.errors';
import { getDbContext } from '../../src/db/transaction-context';
import { captureError, withRollback } from '../support/with-rollback';
import { assertC2BranchTarget } from '../support/c2-target-guard';

// Salvaguarda de destino: solo contra una rama temporal mediante C2. Todo dentro de withRollback.
assertC2BranchTarget();
const target = assertC2BranchTarget();

// Publicación legal con adaptadores reales: identidad por pg_settings, hora de la BD y candado. Se ejecuta sin depender de
// lo que ya esté publicado en la rama: usa fechas futuras y versiones únicas.
const useCase = (audit = new DrizzleAuditTrail()) =>
  new PublishLegalDocumentsUseCase(new DrizzleUnitOfWork(), audit, new DrizzleLegalDocumentRepository(), new DrizzleDatabaseTargetReader());

const count = async (table: 'legal_document' | 'audit_log' | 'user_legal_acceptance') => {
  const { rows } = await getDbContext().execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)}`);
  return rows[0].n;
};

const version = () => `gst-m03-pub-${Math.floor(Math.random() * 1e9)}`;
const request = (v = version(), content = 'Texto sintético de prueba') => ({
  audience: 'doctor' as const,
  documents: [{ type: 'privacy_policy' as const, version: v, content }, { type: 'doctor_terms' as const, version: v, content }],
  publishedAt: new Date(Date.now() + 3_600_000),
  declaredTarget: { branch: target.branch, endpoint: target.endpoint },
});
const authorized = { acceptRegimeTransition: true };

describe('Publicación legal segura contra PostgreSQL (rollback)', () => {
  it('[TC-M03-244] la simulación identifica la rama y no escribe nada', () =>
    withRollback(async () => {
      const before = [await count('legal_document'), await count('audit_log'), await count('user_legal_acceptance')];
      const { plan, confirmation } = await useCase().simulate(request());
      expect(plan.target).toMatchObject({ kind: 'development', branch: target.branch, endpoint: target.endpoint });
      expect(confirmation).toMatch(/^\d+\.[0-9a-f]{64}$/);
      expect([await count('legal_document'), await count('audit_log'), await count('user_legal_acceptance')]).toEqual(before);
    }));

  it('[TC-M03-245] publica con confirmación válida: un evento con impacto por documento y ninguna aceptación', () =>
    withRollback(async () => {
      const req = request();
      const { confirmation } = await useCase().simulate(req);
      const acceptances = await count('user_legal_acceptance');
      const { published } = await useCase().execute({ ...req, confirmation, authorizations: authorized });
      expect(published).toHaveLength(2);
      const { rows } = await getDbContext().execute<{ metadata: Record<string, unknown> }>(sql`
        select metadata from audit_log where action = 'identity.legal_document.published'
         and entity_id in (${sql.join(published.map((d) => sql`${d.id}::uuid`), sql`, `)})`);
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((row) => row.metadata.publicationId)).size).toBe(1);
      for (const { metadata } of rows) {
        expect(metadata).toMatchObject({
          result: 'published', audience: 'doctor', targetKind: 'development', neonBranch: target.branch, neonEndpoint: target.endpoint, impactScope: 'operation_total',
          authorizationsUsed: expect.any(Array), patientProfilesPotentiallyAffected: expect.any(Number), doctorProfilesPotentiallyAffected: expect.any(Number),
        });
      }
      expect(await count('user_legal_acceptance')).toBe(acceptances);
    }));

  it('[TC-M03-246] un contenido distinto del simulado se rechaza sin escribir', () =>
    withRollback(async () => {
      const req = request();
      const { confirmation } = await useCase().simulate(req);
      const before = await count('legal_document');
      const changed = { ...req, documents: req.documents.map((d) => ({ ...d, content: 'Otro texto' })) };
      const error = await captureError(useCase().execute({ ...changed, confirmation, authorizations: authorized }));
      expect(error).toBeInstanceOf(InvalidLegalPublicationError);
      expect(await count('legal_document')).toBe(before);
    }));

  it('[TC-M03-247] rechaza un destino declarado distinto del conectado', () =>
    withRollback(async () => {
      const error = await captureError(useCase().simulate({ ...request(), declaredTarget: { branch: 'br-otra-rama', endpoint: target.endpoint } }));
      expect(error).toBeInstanceOf(InvalidLegalPublicationError);
    }));

  it('[TC-M03-248] si la auditoría falla, la publicación se revierte por completo', () =>
    withRollback(async () => {
      const req = request();
      const { confirmation } = await useCase().simulate(req);
      const before = await count('legal_document');
      const failing = { record: async () => { throw new Error('fallo simulado de auditoría'); } };
      await expect(useCase(failing as never).execute({ ...req, confirmation, authorizations: authorized })).rejects.toThrow('fallo simulado');
      expect(await count('legal_document')).toBe(before);
    }));
});
