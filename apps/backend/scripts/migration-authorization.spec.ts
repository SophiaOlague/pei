import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AUTHORIZATION_SETTING,
  authorizeForRunner,
  authorizeProtectedMigration,
  loadAuthorizedFor,
  MigrationAuthorizationError,
  PROTECTED_MIGRATIONS,
  SQL_PERSISTENT_AUTHORIZATION,
  SQL_READ_AUTHORIZATION,
  SQL_RESET_AUTHORIZATION,
  sqlSetAuthorization,
  type Query,
} from './migration-authorization';
import { assertDrizzleKitCommandAllowed, drizzleKitCommand, MIGRATE_INSTRUCTIONS } from './drizzle-kit-guard';
import { AUTHORIZED_MIGRATIONS, C2_AUTHORIZED_FINGERPRINT_FILE, sha256 } from './c2-migrate-core';
import { DEV_AUTHORIZED_FINGERPRINT_FILE, DEV_AUTHORIZED_MIGRATIONS } from './dev-migrate-core';
import { hostHash, type AuthorizedTarget, type Fingerprint } from './payments-preflight-core';

// R-1: ningún comando genérico puede aplicar 0017 y los ejecutores controlados no definen la autorización antes de
// validar el destino. Sin conexiones: sesiones SQL falsas y comprobaciones del código fuente.
const BACKEND = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(BACKEND, rel), 'utf8');
const URL_ = 'postgresql://rol:clave@ep-c2-endpoint.c-7.us-east-2.aws.neon.tech/neondb';
const FP: Fingerprint = {
  database: 'neondb', system_identifier: '1', server_version: '180006', current_user: 'rol', neon_project_id: 'p',
  neon_branch_id: 'b', neon_endpoint_id: 'ep-c2-endpoint', host_sha256_16: hostHash('ep-c2-endpoint.c-7.us-east-2.aws.neon.tech'),
};
const AUTH: AuthorizedTarget = { label: 'C2', fingerprint: FP };

function session(opts: { fp?: Partial<Fingerprint>; inherited?: string | null; persistent?: number; fingerprintError?: Error } = {}) {
  const log: string[] = [];
  const query: Query = async (text) => {
    log.push(text);
    if (text === SQL_READ_AUTHORIZATION) return [{ v: opts.inherited ?? null }];
    if (text === SQL_PERSISTENT_AUTHORIZATION) return [{ n: opts.persistent ?? 0 }];
    return [];
  };
  const fingerprint = async () => {
    log.push('fingerprint');
    if (opts.fingerprintError) throw opts.fingerprintError;
    return { ...FP, ...opts.fp };
  };
  return { log, query, fingerprint };
}
const SET = sqlSetAuthorization('0017');
type MigrationEntry = { idx: number; tag: string; sha256: string };

describe('R-1 · drizzle-kit migrate/push bloqueados', () => {
  it.each([
    [['node', 'drizzle-kit', 'migrate']],
    [['node', 'drizzle-kit', 'push']],
    [['node', 'drizzle-kit', '--config', 'drizzle.config.ts', 'migrate']],
    [['node', 'drizzle-kit', 'migrate', '--config=drizzle.config.ts']],
  ])('rechaza %j con las instrucciones', (argv) => {
    expect(() => assertDrizzleKitCommandAllowed(argv)).toThrow(MIGRATE_INSTRUCTIONS);
  });

  it.each([[['node', 'drizzle-kit', 'generate']], [['node', 'drizzle-kit', 'studio']], [['node', 'drizzle-kit', 'check']], [['node', 'drizzle-kit', 'up']], [['node', 'x']]])(
    'permite %j',
    (argv) => {
      expect(() => assertDrizzleKitCommandAllowed(argv)).not.toThrow();
    },
  );

  it('drizzleKitCommand toma el primer argumento que no es opción', () => {
    expect(drizzleKitCommand(['n', 'k', 'migrate', '--config', 'x'])).toBe('migrate');
    expect(drizzleKitCommand(['n', 'k'])).toBeUndefined();
  });

  it('drizzle.config.ts llama a la guarda con process.argv antes de leer el .env', () => {
    const config = read('drizzle.config.ts');
    const guard = config.indexOf('assertDrizzleKitCommandAllowed(process.argv);');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(config.indexOf('dotenv.config();'));
    expect(config).toMatch(/import \{ assertDrizzleKitCommandAllowed \} from '\.\/scripts\/drizzle-kit-guard';/);
  });

  it('pnpm db:migrate ya no invoca drizzle-kit migrate', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    expect(scripts['db:migrate']).toBe('ts-node --transpile-only scripts/db-migrate-blocked.ts');
    expect(Object.values(scripts).some((s) => /drizzle-kit (migrate|push)/.test(s))).toBe(false);
    expect(scripts['db:generate']).toBe('drizzle-kit generate');
    const blocked = read('scripts/db-migrate-blocked.ts');
    expect(blocked).toMatch(/process\.exitCode = 1;/);
    expect(blocked).not.toMatch(/migrate\(|drizzle-orm|neondatabase/);
  });
});

