// CLI del lanzador C2. Uso (desde apps/backend):
//
//   pnpm c2 check <modo> <spec>                  validaciones locales, sin conexiones
//   pnpm c2 preflight <modo>                     además, identidad real de Neon (lectura: neon.*) y, en r2, HeadBucket
//   pnpm c2 run <modo> <spec> [--committed-fixtures c2-persistent-accepted]
//   pnpm c2 run migration test/integration/m08-m1-part-b.int-spec.ts --authorize-part-b 0014   (solo TC-M08-307)
//   pnpm c2 rotate-auth-secret                   genera un BETTER_AUTH_SECRET exclusivo de C2 en .env.c2
//
// Modos: postgres | concurrency | r2 | auth | migration (rama aislada, con C2_ENV_FILE apuntando a su propio .env.c2). Archivo: C:\pei-c2\.env.c2 (o C2_ENV_FILE). Nunca lee apps/backend/.env,
// nunca imprime secretos ni cadenas de conexión y ejecuta Jest desde un directorio temporal sin .env.
import { execSync, spawn } from 'child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { createRequire } from 'module';
import { join } from 'path';
import {
  assertEnvFileLocation,
  assertRunDirectory,
  BACKEND_ROOT,
  buildChildEnv,
  C2LaunchError,
  DEFAULT_ENV_FILE,
  jestArgs,
  makeRedactor,
  parseEnvFile,
  REPO_ROOT,
  resolveSpec,
  rotateAuthSecret,
} from '../test/support/c2-launcher';
import {
  buildRunRecord,
  createRunDirectory,
  DEFAULT_EVIDENCE_ROOT,
  executeWithEvidence,
  gitState,
  makeEvidenceRedactor,
  writeEvidenceFile,
  type PgSnapshot,
  type RunTarget,
} from '../test/support/c2-evidence';
import { takePgSnapshot } from '../test/support/c2-pg-fingerprint';
import { runUuid } from '../test/support/r2-run';
import { assertC2R2Target, C2_MODES, c2ModeOf, c2TargetFor, verifyNeonRuntimeIdentity, type C2Mode } from '../test/support/c2-target-guard';

// La ruta del archivo es lo único que se toma del entorno del proceso padre.
const envFile = assertEnvFileLocation(process.env.C2_ENV_FILE ?? DEFAULT_ENV_FILE);
const backendRequire = createRequire(join(BACKEND_ROOT, 'package.json'));

function loadVars(): Record<string, string> {
  return parseEnvFile(readFileSync(envFile, 'utf8'));
}

function parseMode(value: string | undefined): C2Mode {
  if (!value || !(C2_MODES as readonly string[]).includes(value)) throw new C2LaunchError(`modo requerido: ${C2_MODES.join(' | ')}`);
  return value as C2Mode;
}

function runDirectory(): string {
  const dir = join(tmpdir(), 'pei-c2-run');
  mkdirSync(dir, { recursive: true });
  assertRunDirectory(dir);
  return dir;
}

// Identidad real: sesión READ ONLY, solo current_setting('neon.*'). En r2, HeadBucket (lectura) del bucket de C2.
async function preflight(env: NodeJS.ProcessEnv): Promise<void> {
  const { Pool, neonConfig } = backendRequire('@neondatabase/serverless');
  neonConfig.webSocketConstructor = backendRequire('ws');
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await verifyNeonRuntimeIdentity(
      async (name) => (await client.query('SELECT current_setting($1, true) AS v', [name])).rows[0]?.v ?? null,
      c2TargetFor(c2ModeOf(env)),
    );
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
  if (env.C2_MODE === 'r2') {
    const { bucket } = assertC2R2Target(env);
    const { S3Client, HeadBucketCommand } = backendRequire('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    });
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  }
}

// Huella de solo lectura (c2-pg-fingerprint): conexión propia y de corta duración con el DATABASE_URL de C2; la propia
// transacción READ ONLY vuelve a confirmar la identidad de Neon antes de leer ninguna tabla.
async function pgSnapshot(env: NodeJS.ProcessEnv, identity: RunTarget, cutoff?: string): Promise<PgSnapshot> {
  const { Pool, neonConfig } = backendRequire('@neondatabase/serverless');
  neonConfig.webSocketConstructor = backendRequire('ws');
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const { bucket: _bucket, ...target } = identity;
    return await takePgSnapshot(client, { identity: target, expected: c2TargetFor(c2ModeOf(env)), cutoff });
  } finally {
    client.release();
    await pool.end();
  }
}

