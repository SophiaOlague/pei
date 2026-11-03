import { rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { sql } from 'drizzle-orm';
import { main } from '../../src/cli/legal-publish';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import { db } from '../../src/db';
import { PublishLegalDocumentsUseCase } from '../../src/modules/identity/application/use-cases/legal-documents.use-cases';
import { DrizzleDatabaseTargetReader } from '../../src/modules/identity/infrastructure/persistence/drizzle-database-target.reader';
import { DrizzleLegalDocumentRepository } from '../../src/modules/identity/infrastructure/persistence/drizzle-legal-document.repository';
import { InvalidLegalPublicationError } from '../../src/modules/identity/domain/identity.errors';
import { createPublicationConfirmation, CONFIRMATION_TTL_SECONDS } from '../../src/modules/identity/domain/legal-publication';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { captureError } from '../support/with-rollback';
import { identityUseCases } from '../support/identity-integration';

// Publicación legal con transacciones REALES y datos CONFIRMADOS: legal_document es de solo inserción y estos datos NO se
// pueden limpiar. Solo se ejecuta mediante C2 en una rama de Neon DESECHABLE (nunca `production`, `rama` ni una rama
// conservada) y fuera de la suite de integración (test/jest-concurrency.json).
const target = assertC2BranchTarget();
if (process.env.C2_COMMITTED_FIXTURES !== 'disposable-branch') {
  throw new Error('legal-publication.conc-spec confirma datos: solo contra una rama desechable autorizada (C2_COMMITTED_FIXTURES=disposable-branch)');
}

const { publishLegal } = identityUseCases();
const declaredTarget = { branch: target.branch, endpoint: target.endpoint };
const documentCount = async () => {
  const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from legal_document`);
  return rows[0].n;
};
// Cada prueba usa una fecha más lejana: published_at debe crecer por tipo.
let hours = 24 * 365;
const request = (content = 'Texto sintético de prueba') => {
  const version = `gst-m03-conc-${Math.floor(Math.random() * 1e9)}`;
  hours += 24;
  return {
    audience: 'doctor' as const,
    documents: [{ type: 'privacy_policy' as const, version, content }, { type: 'doctor_terms' as const, version, content }],
    publishedAt: new Date(Date.now() + hours * 3_600_000),
    declaredTarget,
  };
};
const authorizations = { acceptRegimeTransition: true };

describe('Publicación legal con transacciones reales (rama desechable)', () => {
  it('[TC-M03-268] la identidad se lee fuera de una transacción desde el adaptador real', async () => {
    const { plan } = await publishLegal.simulate(request());
    expect(plan.target).toMatchObject({ kind: 'development', ...declaredTarget, project: expect.any(String) });
  });

  it('[TC-M03-269] dos conexiones simultáneas: una publica y la otra se rechaza sin escribir', async () => {
    const [first, second] = [request(), request()];
    const confirmations = await Promise.all([publishLegal.simulate(first), publishLegal.simulate(second)]);
    const before = await documentCount();
    const results = await Promise.allSettled([
      publishLegal.execute({ ...first, confirmation: confirmations[0].confirmation, authorizations }),
      publishLegal.execute({ ...second, confirmation: confirmations[1].confirmation, authorizations }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(InvalidLegalPublicationError);
    expect(await documentCount()).toBe(before + 2);
  });

  it('[TC-M03-270] si falla la auditoría, ROLLBACK real sin documentos', async () => {
    const req = request();
    const { confirmation } = await publishLegal.simulate(req);
    const before = await documentCount();
    const failing = new PublishLegalDocumentsUseCase(new DrizzleUnitOfWork(), { record: async () => { throw new Error('fallo simulado de auditoría'); } } as never, new DrizzleLegalDocumentRepository(), new DrizzleDatabaseTargetReader());
    await expect(failing.execute({ ...req, confirmation, authorizations })).rejects.toThrow('fallo simulado');
    expect(await documentCount()).toBe(before);
  });

  it('[TC-M03-271] una confirmación caducada se rechaza con el reloj real de la BD', async () => {
    const req = request();
    const { plan } = await publishLegal.simulate(req);
    const confirmation = createPublicationConfirmation(plan, new Date(Date.now() - (CONFIRMATION_TTL_SECONDS + 60) * 1000));
    const error = await captureError(publishLegal.execute({ ...req, confirmation, authorizations }));
    expect((error as Error).message).toContain('caducó');
  });

  it('[TC-M03-272] main() simula y publica, y la confirmación no se puede repetir', async () => {
    const file = join(tmpdir(), `gst-m03-${process.pid}.md`);
    writeFileSync(file, 'Texto sintético de prueba');
    const log = jest.spyOn(console, 'log').mockImplementation();
    const end = jest.spyOn(db.$client, 'end').mockResolvedValue(undefined as never);
    try {
      const version = `gst-m03-main-${Math.floor(Math.random() * 1e9)}`;
      hours += 24;
      const args = [
        '--audience', 'doctor', '--doc', `doctor_terms@${version}=${file}`, '--doc', `privacy_policy@${version}=${file}`, '--target-branch', target.branch, '--target-endpoint', target.endpoint,
        '--published-at', new Date(Date.now() + hours * 3_600_000).toISOString(),
      ];
      await expect(main([...args, '--dry-run'])).resolves.toBe(0);
      const output = log.mock.calls.flat().join('\n');
      const token = /Confirmación: (\S+)/.exec(output)![1];
      const before = await documentCount();
      await expect(main([...args, '--confirm', token, '--accept-regime-transition'])).resolves.toBe(0);
      expect(await documentCount()).toBe(before + 2);
      await expect(main([...args, '--confirm', token, '--accept-regime-transition'])).rejects.toBeInstanceOf(InvalidLegalPublicationError);
    } finally {
      log.mockRestore();
      end.mockRestore();
      rmSync(file, { force: true });
    }
  });
});

afterAll(async () => {
  await db.$client.end();
});
