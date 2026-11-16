import { createHash } from 'crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { PrivateObjectStorage, StoredObject } from '../../src/modules/private-storage/application/ports/private-object-storage';
import { isPrivateObjectKey } from '../../src/modules/private-storage/domain/object-key';
import { writeEvidenceJson } from './c2-evidence';
import { C2_RUN_ID_PATTERN, TEST_PREFIX } from './test-tag';

// Objetos de R2 creados por UNA ejecución de C2 (opción A, 2026-11-04; etapa 2 del manifiesto, 2026-11-06). Las claves
// conservan la gramática de producción (doctor-identity/…, doctor-licenses/…, doctor-photos/…): la ejecución se
// identifica por el doctorProfileId, que es el UUID v5 derivado de C2_RUN_ID (pruebas del adaptador) o el de un médico
// sintético creado por la ejecución (casos de uso), registrado con su origen. Cada operación queda en el manifiesto, sin
// bytes, credenciales ni mensajes del proveedor. La limpieza solo borra claves que el propio manifiesto registró como
// subidas. ListObjects nunca decide qué borrar: solo alimenta la comprobación final (finalCheck).
//
// Persistencia: con attach(dir), el manifiesto se crea en exclusiva (nunca sobre uno existente) y se reescribe tras cada
// operación de forma atómica (archivo temporal propio + rename), de modo que una interrupción conserva todo lo registrado
// hasta ese momento. Las escrituras son síncronas: dos operaciones asíncronas no pueden intercalar sus escrituras.

