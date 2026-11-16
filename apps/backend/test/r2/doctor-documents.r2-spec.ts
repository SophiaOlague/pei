import { createHash } from 'crypto';
import { db } from '../../src/db';
import { getDbContext } from '../../src/db/transaction-context';
import { sql } from 'drizzle-orm';
import { RegistrationDataConflictError } from '../../src/modules/identity/domain/identity.errors';
import { StoredFileNotFoundError } from '../../src/modules/private-storage/domain/private-storage.errors';
import { loadR2Config, R2PrivateObjectStorage } from '../../src/modules/private-storage/infrastructure/r2-private-object-storage';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { createAdminActor, identityUseCases } from '../support/identity-integration';
import { createDoctor, doctorUseCases, JPEG, PDF } from '../support/doctors-integration';
import { cleanupRunObjects, ManifestStorage, R2RunManifest } from '../support/r2-run';
import { countObjectsUnder } from '../support/r2-verify';
import { withRollback } from '../support/with-rollback';

// Documentos del médico con PostgreSQL Y R2 REALES (C2, modo r2). PostgreSQL va dentro de withRollback; R2 NO se
// revierte: cada prueba borra en su `finally` las claves que subió (manifiesto de la ejecución), aunque falle una
// aserción. Los médicos son sintéticos y sus doctorProfileId se registran en el manifiesto antes de cualquier subida.
// Excluye la CLI de conciliación global (recorre INE de toda la rama y modificaría registros preexistentes).
assertC2BranchTarget();
const config = loadR2Config(process.env)!;
const manifest = new R2RunManifest(process.env.C2_RUN_ID!);
const r2 = new R2PrivateObjectStorage(config);
const storage = new ManifestStorage(r2, manifest);
const uc = doctorUseCases(storage);
// Con el lanzador, el manifiesto se crea en exclusiva en el directorio de la ejecución y se actualiza tras cada operación.
if (process.env.C2_EVIDENCE_DIR) manifest.attach(process.env.C2_EVIDENCE_DIR);

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function readR2(key: string): Promise<Buffer> {
  const { stream } = await storage.openForRead(key);
  const parts: Buffer[] = [];
  for await (const chunk of stream) parts.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(parts);
}

// Médico sintético de la ejecución: sus claves pasan a pertenecer al manifiesto antes de subir nada.
async function runDoctor() {
  const d = await createDoctor(uc);
  manifest.allowDoctor(d.doctorProfileId, { origin: 'createDoctor', userId: d.userId });
  return d;
}

// PostgreSQL revertido y, pase lo que pase, limpieza de los objetos de R2 de esta prueba (sin ocultar fallos).
async function withRollbackAndCleanup(work: () => Promise<void>): Promise<void> {
  try {
    await withRollback(work);
  } finally {
    const cleanup = await cleanupRunObjects(r2, manifest);
    expect(cleanup.pending).toEqual([]);
  }
}

describe('Documentos del médico con PostgreSQL y R2 reales (C2)', () => {
  afterAll(async () => {
    try {
      const remaining = await countObjectsUnder(config, manifest.ownerPrefixes());
      manifest.recordFinalCheck(remaining);
      // Sin el lanzador, una sola escritura al final en el directorio temporal (como antes).
      if (!process.env.C2_EVIDENCE_DIR) console.log(`manifiesto R2: ${manifest.write(undefined, 'doctor-documents')}`);
      expect(manifest.persistenceErrors()).toEqual([]);
      expect(manifest.livingKeys()).toEqual([]);
      expect(Object.values(remaining).every((n) => n === 0)).toBe(true);
    } finally {
      await db.$client.end();
      expect(db.$client.totalCount).toBe(0);
    }
  });

  it('[TC-M03-304] INE y cédula: las claves guardadas en PostgreSQL existen en R2 con los mismos bytes; lectura del admin auditada', () =>
    withRollbackAndCleanup(async () => {
      const admin = await createAdminActor(identityUseCases());
      const d = await runDoctor();
      const ine = await uc.submitIne.execute(d, { front: JPEG, back: JPEG });
      const lic = await uc.submitLicense.execute(d, { licenseNumber: `R2${Date.now() % 1e9}`, document: PDF });
      const { rows } = await getDbContext().execute<{ front: string; back: string; doc: string }>(sql`
        select i.ine_front_object_key as front, i.ine_back_object_key as back, l.document_object_key as doc
          from doctor_identity_verification i, doctor_license_verification l where i.id = ${ine.reviewId} and l.id = ${lic.reviewId}`);
      expect(sha256(await readR2(rows[0].front))).toBe(sha256(JPEG));
      expect(sha256(await readR2(rows[0].back))).toBe(sha256(JPEG));
      expect(sha256(await readR2(rows[0].doc))).toBe(sha256(PDF));
      const opened = await uc.documents.license(admin, lic.reviewId);
      expect(opened.contentType).toBe('application/pdf');
      opened.stream.resume();
    }));

  it('[TC-M03-305] aprobar la INE la purga de R2 (frente y reverso) y conserva la cédula', () =>
    withRollbackAndCleanup(async () => {
      const admin = await createAdminActor(identityUseCases());
      const d = await runDoctor();
      const ine = await uc.submitIne.execute(d, { front: JPEG, back: JPEG });
      const lic = await uc.submitLicense.execute(d, { licenseNumber: `R2${Date.now() % 1e9}`, document: PDF });
      const { rows } = await getDbContext().execute<{ front: string; back: string; doc: string }>(sql`
        select i.ine_front_object_key as front, i.ine_back_object_key as back, l.document_object_key as doc
          from doctor_identity_verification i, doctor_license_verification l where i.id = ${ine.reviewId} and l.id = ${lic.reviewId}`);
      expect((await uc.review.execute(admin, 'identity', ine.reviewId, { decision: 'approve' })).documentsDeleted).toBe(true);
      await expect(storage.openForRead(rows[0].front)).rejects.toBeInstanceOf(StoredFileNotFoundError);
      await expect(storage.openForRead(rows[0].back)).rejects.toBeInstanceOf(StoredFileNotFoundError);
      expect(sha256(await readR2(rows[0].doc))).toBe(sha256(PDF));
    }));

  it('[TC-M03-306] si la transacción falla después de subir (cédula duplicada), el objeto se compensa y no queda en R2', () =>
    withRollbackAndCleanup(async () => {
      const first = await runDoctor();
      const second = await runDoctor();
      const number = `R2DUP${Date.now() % 1e9}`;
      await uc.submitLicense.execute(first, { licenseNumber: number, document: PDF });
      const before = manifest.toJSON().operations.length;
      await expect(uc.submitLicense.execute(second, { licenseNumber: number, document: PDF })).rejects.toThrow(RegistrationDataConflictError);
      const ops = manifest.toJSON().operations.slice(before);
      const put = ops.find((o) => o.operation === 'put' && o.ok && o.key.includes(second.doctorProfileId));
      expect(put).toBeDefined();
      expect(ops.some((o) => o.operation === 'delete' && o.ok && o.key === put!.key)).toBe(true);
      await expect(storage.openForRead(put!.key)).rejects.toBeInstanceOf(StoredFileNotFoundError);
    }));
});
