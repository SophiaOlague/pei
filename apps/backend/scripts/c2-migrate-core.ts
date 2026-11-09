// Núcleo del ejecutor de migraciones EXCLUSIVO de C2 (scripts/c2-migrate.ts). Sin E/S propia: el archivo de entorno,
// el journal, las migraciones y la conexión se inyectan, de modo que cada salvaguarda se prueba con dobles.
//
// Falla de forma cerrada: cualquier dato ausente, ilegible o distinto de lo esperado detiene el proceso ANTES de escribir.
// - DATABASE_URL se toma SOLO del contenido del archivo de C2: nunca de las variables del proceso ni del archivo de
//   entorno del backend (base de desarrollo).
// - La identidad se comprueba dos veces: por la URL (endpoint directo de C2, nunca el de desarrollo) y por la conexión
//   real (parámetros neon.* del compute, leídos en una transacción READ ONLY). No basta con lo que diga la URL.
// - Solo se aplica la migración autorizada: la BD debe tener exactamente las anteriores (mismos hashes que el journal)
//   y el journal, exactamente una más, con el tag y el SHA-256 autorizados.
import { createHash } from 'crypto';

export const C2_MIGRATION_TARGET = Object.freeze({
  project: 'royal-paper-10258990',
  branch: 'br-shy-pond-b50a3m8f',
  endpoint: 'ep-withered-block-b5e8v9ov',
});
// Base de desarrollo: nunca es un destino válido.
export const DEVELOPMENT_TARGET = Object.freeze({ branch: 'br-royal-recipe-b54s5hnn', endpoint: 'ep-wandering-bonus-b5kxacor' });

// Única migración que este ejecutor puede aplicar. 0013 ya está aplicada en C2 (2026-11-08) y su hash queda como
// requisito previo. 0014 (AP-26): PREPARADA, sin aplicar; aplicarla en C2 exige autorización expresa y respaldo.
export const AUTHORIZED_MIGRATION = Object.freeze({
  idx: 14,
  tag: '0014_m08_m1_legal_acceptance',
  sha256: '72af287cf7336d6f56942b35576b89c9cf0e1e3566b42f41ab62145ab440e24c',
});

export class C2MigrateError extends Error {
  constructor(reason: string) {
    super(`c2-migrate detenido: ${reason}`);
    this.name = 'C2MigrateError';
  }
}

