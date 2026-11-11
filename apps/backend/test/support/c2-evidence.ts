import { createHash } from 'crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import type { C2Mode } from './c2-target-guard';
import { REPO_ROOT } from './c2-launcher';
import { comparePgSnapshots, errorName, type PgComparison, type PgComparisonStatus } from './c2-pg-fingerprint';

// Evidencias de las ejecuciones C2 (etapa 1, 2026-11-06). Cada ejecución del lanzador (`pnpm c2 run`) guarda su paquete
// ORIGINAL en C:\pei-c2-evidencias\<AAAA-MM-DD>\<C2_RUN_ID>\, fuera del repositorio y separado de C:\pei-c2\ (secretos):
//
//   run.started.json   al empezar (si al final falta run.json, la ejecución se interrumpió)
//   run.json           al terminar: identificador, modo, suite, commit, estado del árbol, fechas y código de salida
//   jest-results.json  salida --json de Jest (la escribe Jest)
//   jest-output.log    stdout y stderr de Jest, depurados
//   pg-before.json / pg-after.json     huella de PostgreSQL (recuentos y hashes; NUNCA filas). Activa en el modo r2
//   pg-comparison.json                 comparación de las 13 tablas: equal | different | incomplete | error
//   r2-manifest.json / r2-final-check.json   solo en el modo r2 (los escribe el spec)
//   SHA256SUMS         hashes de todos los archivos anteriores
//
// Nada se sobrescribe: el directorio de la ejecución se crea con mkdir no recursivo y cada archivo con la marca 'wx'.
// Nada se versiona automáticamente: reviewForVersioning solo dice si un paquete podría versionarse y, ante la duda, no.

export const DEFAULT_EVIDENCE_ROOT = 'C:\\pei-c2-evidencias';
export const SECRETS_DIR = 'C:\\pei-c2';

export const EVIDENCE_FILES = [
  'run.started.json',
  'run.json',
  'jest-results.json',
  'jest-output.log',
  'pg-before.json',
  'pg-after.json',
  'pg-comparison.json',
  'r2-manifest.json',
  'r2-final-check.json',
] as const;
export type EvidenceFile = (typeof EVIDENCE_FILES)[number];
export const CHECKSUMS_FILE = 'SHA256SUMS';

export class C2EvidenceError extends Error {
  constructor(reason: string) {
    super(`Evidencias C2: ${reason}`);
    this.name = 'C2EvidenceError';
  }
}

