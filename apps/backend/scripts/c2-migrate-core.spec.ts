import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AUTHORIZED_MIGRATION, C2_MIGRATION_TARGET, C2MigrateError, DEVELOPMENT_TARGET, runC2Migrate, sha256,
  type AppliedMigration, type C2MigrateDeps, type JournalEntry, type RuntimeIdentity,
} from './c2-migrate-core';

// Sin conexiones reales: el archivo de entorno, el journal, el SQL y la conexión son dobles.
const C2_URL = `postgresql://u:p@${C2_MIGRATION_TARGET.endpoint}.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require`;
const DEV_URL = `postgresql://u:p@${DEVELOPMENT_TARGET.endpoint}.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require`;
const OK_IDENTITY: RuntimeIdentity = { project: C2_MIGRATION_TARGET.project, branch: C2_MIGRATION_TARGET.branch, endpoint: C2_MIGRATION_TARGET.endpoint };

// SQL sintético por tag; el de la migración autorizada (0014) se fuerza a tener el SHA-256 autorizado mediante la tabla de hashes.
const N = AUTHORIZED_MIGRATION.idx;
const journal: JournalEntry[] = Array.from({ length: N + 1 }, (_, i) => ({ idx: i, tag: i === N ? AUTHORIZED_MIGRATION.tag : `00${String(i).padStart(2, '0')}_x`, when: 1000 + i }));
const sqlOf = (tag: string) => `-- ${tag}`;
const appliedOk: AppliedMigration[] = journal.slice(0, N).map((e) => ({ hash: sha256(sqlOf(e.tag)), created_at: String(e.when) }));

function deps(overrides: Partial<C2MigrateDeps> = {}, conn: { identity?: RuntimeIdentity[]; applied?: AppliedMigration[][] } = {}) {
  const identities = [...(conn.identity ?? [OK_IDENTITY, OK_IDENTITY])];
  const appliedSeq = [...(conn.applied ?? [appliedOk, [...appliedOk, { hash: AUTHORIZED_MIGRATION.sha256, created_at: String(1000 + N) }]])];
  const calls = { migrate: 0, close: 0, connectedTo: [] as string[] };
  const d: C2MigrateDeps = {
    readEnvFile: () => `NODE_ENV=test\nDATABASE_URL="${C2_URL}"\n`,
    readJournal: () => journal,
    readSql: (tag) => (tag === AUTHORIZED_MIGRATION.tag ? AUTHORIZED_SQL : sqlOf(tag)),
    connect: async (url) => {
      calls.connectedTo.push(url);
      return {
        identity: async () => identities.shift() ?? OK_IDENTITY,
        applied: async () => appliedSeq.shift() ?? [],
        migrate: async () => { calls.migrate++; },
        close: async () => { calls.close++; },
      };
    },
    log: () => undefined,
    ...overrides,
  };
  return { d, calls };
}

// El hash autorizado no se puede invertir: el SQL de la migración autorizada es el archivo real del repositorio.
const AUTHORIZED_SQL = readFileSync(join(__dirname, '..', 'src', 'db', 'migrations', `${AUTHORIZED_MIGRATION.tag}.sql`), 'utf8');

