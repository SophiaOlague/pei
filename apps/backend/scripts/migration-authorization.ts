// Autorización de migraciones protegidas (R-1). Hoy: 0017_payments_f1, 0018_payments_stripe_provider y 0019_video_v1
// (videoconsulta, escrita y sin autorizar en ningún ejecutor); cada una exige
// en su propia sesión current_setting('pei.migration_authorized', true) = su número (precondición de su SQL).
//
// La variable SOLO la establece un ejecutor controlado (c2-migrate, dev-migrate o el spec de integración de F1), y SOLO
// después de:
//   1. la verificación existente de la identidad de Neon de ese ejecutor;
//   2. la verificación de los OCHO componentes de la huella autorizada del destino, en la misma conexión;
//   3. comprobar que la sesión no la trae ya definida (por PGOPTIONS, parámetros de arranque, ALTER ROLE o ALTER DATABASE).
// Después de migrar se retira con RESET, incluso si la migración falla. Este módulo no tiene E/S propia.
import { readFileSync } from 'fs';
import {
  assertFingerprintMatches,
  FINGERPRINT_COMPONENTS,
  hostHash,
  hostOf,
  parseAuthorizedTarget,
  PreflightAbort,
  SQL_FINGERPRINT,
  type AuthorizedTarget,
  type Fingerprint,
} from './payments-preflight-core';

export const AUTHORIZATION_SETTING = 'pei.migration_authorized';

// Migraciones que exigen la variable, con el valor exacto que esperan.
export const PROTECTED_MIGRATIONS: Readonly<Record<string, string>> = Object.freeze({
  '0017_payments_f1': '0017',
  '0018_payments_stripe_provider': '0018',
  '0019_video_v1': '0019',
});

export const SQL_READ_AUTHORIZATION = `SELECT current_setting('${AUTHORIZATION_SETTING}', true) AS v`;
// Valores persistentes (ALTER ROLE … SET / ALTER DATABASE … SET): nunca deben existir.
export const SQL_PERSISTENT_AUTHORIZATION = `SELECT count(*)::int AS n FROM pg_db_role_setting WHERE array_to_string(setconfig, ',') LIKE '%${AUTHORIZATION_SETTING}%'`;
export const sqlSetAuthorization = (value: string) => {
  if (!/^[0-9]{4}$/.test(value)) throw new MigrationAuthorizationError('valor de autorización no válido');
  return `SET ${AUTHORIZATION_SETTING} = '${value}'`;
};
export const SQL_RESET_AUTHORIZATION = `RESET ${AUTHORIZATION_SETTING}`;

export class MigrationAuthorizationError extends Error {
  constructor(reason: string) {
    super(`autorización de migración detenida: ${reason}`);
    this.name = 'MigrationAuthorizationError';
  }
}

export type Query = (text: string) => Promise<Record<string, unknown>[]>;

// Los ocho componentes, leídos en la conexión dada. Fallo cerrado: nulo, vacío, más de una fila o sin permiso aborta;
// del error del driver solo se informa el SQLSTATE.
export async function readConnectionFingerprint(query: Query, databaseUrl: string): Promise<Fingerprint> {
  const fp: Partial<Fingerprint> = {};
  for (const [component, text] of Object.entries(SQL_FINGERPRINT) as [Exclude<keyof Fingerprint, 'host_sha256_16'>, string][]) {
    let rows: Record<string, unknown>[];
    try {
      rows = await query(text);
    } catch (error) {
      const code = (error as { code?: unknown })?.code;
      throw new PreflightAbort(`no se pudo obtener ${component} (SQLSTATE ${typeof code === 'string' ? code : 'desconocido'})`);
    }
    if (rows.length !== 1) throw new PreflightAbort(`huella: ${component}: se esperaba exactamente una fila`);
    const v = rows[0].v;
    if (typeof v !== 'string' || !v.trim()) throw new PreflightAbort(`huella incompleta: no se obtuvo ${component}`);
    fp[component] = v.trim();
  }
  fp.host_sha256_16 = hostHash(hostOf(databaseUrl));
  for (const c of FINGERPRINT_COMPONENTS) if (!fp[c]) throw new PreflightAbort(`huella incompleta: no se obtuvo ${c}`);
  return fp as Fingerprint;
}

export function loadAuthorizedFor(path: string, expectedLabel: string, read: (p: string) => string | null = defaultRead): AuthorizedTarget {
  const target = parseAuthorizedTarget(read(path));
  if (target.label !== expectedLabel) throw new MigrationAuthorizationError(`la huella autorizada no es la de ${expectedLabel}`);
  return target;
}

function defaultRead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export interface AuthorizationSession {
  // Lee los 8 componentes en la MISMA conexión del migrador (en una transacción de solo lectura).
  fingerprint: () => Promise<Fingerprint>;
  query: Query;
}

// Prepara la sesión para una migración protegida. Devuelve la función que retira la autorización. Si `tag` no es una
// migración protegida, no hace nada (la variable nunca se define para otras migraciones).
export async function authorizeProtectedMigration(
  session: AuthorizationSession,
  tag: string,
  authorized: () => AuthorizedTarget,
): Promise<{ protected: boolean; reset: () => Promise<void> }> {
  const value = PROTECTED_MIGRATIONS[tag];
  if (value === undefined) return { protected: false, reset: async () => undefined };
  // 1. Huella completa del destino (lanza ante cualquier diferencia o componente ausente).
  assertFingerprintMatches(await session.fingerprint(), authorized());
  // 2. La sesión no debe traer la variable heredada ni persistente.
  const inherited = (await session.query(SQL_READ_AUTHORIZATION))[0]?.v;
  if (typeof inherited === 'string' && inherited !== '') {
    throw new MigrationAuthorizationError(`la sesión ya trae ${AUTHORIZATION_SETTING} (heredada); no se migra`);
  }
  const persistent = Number((await session.query(SQL_PERSISTENT_AUTHORIZATION))[0]?.n ?? 1);
  if (persistent !== 0) throw new MigrationAuthorizationError(`existe un valor persistente de ${AUTHORIZATION_SETTING} (ALTER ROLE/DATABASE)`);
  // 3. Solo entonces, la autorización de sesión.
  await session.query(sqlSetAuthorization(value));
  return { protected: true, reset: async () => void (await session.query(SQL_RESET_AUTHORIZATION)) };
}

// Uso desde los ejecutores de migración (c2-migrate, dev-migrate), justo después de su verificación de identidad de
// Neon y antes de migrar. Fallo cerrado: una migración protegida sin huella, sin consultas o sin la huella autorizada
// del destino no se aplica.
export async function authorizeForRunner(
  conn: { fingerprint?: (url: string) => Promise<Fingerprint>; query?: Query },
  url: string,
  tag: string,
  read: (() => string | null) | undefined,
  file: string,
  label: string,
): Promise<{ protected: boolean; reset: () => Promise<void> }> {
  if (PROTECTED_MIGRATIONS[tag] === undefined) return { protected: false, reset: async () => undefined };
  if (!conn.fingerprint || !conn.query) {
    throw new MigrationAuthorizationError(`la migración ${tag} exige huella completa y control de la autorización de sesión`);
  }
  const fingerprint = conn.fingerprint;
  return authorizeProtectedMigration(
    { fingerprint: () => fingerprint(url), query: conn.query },
    tag,
    () => loadAuthorizedFor(file, label, read ? () => read() : undefined),
  );
}
