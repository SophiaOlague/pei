import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AUTHORIZED_MIGRATIONS, C2_MIGRATION_TARGET, C2MigrateError, DEVELOPMENT_TARGET, planNextMigration, runC2Migrate, sha256,
  type AppliedMigration, type C2MigrateDeps, type JournalEntry, type RuntimeIdentity,
} from './c2-migrate-core';
import {
  PROTECTED_MIGRATIONS, SQL_PERSISTENT_AUTHORIZATION, SQL_READ_AUTHORIZATION, SQL_RESET_AUTHORIZATION, sqlSetAuthorization,
} from './migration-authorization';
import { hostHash, type Fingerprint } from './payments-preflight-core';

// Sin conexiones reales: el archivo de entorno, el journal, el SQL y la conexión son dobles.
const C2_URL = `postgresql://u:p@${C2_MIGRATION_TARGET.endpoint}.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require`;
const DEV_URL = `postgresql://u:p@${DEVELOPMENT_TARGET.endpoint}.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require`;
const OK_IDENTITY: RuntimeIdentity = { project: C2_MIGRATION_TARGET.project, branch: C2_MIGRATION_TARGET.branch, endpoint: C2_MIGRATION_TARGET.endpoint };

// El hash autorizado no se puede invertir: el SQL de las migraciones autorizadas es el archivo real del repositorio.
const repoSql = (tag: string) => readFileSync(join(__dirname, '..', 'src', 'db', 'migrations', `${tag}.sql`), 'utf8');
const [M15, M16] = AUTHORIZED_MIGRATIONS;
const REAL = new Map<string, string>(AUTHORIZED_MIGRATIONS.map((m) => [m.tag, repoSql(m.tag)]));

// Journal 0000–0016 (sintético salvo 0015 y 0016) y BD en 0014: dos pendientes, como C2 hoy.
const journal: JournalEntry[] = Array.from({ length: 17 }, (_, i) => ({
  idx: i, tag: AUTHORIZED_MIGRATIONS.find((m) => m.idx === i)?.tag ?? `00${String(i).padStart(2, '0')}_x`, when: 1000 + i,
}));
const sqlOf = (tag: string) => REAL.get(tag) ?? `-- ${tag}`;
const appliedUpTo = (n: number): AppliedMigration[] => journal.slice(0, n).map((e) => ({ hash: sha256(sqlOf(e.tag)), created_at: String(e.when) }));
const appliedOk = appliedUpTo(15);
const record = (idx: number): AppliedMigration => ({ hash: sha256(sqlOf(journal[idx].tag)), created_at: String(journal[idx].when) });

function deps(overrides: Partial<C2MigrateDeps> = {}, conn: { identity?: RuntimeIdentity[]; applied?: AppliedMigration[][] } = {}) {
  const identities = [...(conn.identity ?? [OK_IDENTITY, OK_IDENTITY])];
  const appliedSeq = [...(conn.applied ?? [appliedOk, [...appliedOk, record(15)]])];
  const calls = { migrate: 0, close: 0, connectedTo: [] as string[], migratedEntries: [] as JournalEntry[][] };
  const d: C2MigrateDeps = {
    readEnvFile: () => `NODE_ENV=test\nDATABASE_URL="${C2_URL}"\n`,
    readJournal: () => journal,
    readSql: sqlOf,
    connect: async (url) => {
      calls.connectedTo.push(url);
      return {
        identity: async () => identities.shift() ?? OK_IDENTITY,
        applied: async () => appliedSeq.shift() ?? [],
        migrate: async (entries) => {
          calls.migrate++;
          calls.migratedEntries.push(entries);
        },
        close: async () => { calls.close++; },
      };
    },
    log: () => undefined,
    ...overrides,
  };
  return { d, calls };
}

