import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ALLOWED_KEYS,
  assertEnvFileLocation,
  assertRunDirectory,
  BACKEND_ROOT,
  buildChildEnv,
  C2LaunchError,
  makeRedactor,
  parseEnvFile,
  REPO_ROOT,
  resolveSpec,
  rotateAuthSecret,
  secretFingerprint,
} from './c2-launcher';
import { C2_R2_BUCKET, C2_TARGET } from './c2-target-guard';

// Lanzador C2 sin red: carga de .env.c2, entorno de lista blanca, ubicación de archivos, secreto de C2 y ocultación
// de secretos. Ninguna prueba conecta con Neon ni con R2.

const SECRET = 'S'.repeat(64);
const DB_PASSWORD = 'contrasena-db-super-secreta';
const VARS: Record<string, string> = {
  DATABASE_URL: `postgresql://usuario_c2:${DB_PASSWORD}@${C2_TARGET.endpoint}.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require`,
  C2_EXPECTED_PROJECT: C2_TARGET.project,
  C2_EXPECTED_BRANCH: C2_TARGET.branch,
  C2_EXPECTED_ENDPOINT: C2_TARGET.endpoint,
  BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: SECRET,
  C2_AUTH_SECRET_FINGERPRINT: secretFingerprint(SECRET),
  C2_AUTH_SECRET_GENERATED_AT: '2026-11-03T00:00:00.000Z',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:3001',
  R2_ACCOUNT_ID: 'cuenta-r2-c2',
  R2_ACCESS_KEY_ID: 'clave-acceso-r2-c2',
  R2_SECRET_ACCESS_KEY: 'secreto-r2-c2-muy-largo',
  R2_BUCKET_NAME: C2_R2_BUCKET,
  C2_EXPECTED_BUCKET: C2_R2_BUCKET,
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
};
// Variables del proceso padre que NUNCA deben pasar al proceso de Jest (incluido lo que cargaría un .env).
const SYSTEM = { PATH: '/usr/bin', TEMP: '/tmp', DATABASE_URL: 'postgresql://prod:prod@ep-wandering-bonus-b5kxacor.x/neondb', RESEND_API_KEY: 're_real', R2_BUCKET_NAME: 'pei-docs', DOTENV_CONFIG_PATH: '/repo/.env' };

const launchError = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e as Error;
  }
};
const SECRET_PATTERN = new RegExp([SECRET, DB_PASSWORD, 'cuenta-r2-c2', 'clave-acceso-r2-c2', 'secreto-r2-c2', 'postgresql://'].join('|'));