// Espacio de nombres UUID v5 propio de las ejecuciones de C2 de PEI (constante; no es un secreto).
export const C2_RUN_UUID_NAMESPACE = '6f1d6c2e-7a3b-5c4d-9e8f-0a1b2c3d4e5f';
// Espacios de M03 en los que una ejecución puede crear objetos.
export const RUN_NAMESPACES = ['doctor-identity', 'doctor-licenses', 'doctor-photos'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MANIFEST_FILE = 'r2-manifest.json';

export class R2RunError extends Error {
  constructor(reason: string) {
    super(`Objetos R2 de la ejecución: ${reason}`);
    this.name = 'R2RunError';
  }
}

// UUID v5 (RFC 4122, SHA-1) de `name` en el espacio `namespace`.
export function uuidV5(name: string, namespace: string = C2_RUN_UUID_NAMESPACE): string {
  if (!UUID.test(namespace)) throw new R2RunError('espacio UUID inválido');
  const hash = createHash('sha1').update(Buffer.from(namespace.replace(/-/g, ''), 'hex')).update(name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function runUuid(runId: string): string {
  if (!C2_RUN_ID_PATTERN.test(runId)) throw new R2RunError('C2_RUN_ID con formato inválido');
  return uuidV5(runId);
}

// Espacio y doctorProfileId de una clave de M03, si la clave cumple la gramática de producción.
export function parseRunKey(key: string): { namespace: (typeof RUN_NAMESPACES)[number]; doctorProfileId: string } | null {
  if (!isPrivateObjectKey(key)) return null;
  const [namespace, doctorProfileId] = key.split('/');
  if (!(RUN_NAMESPACES as readonly string[]).includes(namespace) || !UUID.test(doctorProfileId ?? '')) return null;
  return { namespace: namespace as (typeof RUN_NAMESPACES)[number], doctorProfileId };
}

export type ManifestOperation = 'put' | 'read' | 'delete' | 'cleanup-delete';
export interface ManifestEntry {
  key: string;
  operation: ManifestOperation;
  ok: boolean;
  // Solo el nombre del error (nunca su mensaje, que podría incluir detalles del proveedor).
  error?: string;
  at: string;
}

export interface CleanupResult {
  deleted: string[];
  pending: { key: string; error: string }[];
}

// Dueños de las claves de la ejecución: el UUID derivado o un médico sintético con su prueba de origen.
export interface DoctorOwner {
  doctorProfileId: string;
  origin: 'run-uuid' | 'createDoctor';
  // Cuenta sintética de la ejecución (gst-m00-test-<C2_RUN_ID>-…) que creó al médico; no aplica al UUID derivado.
  userId?: string;
  registeredAt: string;
}

export interface FinalCheck {
  checkedAt: string;
  prefixes: Record<string, number>;
  empty: boolean;
  livingKeys: number;
  pendingCleanup: number;
}

// Escritura del archivo del manifiesto (sustituible en pruebas para simular fallos).
export interface ManifestWriter {
  createExclusive(path: string, content: string): void;
  replace(path: string, content: string): void;
}
export const fsManifestWriter: ManifestWriter = {
  createExclusive: (path, content) => writeFileSync(path, content, { flag: 'wx' }),
  // Atómico: archivo temporal propio (exclusivo) y rename sobre el manifiesto de esta ejecución.
  replace: (path, content) => {
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, content, { flag: 'wx' });
    try {
      renameSync(temp, path);
    } catch (error) {
      rmSync(temp, { force: true });
      throw error;
    }
  },
};

export class R2RunManifest {
  readonly runUuid: string;
  readonly startedAt: string;
  private readonly owners = new Map<string, DoctorOwner>();
  private readonly entries: ManifestEntry[] = [];
  // `cleanup` conserva la última limpieza (formato de las evidencias del 2026-11-04); `cleanups`, todas en orden.
  private cleanup: CleanupResult | null = null;
  private readonly cleanups: CleanupResult[] = [];
  private finalCheck: FinalCheck | null = null;
  private attachedPath: string | null = null;
  private attachedDir: string | null = null;
  private revision = 0;
  private readonly persistErrors: { revision: number; error: string; at: string }[] = [];

  constructor(readonly runId: string, now: Date = new Date(), private readonly writer: ManifestWriter = fsManifestWriter) {
    this.runUuid = runUuid(runId);
    this.startedAt = now.toISOString();
    this.owners.set(this.runUuid, { doctorProfileId: this.runUuid, origin: 'run-uuid', registeredAt: this.startedAt });
  }

  // Vincula el manifiesto al directorio de la ejecución (C2_EVIDENCE_DIR). Crea r2-manifest.json en exclusiva: si ya
  // existe (otra ejecución o un manifiesto histórico), falla sin tocarlo.
  attach(dir: string): string {
    if (this.attachedPath) throw new R2RunError('el manifiesto ya está vinculado a un directorio');
    const path = join(dir, MANIFEST_FILE);
    this.writer.createExclusive(path, this.serialize());
    this.attachedPath = path;
    this.attachedDir = dir;
    return path;
  }

  // Un médico sintético creado por la ejecución. La prueba de origen es la cuenta que lo creó: su id debe ser un
  // identificador sintético de ESTA ejecución (testTag con C2_RUN_ID). Un UUID suelto no basta.
  allowDoctor(doctorProfileId: string, proof: { origin: 'createDoctor'; userId: string }): void {
    if (!UUID.test(doctorProfileId)) throw new R2RunError('doctorProfileId inválido');
    if (proof?.origin !== 'createDoctor') throw new R2RunError('origen del médico no admitido');
    if (!proof.userId?.startsWith(`${TEST_PREFIX}-${this.runId}-`)) throw new R2RunError('el médico no fue creado por una cuenta sintética de esta ejecución');
    this.owners.set(doctorProfileId, { doctorProfileId, origin: proof.origin, userId: proof.userId, registeredAt: new Date().toISOString() });
    this.persist();
  }

  record(operation: ManifestOperation, key: string, ok: boolean, error?: unknown): void {
    this.entries.push({ key, operation, ok, ...(error ? { error: error instanceof Error ? error.name : 'Error' } : {}), at: new Date().toISOString() });
    this.persist();
  }

  // Claves subidas con éxito y todavía no borradas, en orden de subida.
  livingKeys(): string[] {
    const living: string[] = [];
    for (const entry of this.entries) {
      if (!entry.ok) continue;
      const index = living.indexOf(entry.key);
      if (entry.operation === 'put' && index < 0) living.push(entry.key);
      if ((entry.operation === 'delete' || entry.operation === 'cleanup-delete') && index >= 0) living.splice(index, 1);
    }
    return living;
  }

  // El dueño (doctorProfileId) de la clave pertenece a la ejecución.
  assertRunOwner(key: string): void {
    const parsed = parseRunKey(key);
    if (!parsed) throw new R2RunError('clave fuera de los espacios permitidos o con formato inválido');
    if (!this.owners.has(parsed.doctorProfileId)) throw new R2RunError('la clave no pertenece a la ejecución');
  }

  // Además del dueño, la clave figura como subida por esta ejecución (condición para borrar).
  assertOwned(key: string): void {
    this.assertRunOwner(key);
    if (!this.entries.some((e) => e.key === key && e.operation === 'put' && e.ok)) throw new R2RunError('la clave no figura como subida en el manifiesto');
  }

  ownerPrefixes(): string[] {
    return [...this.owners.keys()].flatMap((id) => RUN_NAMESPACES.map((ns) => `${ns}/${id}/`));
  }

  setCleanup(result: CleanupResult): void {
    this.cleanup = result;
    this.cleanups.push(result);
    this.persist();
  }

  // Comprobación final (listado de solo lectura por prefijos). Se guarda en el manifiesto y, si está vinculado, en
  // r2-final-check.json (exclusivo).
  recordFinalCheck(prefixes: Record<string, number>, now: Date = new Date()): FinalCheck {
    if (this.finalCheck) throw new R2RunError('la comprobación final ya está registrada');
    this.finalCheck = {
      checkedAt: now.toISOString(),
      prefixes,
      empty: Object.values(prefixes).every((n) => n === 0),
      livingKeys: this.livingKeys().length,
      pendingCleanup: this.cleanup?.pending.length ?? 0,
    };
    this.persist();
    if (this.attachedDir) writeEvidenceJson(this.attachedDir, 'r2-final-check.json', { runId: this.runId, runUuid: this.runUuid, ...this.finalCheck });
    return this.finalCheck;
  }

  // Errores al escribir el manifiesto: nunca se ocultan (el spec debe comprobar que no hubo ninguno).
  persistenceErrors(): readonly { revision: number; error: string; at: string }[] {
    return this.persistErrors;
  }

  toJSON() {
    return {
      runId: this.runId,
      runUuid: this.runUuid,
      startedAt: this.startedAt,
      revision: this.revision,
      doctorProfileIds: [...this.owners.keys()],
      doctorOwners: [...this.owners.values()],
      operations: this.entries,
      livingKeys: this.livingKeys(),
      cleanup: this.cleanup,
      cleanups: this.cleanups,
      finalCheck: this.finalCheck,
      ...(this.persistErrors.length > 0 ? { persistenceErrors: this.persistErrors } : {}),
    };
  }

  private serialize(): string {
    return `${JSON.stringify(this.toJSON(), null, 2)}\n`;
  }

  // Reescritura tras cada cambio (solo si está vinculado). Un fallo se registra y la siguiente escritura incluye todo.
  private persist(): void {
    if (!this.attachedPath) return;
    this.revision += 1;
    try {
      this.writer.replace(this.attachedPath, this.serialize());
    } catch (error) {
      this.persistErrors.push({ revision: this.revision, error: error instanceof Error ? error.name : 'Error', at: new Date().toISOString() });
    }
  }

  // Sin C2_EVIDENCE_DIR (ejecuciones anteriores a la etapa 1): una sola escritura al final, en el temporal y en exclusiva.
  write(dir: string = join(tmpdir(), 'pei-c2-evidence'), name = 'r2'): string {
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${this.runId}-${name}-manifest.json`);
    this.writer.createExclusive(path, this.serialize());
    return path;
  }
}

// Almacenamiento que registra cada operación en el manifiesto y solo admite claves de dueños de la ejecución.
export class ManifestStorage implements PrivateObjectStorage {
  constructor(private readonly inner: PrivateObjectStorage, readonly manifest: R2RunManifest) {}

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    this.manifest.assertRunOwner(key);
    try {
      await this.inner.put(key, bytes, contentType);
    } catch (error) {
      this.manifest.record('put', key, false, error);
      throw error;
    }
    // Inmediatamente después de la subida: si algo falla después, la clave ya consta para la limpieza.
    this.manifest.record('put', key, true);
  }

  async openForRead(key: string): Promise<StoredObject> {
    this.manifest.assertRunOwner(key);
    try {
      const object = await this.inner.openForRead(key);
      this.manifest.record('read', key, true);
      return object;
    } catch (error) {
      this.manifest.record('read', key, false, error);
      throw error;
    }
  }

  // Borrados del propio código (compensación, purga): solo claves subidas por la ejecución.
  async delete(key: string): Promise<void> {
    this.manifest.assertOwned(key);
    try {
      await this.inner.delete(key);
      this.manifest.record('delete', key, true);
    } catch (error) {
      this.manifest.record('delete', key, false, error);
      throw error;
    }
  }
}

// Borra EXCLUSIVAMENTE las claves vivas del manifiesto, validando cada una. No lista el bucket. Un fallo no se oculta:
// la clave queda en `pending`, sigue viva en el manifiesto y la evidencia se conserva.
export async function cleanupRunObjects(storage: PrivateObjectStorage, manifest: R2RunManifest): Promise<CleanupResult> {
  const result: CleanupResult = { deleted: [], pending: [] };
  for (const key of manifest.livingKeys()) {
    try {
      manifest.assertOwned(key);
      await storage.delete(key);
      manifest.record('cleanup-delete', key, true);
      result.deleted.push(key);
    } catch (error) {
      manifest.record('cleanup-delete', key, false, error);
      result.pending.push({ key, error: error instanceof Error ? error.name : 'Error' });
    }
  }
  manifest.setCleanup(result);
  return result;
}
