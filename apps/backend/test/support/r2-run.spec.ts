import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { doctorIdentityKey, doctorLicenseKey, doctorPhotoKey } from '../../src/modules/doctors/domain/object-keys';
import { FakeDocumentStorage } from './identity-in-memory';
import {
  cleanupRunObjects,
  fsManifestWriter,
  ManifestStorage,
  MANIFEST_FILE,
  parseRunKey,
  R2RunError,
  R2RunManifest,
  runUuid,
  uuidV5,
  type ManifestWriter,
} from './r2-run';

// Objetos R2 por ejecución (opción A) con dobles y archivos temporales: UUID v5, propiedad, manifiesto incremental y
// limpieza segura. Sin red ni R2.

const RUN = 'c2-20261104090000-ab12';
const OTHER_RUN = 'c2-20261104090001-cd34';
const REVIEW = '11111111-2222-4333-8444-555555555555';
const PHOTO = '66666666-7777-4888-9999-000000000000';
const DOCTOR = '22222222-3333-4444-8555-666666666666';
const RUN_USER = `gst-m00-test-${RUN}-0f0e0d0c-0b0a-4908-8706-050403020100`;
const PDF = Buffer.from('%PDF-');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pei-r2-run-spec-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const setup = (writer?: ManifestWriter) => {
  const inner = new FakeDocumentStorage();
  const manifest = new R2RunManifest(RUN, new Date('2026-11-04T09:00:00.000Z'), writer);
  return { inner, manifest, storage: new ManifestStorage(inner, manifest), id: manifest.runUuid };
};
const saved = () => JSON.parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8'));