describe('Lanzador C2: archivo .env.c2', () => {
  it('[TC-M03-282] parseEnvFile acepta KEY=VALUE, comentarios y comillas; rechaza claves repetidas y líneas inválidas', () => {
    expect(parseEnvFile('# comentario\nA=1\r\nB="dos"\n\nC=\n')).toEqual({ A: '1', B: 'dos', C: '' });
    expect(() => parseEnvFile('A=1\nA=2')).toThrow(C2LaunchError);
    expect(() => parseEnvFile('esto no es una variable')).toThrow(C2LaunchError);
  });

  it.each([
    ['ruta relativa', '.env.c2'],
    ['el .env del backend', join(BACKEND_ROOT, '.env')],
    ['un .env.c2 dentro del repositorio', join(REPO_ROOT, '.env.c2')],
    ['un archivo con otro nombre fuera del repositorio', join(tmpdir(), '.env')],
  ])('[TC-M03-283] rechaza cargar %s', (_label, path) => {
    expect(launchError(() => assertEnvFileLocation(path))).toBeInstanceOf(C2LaunchError);
  });

  it('[TC-M03-283] acepta C:\\pei-c2\\.env.c2 (fuera del repositorio)', () => {
    expect(assertEnvFileLocation('C:\\pei-c2\\.env.c2', 'C:\\pei')).toBe('C:\\pei-c2\\.env.c2');
  });

  it('[TC-M03-284] el directorio de ejecución de Jest no puede contener un .env ni estar dentro del repositorio', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pei-c2-spec-'));
    try {
      expect(() => assertRunDirectory(dir)).not.toThrow();
      writeFileSync(join(dir, '.env'), 'DATABASE_URL=x');
      expect(launchError(() => assertRunDirectory(dir))).toBeInstanceOf(C2LaunchError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(launchError(() => assertRunDirectory(BACKEND_ROOT))).toBeInstanceOf(C2LaunchError);
  });
});

describe('Lanzador C2: entorno del proceso de Jest', () => {
  it('[TC-M03-285] modo postgres: solo lista blanca de .env.c2 y del sistema; R2 y Resend vacías; nada del proceso padre', () => {
    const env = buildChildEnv({ mode: 'postgres', spec: '', vars: VARS, systemEnv: SYSTEM, runId: 'c2-prueba' });
    expect(env.DATABASE_URL).toBe(VARS.DATABASE_URL);
    expect(env.PATH).toBe('/usr/bin');
    expect(env.DOTENV_CONFIG_PATH).toBeUndefined();
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'RESEND_API_KEY', 'EMAIL_FROM']) expect(env[key]).toBe('');
    expect(env.C2_EXPECTED_BUCKET).toBeUndefined();
    expect(env).toMatchObject({ C2_MODE: 'postgres', C2_RUN_ID: 'c2-prueba', BETTER_AUTH_SECRET: SECRET, NODE_OPTIONS: '' });
    const allowed = new Set([...ALLOWED_KEYS, 'PATH', 'TEMP', 'C2_MODE', 'C2_RUN_ID', 'NODE_ENV', 'NODE_OPTIONS']);
    expect(Object.keys(env).filter((key) => !allowed.has(key))).toEqual([]);
  });

  it('[TC-M03-285] modo r2: pasa las credenciales R2 solo con el bucket exacto de C2', () => {
    const env = buildChildEnv({ mode: 'r2', spec: '', vars: VARS, systemEnv: SYSTEM });
    expect(env).toMatchObject({ C2_MODE: 'r2', R2_BUCKET_NAME: C2_R2_BUCKET, C2_EXPECTED_BUCKET: C2_R2_BUCKET });
    expect(launchError(() => buildChildEnv({ mode: 'r2', spec: '', vars: { ...VARS, R2_BUCKET_NAME: 'pei-docs' }, systemEnv: SYSTEM }))).toBeInstanceOf(C2LaunchError);
  });

  it.each([
    ['configuración incompleta (sin DATABASE_URL)', { DATABASE_URL: '' }, 'postgres'],
    ['configuración incompleta (sin identidad esperada)', { C2_EXPECTED_BRANCH: '' }, 'postgres'],
    ['proyecto distinto', { C2_EXPECTED_PROJECT: 'otro-proyecto-12345' }, 'postgres'],
    ['branch distinta', { C2_EXPECTED_BRANCH: 'br-otra-rama-b5abcdef' }, 'postgres'],
    ['endpoint distinto', { C2_EXPECTED_ENDPOINT: 'ep-otro-endpoint-b5abcdef' }, 'postgres'],
    ['pooler en concurrencia', { DATABASE_URL: VARS.DATABASE_URL.replace(C2_TARGET.endpoint, `${C2_TARGET.endpoint}-pooler`) }, 'concurrency'],
    ['clave no admitida en .env.c2', { NODE_OPTIONS: '--require dotenv/config' }, 'postgres'],
    ['Resend con valor', { RESEND_API_KEY: 're_algo' }, 'postgres'],
    ['secreto de Better Auth corto', { BETTER_AUTH_SECRET: 'corto', C2_AUTH_SECRET_FINGERPRINT: secretFingerprint('corto') }, 'auth'],
    ['secreto de Better Auth sin huella de C2 (copiado de otro entorno)', { BETTER_AUTH_SECRET: 'X'.repeat(64) }, 'auth'],
  ])('[TC-M03-286] rechaza: %s, sin mostrar secretos', (_label, overrides, mode) => {
    const error = launchError(() => buildChildEnv({ mode: mode as 'postgres', spec: '', vars: { ...VARS, ...overrides }, systemEnv: SYSTEM }));
    expect(error).toBeInstanceOf(C2LaunchError);
    expect(error!.message).not.toMatch(SECRET_PATTERN);
  });

  it('[TC-M03-286] la marca de datos confirmados solo admite valores conocidos', () => {
    expect(buildChildEnv({ mode: 'concurrency', spec: '', vars: VARS, systemEnv: SYSTEM, committedFixtures: 'c2-persistent-accepted' }).C2_COMMITTED_FIXTURES).toBe('c2-persistent-accepted');
    for (const marker of ['cualquiera', 'disposable-branch', 'rama-permanent-accepted']) {
      expect(launchError(() => buildChildEnv({ mode: 'concurrency', spec: '', vars: VARS, systemEnv: SYSTEM, committedFixtures: marker }))).toBeInstanceOf(C2LaunchError);
    }
    // La marca no habilita otro destino: la identidad exacta se valida igual.
    expect(launchError(() => buildChildEnv({ mode: 'concurrency', spec: '', vars: { ...VARS, C2_EXPECTED_BRANCH: 'br-royal-recipe-b54s5hnn' }, systemEnv: SYSTEM, committedFixtures: 'c2-persistent-accepted' }))).toBeInstanceOf(C2LaunchError);
  });

  it('[TC-M03-287] cada spec solo se ejecuta en su modalidad y debe existir', () => {
    expect(resolveSpec('concurrency', 'test/concurrency/doctors.conc-spec.ts').config).toMatch(/jest-concurrency\.json$/);
    expect(resolveSpec('postgres', 'test/integration/doctors.int-spec.ts').config).toMatch(/jest-integration\.json$/);
    expect(resolveSpec('auth', 'test/integration/admin-bootstrap-better-auth.int-spec.ts').config).toMatch(/jest-integration\.json$/);
    expect(launchError(() => resolveSpec('postgres', 'test/concurrency/doctors.conc-spec.ts'))).toBeInstanceOf(C2LaunchError);
    expect(launchError(() => resolveSpec('r2', 'test/integration/doctors.int-spec.ts'))).toBeInstanceOf(C2LaunchError);
    expect(launchError(() => resolveSpec('postgres', 'test/integration/no-existe.int-spec.ts'))).toBeInstanceOf(C2LaunchError);
    expect(launchError(() => resolveSpec('postgres', '../../.env'))).toBeInstanceOf(C2LaunchError);
  });
});