describe('c2-migrate: ejecutor exclusivo de migraciones de C2', () => {
  it('[TC-M08-320][M-1c][Payments F1] las migraciones autorizadas en C2 son 0015, 0016, 0017 y 0018, con el SHA-256 de su SQL del repositorio', () => {
    // 0017_payments_f1: autorizada SOLO para C2 el 2026-11-15 (Payments-decisiones.md §7.4).
    expect(AUTHORIZED_MIGRATIONS).toEqual([
      { idx: 15, tag: '0015_m08_m1c_agenda_block_not_null', sha256: '7652c22e8ea4598ca290338ad030fec40170da46c985591bdc85874d7909ef8d' },
      { idx: 16, tag: '0016_m08_m1c_wait_defaults', sha256: 'fd9f6f77a778e010a064bd45644f5754faf6b6221387cdcef35e7060aa584936' },
      { idx: 17, tag: '0017_payments_f1', sha256: '5593858840293a7d46866dbd37ada7345c5616cda84db1c566a37b8f840944b1' },
      // 0018_payments_stripe_provider: autorizada para C2 el 2026-11-15 (Payments-decisiones.md §8.2).
      { idx: 18, tag: '0018_payments_stripe_provider', sha256: 'f15b342a27a8367b94b1be5dc62a550096891e6e9b8d8e786ab2dda25029be56' },
    ]);
    for (const m of AUTHORIZED_MIGRATIONS) expect(sha256(repoSql(m.tag))).toBe(m.sha256);
    // Los requisitos previos son 0013 y 0014 tal como se aplicaron en C2: sus archivos siguen con el mismo hash.
    expect(sha256(repoSql('0013_m08_m1_core'))).toBe('2138d4064d8acd97e3189c38eace19e79fbf622b97ed53ecf772c205846b1472');
    expect(sha256(repoSql('0014_m08_m1_legal_acceptance'))).toBe('72af287cf7336d6f56942b35576b89c9cf0e1e3566b42f41ab62145ab440e24c');
  });

  it('[TC-M08-321] destino correcto: verifica, aplica una sola migración y cierra la conexión', async () => {
    const { d, calls } = deps();
    await expect(runC2Migrate(d, true)).resolves.toMatchObject({ applied: true, plan: { tag: M15.tag } });
    expect({ migrate: calls.migrate, close: calls.close, connectedTo: calls.connectedTo }).toEqual({ migrate: 1, close: 1, connectedTo: [C2_URL] });
  });

  it('[TC-M08-322] sin --apply no escribe', async () => {
    const { d, calls } = deps();
    await expect(runC2Migrate(d, false)).resolves.toMatchObject({ applied: false });
    expect(calls.migrate).toBe(0);
  });

  it('[TC-M08-323] nunca usa process.env.DATABASE_URL: sin el archivo de C2 se detiene aunque la variable exista', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = C2_URL;
    try {
      for (const content of [null, '', 'OTRA=1\n', 'DATABASE_URL=\n', `DATABASE_URL=${C2_URL}\nDATABASE_URL=${C2_URL}\n`]) {
        const { d, calls } = deps({ readEnvFile: () => content });
        await expect(runC2Migrate(d, true)).rejects.toBeInstanceOf(C2MigrateError);
        expect(calls.connectedTo).toEqual([]);
      }
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it.each([
    ['desarrollo', DEV_URL],
    ['pooler de C2', C2_URL.replace(C2_MIGRATION_TARGET.endpoint, `${C2_MIGRATION_TARGET.endpoint}-pooler`)],
    ['otro endpoint', C2_URL.replace(C2_MIGRATION_TARGET.endpoint, 'ep-otro-endpoint-b5abcdef')],
    ['URL inválida', 'no-es-una-url'],
  ])('[TC-M08-324] rechaza la URL de %s sin conectarse', async (_label, url) => {
    const { d, calls } = deps({ readEnvFile: () => `DATABASE_URL=${url}` });
    await expect(runC2Migrate(d, true)).rejects.toBeInstanceOf(C2MigrateError);
    expect(calls.connectedTo).toEqual([]);
  });

  it.each([
    ['proyecto distinto', { ...OK_IDENTITY, project: 'otro-proyecto' }],
    ['rama distinta', { ...OK_IDENTITY, branch: 'br-otra-rama' }],
    ['rama de desarrollo', { ...OK_IDENTITY, branch: DEVELOPMENT_TARGET.branch }],
    ['endpoint distinto', { ...OK_IDENTITY, endpoint: 'ep-otro' }],
    ['sin neon.*', { project: null, branch: null, endpoint: null }],
  ])('[TC-M08-325] rechaza la identidad real con %s (aunque la URL sea la de C2) y no escribe', async (_label, identity) => {
    const { d, calls } = deps({}, { identity: [identity as RuntimeIdentity] });
    await expect(runC2Migrate(d, true)).rejects.toThrow(/identidad|proyecto|rama|endpoint|desarrollo/);
    expect(calls.migrate).toBe(0);
    expect(calls.close).toBe(1);
  });

  it('[TC-M08-326] vuelve a comprobar la identidad justo antes de escribir', async () => {
    const { d, calls } = deps({}, { identity: [OK_IDENTITY, { ...OK_IDENTITY, branch: 'br-otra-rama' }] });
    await expect(runC2Migrate(d, true)).rejects.toThrow(/rama real/);
    expect(calls.migrate).toBe(0);
  });

  it.each([
    ['ya tiene todas (0016)', appliedUpTo(17)],
    ['tiene más que el journal', [...appliedUpTo(17), { hash: 'e'.repeat(64), created_at: '5000' }]],
    ['un hash distinto', appliedOk.map((m, i) => (i === 5 ? { ...m, hash: 'f'.repeat(64) } : m))],
    ['un created_at distinto', appliedOk.map((m, i) => (i === 7 ? { ...m, created_at: '1' } : m))],
  ])('[TC-M08-327] se detiene si la BD %s', async (_label, applied) => {
    const { d, calls } = deps({}, { applied: [applied] });
    await expect(runC2Migrate(d, true)).rejects.toBeInstanceOf(C2MigrateError);
    expect(calls.migrate).toBe(0);
  });

  it.each([
    ['tiene otra migración con el idx de 0017', [...journal, { idx: 17, tag: '0017_x', when: 2000 }]],
    ['tiene otra migración con el idx de 0018', [...journal, { idx: 17, tag: '0017_payments_f1', when: 2000 }, { idx: 18, tag: '0018_x', when: 2001 }]],
    ['tiene una pendiente no autorizada (0019)', [...journal, { idx: 17, tag: '0017_payments_f1', when: 2000 }, { idx: 18, tag: '0018_payments_stripe_provider', when: 2001 }, { idx: 19, tag: '0019_x', when: 2002 }]],
    ['tiene otra migración con el idx de 0015', journal.map((e) => (e.idx === 15 ? { ...e, tag: '0015_otra' } : e))],
    ['tiene otra migración con el idx de 0016', journal.map((e) => (e.idx === 16 ? { ...e, tag: '0016_otra' } : e))],
    ['no es consecutivo', journal.map((e) => (e.idx === 4 ? { ...e, idx: 40 } : e))],
    ['no tiene when creciente', journal.map((e) => (e.idx === 16 ? { ...e, when: 1000 } : e))],
    ['está vacío', []],
  ])('[TC-M08-328] se detiene si el journal %s', async (_label, entries) => {
    const { d, calls } = deps({ readJournal: () => entries as JournalEntry[] });
    await expect(runC2Migrate(d, true)).rejects.toBeInstanceOf(C2MigrateError);
    expect(calls.migrate).toBe(0);
  });

  it.each([M15, M16])('[TC-M08-329] se detiene si el SQL de una pendiente ($tag) no es el autorizado', async (m) => {
    const { d, calls } = deps({ readSql: (tag) => (tag === m.tag ? `${sqlOf(tag)}\n-- cambio` : sqlOf(tag)) });
    await expect(runC2Migrate(d, true)).rejects.toThrow(/SHA-256/);
    expect(calls.migrate).toBe(0);
  });

  it('[TC-M08-330] tras migrar exige exactamente un registro nuevo con el hash de la siguiente', async () => {
    const { d } = deps({}, { applied: [appliedOk, [...appliedOk, { hash: 'a'.repeat(64), created_at: String(journal[15].when) }]] });
    await expect(runC2Migrate(d, true)).rejects.toThrow(/no es la migración autorizada/);
    const none = deps({}, { applied: [appliedOk, appliedOk] });
    await expect(runC2Migrate(none.d, true)).rejects.toThrow(/se esperaban 16/);
    // Si el migrador aplicara también la siguiente (0016), se detiene: dos registros nuevos.
    const both = deps({}, { applied: [appliedOk, [...appliedOk, record(15), record(16)]] });
    await expect(runC2Migrate(both.d, true)).rejects.toThrow(/se esperaban 16/);
  });

  it('[TC-M08-332][M-1c] con C2 en 0014 y el journal en 0016, solo aplica 0015 y entrega al migrador el journal hasta 0015', async () => {
    const lines: string[] = [];
    const { d, calls } = deps({ log: (l) => lines.push(l) });
    const result = await runC2Migrate(d, true);
    expect(result.plan).toMatchObject({ idx: 15, tag: M15.tag, sha256: M15.sha256, pending: [M15.tag, M16.tag] });
    expect(calls.migratedEntries).toHaveLength(1);
    expect(calls.migratedEntries[0].map((e) => e.idx)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(calls.migratedEntries[0].at(-1)!.tag).toBe(M15.tag);
    expect(lines.join('\n')).toMatch(/pendientes 0015_m08_m1c_agenda_block_not_null, 0016_m08_m1c_wait_defaults; esta ejecución aplica solo 0015/);
  });

  it('[TC-M08-333][M-1c] la ejecución siguiente (C2 en 0015) aplica solo 0016', async () => {
    const at15 = appliedUpTo(16);
    const { d, calls } = deps({}, { applied: [at15, [...at15, record(16)]] });
    await expect(runC2Migrate(d, true)).resolves.toMatchObject({ applied: true, plan: { idx: 16, tag: M16.tag, pending: [M16.tag] } });
    expect(calls.migratedEntries[0]).toHaveLength(17);
    // Y una tercera ya no tiene nada que aplicar.
    const done = deps({}, { applied: [appliedUpTo(17)] });
    await expect(runC2Migrate(done.d, true)).rejects.toThrow(/no hay migraciones pendientes/);
    expect(done.calls.migrate).toBe(0);
  });

  it('[TC-M08-334] la BD debe tener exactamente un prefijo del journal: con 0013 sin 0014 la siguiente (0014) no está autorizada', () => {
    expect(() => planNextMigration(journal, sqlOf, appliedUpTo(14))).toThrow(/0014_x \(idx 14\) no está autorizada/);
    expect(() => planNextMigration(journal, sqlOf, appliedUpTo(15))).not.toThrow();
  });

  it('[TC-M08-335] sin --apply verifica el plan de la siguiente y no escribe', async () => {
    const { d, calls } = deps();
    await expect(runC2Migrate(d, false)).resolves.toMatchObject({ applied: false, plan: { tag: M15.tag, pending: [M15.tag, M16.tag] } });
    expect(calls.migrate).toBe(0);
  });

  it('[TC-M08-331] el núcleo no lee dotenv, el .env de desarrollo ni process.env', () => {
    const source = readFileSync(join(__dirname, 'c2-migrate-core.ts'), 'utf8') + readFileSync(join(__dirname, 'c2-migrate.ts'), 'utf8');
    expect(source).not.toMatch(/dotenv|process\.env|apps[\\/]backend[\\/]\.env|['"]\.env['"]/);
    expect(source).toMatch(/C:\\\\pei-c2\\\\\.env\.c2/);
  });

  it('[TC-M08-336] la CLI entrega al migrador de Drizzle una carpeta temporal con el journal limitado, nunca la del repositorio', () => {
    const cli = readFileSync(join(__dirname, 'c2-migrate.ts'), 'utf8');
    expect(cli).toMatch(/mkdtempSync\(join\(tmpdir\(\), 'pei-c2-migrate-'\)\)/);
    expect(cli).toMatch(/journal\.entries\.slice\(0, entries\.length\)/);
    expect(cli).toMatch(/migrate\(drizzle\(\{ client \}\), \{ migrationsFolder: dir \}\)/);
    expect(cli).not.toMatch(/migrationsFolder: MIGRATIONS/);
    expect(cli).toMatch(/rmSync\(dir, \{ recursive: true, force: true \}\)/);
  });
});

// 0017_payments_f1 (autorizada SOLO para C2 el 2026-11-15, Payments-decisiones.md §7.4). Es una migración protegida
// (R-1): además de la URL y la identidad de Neon de C2, exige la huella completa de 8 componentes en la misma conexión
// contra la huella autorizada de C2, y solo entonces define pei.migration_authorized. Sin conexiones reales.
describe('c2-migrate · 0017 (Payments F1): autorizada para C2, con huella e identidad exactas', () => {
  const TAG = '0017_payments_f1';
  const journal17: JournalEntry[] = [...journal, { idx: 17, tag: TAG, when: 2000 }];
  const applied16: AppliedMigration[] = journal.map((e) => ({ hash: sha256(sqlOf(e.tag)), created_at: String(e.when) }));
  const record17: AppliedMigration = { hash: sha256(sqlOf(TAG)), created_at: '2000' };
  const C2_FP: Fingerprint = {
    database: 'neondb', system_identifier: '7688416788070812297', server_version: '180007', current_user: 'neondb_owner',
    neon_project_id: C2_MIGRATION_TARGET.project, neon_branch_id: C2_MIGRATION_TARGET.branch, neon_endpoint_id: C2_MIGRATION_TARGET.endpoint,
    host_sha256_16: hostHash(new URL(C2_URL).hostname),
  };
  const AUTHORIZED_C2 = JSON.stringify({ label: 'C2', fingerprint: C2_FP });

  function deps17(opts: {
    identity?: RuntimeIdentity; fingerprint?: Partial<Fingerprint> | null; authorized?: string | null; migrateError?: Error;
  } = {}) {
    const log: string[] = [];
    const appliedSeq = [applied16, [...applied16, record17]];
    const calls = { migrate: 0, close: 0 };
    const withSession = opts.fingerprint !== null;
    const d: C2MigrateDeps = {
      readEnvFile: () => `DATABASE_URL="${C2_URL}"\n`,
      readJournal: () => journal17,
      readSql: sqlOf,
      // Nunca se lee el archivo real de C:\pei-c2 en las pruebas.
      readAuthorizedFingerprint: () => (opts.authorized === undefined ? AUTHORIZED_C2 : opts.authorized),
      connect: async () => ({
        identity: async () => opts.identity ?? OK_IDENTITY,
        applied: async () => appliedSeq.shift() ?? [],
        migrate: async () => {
          calls.migrate++;
          log.push('migrate');
          if (opts.migrateError) throw opts.migrateError;
        },
        close: async () => { calls.close++; },
        ...(withSession
          ? {
              fingerprint: async () => {
                log.push('fingerprint');
                return { ...C2_FP, ...(opts.fingerprint ?? {}) };
              },
              query: async (text: string) => {
                log.push(text);
                if (text === SQL_READ_AUTHORIZATION) return [{ v: null }];
                if (text === SQL_PERSISTENT_AUTHORIZATION) return [{ n: 0 }];
                return [];
              },
            }
          : {}),
      }),
      log: () => undefined,
    };
    return { d, calls, log };
  }
  const SET = sqlSetAuthorization('0017');

  it('el plan de C2 admite 0017 con su SHA-256 y es una migración protegida', () => {
    expect(sha256(repoSql(TAG))).toBe('5593858840293a7d46866dbd37ada7345c5616cda84db1c566a37b8f840944b1');
    expect(planNextMigration(journal17, sqlOf, applied16)).toMatchObject({ idx: 17, tag: TAG, sha256: sha256(repoSql(TAG)), pending: [TAG] });
    expect(PROTECTED_MIGRATIONS[TAG]).toBe('0017');
  });

  it('con huella e identidad de C2: huella → sin autorización heredada ni persistente → SET → migrate → RESET', async () => {
    const { d, calls, log } = deps17();
    await expect(runC2Migrate(d, true)).resolves.toMatchObject({ applied: true, plan: { tag: TAG } });
    expect(log).toEqual(['fingerprint', SQL_READ_AUTHORIZATION, SQL_PERSISTENT_AUTHORIZATION, SET, 'migrate', SQL_RESET_AUTHORIZATION]);
    expect(calls).toEqual({ migrate: 1, close: 1 });
  });

  it('sin --apply no lee la huella ni define la autorización', async () => {
    const { d, calls, log } = deps17();
    await expect(runC2Migrate(d, false)).resolves.toMatchObject({ applied: false, plan: { tag: TAG } });
    expect(log).toEqual([]);
    expect(calls.migrate).toBe(0);
  });

  it.each([
    ['la base de desarrollo', { project: C2_MIGRATION_TARGET.project, branch: DEVELOPMENT_TARGET.branch, endpoint: DEVELOPMENT_TARGET.endpoint }],
    ['otra rama del proyecto', { ...OK_IDENTITY, branch: 'br-otra-rama' }],
    ['otro proyecto', { ...OK_IDENTITY, project: 'otro-proyecto' }],
  ])('se detiene antes de la huella si la identidad real es %s', async (_label, identity) => {
    const { d, calls, log } = deps17({ identity });
    await expect(runC2Migrate(d, true)).rejects.toBeInstanceOf(C2MigrateError);
    expect(log).toEqual([]);
    expect(calls.migrate).toBe(0);
  });

  it.each([
    ['otro system_identifier', { system_identifier: '1' }],
    ['otra versión del servidor', { server_version: '180008' }],
    ['otro rol', { current_user: 'otro_rol' }],
    ['otro host', { host_sha256_16: '0000000000000000' }],
  ])('se detiene sin definir la autorización si la huella tiene %s', async (_label, fingerprint) => {
    const { d, calls, log } = deps17({ fingerprint });
    await expect(runC2Migrate(d, true)).rejects.toThrow(/no coincide/);
    expect(log).toEqual(['fingerprint']);
    expect(calls.migrate).toBe(0);
  });

  it.each([
    ['no existe la huella autorizada', null],
    ['la huella autorizada es la de desarrollo', JSON.stringify({ label: 'desarrollo', fingerprint: C2_FP })],
  ])('se detiene si %s', async (_label, authorized) => {
    const { d, calls, log } = deps17({ authorized });
    await expect(runC2Migrate(d, true)).rejects.toThrow();
    expect(log).not.toContain(SET);
    expect(calls.migrate).toBe(0);
  });

  it('falla cerrado si la conexión no ofrece huella ni consultas', async () => {
    const { d, calls } = deps17({ fingerprint: null });
    await expect(runC2Migrate(d, true)).rejects.toThrow(/exige huella completa/);
    expect(calls.migrate).toBe(0);
  });

  it('retira la autorización aunque la migración falle', async () => {
    const { d, log } = deps17({ migrateError: new Error('fallo de la migración') });
    await expect(runC2Migrate(d, true)).rejects.toThrow('fallo de la migración');
    expect(log.slice(-2)).toEqual(['migrate', SQL_RESET_AUTHORIZATION]);
  });
});
