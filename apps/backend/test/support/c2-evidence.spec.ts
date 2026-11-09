import { EventEmitter } from 'events';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  assertEvidenceRoot,
  buildRunRecord,
  C2EvidenceError,
  createRunDirectory,
  executeWithEvidence,
  finishRunRecord,
  gitState,
  makeEvidenceRedactor,
  REDACTION_MARK,
  reviewForVersioning,
  runState,
  verifyChecksums,
  writeChecksums,
  writeEvidenceFile,
  writeEvidenceJson,
  writePgSnapshot,
  type ChildLike,
  type RunRecord,
} from './c2-evidence';
import { makeRedactor, newRunId } from './c2-launcher';
import { C2_MODES, C2_TARGET } from './c2-target-guard';
import { R2RunManifest } from './r2-run';

// Evidencias C2 (etapa 1) con un sistema de archivos temporal y dobles. Sin .env.c2, Neon ni R2.

const RUN = 'c2-20261106120000-ab12';
const NOW = new Date('2026-11-06T12:00:00.000Z');
const OPTS = { repoRoot: 'C:\\pei', secretsDir: 'C:\\pei-c2' };
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pei-c2-evidencias-spec-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const record = (overrides: Partial<RunRecord> = {}): RunRecord =>
  buildRunRecord({
    runId: RUN,
    runUuid: '8cb16c66-9111-5fce-bc45-8cdffe1472b2',
    mode: 'postgres',
    spec: 'test/integration/doctors.int-spec.ts',
    commit: 'abc1234',
    workingTreeDirty: true,
    target: { project: C2_TARGET.project, branch: C2_TARGET.branch, endpoint: C2_TARGET.endpoint },
    startedAt: NOW.toISOString(),
    ...overrides,
  });

describe('Directorio de evidencias', () => {
  it('[TC-M03-307] se organiza por fecha y C2_RUN_ID, fuera del repositorio y de C:\\pei-c2', () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    expect(dir).toBe(join(root, '2026-11-06', RUN));
    expect(existsSync(dir)).toBe(true);
    expect(() => assertEvidenceRoot('C:\\pei-c2-evidencias', OPTS.repoRoot, OPTS.secretsDir)).not.toThrow();
    for (const bad of ['C:\\pei\\evidencias', 'C:\\pei-c2\\evidencias', 'C:\\pei-c2', 'evidencias-relativas']) {
      expect(() => assertEvidenceRoot(bad, OPTS.repoRoot, OPTS.secretsDir)).toThrow(C2EvidenceError);
    }
    expect(() => createRunDirectory(root, 'otra-ejecucion', NOW, OPTS)).toThrow(C2EvidenceError);
  });

  it('[TC-M03-308] C2_RUN_ID único por ejecución y nunca se reutiliza un directorio ni se sobrescribe un archivo', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRunId(NOW)));
    expect(ids.size).toBeGreaterThan(190); // 4 hexadecimales aleatorios por segundo; el directorio impide el choque
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    expect(() => createRunDirectory(root, RUN, NOW, OPTS)).toThrow(/ya existe/);
    writeEvidenceJson(dir, 'run.json', record());
    expect(() => writeEvidenceJson(dir, 'run.json', record({ status: 'completed' }))).toThrow(/no se sobrescribe/);
    expect(() => writeEvidenceFile(dir, 'otro.txt' as never, 'x')).toThrow(C2EvidenceError);
  });
});

