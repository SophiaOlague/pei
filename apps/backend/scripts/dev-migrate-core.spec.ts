import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sha256, type AppliedMigration, type JournalEntry, type RuntimeIdentity } from './c2-migrate-core';
import {
  DEV_AUTHORIZED_MIGRATIONS, DEV_MIGRATION_TARGET, DevMigrateError, directDevUrl, planNextDevMigration, runDevMigrate, type DevMigrateDeps,
} from './dev-migrate-core';

// dev-migrate: sin conexiones reales; el archivo de entorno, el journal, el SQL y la conexión son dobles.
const DEV_DIRECT = `postgresql://u:p@${DEV_MIGRATION_TARGET.endpoint}.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require`;
const DEV_POOLER = DEV_DIRECT.replace(DEV_MIGRATION_TARGET.endpoint, `${DEV_MIGRATION_TARGET.endpoint}-pooler`);
const C2_URL = 'postgresql://u:p@ep-withered-block-b5e8v9ov.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require';
const OK: RuntimeIdentity = { ...DEV_MIGRATION_TARGET };
const C2_IDENTITY: RuntimeIdentity = { project: 'royal-paper-10258990', branch: 'br-shy-pond-b50a3m8f', endpoint: 'ep-withered-block-b5e8v9ov' };

const repoSql = (tag: string) => readFileSync(join(__dirname, '..', 'src', 'db', 'migrations', `${tag}.sql`), 'utf8');
const REAL = new Map<string, string>(DEV_AUTHORIZED_MIGRATIONS.map((m) => [m.tag, repoSql(m.tag)]));
const [M14, M15, M16] = DEV_AUTHORIZED_MIGRATIONS;

// Journal 0000–0016 (sintético salvo 0014–0016) y BD en 0013 (14 registros), como desarrollo según A.15/A.16.
const journal: JournalEntry[] = Array.from({ length: 17 }, (_, i) => ({
  idx: i, tag: DEV_AUTHORIZED_MIGRATIONS.find((m) => m.idx === i)?.tag ?? `00${String(i).padStart(2, '0')}_x`, when: 1000 + i,
}));
const sqlOf = (tag: string) => REAL.get(tag) ?? `-- ${tag}`;
const upTo = (n: number): AppliedMigration[] => journal.slice(0, n).map((e) => ({ hash: sha256(sqlOf(e.tag)), created_at: String(e.when) }));
const record = (idx: number): AppliedMigration => ({ hash: sha256(sqlOf(journal[idx].tag)), created_at: String(journal[idx].when) });

function deps(overrides: Partial<DevMigrateDeps> = {}, conn: { identity?: RuntimeIdentity[]; applied?: AppliedMigration[][] } = {}) {
  const identities = [...(conn.identity ?? [OK, OK])];
  const appliedSeq = [...(conn.applied ?? [upTo(14), [...upTo(14), record(14)]])];
  const calls = { migrate: 0, close: 0, connectedTo: [] as string[], entries: [] as JournalEntry[][], logs: [] as string[] };
  const d: DevMigrateDeps = {
    readEnvFile: () => `NODE_ENV=development\nDATABASE_URL="${DEV_DIRECT}"\nOTRA=1\n`,
    readJournal: () => journal,
    readSql: sqlOf,
    connect: async (url) => {
      calls.connectedTo.push(url);
      return {
        identity: async () => identities.shift() ?? OK,
        applied: async () => appliedSeq.shift() ?? [],
        migrate: async (entries) => {
          calls.migrate++;
          calls.entries.push(entries);
        },
        close: async () => { calls.close++; },
      };
    },
    log: (l) => calls.logs.push(l),
    ...overrides,
  };
  return { d, calls };
}