describe('R-1 · guardia dentro de 0017', () => {
  const up = read('src/db/proposals/payments-f1/0017_payments_f1.up.sql');
  const guard = /do \$\$[\s\S]*?end \$\$;/.exec(up)![0];

  it('la migración registrada es idéntica a la propuesta', () => {
    expect(read('src/db/migrations/0017_payments_f1.sql')).toBe(up);
  });

  it('exige pei.migration_authorized = 0017 como PRIMERA comprobación, antes de cualquier DDL', () => {
    const body = guard.slice(guard.indexOf('begin'));
    const firstIf = body.indexOf('if ');
    expect(body.slice(firstIf)).toMatch(/^if coalesce\(current_setting\('pei\.migration_authorized', true\), ''\) <> '0017' then\n\s+raise exception '0017 requiere autorización explícita/);
    expect(up.indexOf(guard)).toBeLessThan(up.indexOf('drop table'));
  });

  it('rechaza una autorización persistente (ALTER ROLE/DATABASE … SET)', () => {
    expect(guard).toMatch(/from pg_db_role_setting where array_to_string\(setconfig, ','\) like '%pei\.migration_authorized%'/);
  });

  it('las migraciones históricas no usan la variable', () => {
    const journal = JSON.parse(read('src/db/migrations/meta/_journal.json')) as { entries: { idx: number; tag: string }[] };
    for (const e of journal.entries.filter((x) => x.idx < 17)) {
      expect(read(`src/db/migrations/${e.tag}.sql`)).not.toContain('pei.migration_authorized');
    }
  });
});

describe('R-1 · autorización de sesión (authorizeProtectedMigration)', () => {
  it('orden: huella completa → sin variable heredada → sin valor persistente → SET; reset hace RESET', async () => {
    const s = session();
    const auth = await authorizeProtectedMigration(s, '0017_payments_f1', () => AUTH);
    expect(s.log).toEqual(['fingerprint', SQL_READ_AUTHORIZATION, SQL_PERSISTENT_AUTHORIZATION, SET]);
    await auth.reset();
    expect(s.log.at(-1)).toBe(SQL_RESET_AUTHORIZATION);
  });

  it.each(Object.keys(FP))('si %s no coincide, aborta sin consultar ni definir la variable', async (component) => {
    const s = session({ fp: { [component]: 'otro' } });
    await expect(authorizeProtectedMigration(s, '0017_payments_f1', () => AUTH)).rejects.toThrow(/no coincide/);
    expect(s.log).toEqual(['fingerprint']);
  });

  it('si la huella no se puede leer (sin permiso), aborta sin definir la variable', async () => {
    const s = session({ fingerprintError: new Error('sin permiso') });
    await expect(authorizeProtectedMigration(s, '0017_payments_f1', () => AUTH)).rejects.toThrow('sin permiso');
    expect(s.log).not.toContain(SET);
  });

  it('si la huella autorizada no se puede cargar, aborta sin definir la variable', async () => {
    const s = session();
    await expect(authorizeProtectedMigration(s, '0017_payments_f1', () => loadAuthorizedFor('x', 'C2', () => null))).rejects.toThrow();
    expect(s.log).not.toContain(SET);
  });

  it.each(['0017', '1'])('una variable heredada (%s) no autoriza: aborta', async (inherited) => {
    const s = session({ inherited });
    await expect(authorizeProtectedMigration(s, '0017_payments_f1', () => AUTH)).rejects.toThrow(/heredada/);
    expect(s.log).not.toContain(SET);
  });

  it('un valor persistente (ALTER ROLE/DATABASE) aborta', async () => {
    const s = session({ persistent: 1 });
    await expect(authorizeProtectedMigration(s, '0017_payments_f1', () => AUTH)).rejects.toThrow(/persistente/);
    expect(s.log).not.toContain(SET);
  });

  it('una migración no protegida no consulta nada ni define la variable', async () => {
    const s = session();
    const auth = await authorizeProtectedMigration(s, '0016_m08_m1c_wait_defaults', () => AUTH);
    expect(auth.protected).toBe(false);
    expect(s.log).toEqual([]);
  });

  it('el valor de la variable es exactamente el de la migración protegida', () => {
    expect(PROTECTED_MIGRATIONS).toEqual({ '0017_payments_f1': '0017', '0018_payments_stripe_provider': '0018' });
    expect(SET).toBe(`SET ${AUTHORIZATION_SETTING} = '0017'`);
    expect(() => sqlSetAuthorization("0017'; drop table x; --")).toThrow(MigrationAuthorizationError);
  });
});

describe('R-1 · ejecutores controlados', () => {
  it('authorizeForRunner falla cerrado si la conexión no ofrece huella o consultas', async () => {
    await expect(authorizeForRunner({}, URL_, '0017_payments_f1', () => JSON.stringify(AUTH), 'f', 'C2')).rejects.toThrow(/exige huella completa/);
    await expect(authorizeForRunner({}, URL_, '0016_m08_m1c_wait_defaults', undefined, 'f', 'C2')).resolves.toMatchObject({ protected: false });
  });

  it('authorizeForRunner usa la huella del archivo autorizado del destino y su rótulo', async () => {
    const s = session();
    const conn = { fingerprint: async () => s.fingerprint(), query: s.query };
    await expect(authorizeForRunner(conn, URL_, '0017_payments_f1', () => JSON.stringify({ label: 'desarrollo', fingerprint: FP }), 'f', 'C2'))
      .rejects.toThrow(/no es la de C2/);
    expect(s.log).not.toContain(SET);
    await expect(authorizeForRunner(conn, URL_, '0017_payments_f1', () => JSON.stringify(AUTH), 'f', 'C2')).resolves.toMatchObject({ protected: true });
    expect(s.log.at(-1)).toBe(SET);
  });

  it.each([
    ['scripts/c2-migrate-core.ts', 'assertRuntimeIdentity', "C2_AUTHORIZED_FINGERPRINT_FILE, 'C2'"],
    ['scripts/dev-migrate-core.ts', 'assertDevRuntimeIdentity', "DEV_AUTHORIZED_FINGERPRINT_FILE, 'desarrollo'"],
  ])('%s: identidad de Neon → autorización → migrate en try/finally con reset', (file, identity, args) => {
    const source = read(file).replace(/\r\n/g, '\n');
    const lastIdentity = source.lastIndexOf(`${identity}(await conn.identity());`);
    const auth = source.indexOf(`const auth = await authorizeForRunner(conn, url, plan.tag, deps.readAuthorizedFingerprint, ${args});`);
    const migrate = source.indexOf('await conn.migrate(plan.entries);');
    expect(lastIdentity).toBeGreaterThan(-1);
    expect(auth).toBeGreaterThan(lastIdentity);
    expect(migrate).toBeGreaterThan(auth);
    expect(source.slice(auth, migrate + 200)).toMatch(/try \{\n\s+await conn\.migrate\(plan\.entries\);\n\s+\} finally \{\n\s+await auth\.reset\(\);/);
    expect(source.match(/conn\.migrate\(/g)).toHaveLength(1);
    expect(source).not.toMatch(/SET pei\.migration_authorized|sqlSetAuthorization/);
  });

  it('los ejecutores reales leen la huella en la MISMA conexión, en solo lectura, y no definen la variable por su cuenta', () => {
    for (const file of ['scripts/c2-migrate.ts', 'scripts/dev-migrate.ts']) {
      const source = read(file);
      expect(source).toMatch(/fingerprint: async \(u\) => \{\s+await client\.query\('begin transaction read only'\);\s+try \{\s+return await readConnectionFingerprint\(/);
      expect(source).not.toMatch(/pei\.migration_authorized|sqlSetAuthorization|process\.env\.PEI/);
    }
  });

  // Autorizaciones expresas e independientes del 2026-11-15: C2 (Payments-decisiones.md §7.4) y desarrollo (§7.5). Cada
  // ejecutor tiene su propia lista y su propia huella; ninguno toma la lista del otro.
  const ENTRY_0017 = { idx: 17, tag: '0017_payments_f1', sha256: '5593858840293a7d46866dbd37ada7345c5616cda84db1c566a37b8f840944b1' };
  const after16 = (list: readonly MigrationEntry[]) => list.filter((m) => m.idx === 17 || m.tag === '0017_payments_f1');

  it('0017 está autorizada en el ejecutor de C2, con el SHA-256 de su SQL, y sigue siendo una migración protegida', () => {
    expect(after16(AUTHORIZED_MIGRATIONS as readonly MigrationEntry[])).toEqual([ENTRY_0017]);
    expect(sha256(read('src/db/migrations/0017_payments_f1.sql'))).toBe(ENTRY_0017.sha256);
    expect(PROTECTED_MIGRATIONS['0017_payments_f1']).toBe('0017');
  });

  it('0017 está autorizada en el ejecutor de desarrollo con el mismo SHA-256, en su propia lista', () => {
    expect(after16(DEV_AUTHORIZED_MIGRATIONS as readonly MigrationEntry[])).toEqual([ENTRY_0017]);
    // Independencia: el núcleo de C2 no conoce la lista de desarrollo, y el de desarrollo solo importa utilidades de C2.
    expect(read('scripts/c2-migrate-core.ts')).not.toMatch(/DEV_AUTHORIZED_MIGRATIONS|dev-migrate-core/);
    expect(read('scripts/dev-migrate-core.ts')).toMatch(/import \{ sha256, type AppliedMigration, type JournalEntry, type RuntimeIdentity \} from '\.\/c2-migrate-core';/);
    expect(read('scripts/dev-migrate-core.ts').replace(/DEV_AUTHORIZED_MIGRATIONS/g, '')).not.toMatch(/AUTHORIZED_MIGRATIONS/);
  });

  // 0018 (Stripe como proveedor): autorizaciones expresas e independientes del 2026-11-15 para C2 (§8.2) y desarrollo (§8.3).
  const ENTRY_0018 = { idx: 18, tag: '0018_payments_stripe_provider', sha256: 'f15b342a27a8367b94b1be5dc62a550096891e6e9b8d8e786ab2dda25029be56' };

  it('0018 está autorizada en cada ejecutor, en su propia lista, con el SHA-256 de su SQL, y es protegida', () => {
    for (const list of [AUTHORIZED_MIGRATIONS, DEV_AUTHORIZED_MIGRATIONS] as unknown as (readonly MigrationEntry[])[]) {
      expect(list.filter((m) => m.idx === 18)).toEqual([ENTRY_0018]);
    }
    expect(sha256(read('src/db/migrations/0018_payments_stripe_provider.sql'))).toBe(ENTRY_0018.sha256);
    expect(PROTECTED_MIGRATIONS['0018_payments_stripe_provider']).toBe('0018');
  });

  it('0018 exige pei.migration_authorized = 0018 como PRIMERA comprobación y solo amplía el enum', () => {
    const up = read('src/db/migrations/0018_payments_stripe_provider.sql');
    expect(up.includes('\r')).toBe(false);
    const guard = /do \$\$[\s\S]*?end \$\$;/.exec(up)![0];
    const body = guard.slice(guard.indexOf('begin'));
    expect(body.slice(body.indexOf('if '))).toMatch(/^if coalesce\(current_setting\('pei\.migration_authorized', true\), ''\) <> '0018' then\n\s+raise exception '0018 requiere autorización explícita/);
    expect(guard).toMatch(/from pg_db_role_setting where array_to_string\(setconfig, ','\) like '%pei\.migration_authorized%'/);
    expect(guard).toMatch(/requiere 0017/);
    expect(guard).toMatch(/ya está aplicada/);
    const ddl = up.replace(guard, '').replace(/--.*$/gm, '').trim();
    expect(ddl).toBe("alter type payment_provider_enum add value 'stripe';");
  });

  it('ninguna migración posterior a 0018 está autorizada en ningún ejecutor', () => {
    for (const list of [AUTHORIZED_MIGRATIONS, DEV_AUTHORIZED_MIGRATIONS] as unknown as (readonly MigrationEntry[])[]) {
      expect(list.filter((m) => m.idx > 18)).toEqual([]);
    }
  });

  it('rutas de las huellas autorizadas (fuera del repositorio)', () => {
    expect(C2_AUTHORIZED_FINGERPRINT_FILE).toBe('C:\\pei-c2\\payments-preflight-c2.authorized.json');
    expect(DEV_AUTHORIZED_FINGERPRINT_FILE).toBe('C:\\pei-dev\\payments-preflight-dev.authorized.json');
  });

  it('ningún código fuera de migration-authorization.ts (y su prueba) construye el SET de la autorización', () => {
    for (const file of ['scripts/c2-migrate.ts', 'scripts/dev-migrate.ts', 'scripts/c2-migrate-core.ts', 'scripts/dev-migrate-core.ts',
      'scripts/payments-preflight.ts', 'scripts/payments-preflight-core.ts', 'drizzle.config.ts']) {
      expect(read(file)).not.toMatch(/SET pei\.migration_authorized/i);
    }
  });
});
