// Núcleo del ejecutor de migraciones EXCLUSIVO de C2 (scripts/c2-migrate.ts). Sin E/S propia: el archivo de entorno,
// el journal, las migraciones y la conexión se inyectan, de modo que cada salvaguarda se prueba con dobles.
//
// Falla de forma cerrada: cualquier dato ausente, ilegible o distinto de lo esperado detiene el proceso ANTES de escribir.
// - DATABASE_URL se toma SOLO del contenido del archivo de C2: nunca de las variables del proceso ni del archivo de
//   entorno del backend (base de desarrollo).
// - La identidad se comprueba dos veces: por la URL (endpoint directo de C2, nunca el de desarrollo) y por la conexión
//   real (parámetros neon.* del compute, leídos en una transacción READ ONLY). No basta con lo que diga la URL.
// - Solo se aplica la SIGUIENTE migración pendiente: la BD debe tener exactamente las primeras N del journal (mismos
//   hashes y `when`); las pendientes deben ser consecutivas y estar todas autorizadas (tag y SHA-256). Al migrador de
//   Drizzle se le pasa un journal que termina en la siguiente, así que no puede aplicar ninguna más.
import { createHash } from 'crypto';
import { authorizeForRunner, type Query } from './migration-authorization';
import type { Fingerprint } from './payments-preflight-core';

// Huella autorizada de C2 (8 componentes), construida tras --identify (Payments F1, 0.b).
export const C2_AUTHORIZED_FINGERPRINT_FILE = 'C:\\pei-c2\\payments-preflight-c2.authorized.json';

export const C2_MIGRATION_TARGET = Object.freeze({
  project: 'royal-paper-10258990',
  branch: 'br-shy-pond-b50a3m8f',
  endpoint: 'ep-withered-block-b5e8v9ov',
});
// Base de desarrollo: nunca es un destino válido.
export const DEVELOPMENT_TARGET = Object.freeze({ branch: 'br-royal-recipe-b54s5hnn', endpoint: 'ep-wandering-bonus-b5kxacor' });

// Migraciones que este ejecutor puede aplicar en C2, con su SHA-256. 0013 (2026-11-08) y 0014 (2026-11-09) ya están
// aplicadas y sus hashes quedan como requisito previo. 0015 y 0016 (M-1c): PREPARADAS, sin aplicar; cada una exige
// autorización expresa y respaldo. Pueden estar pendientes varias, pero cada ejecución aplica SOLO la siguiente.
export const AUTHORIZED_MIGRATIONS = Object.freeze([
  Object.freeze({ idx: 15, tag: '0015_m08_m1c_agenda_block_not_null', sha256: '7652c22e8ea4598ca290338ad030fec40170da46c985591bdc85874d7909ef8d' }),
  Object.freeze({ idx: 16, tag: '0016_m08_m1c_wait_defaults', sha256: 'fd9f6f77a778e010a064bd45644f5754faf6b6221387cdcef35e7060aa584936' }),
  // Payments F1: autorizada SOLO para C2 el 2026-11-15 (Payments-decisiones.md §7.4). Migración protegida: exige la
  // huella de 8 componentes y pei.migration_authorized (scripts/migration-authorization.ts).
  Object.freeze({ idx: 17, tag: '0017_payments_f1', sha256: '5593858840293a7d46866dbd37ada7345c5616cda84db1c566a37b8f840944b1' }),
  // Stripe como proveedor (solo amplía payment_provider_enum): autorizada para C2 el 2026-11-15, con una autorización
  // propia e independiente de la de desarrollo (Payments-decisiones.md §8.2). Protegida (R-1), igual que 0017.
  Object.freeze({ idx: 18, tag: '0018_payments_stripe_provider', sha256: 'f15b342a27a8367b94b1be5dc62a550096891e6e9b8d8e786ab2dda25029be56' }),
]);

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

export interface MigrationPlan {
  idx: number;
  tag: string;
  sha256: string;
  when: number;
  // Journal que se entrega al migrador de Drizzle: desde la 0000 hasta la siguiente pendiente, ninguna más.
  entries: JournalEntry[];
  // Todas las pendientes, en orden (la primera es la que se aplica).
  pending: string[];
}