describe('run.json, huella de PostgreSQL y SHA256SUMS', () => {
  it('[TC-M03-309] run.json omite los campos que no corresponden y registra el código de salida', () => {
    const started = record({ committedFixtures: undefined });
    expect(started).not.toHaveProperty('committedFixtures');
    expect(started).not.toHaveProperty('exitCode');
    expect(started.status).toBe('running');
    expect(finishRunRecord(started, { code: 0 }, NOW)).toMatchObject({ status: 'completed', exitCode: 0, finishedAt: NOW.toISOString() });
    expect(finishRunRecord(started, { code: 1 }, NOW)).toMatchObject({ status: 'failed', exitCode: 1 });
    expect(finishRunRecord(started, { code: null, signal: 'SIGINT', interrupted: true }, NOW)).toMatchObject({ status: 'interrupted', exitCode: null, signal: 'SIGINT' });
    expect(record({ mode: 'r2', target: { ...C2_TARGET, bucket: 'pei-docs-c2-test' } }).target.bucket).toBe('pei-docs-c2-test');
  });

  it('[TC-M03-309] gitState: commit y árbol sucio sin listar archivos; sin git, null (no se inventa)', () => {
    expect(gitState((c) => (c.startsWith('git rev-parse') ? 'abc123\n' : ' M archivo.ts\n'))).toEqual({ commit: 'abc123', workingTreeDirty: true });
    expect(gitState((c) => (c.startsWith('git rev-parse') ? 'abc123\n' : ''))).toEqual({ commit: 'abc123', workingTreeDirty: false });
    expect(gitState(() => { throw new Error('sin git'); })).toEqual({ commit: null, workingTreeDirty: null });
  });

  it('[TC-M03-310] la huella de PostgreSQL solo admite recuentos y hashes, nunca filas', () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    const snapshot = { takenAt: 'x', cutoff: 'x', identity: C2_TARGET, tables: { user: { total: 3, preexisting: 3, hash: 'a'.repeat(32), byCreatedAt: true } } };
    writePgSnapshot(dir, 'before', snapshot);
    expect(JSON.parse(readFileSync(join(dir, 'pg-before.json'), 'utf8')).tables.user.total).toBe(3);
    const withRows = { ...snapshot, tables: { user: { ...snapshot.tables.user, rows: [{ email: 'a@b.mx' }] } } };
    expect(() => writePgSnapshot(dir, 'after', withRows as never)).toThrow(C2EvidenceError);
    expect(existsSync(join(dir, 'pg-after.json'))).toBe(false);
  });

  it('[TC-M03-311] SHA256SUMS cubre todos los archivos y detecta cambios, faltantes y archivos añadidos', () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    writeEvidenceJson(dir, 'run.json', record());
    writeEvidenceFile(dir, 'jest-output.log', 'PASS\n');
    writeChecksums(dir);
    expect(verifyChecksums(dir)).toEqual({ ok: true, mismatched: [], missing: [], unlisted: [] });
    expect(() => writeChecksums(dir)).toThrow(); // tampoco se sobrescribe
    writeFileSync(join(dir, 'jest-output.log'), 'PASS (alterado)\n');
    writeFileSync(join(dir, 'jest-results.json'), '{}');
    expect(verifyChecksums(dir)).toMatchObject({ ok: false, mismatched: ['jest-output.log'], unlisted: ['jest-results.json'] });
  });
});

