import { EventEmitter } from 'events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRunDirectory, executeWithEvidence, makeEvidenceRedactor, reviewForVersioning, runState, verifyChecksums, writeEvidenceFile, type ChildLike, type PgSnapshot, type RunRecord } from './c2-evidence';
import {
  comparePgSnapshots,
  fingerprintRows,
  FINGERPRINT_SESSION_SETTINGS,
  PG_FINGERPRINT_TABLES,
  takePgSnapshot,
  type PgReadClient,
} from './c2-pg-fingerprint';
import { C2_TARGET } from './c2-target-guard';

// Huella de PostgreSQL de C2 con dobles: sin .env.c2, Neon ni R2.

const RUN = 'c2-20261110120000-ab12';
const NOW = new Date('2026-11-10T12:00:00.000Z');
const OPTS = { repoRoot: 'C:\\pei', secretsDir: 'C:\\pei-c2' };

async function* batches(rows: string[], size = 2): AsyncGenerator<string[]> {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}
const fp = (rows: string[], size?: number) => fingerprintRows(batches(rows, size));

// Doble de PostgreSQL: cada tabla es una lista de filas ya serializadas (como to_jsonb(t)::text) y un created_at opcional.
type FakeTable = { rows: string[]; createdAt?: string[] };
class FakePg implements PgReadClient {
  readonly log: string[] = [];
  settings: Record<string, string> = { 'neon.project_id': C2_TARGET.project, 'neon.branch_id': C2_TARGET.branch, 'neon.endpoint_id': C2_TARGET.endpoint };
  readOnly = 'on';
  failOn?: RegExp;
  private cursor: string[] = [];
  constructor(public tables: Record<string, FakeTable>) {}

  async query(text: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> {
    this.log.push(text);
    if (this.failOn?.test(text)) throw new TypeError('fallo simulado');
    if (text === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: this.readOnly }] };
    if (text.startsWith('SELECT current_setting')) return { rows: [{ v: this.settings[params[0] as string] ?? null }] };
    if (text.startsWith('SELECT 1 FROM information_schema')) return { rows: this.tables[params[0] as string]?.createdAt ? [{ '?column?': 1 }] : [] };
    const declared = /FROM "([a-z_]+)" t$/.exec(text);
    if (text.startsWith('DECLARE') && declared) {
      const table = this.tables[declared[1]];
      if (!table) throw new Error('relation does not exist');
      this.cursor = [...table.rows];
      return { rows: [] };
    }
    const fetch = /^FETCH FORWARD (\d+)/.exec(text);
    if (fetch) return { rows: this.cursor.splice(0, Number(fetch[1])).map((r) => ({ r })) };
    const count = /^SELECT count\(\*\)::int AS n FROM "([a-z_]+)" WHERE created_at/.exec(text);
    if (count) return { rows: [{ n: (this.tables[count[1]].createdAt ?? []).filter((c) => c < (params[0] as string)).length }] };
    return { rows: [] };
  }
}

const allTables = (override: Record<string, FakeTable> = {}) =>
  Object.fromEntries(PG_FINGERPRINT_TABLES.map((t) => [t, override[t] ?? { rows: [`{"id": "${t}-1"}`], createdAt: ['2026-01-01T00:00:00Z'] }]));
const snapshot = (client: FakePg, cutoff?: string) =>
  takePgSnapshot(client, { identity: C2_TARGET, expected: C2_TARGET, cutoff, now: () => NOW, batchSize: 2 });

