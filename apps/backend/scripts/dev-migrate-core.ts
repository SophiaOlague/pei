// Núcleo del ejecutor de migraciones EXCLUSIVO de DESARROLLO (scripts/dev-migrate.ts). Separado de c2-migrate: destino,
// archivo de entorno, lista de migraciones autorizadas y mensajes propios. Sin E/S propia: el archivo de entorno, el
// journal, el SQL y la conexión se inyectan, así que cada salvaguarda se prueba con dobles.
//
// Falla de forma cerrada: cualquier dato ausente, ilegible o distinto de lo esperado detiene el proceso ANTES de escribir.
// - DATABASE_URL se toma SOLO del contenido de apps/backend/.env leído por la CLI (nunca de process.env ni de dotenv, y
//   nunca de .env.c2). La URL no se imprime ni se registra.
// - Identidad doble: por la URL (endpoint de desarrollo; nunca el de C2) y por la conexión real (neon.* en una
//   transacción READ ONLY), antes de planear y otra vez justo antes de escribir. Solo vale la identidad exacta de
//   desarrollo: cualquier otro proyecto, rama o endpoint (C2, sus respaldos, producción) se rechaza.
// - Se aplica SOLO la siguiente migración pendiente: la BD tiene exactamente un prefijo del journal (hash y `when`), las
//   pendientes son consecutivas y todas están autorizadas por índice, tag y SHA-256.
import { sha256, type AppliedMigration, type JournalEntry, type RuntimeIdentity } from './c2-migrate-core';

export const DEV_MIGRATION_TARGET = Object.freeze({
  project: 'royal-paper-10258990',
  branch: 'br-royal-recipe-b54s5hnn',
  endpoint: 'ep-wandering-bonus-b5kxacor',
});

// Destinos conocidos que NUNCA son desarrollo, rechazados con un mensaje explícito: C2 y los respaldos de C2 y de
// desarrollo. Producción no tiene identidad todavía (proyecto futuro): queda rechazada por exigir la identidad exacta.
export const DEV_FORBIDDEN_TARGETS = Object.freeze([
  Object.freeze({ name: 'C2', branch: 'br-shy-pond-b50a3m8f', endpoint: 'ep-withered-block-b5e8v9ov' }),
  Object.freeze({ name: 'respaldo de desarrollo previo a 0013', branch: 'br-rapid-water-b5za50z4', endpoint: 'ep-calm-snow-b5eox1a8' }),
  Object.freeze({ name: 'respaldo c2-pre-0013', branch: 'br-silent-butterfly-b5z128fu', endpoint: 'ep-holy-sea-b5zxmnm6' }),
  Object.freeze({ name: 'respaldo de C2 previo a 0015', branch: 'br-hidden-fire-b5u27hik', endpoint: null }),
  Object.freeze({ name: 'respaldo de C2 previo a 0016', branch: 'br-red-cell-b5bpd2dp', endpoint: null }),
]);

// Migraciones que este ejecutor puede aplicar en desarrollo. 0000–0013 ya están registradas en desarrollo (0013
// aplicada y registrada el 2026-11-07, M08-diseno A.15 y A.16): son el requisito previo. Cada una exige respaldo y
// autorización expresa; cada ejecución aplica solo la siguiente.
export const DEV_AUTHORIZED_MIGRATIONS = Object.freeze([
  Object.freeze({ idx: 14, tag: '0014_m08_m1_legal_acceptance', sha256: '72af287cf7336d6f56942b35576b89c9cf0e1e3566b42f41ab62145ab440e24c' }),
  Object.freeze({ idx: 15, tag: '0015_m08_m1c_agenda_block_not_null', sha256: '7652c22e8ea4598ca290338ad030fec40170da46c985591bdc85874d7909ef8d' }),
  Object.freeze({ idx: 16, tag: '0016_m08_m1c_wait_defaults', sha256: 'fd9f6f77a778e010a064bd45644f5754faf6b6221387cdcef35e7060aa584936' }),
]);

export class DevMigrateError extends Error {
  constructor(reason: string) {
    super(`dev-migrate detenido: ${reason}`);
    this.name = 'DevMigrateError';
  }
}