describe('Lanzador C2: secreto de Better Auth y registros', () => {
  it('[TC-M03-288] rotateAuthSecret genera un secreto exclusivo con huella y conserva las demás líneas', () => {
    const before = 'DATABASE_URL=algo\r\nBETTER_AUTH_SECRET=viejo\r\nEMAIL_FROM=\r\n';
    const after = rotateAuthSecret(before, new Date('2026-11-03T12:00:00.000Z'), Buffer.alloc(48, 7));
    const vars = parseEnvFile(after);
    expect(vars.DATABASE_URL).toBe('algo');
    expect(vars.EMAIL_FROM).toBe('');
    expect(vars.BETTER_AUTH_SECRET).not.toBe('viejo');
    expect(vars.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(vars.C2_AUTH_SECRET_FINGERPRINT).toBe(secretFingerprint(vars.BETTER_AUTH_SECRET));
    expect(vars.C2_AUTH_SECRET_GENERATED_AT).toBe('2026-11-03T12:00:00.000Z');
    expect(after).toContain('\r\n');
    expect(() => buildChildEnv({ mode: 'auth', spec: '', vars: { ...VARS, ...vars, DATABASE_URL: VARS.DATABASE_URL }, systemEnv: SYSTEM })).not.toThrow();
  });

  it('[TC-M03-289] la salida de Jest no contiene credenciales: se ocultan secretos, la contraseña y cualquier cadena de conexión', () => {
    const redact = makeRedactor(VARS);
    const log = [
      `conectando a ${VARS.DATABASE_URL}`,
      `password=${DB_PASSWORD}`,
      `secret ${SECRET} y r2 ${VARS.R2_ACCESS_KEY_ID}/${VARS.R2_SECRET_ACCESS_KEY} en ${VARS.R2_ACCOUNT_ID}`,
      'otra postgres://u:p@host/db',
    ].join('\n');
    const out = redact(log);
    expect(out).not.toMatch(SECRET_PATTERN);
    expect(out).not.toMatch(/postgres:\/\//);
    expect(out).toContain('«oculto»');
    expect(out).toContain('«conexión oculta»');
  });

  it('[TC-M03-290] el lanzador y su CLI no cargan dotenv ni leen el .env del repositorio', () => {
    for (const file of ['test/support/c2-launcher.ts', 'scripts/c2-run.ts']) {
      // Solo el código: los comentarios explican, precisamente, qué no se lee.
      const source = readFileSync(join(BACKEND_ROOT, file), 'utf8').replace(/^\s*\/\/.*$/gm, '');
      expect(source).not.toMatch(/from ['"]dotenv|require\(['"]dotenv|dotenv\/config/);
      // Las únicas menciones a «.env» son la lista de archivos prohibidos en el directorio de ejecución.
      expect(source).not.toMatch(/apps[\\/]backend[\\/]\.env/);
      expect(source).not.toMatch(/readFileSync\([^)]*['"][^'"]*\.env(\.local)?['"]/);
      expect(source).not.toMatch(/join\(BACKEND_ROOT, ['"]\.env['"]\)/);
    }
  });
});