// Plan de UNA migración: la siguiente pendiente. La BD tiene exactamente las primeras N entradas del journal (orden,
// hash y `when`); las pendientes son consecutivas, con `when` creciente, y todas están en AUTHORIZED_MIGRATIONS con su
// tag y SHA-256. Cualquier diferencia detiene el plan antes de escribir.
export function planNextMigration(journal: JournalEntry[], readSql: (tag: string) => string, applied: AppliedMigration[]): MigrationPlan {
  if (journal.length === 0) throw new C2MigrateError('el journal está vacío');
  journal.forEach((e, i) => {
    if (e.idx !== i) throw new C2MigrateError(`el journal no es consecutivo en la entrada ${i}`);
    if (i > 0 && !(Number(e.when) > Number(journal[i - 1].when))) throw new C2MigrateError(`el journal no tiene when creciente en la entrada ${i}`);
  });
  const n = applied.length;
  if (n === journal.length) throw new C2MigrateError(`no hay migraciones pendientes: la BD ya tiene las ${n} del journal`);
  if (n > journal.length) throw new C2MigrateError(`la BD tiene ${n} migraciones registradas; el journal solo ${journal.length}`);
  applied.forEach((m, i) => {
    const e = journal[i];
    if (m.hash !== sha256(readSql(e.tag))) throw new C2MigrateError(`el hash registrado ${i} no coincide con ${e.tag}`);
    if (String(m.created_at) !== String(e.when)) throw new C2MigrateError(`el created_at registrado ${i} no coincide con el journal`);
  });
  const pending = journal.slice(n);
  for (const p of pending) {
    const authorized = AUTHORIZED_MIGRATIONS.find((a) => a.idx === p.idx);
    if (!authorized) throw new C2MigrateError(`la migración pendiente ${p.tag} (idx ${p.idx}) no está autorizada`);
    if (p.tag !== authorized.tag) throw new C2MigrateError(`la entrada ${p.idx} del journal es ${p.tag}, no ${authorized.tag}`);
    if (sha256(readSql(p.tag)) !== authorized.sha256) throw new C2MigrateError(`el SHA-256 de ${p.tag}.sql no es el autorizado`);
  }
  const next = pending[0];
  if (n > 0 && Math.max(...applied.map((m) => Number(m.created_at))) >= Number(next.when)) {
    throw new C2MigrateError('el journal de la siguiente migración no es posterior a la última aplicada');
  }
  const nextAuthorized = AUTHORIZED_MIGRATIONS.find((a) => a.idx === next.idx)!;
  return {
    idx: next.idx, tag: next.tag, sha256: nextAuthorized.sha256, when: next.when,
    entries: journal.slice(0, next.idx + 1), pending: pending.map((p) => p.tag),
  };
}

// Comprobación posterior: exactamente una migración nueva, la planificada, con su hash y su `when`.
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
    // Aplica lo que falte de `entries` (el migrador de Drizzle con un journal que termina en la siguiente).
    migrate: (entries: JournalEntry[]) => Promise<void>;
    close: () => Promise<void>;
    // R-1 (migraciones protegidas): huella de 8 componentes en ESTA conexión y consultas de la variable de autorización.
    // Opcionales: si faltan y la migración es protegida, el ejecutor se detiene (fallo cerrado).
    fingerprint?: (url: string) => Promise<Fingerprint>;
    query?: Query;
  }>;
  // Huella autorizada del destino (archivo fuera del repositorio). Sin ella, una migración protegida no se aplica.
  readAuthorizedFingerprint?: () => string | null;
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
    const plan = planNextMigration(deps.readJournal(), deps.readSql, before);
    deps.log(`plan: ${before.length} registradas; pendientes ${plan.pending.join(', ')}; esta ejecución aplica solo ${plan.tag} (sha256 ${plan.sha256})`);
    if (!apply) {
      deps.log('verificación sin escritura: use --apply para aplicar');
      return { applied: false, plan };
    }
    // Identidad otra vez justo antes de escribir (misma conexión del migrador).
    assertRuntimeIdentity(await conn.identity());
    // R-1: solo para una migración protegida y DESPUÉS de la identidad de Neon: huella de 8 componentes, sesión sin
    // autorización heredada y, entonces, pei.migration_authorized. Se retira siempre después de migrar.
    const auth = await authorizeForRunner(conn, url, plan.tag, deps.readAuthorizedFingerprint, C2_AUTHORIZED_FINGERPRINT_FILE, 'C2');
    try {
      await conn.migrate(plan.entries);
    } finally {
      await auth.reset();
    }
    const after = await conn.applied();
    assertAppliedAfter(before, after, plan);
    deps.log(`aplicada ${plan.tag}; ${after.length} migraciones registradas`);
    return { applied: true, plan };
  } finally {
    await conn.close();
  }
}