describe('Depuración y revisión para versionar', () => {
  const SECRET_VARS = { DATABASE_URL: 'postgresql://u:clave-muy-secreta@ep-x.neon.tech/db', BETTER_AUTH_SECRET: 'S'.repeat(64), R2_SECRET_ACCESS_KEY: 'secreto-r2-largo' };
  const redact = makeEvidenceRedactor(makeRedactor(SECRET_VARS));

  it('[TC-M03-312] la depuración oculta secretos, conexiones, cookies, tokens, correos reales, CURP, RFC y cadenas largas', () => {
    const raw = [
      `conecta a ${SECRET_VARS.DATABASE_URL}`,
      `secreto ${SECRET_VARS.BETTER_AUTH_SECRET} y r2 ${SECRET_VARS.R2_SECRET_ACCESS_KEY}`,
      'set-cookie: better-auth.session_token=abc.def; HttpOnly',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.firma',
      'token=0123456789abcdef',
      'correo persona.real@gmail.com y sintético gst-m00-test-1@m00.test.invalid',
      'CURP real PEGJ800101HDFRRN05 y sintética XAXX900101HNEXXX5',
      'RFC PEGJ800101AB1',
      'clave tA9sK2pQ7vX1mZ8nB3cR6dF0gH4jL5wE2yU7iO9pQ',
      'clave R2 doctor-identity/8cb16c66-9111-5fce-bc45-8cdffe1472b2/6d07719f-b460-4825-ac4a-73c457743bb1/front.png',
    ].join('\n');
    const out = redact(raw);
    for (const leaked of ['clave-muy-secreta', 'postgresql://', 'SSSSSSSS', 'secreto-r2-largo', 'abc.def', 'eyJhbGci', '0123456789abcdef', 'persona.real@gmail.com', 'PEGJ800101HDFRRN05', 'PEGJ800101AB1', 'tA9sK2pQ7vX1mZ8nB3cR6dF0gH4jL5wE2yU7iO9pQ']) {
      expect(out).not.toContain(leaked);
    }
    expect(out).toContain('gst-m00-test-1@m00.test.invalid');
    expect(out).toContain('XAXX900101HNEXXX5');
    expect(out).toContain('doctor-identity/8cb16c66-9111-5fce-bc45-8cdffe1472b2/6d07719f-b460-4825-ac4a-73c457743bb1/front.png');
    expect(out).toContain(REDACTION_MARK);
  });

  it('[TC-M03-313] un paquete limpio pasa la revisión; con contenido depurado, sospechoso, binario o desconocido se rechaza', () => {
    const clean = createRunDirectory(root, RUN, NOW, OPTS);
    writeEvidenceJson(clean, 'run.json', record());
    writeEvidenceFile(clean, 'jest-output.log', redact('PASS test/integration/doctors.int-spec.ts\n  √ caso (12 ms)\n'));
    writeChecksums(clean);
    expect(reviewForVersioning(clean)).toEqual({ ok: true, findings: [] });

    const cases: [string, (dir: string) => void, string][] = [
      ['contenido depurado', (d) => writeEvidenceFile(d, 'jest-output.log', redact('token=abc123456789')), 'contenido-depurado'],
      ['correo real sin depurar', (d) => writeEvidenceFile(d, 'jest-output.log', 'falló con persona.real@gmail.com'), 'correo'],
      ['cadena de conexión', (d) => writeEvidenceFile(d, 'jest-results.json', '{"m":"postgres://u:p@h/db"}'), 'conexión'],
      ['binario', (d) => writeEvidenceFile(d, 'jest-output.log', 'a\u0000b'), 'binario'],
      ['archivo no admitido', (d) => writeFileSync(join(d, 'documento.pdf'), '%PDF-'), 'archivo-no-admitido'],
    ];
    cases.forEach(([, prepare, kind], i) => {
      const dir = createRunDirectory(root, `c2-2026110612000${i}-ef56`, NOW, OPTS);
      prepare(dir);
      const review = reviewForVersioning(dir);
      expect(review.ok).toBe(false);
      expect(review.findings.map((f) => f.kind)).toContain(kind);
      expect(JSON.stringify(review)).not.toMatch(/persona\.real|postgres:\/\/|abc123456789/); // sin repetir el valor
    });
  });

  it('[TC-M03-313] el manifiesto de R2 y su comprobación final en el directorio de la ejecución pasan la revisión', () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    const manifest = new R2RunManifest(RUN, NOW);
    manifest.attach(dir);
    manifest.record('put', `doctor-licenses/${manifest.runUuid}/6d07719f-b460-4825-ac4a-73c457743bb1.pdf`, true);
    manifest.recordFinalCheck({ [`doctor-licenses/${manifest.runUuid}/`]: 0 });
    expect(JSON.parse(readFileSync(join(dir, 'r2-final-check.json'), 'utf8'))).toMatchObject({ runId: RUN, empty: true, livingKeys: 1 });
    expect(reviewForVersioning(dir)).toEqual({ ok: true, findings: [] });
    expect(() => manifest.recordFinalCheck({})).toThrow(/ya está registrada/);
  });
});