describe('UUID v5 de la ejecución', () => {
  it('[TC-M03-294] coincide con el vector de la RFC 4122 (DNS, www.example.com) y es determinista por C2_RUN_ID', () => {
    expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
    expect(runUuid(RUN)).toBe(runUuid(RUN));
    expect(runUuid(RUN)).not.toBe(runUuid(OTHER_RUN));
    expect(runUuid(RUN)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(() => runUuid('ejecucion-cualquiera')).toThrow(R2RunError);
  });

  it('[TC-M03-294] las claves usan exactamente la gramática de producción con el UUID de la ejecución', () => {
    const id = runUuid(RUN);
    const keys = [
      doctorIdentityKey(id, REVIEW, 'front', 'jpg'),
      doctorIdentityKey(id, REVIEW, 'back', 'jpg'),
      doctorLicenseKey(id, REVIEW, 'pdf'),
      doctorPhotoKey(id, PHOTO, 'jpg'),
    ];
    expect(keys).toEqual([
      `doctor-identity/${id}/${REVIEW}/front.jpg`,
      `doctor-identity/${id}/${REVIEW}/back.jpg`,
      `doctor-licenses/${id}/${REVIEW}.pdf`,
      `doctor-photos/${id}/${PHOTO}.jpg`,
    ]);
    for (const key of keys) expect(parseRunKey(key)?.doctorProfileId).toBe(id);
    expect(parseRunKey(`identity/${id}/${REVIEW}/front.jpg`)).toBeNull(); // espacio de M02: no admitido
    expect(parseRunKey(`c2/${RUN}/x.jpg`)).toBeNull();
  });
});

describe('Propiedad de las claves', () => {
  it('[TC-M03-296] put exige un dueño de la ejecución: el UUID derivado o un médico registrado con su origen', async () => {
    const { manifest, storage, id } = setup();
    await expect(storage.put(doctorLicenseKey(DOCTOR, REVIEW, 'pdf'), PDF, 'application/pdf')).rejects.toThrow('la clave no pertenece a la ejecución');
    await expect(storage.put(doctorLicenseKey(runUuid(OTHER_RUN), REVIEW, 'pdf'), PDF, 'application/pdf')).rejects.toThrow(R2RunError);
    await expect(storage.put(`identity/${id}/${REVIEW}/front.jpg`, Buffer.alloc(3), 'image/jpeg')).rejects.toThrow(R2RunError);
    await expect(storage.put(doctorLicenseKey(id, REVIEW, 'pdf'), PDF, 'application/pdf')).resolves.toBeUndefined();
    manifest.allowDoctor(DOCTOR, { origin: 'createDoctor', userId: RUN_USER });
    await expect(storage.put(doctorLicenseKey(DOCTOR, REVIEW, 'pdf'), PDF, 'application/pdf')).resolves.toBeUndefined();
  });

  it('[TC-M03-296] allowDoctor rechaza UUID sueltos: exige origen y una cuenta sintética de ESTA ejecución', () => {
    const { manifest } = setup();
    expect(() => manifest.allowDoctor(DOCTOR, undefined as never)).toThrow(R2RunError);
    expect(() => manifest.allowDoctor(DOCTOR, { origin: 'otro' as never, userId: RUN_USER })).toThrow(R2RunError);
    expect(() => manifest.allowDoctor(DOCTOR, { origin: 'createDoctor', userId: 'usuario-real-123' })).toThrow(R2RunError);
    expect(() => manifest.allowDoctor(DOCTOR, { origin: 'createDoctor', userId: `gst-m00-test-${OTHER_RUN}-x` })).toThrow(R2RunError);
    expect(() => manifest.allowDoctor('no-es-uuid', { origin: 'createDoctor', userId: RUN_USER })).toThrow(R2RunError);
    manifest.allowDoctor(DOCTOR, { origin: 'createDoctor', userId: RUN_USER });
    expect(manifest.toJSON().doctorOwners).toEqual([
      expect.objectContaining({ doctorProfileId: manifest.runUuid, origin: 'run-uuid' }),
      expect.objectContaining({ doctorProfileId: DOCTOR, origin: 'createDoctor', userId: RUN_USER }),
    ]);
  });

  it('[TC-M03-296] delete exige que la clave se haya subido en la ejecución; claves de otras ejecuciones nunca', async () => {
    const { manifest, storage, inner, id } = setup();
    const foreign = doctorLicenseKey(runUuid(OTHER_RUN), REVIEW, 'pdf');
    await inner.put(foreign, PDF, 'application/pdf');
    await expect(storage.delete(foreign)).rejects.toThrow(R2RunError);
    await expect(storage.delete(doctorLicenseKey(id, REVIEW, 'pdf'))).rejects.toThrow('la clave no figura como subida');
    expect(() => manifest.assertOwned('doctor-licenses/../../otra.pdf')).toThrow(R2RunError);
    expect(inner.objects.has(foreign)).toBe(true);
  });
});

describe('Manifiesto y limpieza', () => {
  it('[TC-M03-295] registra put, read (incluidos los fallos) y delete; la limpieza borra solo las claves vivas', async () => {
    const { inner, manifest, storage, id } = setup();
    const ine = doctorIdentityKey(id, REVIEW, 'front', 'jpg');
    const lic = doctorLicenseKey(id, REVIEW, 'pdf');
    await storage.put(ine, Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');
    await storage.put(lic, PDF, 'application/pdf');
    await storage.openForRead(lic);
    await expect(storage.openForRead(doctorPhotoKey(id, PHOTO, 'jpg'))).rejects.toThrow();
    await storage.delete(ine);
    const foreign = doctorLicenseKey(runUuid(OTHER_RUN), REVIEW, 'pdf');
    await inner.put(foreign, PDF, 'application/pdf');

    expect(manifest.livingKeys()).toEqual([lic]);
    expect(await cleanupRunObjects(inner, manifest)).toEqual({ deleted: [lic], pending: [] });
    expect(inner.deleted).toEqual([ine, lic]);
    expect(inner.objects.has(foreign)).toBe(true);
    const ops = manifest.toJSON().operations;
    expect(ops.map((e) => `${e.operation}:${e.ok}`)).toEqual(['put:true', 'put:true', 'read:true', 'read:false', 'delete:true', 'cleanup-delete:true']);
    expect(ops[3].error).toBe('StoredFileNotFoundError'); // solo el nombre del error
  });

  it('[TC-M03-297] un fallo de limpieza no se oculta: la clave queda pendiente y sigue viva', async () => {
    const { inner, manifest, storage, id } = setup();
    const key = doctorPhotoKey(id, PHOTO, 'jpg');
    await storage.put(key, Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');
    inner.failDelete = true;
    expect(await cleanupRunObjects(inner, manifest)).toEqual({ deleted: [], pending: [{ key, error: 'Error' }] });
    expect(manifest.livingKeys()).toEqual([key]);
    expect(JSON.stringify(manifest.toJSON())).not.toMatch(/fallo simulado/);
  });

  it('[TC-M03-297] cleanups acumula todas las limpiezas en orden; cleanup conserva la última (formato anterior)', async () => {
    const { inner, manifest, storage, id } = setup();
    await storage.put(doctorLicenseKey(id, REVIEW, 'pdf'), PDF, 'application/pdf');
    const first = await cleanupRunObjects(inner, manifest);
    await storage.put(doctorPhotoKey(id, PHOTO, 'jpg'), Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');
    const second = await cleanupRunObjects(inner, manifest);
    const json = manifest.toJSON();
    expect(json.cleanups).toEqual([first, second]);
    expect(json.cleanup).toEqual(second);
    // Las claves del formato anterior siguen presentes.
    expect(Object.keys(json)).toEqual(expect.arrayContaining(['runId', 'runUuid', 'startedAt', 'doctorProfileIds', 'operations', 'livingKeys', 'cleanup']));
  });
});

describe('Persistencia del manifiesto', () => {
  it('[TC-M03-317] attach crea el manifiesto en exclusiva: nunca sobrescribe uno existente', () => {
    writeFileSync(join(dir, MANIFEST_FILE), '{"historico":true}');
    const { manifest } = setup();
    expect(() => manifest.attach(dir)).toThrow();
    expect(readFileSync(join(dir, MANIFEST_FILE), 'utf8')).toBe('{"historico":true}');
    const other = mkdtempSync(join(tmpdir(), 'pei-r2-run-spec-'));
    try {
      manifest.attach(other);
      expect(() => manifest.attach(other)).toThrow('ya está vinculado');
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('[TC-M03-317] el modo sin C2_EVIDENCE_DIR también escribe en exclusiva', () => {
    const { manifest } = setup();
    const path = manifest.write(dir);
    expect(existsSync(path)).toBe(true);
    expect(() => manifest.write(dir)).toThrow();
  });

  it('[TC-M03-318] escritura incremental: cada operación queda en disco al momento, sin temporales sobrantes', async () => {
    const { manifest, storage, inner, id } = setup();
    manifest.attach(dir);
    expect(saved().operations).toEqual([]);
    const key = doctorLicenseKey(id, REVIEW, 'pdf');
    await storage.put(key, PDF, 'application/pdf');
    expect(saved().operations.map((o: { operation: string }) => o.operation)).toEqual(['put']);
    await storage.openForRead(key);
    expect(saved().operations).toHaveLength(2);
    await cleanupRunObjects(inner, manifest);
    expect(saved()).toMatchObject({ livingKeys: [], cleanup: { deleted: [key], pending: [] } });
    expect(saved().cleanups).toHaveLength(1);
    expect(readdirSync(dir)).toEqual([MANIFEST_FILE]);
  });

  it('[TC-M03-318] operaciones concurrentes: las escrituras síncronas no se pisan y no se pierde ninguna', async () => {
    const { storage, id } = setup();
    const manifest = storage.manifest;
    manifest.attach(dir);
    const keys = Array.from({ length: 25 }, (_, i) => doctorLicenseKey(id, `${REVIEW.slice(0, -2)}${String(i).padStart(2, '0')}`, 'pdf'));
    await Promise.all(keys.map((key) => storage.put(key, PDF, 'application/pdf')));
    const onDisk = saved();
    expect(onDisk.operations).toHaveLength(25);
    expect(new Set(onDisk.livingKeys)).toEqual(new Set(keys));
    expect(onDisk.revision).toBe(manifest.toJSON().revision);
  });

  it('[TC-M03-319] un fallo al escribir no pierde operaciones: queda registrado y la siguiente escritura lo recupera', async () => {
    let fail = false;
    const writer: ManifestWriter = { createExclusive: (path, content) => fsManifestWriter.createExclusive(path, content), replace: (path, content) => {
      if (fail) throw new Error('disco lleno simulado');
      fsManifestWriter.replace(path, content);
    } };
    const { manifest, storage, id } = setup(writer);
    manifest.attach(dir);
    const a = doctorLicenseKey(id, REVIEW, 'pdf');
    fail = true;
    await storage.put(a, PDF, 'application/pdf');
    expect(saved().operations).toEqual([]); // la escritura falló, pero la operación sigue en memoria
    expect(manifest.persistenceErrors()).toEqual([expect.objectContaining({ error: 'Error' })]);
    fail = false;
    await storage.openForRead(a);
    const onDisk = saved();
    expect(onDisk.operations.map((o: { operation: string }) => o.operation)).toEqual(['put', 'read']);
    expect(onDisk.persistenceErrors).toHaveLength(1);
    expect(JSON.stringify(onDisk)).not.toMatch(/disco lleno/);
  });

  it('[TC-M03-320] finalCheck se registra una vez en el manifiesto y en r2-final-check.json', async () => {
    const { manifest, storage, inner, id } = setup();
    manifest.attach(dir);
    await storage.put(doctorLicenseKey(id, REVIEW, 'pdf'), PDF, 'application/pdf');
    await cleanupRunObjects(inner, manifest);
    const check = manifest.recordFinalCheck({ [`doctor-licenses/${id}/`]: 0 }, new Date('2026-11-06T12:00:00.000Z'));
    expect(check).toEqual({ checkedAt: '2026-11-06T12:00:00.000Z', prefixes: { [`doctor-licenses/${id}/`]: 0 }, empty: true, livingKeys: 0, pendingCleanup: 0 });
    expect(saved().finalCheck).toEqual(check);
    expect(JSON.parse(readFileSync(join(dir, 'r2-final-check.json'), 'utf8'))).toMatchObject({ runId: RUN, empty: true });
    expect(() => manifest.recordFinalCheck({})).toThrow('ya está registrada');
  });
});