const isInside = (parent: string, child: string) => {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

// La raíz debe ser absoluta, estar fuera del repositorio y fuera del directorio de secretos (comparación por ruta, no
// por prefijo de texto: C:\pei-c2-evidencias no está dentro de C:\pei-c2).
export function assertEvidenceRoot(root: string, repoRoot: string = REPO_ROOT, secretsDir: string = SECRETS_DIR): string {
  if (!isAbsolute(root)) throw new C2EvidenceError('la raíz de evidencias debe ser una ruta absoluta');
  if (isInside(repoRoot, root)) throw new C2EvidenceError('la raíz de evidencias no puede estar dentro del repositorio');
  if (isInside(secretsDir, root) || isInside(root, secretsDir)) throw new C2EvidenceError('la raíz de evidencias no puede compartir directorio con los secretos de C2');
  return resolve(root);
}

// <raíz>\<AAAA-MM-DD>\<C2_RUN_ID>\. El último nivel se crea SIN recursive: si ya existe, falla (nunca se reutiliza).
export function createRunDirectory(root: string, runId: string, now: Date = new Date(), options: { repoRoot?: string; secretsDir?: string } = {}): string {
  const base = assertEvidenceRoot(root, options.repoRoot, options.secretsDir);
  if (!/^c2-\d{14}-[0-9a-f]{4}$/.test(runId)) throw new C2EvidenceError('C2_RUN_ID con formato inválido');
  const day = join(base, now.toISOString().slice(0, 10));
  mkdirSync(day, { recursive: true });
  const dir = join(day, runId);
  if (existsSync(dir)) throw new C2EvidenceError('ya existe un directorio de evidencias para este C2_RUN_ID');
  mkdirSync(dir);
  try {
    chmodSync(dir, 0o700); // en POSIX restringe al usuario; en Windows ver docs/testing/README.md (icacls)
  } catch {
    // sin efecto en algunos sistemas de archivos: la restricción se documenta como recomendación
  }
  return dir;
}

export function writeEvidenceFile(dir: string, name: EvidenceFile, content: string): string {
  if (!(EVIDENCE_FILES as readonly string[]).includes(name)) throw new C2EvidenceError('nombre de archivo de evidencia no admitido');
  const path = join(dir, name);
  try {
    writeFileSync(path, content, { flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new C2EvidenceError(`${name} ya existe: no se sobrescribe`);
    throw error;
  }
  return path;
}

export const writeEvidenceJson = (dir: string, name: EvidenceFile, value: unknown) => writeEvidenceFile(dir, name, `${JSON.stringify(value, null, 2)}\n`);

// --- run.json ------------------------------------------------------------------------------------------------------
export interface RunTarget {
  project: string;
  branch: string;
  endpoint: string;
  bucket?: string;
}
export interface RunRecord {
  runId: string;
  runUuid?: string;
  mode: C2Mode;
  spec: string;
  commit: string | null;
  workingTreeDirty: boolean | null;
  target: RunTarget;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  exitCode?: number | null;
  signal?: string | null;
  committedFixtures?: string;
  // Resultado de pg-comparison.json, cuando la huella de PostgreSQL está activa.
  pgComparison?: PgComparisonStatus;
}

// Construye el registro solo con campos que correspondan (los opcionales ausentes no se escriben).
export function buildRunRecord(input: Omit<RunRecord, 'status'> & { status?: RunRecord['status'] }): RunRecord {
  const record: RunRecord = { ...input, status: input.status ?? 'running' };
  for (const key of Object.keys(record) as (keyof RunRecord)[]) if (record[key] === undefined) delete record[key];
  return record;
}

export function finishRunRecord(started: RunRecord, exit: { code: number | null; signal?: string | null; interrupted?: boolean }, now: Date = new Date()): RunRecord {
  const status: RunRecord['status'] = exit.interrupted ? 'interrupted' : exit.code === 0 ? 'completed' : 'failed';
  return buildRunRecord({ ...started, finishedAt: now.toISOString(), exitCode: exit.code, signal: exit.signal ?? undefined, status });
}

// Estado de un directorio de ejecución tal como quedó en disco.
export function runState(dir: string): 'completed' | 'failed' | 'interrupted' | 'unknown' {
  const hasStart = existsSync(join(dir, 'run.started.json'));
  const finalPath = join(dir, 'run.json');
  if (!existsSync(finalPath)) return hasStart ? 'interrupted' : 'unknown';
  const status = (JSON.parse(readFileSync(finalPath, 'utf8')) as RunRecord).status;
  return status === 'running' ? 'interrupted' : status;
}

// Estado de Git: commit y si hay cambios sin commit (sin listar archivos). `exec` devuelve la salida o lanza.
export function gitState(exec: (command: string) => string): { commit: string | null; workingTreeDirty: boolean | null } {
  let commit: string | null = null;
  let dirty: boolean | null = null;
  try {
    commit = exec('git rev-parse HEAD').trim() || null;
  } catch {
    commit = null;
  }
  try {
    dirty = exec('git status --porcelain').trim().length > 0;
  } catch {
    dirty = null;
  }
  return { commit, workingTreeDirty: dirty };
}

// --- Huella de PostgreSQL (cálculo y comparación: c2-pg-fingerprint.ts) ---------------------------------------------
export interface PgTableFingerprint {
  total: number;
  preexisting: number;
  hash: string;
  byCreatedAt: boolean;
}
export interface PgSnapshot {
  takenAt: string;
  cutoff: string;
  identity: RunTarget;
  tables: Record<string, PgTableFingerprint>;
  currentDoctorLegal?: { type: string; version: string }[];
}

// Solo recuentos, hashes y metadatos: cualquier otro valor (por ejemplo, filas) se rechaza antes de escribir.
export function assertPgSnapshotShape(snapshot: PgSnapshot): void {
  for (const [table, t] of Object.entries(snapshot.tables ?? {})) {
    const keys = Object.keys(t).sort().join(',');
    if (keys !== 'byCreatedAt,hash,preexisting,total') throw new C2EvidenceError(`huella de ${table} con campos no admitidos`);
    if (!Number.isInteger(t.total) || !Number.isInteger(t.preexisting) || !/^[0-9a-f]{32}$|^$/.test(t.hash)) {
      throw new C2EvidenceError(`huella de ${table} con valores no admitidos`);
    }
  }
}

export function writePgSnapshot(dir: string, phase: 'before' | 'after', snapshot: PgSnapshot): string {
  assertPgSnapshotShape(snapshot);
  return writeEvidenceJson(dir, phase === 'before' ? 'pg-before.json' : 'pg-after.json', snapshot);
}

export function writePgComparison(dir: string, comparison: PgComparison): string {
  for (const t of comparison.tables) {
    for (const h of [t.hashBefore, t.hashAfter]) if (h !== null && !/^[0-9a-f]{32}$/.test(h)) throw new C2EvidenceError(`comparación de ${t.table} con hash no admitido`);
  }
  return writeEvidenceJson(dir, 'pg-comparison.json', comparison);
}

// --- Depuración de la salida -----------------------------------------------------------------------------------------
// Conservadora: además de los secretos conocidos (redactor del lanzador), oculta cualquier patrón que PUEDA ser sensible.
// No pretende detectar todos los datos personales: por eso el log completo nunca se versiona automáticamente.
const SYNTHETIC_EMAIL = /@(m00\.test\.invalid|pei-sintetico\.test|example\.(test|invalid))$/i;
const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Una cadena larga formada sobre todo por UUID (claves de R2, identificadores sintéticos) no es un secreto.
const mostlyUuids = (m: string) => m.replace(UUID_IN_TEXT, '').replace(/[/._-]/g, '').length < 24;
const SENSITIVE_PATTERNS: { kind: string; pattern: RegExp; keep?: (match: string) => boolean }[] = [
  { kind: 'conexión', pattern: /\b(?:postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?):\/\/[^\s'"`]+/gi },
  { kind: 'cookie', pattern: /\b(?:set-cookie|cookie)\s*[:=]\s*[^\r\n]+/gi },
  { kind: 'token', pattern: /\b(?:authorization\s*:\s*\S+(?:\s+\S+)?|bearer\s+[\w.~+/=-]+|(?:access_|refresh_|session_)?token\s*[=:]\s*[^\s&"',]+)/gi },
  { kind: 'secreto', pattern: /\b(?:password|passwd|pwd|secret|secret_access_key|api[_-]?key|access[_-]?key[_-]?id)\s*[=:]\s*[^\s"',]+/gi },
  { kind: 'correo', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, keep: (m) => SYNTHETIC_EMAIL.test(m) },
  // CURP (18 caracteres) que no siga el patrón sintético de las pruebas (X?XX…NEXXX).
  { kind: 'curp', pattern: /\b[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d\b/g, keep: (m) => /^X[AEIOUX]XX\d{6}[HMX]NEXXX/.test(m) },
  { kind: 'rfc', pattern: /\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/g },
  // Cadenas largas de alta entropía (claves, secretos): 40+ caracteres base64/base64url o 32+ hexadecimales.
  { kind: 'cadena-larga', pattern: /\b[A-Za-z0-9_\-+/]{40,}={0,2}/g, keep: mostlyUuids },
  { kind: 'hex-largo', pattern: /\b[0-9a-f]{32,}\b/gi },
];
export const REDACTION_MARK = '«depurado»';

export function makeEvidenceRedactor(knownSecrets: (text: string) => string = (t) => t): (text: string) => string {
  return (text: string) => {
    let out = knownSecrets(text);
    for (const { pattern, keep } of SENSITIVE_PATTERNS) out = out.replace(pattern, (match) => (keep?.(match) ? match : REDACTION_MARK));
    return out;
  };
}

// --- SHA256SUMS -------------------------------------------------------------------------------------------------------
const sha256File = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function writeChecksums(dir: string): string {
  const files = readdirSync(dir).filter((f) => f !== CHECKSUMS_FILE && statSync(join(dir, f)).isFile()).sort();
  const lines = files.map((f) => `${sha256File(join(dir, f))}  ${f}`);
  const path = join(dir, CHECKSUMS_FILE);
  writeFileSync(path, `${lines.join('\n')}\n`, { flag: 'wx' });
  return path;
}

export function verifyChecksums(dir: string): { ok: boolean; mismatched: string[]; missing: string[]; unlisted: string[] } {
  const listed = new Map(
    readFileSync(join(dir, CHECKSUMS_FILE), 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [hash, ...name] = line.split('  ');
        return [name.join('  '), hash] as const;
      }),
  );
  const present = readdirSync(dir).filter((f) => f !== CHECKSUMS_FILE && statSync(join(dir, f)).isFile());
  const mismatched = [...listed].filter(([f, h]) => present.includes(f) && sha256File(join(dir, f)) !== h).map(([f]) => f);
  const missing = [...listed.keys()].filter((f) => !present.includes(f));
  const unlisted = present.filter((f) => !listed.has(f));
  return { ok: mismatched.length === 0 && missing.length === 0 && unlisted.length === 0, mismatched, missing, unlisted };
}

// --- Revisión para versionar un resumen ---------------------------------------------------------------------------------
// Falla de forma segura: cualquier archivo desconocido, binario, con marca de depuración (hubo algo sensible) o con un
// patrón sospechoso rechaza el paquete. Los hallazgos no repiten el valor encontrado.
export interface ReviewFinding {
  file: string;
  kind: string;
}

export function reviewForVersioning(dir: string): { ok: boolean; findings: ReviewFinding[] } {
  const findings: ReviewFinding[] = [];
  for (const file of readdirSync(dir).sort()) {
    const path = join(dir, file);
    if (!statSync(path).isFile()) {
      findings.push({ file, kind: 'no-es-archivo' });
      continue;
    }
    if (file !== CHECKSUMS_FILE && !(EVIDENCE_FILES as readonly string[]).includes(file)) {
      findings.push({ file, kind: 'archivo-no-admitido' });
      continue;
    }
    const bytes = readFileSync(path);
    if (bytes.includes(0)) {
      findings.push({ file, kind: 'binario' });
      continue;
    }
    const text = bytes.toString('utf8');
    // SHA256SUMS solo puede contener «<sha256>  <archivo admitido>»: con ese formato no hay nada más que revisar.
    if (file === CHECKSUMS_FILE) {
      const valid = text
        .split(/\r?\n/)
        .filter(Boolean)
        .every((line) => /^[0-9a-f]{64} {2}([a-z0-9.-]+)$/.test(line) && (EVIDENCE_FILES as readonly string[]).includes(line.slice(66)));
      if (!valid) findings.push({ file, kind: 'formato-no-admitido' });
      continue;
    }
    if (text.includes(REDACTION_MARK) || text.includes('«oculto»') || text.includes('«conexión oculta»')) findings.push({ file, kind: 'contenido-depurado' });
    for (const { kind, pattern, keep } of SENSITIVE_PATTERNS) {
      if (kind === 'hex-largo' && /^(pg-before|pg-after|pg-comparison)\.json$/.test(file)) continue; // hashes md5 de la huella
      const matches = [...text.matchAll(new RegExp(pattern.source, pattern.flags))].map((m) => m[0]).filter((m) => !keep?.(m));
      // Los UUID sin guiones y otros hashes se tratan como dudosos en cualquier otro archivo.
      if (matches.length > 0) findings.push({ file, kind });
    }
  }
  return { ok: findings.length === 0, findings };
}

// --- Ejecución con evidencias (lógica de proceso, probable con dobles) ------------------------------------------------
export interface ChildLike {
  stdout: NodeJS.EventEmitter;
  stderr: NodeJS.EventEmitter;
  on(event: 'close', listener: (code: number | null, signal: string | null) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): unknown;
}

export interface ExecuteOptions {
  dir: string;
  record: RunRecord;
  start: () => ChildLike;
  // Depuración del log (conservadora) y, opcionalmente, de la consola (por defecto, la misma).
  redact: (text: string) => string;
  consoleRedact?: (text: string) => string;
  write: { stdout: (text: string) => void; stderr: (text: string) => void };
  appendLog: (text: string) => void;
  onInterrupt?: (handler: () => void) => () => void;
  now?: () => Date;
  // Huella de PostgreSQL: `before` antes de iniciar Jest (si falla, Jest NO se inicia); `after` cuando el proceso de
  // Jest ya terminó (sus conexiones están cerradas). Resultado en pg-comparison.json y en run.json (pgComparison). Una
  // comparación distinta de `equal` hace que la ejecución termine con código 1 aunque Jest pasara.
  pg?: { before: () => Promise<PgSnapshot>; after: (before: PgSnapshot) => Promise<PgSnapshot> };
}

// Escribe run.started.json, transmite la salida depurada a la consola y al log, y al terminar (o al interrumpirse)
// escribe run.json con el código de salida y SHA256SUMS. Devuelve el código de salida (1 si no hubo código).
export async function executeWithEvidence(options: ExecuteOptions): Promise<number> {
  const now = options.now ?? (() => new Date());
  writeEvidenceJson(options.dir, 'run.started.json', options.record);
  let finished = false;
  let pgStatus: PgComparisonStatus | undefined;
  const finish = (exit: { code: number | null; signal?: string | null; interrupted?: boolean }) => {
    if (finished) return;
    finished = true;
    const record = finishRunRecord(options.record, exit, now());
    writeEvidenceJson(options.dir, 'run.json', pgStatus ? { ...record, pgComparison: pgStatus } : record);
    writeChecksums(options.dir);
  };
  const recordComparison = (comparison: PgComparison) => {
    if (pgStatus) return;
    pgStatus = comparison.status;
    writePgComparison(options.dir, comparison);
  };

  // pg-before: sin huella anterior no hay comparación posible, así que Jest no se inicia.
  let before: PgSnapshot | null = null;
  if (options.pg) {
    try {
      before = await options.pg.before();
      writePgSnapshot(options.dir, 'before', before);
    } catch (error) {
      options.appendLog(options.redact(`No se pudo tomar la huella pg-before: ${errorName(error)}. El spec no se ejecutó.\n`));
      recordComparison(comparePgSnapshots(null, null, { failure: { phase: 'before', error: errorName(error) }, now: now() }));
      finish({ code: null, signal: null });
      return 1;
    }
  }
  // pg-after cuando Jest ya terminó. Si falla, la comparación queda incompleta (nunca se corrige ni restaura nada).
  const compareAfter = async (): Promise<boolean> => {
    if (!options.pg || !before) return true;
    if (finished) return false; // interrumpida: ya quedó registrada como incompleta
    let after: PgSnapshot;
    try {
      after = await options.pg.after(before);
      writePgSnapshot(options.dir, 'after', after);
    } catch (error) {
      options.appendLog(options.redact(`No se pudo tomar la huella pg-after: ${errorName(error)}. Comparación incompleta.\n`));
      recordComparison(comparePgSnapshots(before, null, { failure: { phase: 'after', error: errorName(error) }, now: now() }));
      return false;
    }
    const comparison = comparePgSnapshots(before, after, { now: now() });
    recordComparison(comparison);
    const differing = comparison.tables.filter((t) => t.equal !== true).map((t) => t.table);
    options.write.stdout(`huella PostgreSQL: ${comparison.status}${differing.length ? ` (${differing.join(', ')})` : ''}\n`);
    return comparison.status === 'equal';
  };

  let child: ChildLike;
  try {
    child = options.start();
  } catch (error) {
    options.appendLog(options.redact(`No se pudo iniciar Jest: ${error instanceof Error ? error.name : 'error'}\n`));
    finish({ code: null, signal: null });
    return 1;
  }
  const toConsole = options.consoleRedact ?? options.redact;
  const pipe = (stream: NodeJS.EventEmitter, out: (text: string) => void) =>
    stream.on('data', (chunk: Buffer | string) => {
      const raw = chunk.toString();
      out(toConsole(raw));
      options.appendLog(options.redact(raw));
    });
  pipe(child.stdout, options.write.stdout);
  pipe(child.stderr, options.write.stderr);

  const release = options.onInterrupt?.(() => {
    child.kill('SIGINT');
    if (options.pg && before) recordComparison(comparePgSnapshots(before, null, { failure: { phase: 'after', error: 'Interrupted' }, now: now() }));
    finish({ code: null, signal: 'SIGINT', interrupted: true });
  });
  try {
    return await new Promise<number>((done) => {
      child.on('error', (error) => {
        options.appendLog(options.redact(`Error del proceso de Jest: ${error.name}\n`));
        if (!options.pg) {
          finish({ code: null, signal: null });
          done(1);
          return;
        }
        void compareAfter().then(
          () => { finish({ code: null, signal: null }); done(1); },
          () => { finish({ code: null, signal: null }); done(1); },
        );
      });
      child.on('close', (code, signal) => {
        if (!options.pg) {
          finish({ code, signal });
          done(code ?? 1);
          return;
        }
        void compareAfter().then(
          (equal) => { finish({ code, signal }); done(code === 0 && !equal ? 1 : code ?? 1); },
          () => { finish({ code, signal }); done(1); },
        );
      });
    });
  } finally {
    release?.();
  }
}