describe('Huella de PostgreSQL: hash de las filas', () => {
  const ROWS = ['{"id": 1, "n": "a"}', '{"id": 2, "n": "b"}', '{"id": 3, "n": "c"}'];

  it('[TC-M03-321] dos estados idénticos producen el mismo hash (y es md5 de 32 hexadecimales)', async () => {
    const a = await fp(ROWS);
    expect(await fp([...ROWS])).toEqual(a);
    expect(a.total).toBe(3);
    expect(a.hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('[TC-M03-322] cambiar un valor de una fila cambia el hash', async () => {
    expect((await fp(['{"id": 1, "n": "a"}', '{"id": 2, "n": "B"}', '{"id": 3, "n": "c"}'])).hash).not.toBe((await fp(ROWS)).hash);
  });

  it('[TC-M03-323] cambiar el número de filas cambia el hash, también con filas duplicadas', async () => {
    const base = await fp(ROWS);
    expect((await fp(ROWS.slice(0, 2))).hash).not.toBe(base.hash);
    const dup = await fp([...ROWS, ROWS[0]]);
    expect(dup.total).toBe(4);
    expect(dup.hash).not.toBe(base.hash);
    expect((await fp([]))).toEqual({ total: 0, hash: (await fp([])).hash });
  });

  it('[TC-M03-324] NULL es determinista y distinto de cadena vacía o de una columna ausente', async () => {
    const asNull = await fp(['{"id": 1, "x": null}']);
    expect(await fp(['{"id": 1, "x": null}'])).toEqual(asNull);
    expect((await fp(['{"id": 1, "x": ""}'])).hash).not.toBe(asNull.hash);
    expect((await fp(['{"id": 1}'])).hash).not.toBe(asNull.hash);
  });

  it('[TC-M03-325] el orden de lectura y el tamaño de los bloques no alteran el resultado', async () => {
    const base = await fp(ROWS, 1);
    expect(await fp([...ROWS].reverse(), 2)).toEqual(base);
    expect(await fp([ROWS[1], ROWS[2], ROWS[0]], 500)).toEqual(base);
  });
});

describe('Huella de PostgreSQL: captura (doble de PostgreSQL)', () => {
  it('[TC-M03-326] lee las 13 tablas en una transacción READ ONLY, tras confirmar la identidad de Neon, y termina con ROLLBACK', async () => {
    const pg = new FakePg(allTables({ user_legal_acceptance: { rows: ['{"a": 1}', '{"a": 2}', '{"a": 3}'] } }));
    const snap = await snapshot(pg);
    expect(PG_FINGERPRINT_TABLES).toHaveLength(13);
    expect(Object.keys(snap.tables)).toEqual([...PG_FINGERPRINT_TABLES]);
    expect(snap.tables.user_legal_acceptance).toEqual({ total: 3, preexisting: 3, hash: expect.stringMatching(/^[0-9a-f]{32}$/), byCreatedAt: false });
    expect(snap.tables.user).toMatchObject({ total: 1, preexisting: 1, byCreatedAt: true });
    expect(pg.log[0]).toMatch(/^BEGIN .*READ ONLY$/);
    const firstRead = pg.log.findIndex((q) => q.startsWith('DECLARE'));
    expect(pg.log.slice(0, firstRead).filter((q) => q.startsWith('SELECT current_setting'))).toHaveLength(3);
    for (const s of FINGERPRINT_SESSION_SETTINGS) expect(pg.log.indexOf(s)).toBeLessThan(firstRead);
    expect(pg.log.at(-1)).toBe('ROLLBACK');
    expect(pg.log.every((q) => !/\b(INSERT|UPDATE|DELETE|TRUNCATE|COMMIT|ALTER|DROP|CREATE)\b/.test(q))).toBe(true);
    expect(pg.log).toContain('DECLARE pei_fingerprint NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS r FROM "user" t');
  });

  it('[TC-M03-327] otra rama de Neon o una sesión que no es de solo lectura: falla sin leer ninguna tabla', async () => {
    const other = new FakePg(allTables());
    other.settings['neon.branch_id'] = 'br-desarrollo';
    await expect(snapshot(other)).rejects.toThrow();
    expect(other.log.some((q) => q.startsWith('DECLARE'))).toBe(false);
    expect(other.log.at(-1)).toBe('ROLLBACK');
    const writable = new FakePg(allTables());
    writable.readOnly = 'off';
    await expect(snapshot(writable)).rejects.toThrow('solo lectura');
    expect(writable.log.some((q) => q.startsWith('DECLARE'))).toBe(false);
  });

  it('[TC-M03-328] el estado de PostgreSQL no cambia: misma huella; una fila nueva o modificada cambia la tabla afectada', async () => {
    const pg = new FakePg(allTables());
    const before = await snapshot(pg);
    expect(comparePgSnapshots(before, await snapshot(pg, before.cutoff)).status).toBe('equal');
    pg.tables.audit_log = { rows: [...pg.tables.audit_log.rows, '{"id": "nuevo"}'], createdAt: [...pg.tables.audit_log.createdAt!, '2026-12-01T00:00:00Z'] };
    pg.tables.user = { rows: ['{"id": "user-1", "name": "cambiado"}'], createdAt: pg.tables.user.createdAt };
    const after = await snapshot(pg, before.cutoff);
    expect(after.tables.audit_log).toMatchObject({ total: 2, preexisting: 1 });
    const comparison = comparePgSnapshots(before, after, { now: NOW });
    expect(comparison.status).toBe('different');
    expect(comparison.tables.filter((t) => !t.equal).map((t) => t.table)).toEqual(['user', 'audit_log']);
    expect(comparison.tables.find((t) => t.table === 'audit_log')).toMatchObject({ totalBefore: 1, totalAfter: 2, equal: false });
    expect(comparison.tables.find((t) => t.table === 'user')).toMatchObject({ totalBefore: 1, totalAfter: 1, equal: false });
  });

  it('[TC-M03-329] estados de la comparación: equal, different, incomplete y error', async () => {
    const pg = new FakePg(allTables());
    const before = await snapshot(pg);
    expect(comparePgSnapshots(before, before).status).toBe('equal');
    expect(comparePgSnapshots(before, null, { failure: { phase: 'after', error: 'TypeError' } })).toMatchObject({ status: 'incomplete', failure: { phase: 'after' } });
    const partial: PgSnapshot = { ...before, tables: { ...before.tables } };
    delete partial.tables.specialty;
    expect(comparePgSnapshots(before, partial).status).toBe('incomplete');
    expect(comparePgSnapshots(null, null, { failure: { phase: 'before', error: 'TypeError' } }).status).toBe('error');
  });
});

describe('Huella de PostgreSQL en executeWithEvidence', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pei-c2-pg-spec-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  class FakeChild extends EventEmitter implements ChildLike {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    kill() {
      return true;
    }
  }
  const record = (): RunRecord => ({ runId: RUN, mode: 'r2', spec: 'test/r2/x.r2-spec.ts', commit: 'abc', workingTreeDirty: false, target: { ...C2_TARGET, bucket: 'pei-docs-c2-test' }, startedAt: NOW.toISOString(), status: 'running' });
  const run = (dir: string, pg: { before: () => Promise<PgSnapshot>; after: (b: PgSnapshot) => Promise<PgSnapshot> }, start: () => ChildLike) => {
    const logPath = writeEvidenceFile(dir, 'jest-output.log', '');
    const out: string[] = [];
    const promise = executeWithEvidence({
      dir,
      record: record(),
      start,
      redact: makeEvidenceRedactor(),
      write: { stdout: (t) => out.push(t), stderr: (t) => out.push(t) },
      appendLog: (t) => writeFileSync(logPath, readFileSync(logPath, 'utf8') + t),
      now: () => NOW,
      pg,
    });
    return { promise, out, logPath };
  };
  const read = (dir: string, file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const tick = () => new Promise((r) => setImmediate(r));

  it('[TC-M03-330] si pg-before falla, Jest no se inicia y la evidencia registra el error', async () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    const start = jest.fn(() => new FakeChild());
    const { promise, logPath } = run(dir, { before: () => Promise.reject(new TypeError('x')), after: jest.fn() }, start);
    expect(await promise).toBe(1);
    expect(start).not.toHaveBeenCalled();
    expect(existsSync(join(dir, 'pg-before.json'))).toBe(false);
    expect(read(dir, 'pg-comparison.json')).toMatchObject({ status: 'error', failure: { phase: 'before', error: 'TypeError' } });
    expect(read(dir, 'run.json')).toMatchObject({ status: 'failed', pgComparison: 'error' });
    expect(readFileSync(logPath, 'utf8')).toContain('El spec no se ejecutó');
    expect(verifyChecksums(dir).ok).toBe(true);
  });

  it('[TC-M03-331] si pg-after falla después de Jest, la comparación queda incompleta y la evidencia anterior se conserva', async () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    const before = await snapshot(new FakePg(allTables()));
    const child = new FakeChild();
    const { promise } = run(dir, { before: async () => before, after: () => Promise.reject(new TypeError('x')) }, () => child);
    await tick();
    child.emit('close', 0, null);
    expect(await promise).toBe(1);
    expect(read(dir, 'pg-before.json').tables.user.hash).toBe(before.tables.user.hash);
    expect(existsSync(join(dir, 'pg-after.json'))).toBe(false);
    expect(read(dir, 'pg-comparison.json')).toMatchObject({ status: 'incomplete', failure: { phase: 'after', error: 'TypeError' } });
    expect(read(dir, 'run.json')).toMatchObject({ status: 'completed', exitCode: 0, pgComparison: 'incomplete' });
    expect(verifyChecksums(dir).ok).toBe(true);
  });

  it('[TC-M03-332] Jest correcto y huellas iguales: código 0, pg-before/after y comparación equal; el paquete se puede revisar', async () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    const pg = new FakePg(allTables());
    const after = jest.fn((b: PgSnapshot) => snapshot(pg, b.cutoff));
    const child = new FakeChild();
    const { promise, out } = run(dir, { before: () => snapshot(pg), after }, () => child);
    await tick();
    expect(after).not.toHaveBeenCalled(); // pg-after solo cuando Jest terminó
    child.emit('close', 0, null);
    expect(await promise).toBe(0);
    expect(read(dir, 'pg-comparison.json').status).toBe('equal');
    expect(read(dir, 'pg-comparison.json').tables).toHaveLength(13);
    expect(read(dir, 'run.json')).toMatchObject({ status: 'completed', pgComparison: 'equal' });
    expect(out.join('')).toContain('huella PostgreSQL: equal');
    expect(runState(dir)).toBe('completed');
    expect(verifyChecksums(dir).ok).toBe(true);
    expect(reviewForVersioning(dir).findings.filter((f) => f.file.startsWith('pg-'))).toEqual([]);
  });

  it('[TC-M03-333] Jest correcto pero huellas distintas: código 1 y las tablas que difieren en la evidencia (sin corregir nada)', async () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    const pg = new FakePg(allTables());
    const child = new FakeChild();
    const { promise, out } = run(dir, { before: () => snapshot(pg), after: (b) => snapshot(pg, b.cutoff) }, () => child);
    await tick();
    pg.tables.session = { rows: ['{"id": "s-2"}'], createdAt: ['2026-12-01T00:00:00Z'] };
    child.emit('close', 0, null);
    expect(await promise).toBe(1);
    const comparison = read(dir, 'pg-comparison.json');
    expect(comparison.status).toBe('different');
    expect(comparison.tables.filter((t: { equal: boolean }) => !t.equal).map((t: { table: string }) => t.table)).toEqual(['session']);
    expect(out.join('')).toContain('huella PostgreSQL: different (session)');
    expect(read(dir, 'run.json').exitCode).toBe(0);
  });

  it('[TC-M03-334] Jest con fallos: se toma igualmente pg-after y se conserva el código de Jest', async () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    const pg = new FakePg(allTables());
    const child = new FakeChild();
    const { promise } = run(dir, { before: () => snapshot(pg), after: (b) => snapshot(pg, b.cutoff) }, () => child);
    await tick();
    child.emit('close', 1, null);
    expect(await promise).toBe(1);
    expect(read(dir, 'pg-comparison.json').status).toBe('equal');
    expect(read(dir, 'run.json')).toMatchObject({ status: 'failed', exitCode: 1, pgComparison: 'equal' });
  });
});