describe('c2-migrate: ejecutor exclusivo de migraciones de C2', () => {
  it('[TC-M08-320][AP-26] la migración autorizada es 0014 y su SQL del repositorio tiene el SHA-256 autorizado', () => {
    expect(AUTHORIZED_MIGRATION).toEqual({ idx: 14, tag: '0014_m08_m1_legal_acceptance', sha256: '72af287cf7336d6f56942b35576b89c9cf0e1e3566b42f41ab62145ab440e24c' });
    expect(sha256(AUTHORIZED_SQL)).toBe('72af287cf7336d6f56942b35576b89c9cf0e1e3566b42f41ab62145ab440e24c');
    // El requisito previo es 0013 tal como se aplicó en C2: su archivo sigue con el mismo hash.
    const core = readFileSync(join(__dirname, '..', 'src', 'db', 'migrations', '0013_m08_m1_core.sql'), 'utf8');
    expect(sha256(core)).toBe('2138d4064d8acd97e3189c38eace19e79fbf622b97ed53ecf772c205846b1472');
  });

  it('[TC-M08-321] destino correcto: verifica, aplica una sola migración y cierra la conexión', async () => {
    const { d, calls } = deps();
    await expect(runC2Migrate(d, true)).resolves.toMatchObject({ applied: true, plan: { tag: AUTHORIZED_MIGRATION.tag } });
    expect(calls).toEqual({ migrate: 1, close: 1, connectedTo: [C2_URL] });
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
    ['ya tiene 0014', [...appliedOk, { hash: AUTHORIZED_MIGRATION.sha256, created_at: String(1000 + N) }]],
    ['le falta una anterior', appliedOk.slice(0, N - 1)],
    ['un hash distinto', appliedOk.map((m, i) => (i === 5 ? { ...m, hash: 'f'.repeat(64) } : m))],
    ['un created_at distinto', appliedOk.map((m, i) => (i === 7 ? { ...m, created_at: '1' } : m))],
  ])('[TC-M08-327] se detiene si la BD %s', async (_label, applied) => {
    const { d, calls } = deps({}, { applied: [applied] });
    await expect(runC2Migrate(d, true)).rejects.toBeInstanceOf(C2MigrateError);
    expect(calls.migrate).toBe(0);
  });

  it.each([
    ['tiene una entrada más (0015)', [...journal, { idx: N + 1, tag: '0015_x', when: 2000 }]],
    ['termina en otra migración', journal.map((e) => (e.idx === N ? { ...e, tag: '0014_otra' } : e))],
    ['termina en 0013 (sin 0014)', journal.slice(0, N)],
    ['no es consecutivo', journal.map((e) => (e.idx === 4 ? { ...e, idx: 40 } : e))],
  ])('[TC-M08-328] se detiene si el journal %s', async (_label, entries) => {
    const { d, calls } = deps({ readJournal: () => entries as JournalEntry[] });
    await expect(runC2Migrate(d, true)).rejects.toBeInstanceOf(C2MigrateError);
    expect(calls.migrate).toBe(0);
  });

  it('[TC-M08-329] se detiene si el SQL de 0014 no es el autorizado', async () => {
    const { d, calls } = deps({ readSql: (tag) => (tag === AUTHORIZED_MIGRATION.tag ? `${AUTHORIZED_SQL}\n-- cambio` : sqlOf(tag)) });
    await expect(runC2Migrate(d, true)).rejects.toThrow(/SHA-256/);
    expect(calls.migrate).toBe(0);
  });

  it('[TC-M08-330] tras migrar exige exactamente un registro nuevo con el hash autorizado', async () => {
    const { d } = deps({}, { applied: [appliedOk, [...appliedOk, { hash: 'a'.repeat(64), created_at: String(1000 + N) }]] });
    await expect(runC2Migrate(d, true)).rejects.toThrow(/no es la migración autorizada/);
    const two = deps({}, { applied: [appliedOk, appliedOk] });
    await expect(runC2Migrate(two.d, true)).rejects.toThrow(new RegExp(`se esperaban ${N + 1}`));
  });

  it('[TC-M08-331] el núcleo no lee dotenv, el .env de desarrollo ni process.env', () => {
    const source = readFileSync(join(__dirname, 'c2-migrate-core.ts'), 'utf8') + readFileSync(join(__dirname, 'c2-migrate.ts'), 'utf8');
    expect(source).not.toMatch(/dotenv|process\.env|apps[\\/]backend[\\/]\.env|['"]\.env['"]/);
    expect(source).toMatch(/C:\\\\pei-c2\\\\\.env\.c2/);
  });
});