describe('Ejecución con evidencias (proceso simulado)', () => {
  class FakeChild extends EventEmitter implements ChildLike {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    killed: string | undefined;
    kill(signal?: NodeJS.Signals) {
      this.killed = signal;
      return true;
    }
  }
  const run = (dir: string, child: FakeChild, extra: { onInterrupt?: (h: () => void) => () => void } = {}) => {
    const logPath = writeEvidenceFile(dir, 'jest-output.log', '');
    const consoleOut: string[] = [];
    const promise = executeWithEvidence({
      dir,
      record: record(),
      start: () => child,
      redact: makeEvidenceRedactor(),
      consoleRedact: (t) => t.toUpperCase(),
      write: { stdout: (t) => consoleOut.push(t), stderr: (t) => consoleOut.push(t) },
      appendLog: (t) => writeFileSync(logPath, readFileSync(logPath, 'utf8') + t),
      now: () => NOW,
      ...extra,
    });
    return { promise, consoleOut, logPath };
  };

  it('[TC-M03-314] Jest con fallos: captura el código de salida, el log depurado y SHA256SUMS', async () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    const child = new FakeChild();
    const { promise, consoleOut, logPath } = run(dir, child);
    expect(runState(dir)).toBe('interrupted'); // en curso: solo run.started.json
    child.stdout.emit('data', Buffer.from('FAIL caso con persona.real@gmail.com\n'));
    child.emit('close', 1, null);
    expect(await promise).toBe(1);
    expect(JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))).toMatchObject({ status: 'failed', exitCode: 1 });
    expect(readFileSync(logPath, 'utf8')).not.toContain('persona.real@gmail.com');
    expect(consoleOut.join('')).toContain('FAIL'); // la consola usa su propio filtro
    expect(runState(dir)).toBe('failed');
    expect(verifyChecksums(dir).ok).toBe(true);
  });

  it('[TC-M03-314] Jest correcto: código 0 y estado completed', async () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    const child = new FakeChild();
    const { promise } = run(dir, child);
    child.emit('close', 0, null);
    expect(await promise).toBe(0);
    expect(runState(dir)).toBe('completed');
  });

  it('[TC-M03-315] interrupción: detiene Jest, registra interrupted, conserva lo parcial y calcula SHA256SUMS', async () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    const child = new FakeChild();
    let interrupt: () => void = () => {};
    const { promise, logPath } = run(dir, child, { onInterrupt: (h) => ((interrupt = h), () => undefined) });
    child.stdout.emit('data', 'PASS parcial\n');
    interrupt();
    child.emit('close', null, 'SIGINT');
    expect(await promise).toBe(1);
    expect(child.killed).toBe('SIGINT');
    expect(JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))).toMatchObject({ status: 'interrupted', signal: 'SIGINT' });
    expect(readFileSync(logPath, 'utf8')).toContain('PASS parcial');
    expect(verifyChecksums(dir).ok).toBe(true);
  });

  it('[TC-M03-315] un proceso que muere sin terminar deja run.started.json sin run.json: se reconoce como interrumpido', () => {
    const dir = createRunDirectory(root, RUN, NOW, OPTS);
    writeEvidenceJson(dir, 'run.started.json', record());
    expect(runState(dir)).toBe('interrupted');
    expect(readdirSync(dir)).toEqual(['run.started.json']);
  });

  it('[TC-M03-316] las cuatro modalidades C2 generan su run.json; solo r2 incluye bucket', async () => {
    for (const [i, mode] of C2_MODES.entries()) {
      const dir = createRunDirectory(root, `c2-2026110612010${i}-cd34`, NOW, OPTS);
      const child = new FakeChild();
      const target = { project: C2_TARGET.project, branch: C2_TARGET.branch, endpoint: C2_TARGET.endpoint, ...(mode === 'r2' ? { bucket: 'pei-docs-c2-test' } : {}) };
      const logPath = writeEvidenceFile(dir, 'jest-output.log', '');
      const promise = executeWithEvidence({
        dir,
        record: record({ mode, target }),
        start: () => child,
        redact: makeEvidenceRedactor(),
        write: { stdout: () => undefined, stderr: () => undefined },
        appendLog: (t) => writeFileSync(logPath, t),
        now: () => NOW,
      });
      child.emit('close', 0, null);
      expect(await promise).toBe(0);
      const saved = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')) as RunRecord;
      expect(saved.mode).toBe(mode);
      expect('bucket' in saved.target).toBe(mode === 'r2');
    }
  });
});