// Lee DATABASE_URL del contenido del archivo. Sin interpolación ni valores por defecto; exactamente una definición.
export function databaseUrlFromEnvFile(content: string | null | undefined): string {
  if (!content) throw new C2MigrateError('no se pudo leer el archivo de entorno de C2');
  const lines = content.split(/\r?\n/).filter((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (lines.length !== 1) throw new C2MigrateError(lines.length === 0 ? 'falta DATABASE_URL en el archivo de C2' : 'DATABASE_URL aparece más de una vez');
  const raw = lines[0].slice(lines[0].indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  if (!raw) throw new C2MigrateError('DATABASE_URL vacía en el archivo de C2');
  return raw;
}

// La URL debe apuntar al endpoint DIRECTO de C2 (sin -pooler: el DDL y los candados no pasan por el pooler).
export function assertUrlTarget(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new C2MigrateError('DATABASE_URL inválida');
  }
  if (!host) throw new C2MigrateError('DATABASE_URL sin host');
  if (host.includes(DEVELOPMENT_TARGET.endpoint)) throw new C2MigrateError('DATABASE_URL apunta a la base de desarrollo');
  if (host.split('.')[0] !== C2_MIGRATION_TARGET.endpoint) throw new C2MigrateError('DATABASE_URL no es el endpoint directo de C2');
}

export interface RuntimeIdentity { project: string | null; branch: string | null; endpoint: string | null }

// Identidad REAL de la conexión (neon.project_id, neon.branch_id, neon.endpoint_id).
export function assertRuntimeIdentity(actual: RuntimeIdentity): void {
  if (!actual || !actual.project || !actual.branch || !actual.endpoint) throw new C2MigrateError('la conexión no expone la identidad de Neon (neon.*)');
  if (actual.branch === DEVELOPMENT_TARGET.branch || actual.endpoint === DEVELOPMENT_TARGET.endpoint) throw new C2MigrateError('la conexión real es la base de desarrollo');
  if (actual.project !== C2_MIGRATION_TARGET.project) throw new C2MigrateError('el proyecto real no es el de C2');
  if (actual.branch !== C2_MIGRATION_TARGET.branch) throw new C2MigrateError('la rama real no es C2');
  if (actual.endpoint !== C2_MIGRATION_TARGET.endpoint) throw new C2MigrateError('el endpoint real no es el de C2');
}

export interface JournalEntry { idx: number; tag: string; when: number }
export interface AppliedMigration { hash: string; created_at: string | number }

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

// Plan: la BD tiene exactamente las migraciones anteriores a la autorizada (mismo orden, hash y `when`) y el journal
// tiene exactamente una más, la autorizada, con su SHA-256. Así el migrador de Drizzle solo puede aplicar esa.
export function planAuthorizedMigration(journal: JournalEntry[], readSql: (tag: string) => string, applied: AppliedMigration[]) {
  const target = AUTHORIZED_MIGRATION;
  if (journal.length !== target.idx + 1) throw new C2MigrateError(`el journal tiene ${journal.length} entradas; se esperaban ${target.idx + 1}`);
  journal.forEach((e, i) => {
    if (e.idx !== i) throw new C2MigrateError(`el journal no es consecutivo en la entrada ${i}`);
  });
  const last = journal[target.idx];
  if (last.tag !== target.tag) throw new C2MigrateError(`la última entrada del journal es ${last.tag}, no ${target.tag}`);
  const lastHash = sha256(readSql(last.tag));
  if (lastHash !== target.sha256) throw new C2MigrateError(`el SHA-256 de ${target.tag}.sql no es el autorizado`);
  if (applied.length !== target.idx) throw new C2MigrateError(`la BD tiene ${applied.length} migraciones registradas; se esperaban ${target.idx}`);
  applied.forEach((m, i) => {
    const e = journal[i];
    if (m.hash !== sha256(readSql(e.tag))) throw new C2MigrateError(`el hash registrado ${i} no coincide con ${e.tag}`);
    if (String(m.created_at) !== String(e.when)) throw new C2MigrateError(`el created_at registrado ${i} no coincide con el journal`);
  });
  if (Math.max(...applied.map((m) => Number(m.created_at))) >= last.when) throw new C2MigrateError('el journal de la migración autorizada no es posterior a la última aplicada');
  return { tag: last.tag, sha256: lastHash, when: last.when };
}

// Comprobación posterior: exactamente una migración nueva, la autorizada, con su hash y su `when`.
export function assertAppliedAfter(before: AppliedMigration[], after: AppliedMigration[], plan: { sha256: string; when: number }) {
  if (after.length !== before.length + 1) throw new C2MigrateError(`tras migrar hay ${after.length} registros; se esperaban ${before.length + 1}`);
  const added = after[after.length - 1];
  if (added.hash !== plan.sha256 || String(added.created_at) !== String(plan.when)) throw new C2MigrateError('el registro nuevo no es la migración autorizada');
}

// Dependencias de E/S del ejecutor (reales en c2-migrate.ts, dobles en las pruebas).
export interface C2MigrateDeps {
  readEnvFile: () => string | null;
  readJournal: () => JournalEntry[];
  readSql: (tag: string) => string;
  connect: (url: string) => Promise<{
    identity: () => Promise<RuntimeIdentity>;
    applied: () => Promise<AppliedMigration[]>;
    migrate: () => Promise<void>;
    close: () => Promise<void>;
  }>;
  log: (line: string) => void;
}

// Ejecuta la secuencia completa. Sin `apply`, solo verifica (no escribe). Devuelve el plan aplicado o verificado.
export async function runC2Migrate(deps: C2MigrateDeps, apply: boolean) {
  const url = databaseUrlFromEnvFile(deps.readEnvFile());
  assertUrlTarget(url);
  const conn = await deps.connect(url);
  try {
    assertRuntimeIdentity(await conn.identity());
    deps.log(`identidad verificada: ${C2_MIGRATION_TARGET.project} / ${C2_MIGRATION_TARGET.branch} / ${C2_MIGRATION_TARGET.endpoint}`);
    const before = await conn.applied();
    const plan = planAuthorizedMigration(deps.readJournal(), deps.readSql, before);
    deps.log(`plan: ${before.length} registradas; pendiente solo ${plan.tag} (sha256 ${plan.sha256})`);
    if (!apply) {
      deps.log('verificación sin escritura: use --apply para aplicar');
      return { applied: false, plan };
    }
    // Identidad otra vez justo antes de escribir (misma conexión del migrador).
    assertRuntimeIdentity(await conn.identity());
    await conn.migrate();
    const after = await conn.applied();
    assertAppliedAfter(before, after, plan);
    deps.log(`aplicada ${plan.tag}; ${after.length} migraciones registradas`);
    return { applied: true, plan };
  } finally {
    await conn.close();
  }
}