// DATABASE_URL del contenido del archivo. Sin interpolación ni valores por defecto; exactamente una definición.
export function databaseUrlFromDevEnv(content: string | null | undefined): string {
  if (!content) throw new DevMigrateError('no se pudo leer el archivo de entorno de desarrollo');
  const lines = content.split(/\r?\n/).filter((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (lines.length !== 1) throw new DevMigrateError(lines.length === 0 ? 'falta DATABASE_URL en el archivo de desarrollo' : 'DATABASE_URL aparece más de una vez');
  const raw = lines[0].slice(lines[0].indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  if (!raw) throw new DevMigrateError('DATABASE_URL vacía en el archivo de desarrollo');
  return raw;
}

// La URL debe ser la del endpoint de desarrollo (directo o su pooler). Devuelve la URL del endpoint DIRECTO, la que se
// usa para migrar (el DDL y los candados no pasan por el pooler). Los mensajes nunca incluyen la URL.
export function directDevUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DevMigrateError('DATABASE_URL inválida');
  }
  const host = parsed.hostname;
  if (!host) throw new DevMigrateError('DATABASE_URL sin host');
  for (const t of DEV_FORBIDDEN_TARGETS) {
    if (t.endpoint && host.includes(t.endpoint)) throw new DevMigrateError(`DATABASE_URL apunta a ${t.name}`);
  }
  const [first, ...rest] = host.split('.');
  const target = DEV_MIGRATION_TARGET.endpoint;
  if (first !== target && first !== `${target}-pooler`) throw new DevMigrateError('DATABASE_URL no es el endpoint de desarrollo');
  parsed.hostname = [target, ...rest].join('.');
  return parsed.toString();
}

// Identidad REAL de la conexión: exactamente la de desarrollo.
export function assertDevRuntimeIdentity(actual: RuntimeIdentity): void {
  if (!actual || !actual.project || !actual.branch || !actual.endpoint) throw new DevMigrateError('la conexión no expone la identidad de Neon (neon.*)');
  const forbidden = DEV_FORBIDDEN_TARGETS.find((t) => t.branch === actual.branch || (t.endpoint !== null && t.endpoint === actual.endpoint));
  if (forbidden) throw new DevMigrateError(`la conexión real es ${forbidden.name}`);
  if (actual.project !== DEV_MIGRATION_TARGET.project) throw new DevMigrateError('el proyecto real no es el de desarrollo');
  if (actual.branch !== DEV_MIGRATION_TARGET.branch) throw new DevMigrateError('la rama real no es la de desarrollo');
  if (actual.endpoint !== DEV_MIGRATION_TARGET.endpoint) throw new DevMigrateError('el endpoint real no es el de desarrollo');
}

export interface DevMigrationPlan {
  idx: number;
  tag: string;
  sha256: string;
  when: number;
  // Journal que se entrega al migrador de Drizzle: de la 0000 hasta la siguiente pendiente, ninguna más.
  entries: JournalEntry[];
  // Todas las pendientes, en orden (la primera es la que se aplica).
  pending: string[];
}

// Plan de UNA migración: la siguiente pendiente (mismas reglas que c2-migrate, con la lista de desarrollo).
export function planNextDevMigration(journal: JournalEntry[], readSql: (tag: string) => string, applied: AppliedMigration[]): DevMigrationPlan {
  if (journal.length === 0) throw new DevMigrateError('el journal está vacío');
  journal.forEach((e, i) => {
    if (e.idx !== i) throw new DevMigrateError(`el journal no es consecutivo en la entrada ${i}`);
    if (i > 0 && !(Number(e.when) > Number(journal[i - 1].when))) throw new DevMigrateError(`el journal no tiene when creciente en la entrada ${i}`);
  });
  const n = applied.length;
  if (n === journal.length) throw new DevMigrateError(`no hay migraciones pendientes: la BD ya tiene las ${n} del journal`);
  if (n > journal.length) throw new DevMigrateError(`la BD tiene ${n} migraciones registradas; el journal solo ${journal.length}`);
  applied.forEach((m, i) => {
    const e = journal[i];
    if (m.hash !== sha256(readSql(e.tag))) throw new DevMigrateError(`el hash registrado ${i} no coincide con ${e.tag}`);
    if (String(m.created_at) !== String(e.when)) throw new DevMigrateError(`el created_at registrado ${i} no coincide con el journal`);
  });
  const pending = journal.slice(n);
  for (const p of pending) {
    const authorized = DEV_AUTHORIZED_MIGRATIONS.find((a) => a.idx === p.idx);
    if (!authorized) throw new DevMigrateError(`la migración pendiente ${p.tag} (idx ${p.idx}) no está autorizada para desarrollo`);
    if (p.tag !== authorized.tag) throw new DevMigrateError(`la entrada ${p.idx} del journal es ${p.tag}, no ${authorized.tag}`);
    if (sha256(readSql(p.tag)) !== authorized.sha256) throw new DevMigrateError(`el SHA-256 de ${p.tag}.sql no es el autorizado`);
  }
  const next = pending[0];
  if (n > 0 && Math.max(...applied.map((m) => Number(m.created_at))) >= Number(next.when)) {
    throw new DevMigrateError('el journal de la siguiente migración no es posterior a la última aplicada');
  }
  const nextAuthorized = DEV_AUTHORIZED_MIGRATIONS.find((a) => a.idx === next.idx)!;
  return {
    idx: next.idx, tag: next.tag, sha256: nextAuthorized.sha256, when: next.when,
    entries: journal.slice(0, next.idx + 1), pending: pending.map((p) => p.tag),
  };
}

// Comprobación posterior: exactamente un registro nuevo, el planificado, con su hash y su `when`.
export function assertDevAppliedAfter(before: AppliedMigration[], after: AppliedMigration[], plan: { sha256: string; when: number }) {
  if (after.length !== before.length + 1) throw new DevMigrateError(`tras migrar hay ${after.length} registros; se esperaban ${before.length + 1}`);
  before.forEach((m, i) => {
    if (after[i].hash !== m.hash || String(after[i].created_at) !== String(m.created_at)) throw new DevMigrateError(`el registro ${i} cambió durante la migración`);
  });
  const added = after[after.length - 1];
  if (added.hash !== plan.sha256 || String(added.created_at) !== String(plan.when)) throw new DevMigrateError('el registro nuevo no es la migración planificada');
}

export interface DevMigrateDeps {
  readEnvFile: () => string | null;
  readJournal: () => JournalEntry[];
  readSql: (tag: string) => string;
  connect: (url: string) => Promise<{
    identity: () => Promise<RuntimeIdentity>;
    applied: () => Promise<AppliedMigration[]>;
    // Aplica lo que falte de `entries` (el migrador de Drizzle con un journal que termina en la siguiente).
    migrate: (entries: JournalEntry[]) => Promise<void>;
    close: () => Promise<void>;
  }>;
  log: (line: string) => void;
}

// Sin `apply`, solo verifica (no escribe). Devuelve el plan aplicado o verificado.
export async function runDevMigrate(deps: DevMigrateDeps, apply: boolean) {
  const url = directDevUrl(databaseUrlFromDevEnv(deps.readEnvFile()));
  const conn = await deps.connect(url);
  try {
    assertDevRuntimeIdentity(await conn.identity());
    deps.log(`identidad verificada: ${DEV_MIGRATION_TARGET.project} / ${DEV_MIGRATION_TARGET.branch} / ${DEV_MIGRATION_TARGET.endpoint}`);
    const before = await conn.applied();
    const plan = planNextDevMigration(deps.readJournal(), deps.readSql, before);
    deps.log(`plan: ${before.length} registradas; pendientes ${plan.pending.join(', ')}; esta ejecución aplica solo ${plan.tag} (sha256 ${plan.sha256})`);
    if (!apply) {
      deps.log('verificación sin escritura: use --apply para aplicar');
      return { applied: false, plan };
    }
    // Identidad otra vez justo antes de escribir (misma conexión del migrador).
    assertDevRuntimeIdentity(await conn.identity());
    await conn.migrate(plan.entries);
    const after = await conn.applied();
    assertDevAppliedAfter(before, after, plan);
    deps.log(`aplicada ${plan.tag}; ${after.length} migraciones registradas`);
    return { applied: true, plan };
  } finally {
    await conn.close();
  }
}