describe('dev-migrate: ejecutor exclusivo de migraciones de desarrollo', () => {
  it('[TC-DEV-001] autoriza 0014, 0015, 0016, 0017 y 0018 por índice, tag y SHA-256 del SQL del repositorio', () => {
    expect(DEV_AUTHORIZED_MIGRATIONS).toEqual([
      { idx: 14, tag: '0014_m08_m1_legal_acceptance', sha256: '72af287cf7336d6f56942b35576b89c9cf0e1e3566b42f41ab62145ab440e24c' },
      { idx: 15, tag: '0015_m08_m1c_agenda_block_not_null', sha256: '7652c22e8ea4598ca290338ad030fec40170da46c985591bdc85874d7909ef8d' },
      { idx: 16, tag: '0016_m08_m1c_wait_defaults', sha256: 'fd9f6f77a778e010a064bd45644f5754faf6b6221387cdcef35e7060aa584936' },
      { idx: 17, tag: '0017_payments_f1', sha256: '5593858840293a7d46866dbd37ada7345c5616cda84db1c566a37b8f840944b1' },
      // 0018_payments_stripe_provider: autorizada para desarrollo el 2026-11-15 (Payments-decisiones.md §8.3).
      { idx: 18, tag: '0018_payments_stripe_provider', sha256: 'f15b342a27a8367b94b1be5dc62a550096891e6e9b8d8e786ab2dda25029be56' },
    ]);
    for (const m of DEV_AUTHORIZED_MIGRATIONS) expect(sha256(repoSql(m.tag))).toBe(m.sha256);
    // Requisito previo: 0013 con el hash registrado en desarrollo (A.16).
    expect(sha256(repoSql('0013_m08_m1_core'))).toBe('2138d4064d8acd97e3189c38eace19e79fbf622b97ed53ecf772c205846b1472');
  });

  it('[TC-DEV-002] identidad correcta: verifica dos veces, aplica una sola migración y cierra la conexión', async () => {
    const { d, calls } = deps();
    await expect(runDevMigrate(d, true)).resolves.toMatchObject({ applied: true, plan: { idx: 14, tag: M14.tag } });
    expect({ migrate: calls.migrate, close: calls.close }).toEqual({ migrate: 1, close: 1 });
    expect(calls.connectedTo).toEqual([DEV_DIRECT]);
  });

  it('[TC-DEV-003] el pooler de desarrollo se acepta, pero se migra por el endpoint directo', async () => {
    expect(directDevUrl(DEV_POOLER)).toBe(new URL(DEV_DIRECT).toString());
    const { d, calls } = deps({ readEnvFile: () => `DATABASE_URL=${DEV_POOLER}` });
    await runDevMigrate(d, false);
    expect(calls.connectedTo).toEqual([new URL(DEV_DIRECT).toString()]);
  });

  it.each([
    ['C2', C2_URL],
    ['el pooler de C2', C2_URL.replace('ep-withered-block-b5e8v9ov', 'ep-withered-block-b5e8v9ov-pooler')],
    ['el respaldo de desarrollo', DEV_DIRECT.replace(DEV_MIGRATION_TARGET.endpoint, 'ep-calm-snow-b5eox1a8')],
    ['el respaldo de desarrollo previo a 0017', DEV_DIRECT.replace(DEV_MIGRATION_TARGET.endpoint, 'ep-silent-tooth-b518kt75')],
    ['otro endpoint (producción u otro)', DEV_DIRECT.replace(DEV_MIGRATION_TARGET.endpoint, 'ep-otro-endpoint-b5abcdef')],
    ['una URL inválida', 'no-es-una-url'],
  ])('[TC-DEV-004] rechaza la URL de %s sin conectarse', async (_label, url) => {
    const { d, calls } = deps({ readEnvFile: () => `DATABASE_URL=${url}` });
    await expect(runDevMigrate(d, true)).rejects.toBeInstanceOf(DevMigrateError);
    expect(calls.connectedTo).toEqual([]);
  });

  it('[TC-DEV-005] nunca usa process.env ni el archivo de C2: sin DATABASE_URL válida en .env se detiene sin conectarse', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = DEV_DIRECT;
    try {
      for (const content of [null, '', 'OTRA=1\n', 'DATABASE_URL=\n', `DATABASE_URL=${DEV_DIRECT}\nDATABASE_URL=${DEV_DIRECT}\n`]) {
        const { d, calls } = deps({ readEnvFile: () => content });
        await expect(runDevMigrate(d, true)).rejects.toBeInstanceOf(DevMigrateError);
        expect(calls.connectedTo).toEqual([]);
      }
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
    const source = readFileSync(join(__dirname, 'dev-migrate-core.ts'), 'utf8') + readFileSync(join(__dirname, 'dev-migrate.ts'), 'utf8');
    const code = source.replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/dotenv|process\.env|\.env\.c2|pei-c2/);
    expect(code).toMatch(/const DEV_ENV_FILE = join\(__dirname, '\.\.', '\.env'\);/);
  });

  it.each([
    ['C2', C2_IDENTITY],
    ['un respaldo de C2', { ...C2_IDENTITY, branch: 'br-red-cell-b5bpd2dp', endpoint: 'ep-otro' }],
    ['el respaldo de desarrollo', { ...OK, branch: 'br-rapid-water-b5za50z4', endpoint: 'ep-calm-snow-b5eox1a8' }],
    ['el respaldo de desarrollo previo a 0017', { ...OK, branch: 'br-curly-wind-b5bi0stw', endpoint: 'ep-silent-tooth-b518kt75' }],
    ['otro proyecto (producción)', { ...OK, project: 'otro-proyecto' }],
    ['otra rama', { ...OK, branch: 'br-otra-rama' }],
    ['otro endpoint', { ...OK, endpoint: 'ep-otro' }],
    ['sin neon.*', { project: null, branch: null, endpoint: null }],
  ])('[TC-DEV-006] rechaza la identidad real de %s (aunque la URL sea la de desarrollo) y no escribe', async (_label, identity) => {
    const { d, calls } = deps({}, { identity: [identity as RuntimeIdentity] });
    await expect(runDevMigrate(d, true)).rejects.toBeInstanceOf(DevMigrateError);
    expect(calls.migrate).toBe(0);
    expect(calls.close).toBe(1);
  });

  it('[TC-DEV-007] vuelve a comprobar la identidad justo antes de escribir', async () => {
    const { d, calls } = deps({}, { identity: [OK, C2_IDENTITY] });
    await expect(runDevMigrate(d, true)).rejects.toThrow(/C2/);
    expect(calls.migrate).toBe(0);
  });

  it('[TC-DEV-008] secuencia 0014 → 0015 → 0016: cada ejecución aplica solo la siguiente y entrega el journal hasta ella', async () => {
    for (const [n, m] of [[14, M14], [15, M15], [16, M16]] as const) {
      const { d, calls } = deps({}, { applied: [upTo(n), [...upTo(n), record(n)]] });
      const result = await runDevMigrate(d, true);
      expect(result.plan).toMatchObject({ idx: n, tag: m.tag, sha256: m.sha256 });
      expect(result.plan.pending[0]).toBe(m.tag);
      expect(calls.migrate).toBe(1);
      expect(calls.entries[0].at(-1)!.tag).toBe(m.tag);
      expect(calls.entries[0]).toHaveLength(n + 1);
    }
    const { d, calls } = deps({}, { applied: [upTo(17)] });
    await expect(runDevMigrate(d, true)).rejects.toThrow(/no hay migraciones pendientes/);
    expect(calls.migrate).toBe(0);
  });

  it('[TC-DEV-009] sin --apply verifica el plan (0014, con 0015 y 0016 pendientes) y no escribe', async () => {
    const { d, calls } = deps();
    await expect(runDevMigrate(d, false)).resolves.toMatchObject({ applied: false, plan: { tag: M14.tag, pending: [M14.tag, M15.tag, M16.tag] } });
    expect(calls.migrate).toBe(0);
    expect(calls.logs.join('\n')).toMatch(/esta ejecución aplica solo 0014_m08_m1_legal_acceptance/);
    expect(calls.logs.join('\n')).not.toMatch(/postgresql:\/\//);
  });

  it.each([M14, M15, M16])('[TC-DEV-010] se detiene si el SQL de una pendiente ($tag) no tiene el SHA-256 autorizado', async (m) => {
    const { d, calls } = deps({ readSql: (tag) => (tag === m.tag ? `${sqlOf(tag)}\n-- cambio` : sqlOf(tag)) });
    await expect(runDevMigrate(d, true)).rejects.toThrow(/SHA-256/);
    expect(calls.migrate).toBe(0);
  });

  it.each([
    ['una pendiente desconocida (0017)', [...journal, { idx: 17, tag: '0017_x', when: 2000 }]],
    ['otra migración con el idx de 0014', journal.map((e) => (e.idx === 14 ? { ...e, tag: '0014_otra' } : e))],
    ['no es consecutivo', journal.map((e) => (e.idx === 4 ? { ...e, idx: 40 } : e))],
    ['no tiene when creciente', journal.map((e) => (e.idx === 15 ? { ...e, when: 1000 } : e))],
  ])('[TC-DEV-011] rechaza un journal con %s', async (_label, entries) => {
    const { d, calls } = deps({ readJournal: () => entries as JournalEntry[] });
    await expect(runDevMigrate(d, true)).rejects.toBeInstanceOf(DevMigrateError);
    expect(calls.migrate).toBe(0);
  });

  it.each([
    ['sin 0013 (la siguiente sería 0013, no autorizada)', upTo(13)],
    ['un hash registrado distinto', upTo(14).map((m, i) => (i === 13 ? { ...m, hash: 'f'.repeat(64) } : m))],
    ['un created_at distinto', upTo(14).map((m, i) => (i === 7 ? { ...m, created_at: '1' } : m))],
    ['más registros que el journal', [...upTo(17), { hash: 'e'.repeat(64), created_at: '5000' }]],
  ])('[TC-DEV-012] se detiene si la BD tiene %s', async (_label, applied) => {
    const { d, calls } = deps({}, { applied: [applied] });
    await expect(runDevMigrate(d, true)).rejects.toBeInstanceOf(DevMigrateError);
    expect(calls.migrate).toBe(0);
  });

  it('[TC-DEV-013] tras migrar exige exactamente un registro nuevo, el planificado, sin cambiar los anteriores', async () => {
    const wrongHash = deps({}, { applied: [upTo(14), [...upTo(14), { hash: 'a'.repeat(64), created_at: String(journal[14].when) }]] });
    await expect(runDevMigrate(wrongHash.d, true)).rejects.toThrow(/no es la migración planificada/);
    const none = deps({}, { applied: [upTo(14), upTo(14)] });
    await expect(runDevMigrate(none.d, true)).rejects.toThrow(/se esperaban 15/);
    const two = deps({}, { applied: [upTo(14), [...upTo(14), record(14), record(15)]] });
    await expect(runDevMigrate(two.d, true)).rejects.toThrow(/se esperaban 15/);
    const changed = deps({}, { applied: [upTo(14), [...upTo(14).map((m, i) => (i === 2 ? { ...m, hash: 'b'.repeat(64) } : m)), record(14)]] });
    await expect(runDevMigrate(changed.d, true)).rejects.toThrow(/cambió durante la migración/);
  });

  it('[TC-DEV-014] la CLI usa su propia carpeta temporal con el journal limitado y no comparte destino con c2-migrate', () => {
    const cli = readFileSync(join(__dirname, 'dev-migrate.ts'), 'utf8');
    expect(cli).toMatch(/mkdtempSync\(join\(tmpdir\(\), 'pei-dev-migrate-'\)\)/);
    expect(cli).toMatch(/journal\.entries\.slice\(0, entries\.length\)/);
    expect(cli).toMatch(/migrate\(drizzle\(\{ client \}\), \{ migrationsFolder: dir \}\)/);
    expect(cli).not.toMatch(/migrationsFolder: MIGRATIONS/);
    expect(cli).not.toMatch(/runC2Migrate|C2_MIGRATION_TARGET|AUTHORIZED_MIGRATIONS\b/);
    expect(planNextDevMigration).toBeDefined();
  });
});

