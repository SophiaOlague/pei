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
  it('[TC-DEV-001] autoriza 0014, 0015 y 0016 por índice, tag y SHA-256 del SQL del repositorio', () => {
    expect(DEV_AUTHORIZED_MIGRATIONS).toEqual([
      { idx: 14, tag: '0014_m08_m1_legal_acceptance', sha256: '72af287cf7336d6f56942b35576b89c9cf0e1e3566b42f41ab62145ab440e24c' },
      { idx: 15, tag: '0015_m08_m1c_agenda_block_not_null', sha256: '7652c22e8ea4598ca290338ad030fec40170da46c985591bdc85874d7909ef8d' },
      { idx: 16, tag: '0016_m08_m1c_wait_defaults', sha256: 'fd9f6f77a778e010a064bd45644f5754faf6b6221387cdcef35e7060aa584936' },
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
