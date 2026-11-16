import { createHash, randomUUID } from 'crypto';
import { doctorIdentityKey, doctorLicenseKey, doctorPhotoKey } from '../../src/modules/doctors/domain/object-keys';
import { StoredFileNotFoundError } from '../../src/modules/private-storage/domain/private-storage.errors';
import { DocumentStorageError, loadR2Config, R2PrivateObjectStorage } from '../../src/modules/private-storage/infrastructure/r2-private-object-storage';
import { assertC2R2Target } from '../support/c2-target-guard';
import { cleanupRunObjects, ManifestStorage, R2RunManifest } from '../support/r2-run';
import { countObjectsUnder } from '../support/r2-verify';
import { syntheticJpeg, syntheticPng } from '../support/synthetic-identity';

// Adaptador R2 REAL contra el bucket exclusivo de C2 (pei-docs-c2-test), sin PostgreSQL. Solo mediante el lanzador C2
// (modo r2). Cada objeto usa claves de producción cuyo doctorProfileId es el UUID v5 de C2_RUN_ID; el manifiesto
// registra cada operación y la limpieza solo borra lo que esta ejecución subió. Contenido sintético.
const { bucket } = assertC2R2Target();
const config = loadR2Config(process.env)!;
const manifest = new R2RunManifest(process.env.C2_RUN_ID!);
const r2 = new R2PrivateObjectStorage(config);
const storage = new ManifestStorage(r2, manifest);
// Con el lanzador, el manifiesto se crea en exclusiva en el directorio de la ejecución y se actualiza tras cada operación.
if (process.env.C2_EVIDENCE_DIR) manifest.attach(process.env.C2_EVIDENCE_DIR);
const RUN = manifest.runUuid;
const PDF = Buffer.from('%PDF-1.7\n% documento sintetico C2 R2\n');

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
async function readAll(key: string): Promise<{ bytes: Buffer; contentLength: number | null; chunks: number }> {
  const { stream, contentLength } = await storage.openForRead(key);
  const parts: Buffer[] = [];
  for await (const chunk of stream) parts.push(Buffer.from(chunk as Buffer));
  return { bytes: Buffer.concat(parts), contentLength, chunks: parts.length };
}

describe(`Adaptador R2 real (C2, bucket ${bucket})`, () => {
  afterAll(async () => {
    const cleanup = await cleanupRunObjects(r2, manifest);
    const remaining = await countObjectsUnder(config, manifest.ownerPrefixes());
    manifest.recordFinalCheck(remaining);
    // Sin el lanzador, una sola escritura al final en el directorio temporal (como antes).
    if (!process.env.C2_EVIDENCE_DIR) console.log(`manifiesto R2: ${manifest.write()}`);
    expect(manifest.persistenceErrors()).toEqual([]);
    expect(cleanup.pending).toEqual([]);
    expect(Object.values(remaining).every((n) => n === 0)).toBe(true);
  });

  it('[TC-M03-298] subida y lectura de PNG, JPEG y PDF: bytes idénticos y ContentLength real', async () => {
    const review = randomUUID();
    const files: [string, Buffer, string][] = [
      [doctorIdentityKey(RUN, review, 'front', 'png'), syntheticPng(2048), 'image/png'],
      [doctorIdentityKey(RUN, review, 'back', 'jpg'), syntheticJpeg(4096), 'image/jpeg'],
      [doctorLicenseKey(RUN, review, 'pdf'), PDF, 'application/pdf'],
    ];
    for (const [key, bytes, type] of files) {
      await storage.put(key, bytes, type);
      const read = await readAll(key);
      expect(read.contentLength).toBe(bytes.length);
      expect(sha256(read.bytes)).toBe(sha256(bytes));
    }
  });

  it('[TC-M03-299] streaming de un documento de ~5 MB: se recibe por partes y completo', async () => {
    const key = doctorPhotoKey(RUN, randomUUID(), 'jpg');
    const bytes = syntheticJpeg(5 * 1024 * 1024 - 1024);
    await storage.put(key, bytes, 'image/jpeg');
    const read = await readAll(key);
    expect(read.contentLength).toBe(bytes.length);
    expect(read.chunks).toBeGreaterThan(1);
    expect(sha256(read.bytes)).toBe(sha256(bytes));
  });

  it('[TC-M03-300] un objeto inexistente responde StoredFileNotFoundError', async () => {
    await expect(storage.openForRead(doctorLicenseKey(RUN, randomUUID(), 'pdf'))).rejects.toBeInstanceOf(StoredFileNotFoundError);
  });

  it('[TC-M03-301] borrado e idempotencia: borrar dos veces no falla y después el objeto no existe', async () => {
    const key = doctorLicenseKey(RUN, randomUUID(), 'pdf');
    await storage.put(key, PDF, 'application/pdf');
    await storage.delete(key);
    await expect(storage.delete(key)).resolves.toBeUndefined();
    await expect(storage.openForRead(key)).rejects.toBeInstanceOf(StoredFileNotFoundError);
  });

  it('[TC-M03-302] una clave fuera de la gramática se rechaza sin llamar a R2', async () => {
    // fuera del manifiesto: sin red (el adaptador rechaza la clave antes de llamar a R2)
    await expect(r2.put('c2/otra/clave.pdf', PDF, 'application/pdf')).rejects.toThrow('Clave de objeto con formato no permitido'); // fuera del manifiesto: sin red
    await expect(r2.delete('../doctor-licenses/x.pdf')).rejects.toThrow('Clave de objeto con formato no permitido'); // fuera del manifiesto: sin red
  });

  it('[TC-M03-303] credenciales inválidas: DocumentStorageError sin clave, bucket ni credenciales en el mensaje', async () => {
    const invalid = new ManifestStorage(new R2PrivateObjectStorage({ ...config, accessKeyId: 'clave-invalida-c2', secretAccessKey: 'secreto-invalido-c2' }), manifest);
    const key = doctorLicenseKey(RUN, randomUUID(), 'pdf');
    const error = await invalid.put(key, PDF, 'application/pdf').then(() => null, (e: Error) => e);
    expect(error).toBeInstanceOf(DocumentStorageError);
    expect(error!.message).not.toContain(key);
    expect(error!.message).not.toContain(config.bucket);
    expect(error!.message).not.toMatch(/clave-invalida-c2|secreto-invalido-c2/);
    expect(manifest.livingKeys()).not.toContain(key);
  });
});