async function main(argv: string[]): Promise<number> {
  const [command, modeArg, specArg, ...rest] = argv;
  if (command === 'rotate-auth-secret') {
    writeFileSync(envFile, rotateAuthSecret(readFileSync(envFile, 'utf8')));
    console.log('BETTER_AUTH_SECRET de C2 regenerado en .env.c2 (no se muestra).');
    return 0;
  }
  const vars = loadVars();
  const redact = makeRedactor(vars);
  const mode = parseMode(modeArg);
  const committedIndex = rest.indexOf('--committed-fixtures');
  const committedFixtures = committedIndex >= 0 ? rest[committedIndex + 1] : undefined;
  const partBIndex = rest.indexOf('--authorize-part-b');
  const authorizePartB = partBIndex >= 0 ? rest[partBIndex + 1] ?? '' : undefined;
  const env = buildChildEnv({ mode, spec: specArg ?? '', vars, committedFixtures, authorizePartB });

  if (command === 'preflight') {
    await preflight(env);
    console.log(`preflight ${mode}: identidad de Neon confirmada (proyecto, rama y endpoint)${mode === 'r2' ? '; bucket de C2 accesible' : ''}.`);
    return 0;
  }
  const { config, spec } = resolveSpec(mode, specArg ?? '');
  const cwd = runDirectory();
  if (command === 'check') {
    console.log(`check ${mode}: configuración válida; spec ${specArg}; Jest se ejecutaría desde ${cwd} (sin .env). Sin conexiones.`);
    return 0;
  }
  if (command !== 'run') throw new C2LaunchError('comando requerido: check | preflight | run | rotate-auth-secret');

  await preflight(env);
  const runId = env.C2_RUN_ID!;
  console.log(`run ${mode}: ${specArg} (C2_RUN_ID=${runId})`);

  // Evidencias (etapa 1): directorio propio de la ejecución, fuera del repositorio y de C:\pei-c2. En el modo r2, huella
  // de PostgreSQL de las 13 tablas antes y después de Jest (pg-before.json, pg-after.json, pg-comparison.json).
  const dir = createRunDirectory(DEFAULT_EVIDENCE_ROOT, runId);
  env.C2_EVIDENCE_DIR = dir;
  const logPath = writeEvidenceFile(dir, 'jest-output.log', '');
  const record = buildRunRecord({
    runId,
    runUuid: runUuid(runId),
    mode,
    spec: specArg ?? '',
    ...gitState((command) => execSync(command, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString()),
    target: {
      project: env.C2_EXPECTED_PROJECT!,
      branch: env.C2_EXPECTED_BRANCH!,
      endpoint: env.C2_EXPECTED_ENDPOINT!,
      ...(mode === 'r2' ? { bucket: env.C2_EXPECTED_BUCKET } : {}),
    },
    startedAt: new Date().toISOString(),
    committedFixtures,
  });
  const args = [...jestArgs(BACKEND_ROOT, config, spec), '--json', `--outputFile=${join(dir, 'jest-results.json')}`];
  const code = await executeWithEvidence({
    dir,
    record,
    start: () => spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }),
    redact: makeEvidenceRedactor(redact),
    consoleRedact: redact,
    write: { stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) },
    appendLog: (text) => appendFileSync(logPath, text),
    onInterrupt: (handler) => {
      process.once('SIGINT', handler);
      return () => process.off('SIGINT', handler);
    },
    ...(mode === 'r2'
      ? {
          pg: {
            before: () => pgSnapshot(env, record.target),
            after: (before: PgSnapshot) => pgSnapshot(env, record.target, before.cutoff),
          },
        }
      : {}),
  });
  console.log(`evidencias: ${dir}`);
  return code;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : 'error desconocido';
    console.error(message.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '«conexión oculta»'));
    process.exit(1);
  });