// 0017_payments_f1: autorización expresa de desarrollo del 2026-11-15 (Payments-decisiones.md §7.5), independiente de la
// de C2 (§7.4). Es protegida (R-1): el ejecutor de desarrollo solo la aplica con la huella de desarrollo verificada en
// la misma conexión, y siempre retira la autorización de sesión.
describe('dev-migrate · 0017 (Payments F1) autorizada en desarrollo con sus propias salvaguardas', () => {
  const TAG = '0017_payments_f1';
  const SHA = '5593858840293a7d46866dbd37ada7345c5616cda84db1c566a37b8f840944b1';
  const journal17: JournalEntry[] = [...journal, { idx: 17, tag: TAG, when: 2000 }];
  const readSql17 = (tag: string) => (tag === TAG ? repoSql(TAG) : sqlOf(tag));
  const record17: AppliedMigration = { hash: SHA, created_at: '2000' };
  const DEV_FP = {
    database: 'neondb', system_identifier: '7688416788070812297', server_version: '180007', current_user: 'neondb_owner',
    neon_project_id: DEV_MIGRATION_TARGET.project, neon_branch_id: DEV_MIGRATION_TARGET.branch, neon_endpoint_id: DEV_MIGRATION_TARGET.endpoint,
    host_sha256_16: createHash('sha256').update(new URL(DEV_DIRECT).hostname).digest('hex').slice(0, 16),
  };
  const C2_FP = { ...DEV_FP, neon_branch_id: 'br-shy-pond-b50a3m8f', neon_endpoint_id: 'ep-withered-block-b5e8v9ov' };
  const SET = "SET pei.migration_authorized = '0017'";

  interface Opts { live?: typeof DEV_FP; file?: string | null; withSession?: boolean; sql?: (tag: string) => string }

  function protectedDeps(opts: Opts = {}) {
    const log: string[] = [];
    let migrated = 0;
    const base = deps({ readJournal: () => journal17, readSql: opts.sql ?? readSql17 }, { applied: [upTo(17), [...upTo(17), record17]] });
    const connect = base.d.connect;
    base.d.connect = async (url) => {
      const c = await connect(url);
      const session = opts.withSession === false ? {} : {
        fingerprint: async () => opts.live ?? DEV_FP,
        query: async (t: string) => {
          log.push(t);
          if (/current_setting\('pei\.migration_authorized'/.test(t)) return [{ v: null }];
          if (/pg_db_role_setting/.test(t)) return [{ n: 0 }];
          return [];
        },
      };
      return { ...c, ...session, migrate: async (e: JournalEntry[]) => { migrated++; log.push('MIGRATE'); await c.migrate(e); } };
    };
    base.d.readAuthorizedFingerprint = () => (opts.file === undefined ? JSON.stringify({ label: 'desarrollo', fingerprint: DEV_FP }) : opts.file);
    return { d: base.d, log, migrated: () => migrated };
  }

  it('[TC-DEV-015] el plan acepta la 0017 real como única pendiente, con el SHA-256 autorizado', () => {
    expect(sha256(repoSql(TAG))).toBe(SHA);
    expect(planNextDevMigration(journal17, readSql17, upTo(17))).toMatchObject({ idx: 17, tag: TAG, sha256: SHA, pending: [TAG] });
  });

  it('[TC-DEV-016] con la huella de desarrollo: autoriza la sesión, migra una vez y retira la autorización', async () => {
    const t = protectedDeps();
    await expect(runDevMigrate(t.d, true)).resolves.toMatchObject({ applied: true, plan: { idx: 17, tag: TAG } });
    expect(t.migrated()).toBe(1);
    const set = t.log.indexOf(SET);
    expect(set).toBeGreaterThan(-1);
    expect(t.log.indexOf('MIGRATE')).toBeGreaterThan(set);
    expect(t.log.at(-1)).toBe('RESET pei.migration_authorized');
  });

  it.each<[string, Opts]>([
    ['la conexión sin huella ni consultas', { withSession: false }],
    ['sin archivo de huella autorizada', { file: null }],
    ['la huella autorizada de C2 (rótulo C2)', { file: JSON.stringify({ label: 'C2', fingerprint: C2_FP }) }],
    ['una huella real que no coincide (C2)', { live: C2_FP }],
    ['el SQL de 0017 modificado', { sql: (tag) => (tag === TAG ? `${repoSql(TAG)}\n-- cambio` : sqlOf(tag)) }],
  ])('[TC-DEV-017] se detiene sin migrar ni autorizar la sesión con %s', async (_label, opts) => {
    const t = protectedDeps(opts);
    await expect(runDevMigrate(t.d, true)).rejects.toThrow();
    expect(t.migrated()).toBe(0);
    expect(t.log).not.toContain(SET);
  });

  it('[TC-DEV-018] una migración posterior no autorizada (0019) sigue bloqueada, y el idx 18 solo admite la 0018 real', () => {
    const TAG18 = '0018_payments_stripe_provider';
    const sql18 = (tag: string) => (tag === TAG18 ? repoSql(TAG18) : readSql17(tag));
    const j19 = [...journal17, { idx: 18, tag: TAG18, when: 3000 }, { idx: 19, tag: '0019_x', when: 4000 }];
    expect(() => planNextDevMigration(j19, sql18, [...upTo(17), record17])).toThrow(/0019_x \(idx 19\) no está autorizada para desarrollo/);
    expect(() => planNextDevMigration(j19, sql18, upTo(17))).toThrow(/0019_x \(idx 19\) no está autorizada para desarrollo/);
    const other18 = [...journal17, { idx: 18, tag: '0018_x', when: 3000 }];
    expect(() => planNextDevMigration(other18, readSql17, [...upTo(17), record17])).toThrow(/la entrada 18 del journal es 0018_x/);
  });
});

// 0018_payments_stripe_provider: autorización expresa de desarrollo del 2026-11-15 (Payments-decisiones.md §8.3),
// independiente de la de C2 (§8.2). Protegida (R-1): exige la huella de desarrollo y nunca acepta la de C2.
describe('dev-migrate · 0018 (Stripe como proveedor) autorizada en desarrollo con sus propias salvaguardas', () => {
  const TAG17 = '0017_payments_f1';
  const TAG = '0018_payments_stripe_provider';
  const SHA = 'f15b342a27a8367b94b1be5dc62a550096891e6e9b8d8e786ab2dda25029be56';
  const journal18: JournalEntry[] = [...journal, { idx: 17, tag: TAG17, when: 2000 }, { idx: 18, tag: TAG, when: 3000 }];
  const readSql18 = (tag: string) => (tag === TAG || tag === TAG17 ? repoSql(tag) : sqlOf(tag));
  const applied17: AppliedMigration[] = [...upTo(17), { hash: sha256(repoSql(TAG17)), created_at: '2000' }];
  const record18: AppliedMigration = { hash: SHA, created_at: '3000' };
  const DEV_FP = {
    database: 'neondb', system_identifier: '7688416788070812297', server_version: '180007', current_user: 'neondb_owner',
    neon_project_id: DEV_MIGRATION_TARGET.project, neon_branch_id: DEV_MIGRATION_TARGET.branch, neon_endpoint_id: DEV_MIGRATION_TARGET.endpoint,
    host_sha256_16: createHash('sha256').update(new URL(DEV_DIRECT).hostname).digest('hex').slice(0, 16),
  };
  const C2_FP = { ...DEV_FP, neon_branch_id: 'br-shy-pond-b50a3m8f', neon_endpoint_id: 'ep-withered-block-b5e8v9ov' };
  const SET = "SET pei.migration_authorized = '0018'";

  function deps18(opts: { live?: typeof DEV_FP; file?: string | null; sql?: (tag: string) => string } = {}) {
    const log: string[] = [];
    const base = deps({ readJournal: () => journal18, readSql: opts.sql ?? readSql18 }, { applied: [applied17, [...applied17, record18]] });
    const connect = base.d.connect;
    base.d.connect = async (url) => ({
      ...(await connect(url)),
      fingerprint: async () => opts.live ?? DEV_FP,
      query: async (t: string) => {
        log.push(t);
        if (/current_setting\('pei\.migration_authorized'/.test(t)) return [{ v: null }];
        if (/pg_db_role_setting/.test(t)) return [{ n: 0 }];
        return [];
      },
      migrate: async () => { log.push('MIGRATE'); },
    });
    base.d.readAuthorizedFingerprint = () => (opts.file === undefined ? JSON.stringify({ label: 'desarrollo', fingerprint: DEV_FP }) : opts.file);
    return { d: base.d, log };
  }

  it('[TC-DEV-019] el SQL real de 0018 tiene el SHA-256 autorizado y es la única pendiente tras 0017', () => {
    expect(sha256(repoSql(TAG))).toBe(SHA);
    expect(planNextDevMigration(journal18, readSql18, applied17)).toMatchObject({ idx: 18, tag: TAG, sha256: SHA, pending: [TAG] });
  });

  it('[TC-DEV-020] con la huella de desarrollo: SET 0018 → migra una vez → RESET', async () => {
    const t = deps18();
    await expect(runDevMigrate(t.d, true)).resolves.toMatchObject({ applied: true, plan: { idx: 18, tag: TAG } });
    expect(t.log.filter((l) => l === 'MIGRATE')).toHaveLength(1);
    expect(t.log.indexOf('MIGRATE')).toBeGreaterThan(t.log.indexOf(SET));
    expect(t.log.indexOf(SET)).toBeGreaterThan(-1);
    expect(t.log.at(-1)).toBe('RESET pei.migration_authorized');
  });

  it.each<[string, Parameters<typeof deps18>[0]]>([
    ['sin archivo de huella autorizada', { file: null }],
    ['la huella autorizada de C2 (rótulo C2)', { file: JSON.stringify({ label: 'C2', fingerprint: C2_FP }) }],
    ['una huella real que no coincide (C2)', { live: C2_FP }],
    ['el SQL de 0018 modificado', { sql: (tag) => (tag === TAG ? `${repoSql(TAG)}\n-- cambio` : readSql18(tag)) }],
  ])('[TC-DEV-021] se detiene sin migrar ni autorizar la sesión con %s', async (_label, opts) => {
    const t = deps18(opts);
    await expect(runDevMigrate(t.d, true)).rejects.toThrow();
    expect(t.log).not.toContain('MIGRATE');
    expect(t.log).not.toContain(SET);
  });
});
