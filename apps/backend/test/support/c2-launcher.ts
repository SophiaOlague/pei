import { createHash, randomBytes } from 'crypto';
import { existsSync, statSync } from 'fs';
import { basename, isAbsolute, join, relative, resolve } from 'path';
import { assertC2BranchTarget, C2_MODES, C2_PERSISTENT_FIXTURES, C2_WEBHOOKS_FIXTURES, C2TargetError, NEUTRALIZED_ENV, R2_ENV, RESEND_ENV, type C2Mode } from './c2-target-guard';

// Lanzador C2 (lógica pura, sin red): prepara la ejecución de UN spec contra la rama de pruebas de Neon con un entorno
// de lista blanca leído EXCLUSIVAMENTE del archivo .env.c2 (fuera del repositorio). No hereda variables del proceso
// salvo las del sistema operativo, nunca lee apps/backend/.env y ejecuta Jest desde un directorio sin .env, de modo que
// el dotenv de src/db no encuentre nada que cargar. La CLI (scripts/c2-run.ts) añade la comprobación de identidad real
// (neon.*) y transmite la salida de Jest ocultando cualquier secreto.

export const DEFAULT_ENV_FILE = 'C:\\pei-c2\\.env.c2';
export const BACKEND_ROOT = resolve(__dirname, '..', '..');
export const REPO_ROOT = resolve(BACKEND_ROOT, '..', '..');

// Claves admitidas en .env.c2. Cualquier otra hace fallar la carga (evita mezclar configuración ajena).
const IDENTITY_KEYS = ['DATABASE_URL', 'C2_EXPECTED_PROJECT', 'C2_EXPECTED_BRANCH', 'C2_EXPECTED_ENDPOINT'] as const;
const AUTH_KEYS = ['BETTER_AUTH_URL', 'BETTER_AUTH_SECRET', 'AUTH_TRUSTED_ORIGINS', 'C2_AUTH_SECRET_FINGERPRINT', 'C2_AUTH_SECRET_GENERATED_AT'] as const;
export const ALLOWED_KEYS: readonly string[] = [...IDENTITY_KEYS, ...AUTH_KEYS, ...R2_ENV, 'C2_EXPECTED_BUCKET', ...RESEND_ENV];
export const REQUIRED_KEYS: readonly string[] = [...IDENTITY_KEYS, ...AUTH_KEYS];

// Variables del sistema operativo que Node y Jest necesitan. Nada más se hereda del proceso padre.
const SYSTEM_KEYS = ['PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH'];

// Modalidad → configuración de Jest y specs admitidos. Un spec solo se ejecuta en su modalidad.
// Los dos specs de migración de M-1 (D y la parte B) solo se ejecutan en `migration`, contra la rama aislada.
export const MIGRATION_SPECS = ['test/integration/m08-m1-migration.int-spec.ts', 'test/integration/m08-m1-part-b.int-spec.ts'] as const;
export const MODE_CONFIG: Record<C2Mode, { config: string; spec: RegExp }> = {
  postgres: { config: 'test/jest-integration.json', spec: /^test\/integration\/(?!m08-m1-(?:migration|part-b)\.)[a-z0-9-]+\.int-spec\.ts$/ },
  concurrency: { config: 'test/jest-concurrency.json', spec: /^test\/concurrency\/[a-z0-9-]+\.conc-spec\.ts$/ },
  r2: { config: 'test/jest-r2.json', spec: /^test\/r2\/[a-z0-9-]+\.r2-spec\.ts$/ },
  auth: { config: 'test/jest-integration.json', spec: /^test\/integration\/[a-z0-9-]*better-auth[a-z0-9-]*\.int-spec\.ts$/ },
  migration: { config: 'test/jest-migration.json', spec: /^test\/integration\/m08-m1-(?:migration|part-b)\.int-spec\.ts$/ },
  webhooks: { config: 'test/jest-webhooks.json', spec: /^test\/webhooks\/[a-z0-9-]+\.wh-spec\.ts$/ },
};

// Autorización explícita de M-1 parte B (0014) para TC-M08-307: solo con --authorize-part-b 0014, en el modo
// `migration` y para el spec de la parte B. Nunca se lee de .env.c2 ni del proceso padre.
export const PART_B_SPEC = 'test/integration/m08-m1-part-b.int-spec.ts';
export const PART_B_AUTHORIZATION = Object.freeze({ variable: 'M08_PART_B_AUTHORIZED', value: '0014' });

// Autorización explícita del spec de Payments F1 (aplica 0017 en transacciones revertidas): solo con
// --authorize-payments-f1 0017, en el modo postgres y para ese spec. Nunca se lee de .env.c2 ni del proceso padre.
export const PAYMENTS_F1_SPEC = 'test/integration/payments-f1.int-spec.ts';
export const PAYMENTS_F1_AUTHORIZATION = Object.freeze({ variable: 'PAYMENTS_F1_AUTHORIZED', value: '0017' });

// Marcas de datos confirmados que aceptan los specs que no revierten sus transacciones (rama C2 persistente).
// C2_WEBHOOKS_FIXTURES solo en el modo `webhooks`, que la exige (H-5).
export const COMMITTED_FIXTURE_MARKERS = [C2_PERSISTENT_FIXTURES, C2_WEBHOOKS_FIXTURES] as const;

export class C2LaunchError extends Error {
  constructor(reason: string) {
    super(`Lanzador C2: ${reason}`);
    this.name = 'C2LaunchError';
  }
}

// KEY=VALUE por línea; comentarios con #; comillas envolventes opcionales. Claves repetidas o líneas inválidas fallan.
export function parseEnvFile(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) throw new C2LaunchError(`línea ${index + 1} de .env.c2 con formato inválido`);
    const [, key, value] = match;
    if (key in vars) throw new C2LaunchError(`clave repetida en .env.c2: ${key}`);
    vars[key] = value.trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return vars;
}

// El archivo debe ser .env.c2, con ruta absoluta y FUERA del repositorio (nunca apps/backend/.env ni otro .env).
export function assertEnvFileLocation(path: string, repoRoot: string = REPO_ROOT): string {
  if (!isAbsolute(path)) throw new C2LaunchError('la ruta del archivo de configuración debe ser absoluta');
  const full = resolve(path);
  if (basename(full) !== '.env.c2') throw new C2LaunchError('solo se admite un archivo llamado .env.c2');
  const rel = relative(resolve(repoRoot), full);
  if (!rel.startsWith('..') && !isAbsolute(rel)) throw new C2LaunchError('.env.c2 debe estar fuera del repositorio');
  return full;
}

// Directorio de trabajo de Jest: existe, está fuera del repositorio y no contiene ningún .env que dotenv pueda cargar.
export function assertRunDirectory(dir: string, repoRoot: string = REPO_ROOT): void {
  const rel = relative(resolve(repoRoot), resolve(dir));
  if (!rel.startsWith('..') && !isAbsolute(rel)) throw new C2LaunchError('el directorio de ejecución debe estar fuera del repositorio');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new C2LaunchError('el directorio de ejecución no existe');
  const found = ['.env', '.env.local', '.env.development', '.env.test', '.env.production'].filter((name) => existsSync(join(dir, name)));
  if (found.length > 0) throw new C2LaunchError(`el directorio de ejecución contiene archivos de entorno: ${found.join(', ')}`);
}

export const secretFingerprint = (secret: string) => createHash('sha256').update(secret).digest('hex').slice(0, 16);

// El secreto de Better Auth de C2 es exclusivo si lo generó este lanzador (rotateAuthSecret): longitud mínima y huella
// registrada. Un secreto copiado de otro entorno no trae una huella coherente.
export function assertC2AuthSecret(vars: Record<string, string>): void {
  const secret = vars.BETTER_AUTH_SECRET ?? '';
  if (secret.length < 32) throw new C2LaunchError('BETTER_AUTH_SECRET de C2 demasiado corto: genera uno con `c2 rotate-auth-secret`');
  if (!vars.C2_AUTH_SECRET_GENERATED_AT || vars.C2_AUTH_SECRET_FINGERPRINT !== secretFingerprint(secret)) {
    throw new C2LaunchError('BETTER_AUTH_SECRET sin huella de C2: genera uno exclusivo con `c2 rotate-auth-secret`');
  }
}

// Sustituye (o añade) el secreto de Better Auth y su huella en el texto de .env.c2. No toca ninguna otra línea.
export function rotateAuthSecret(text: string, now: Date = new Date(), bytes: Buffer = randomBytes(48)): string {
  const secret = bytes.toString('base64url');
  const replacements: Record<string, string> = {
    BETTER_AUTH_SECRET: secret,
    C2_AUTH_SECRET_FINGERPRINT: secretFingerprint(secret),
    C2_AUTH_SECRET_GENERATED_AT: now.toISOString(),
  };
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  for (const [key, value] of Object.entries(replacements)) {
    const index = lines.findIndex((line) => line.trim().startsWith(`${key}=`));
    if (index >= 0) lines[index] = `${key}=${value}`;
    else lines.splice(lines[lines.length - 1] === '' ? lines.length - 1 : lines.length, 0, `${key}=${value}`);
  }
  return lines.join(eol);
}

export interface RunOptions {
  mode: C2Mode;
  spec: string;
  vars: Record<string, string>;
  systemEnv?: NodeJS.ProcessEnv;
  committedFixtures?: string;
  runId?: string;
  authorizePartB?: string;
  authorizePaymentsF1?: string;
}

export const newRunId = (now: Date = new Date()) => `c2-${now.toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`;

// Entorno completo del proceso de Jest: sistema + .env.c2 de lista blanca + servicios neutralizados + modo.
export function buildChildEnv(options: RunOptions): NodeJS.ProcessEnv {
  const { mode, vars } = options;
  if (!(C2_MODES as readonly string[]).includes(mode)) throw new C2LaunchError('modalidad no reconocida');
  const unknown = Object.keys(vars).filter((key) => !ALLOWED_KEYS.includes(key));
  if (unknown.length > 0) throw new C2LaunchError(`claves no admitidas en .env.c2: ${unknown.join(', ')}`);
  const missing = REQUIRED_KEYS.filter((key) => !vars[key]);
  if (missing.length > 0) throw new C2LaunchError(`configuración incompleta: faltan ${missing.join(', ')}`);
  const resend = RESEND_ENV.filter((key) => (vars[key] ?? '') !== '');
  if (resend.length > 0) throw new C2LaunchError(`Resend debe estar deshabilitado en .env.c2: ${resend.join(', ')} con valor`);
  assertC2AuthSecret(vars);
  if (options.committedFixtures !== undefined && !(COMMITTED_FIXTURE_MARKERS as readonly string[]).includes(options.committedFixtures)) {
    throw new C2LaunchError('marca de datos confirmados no admitida');
  }
  if (mode === 'migration' && options.committedFixtures !== undefined) {
    throw new C2LaunchError('el modo migration no admite datos confirmados');
  }
  if (mode === 'webhooks' && options.committedFixtures !== C2_WEBHOOKS_FIXTURES) {
    throw new C2LaunchError(`el modo webhooks exige --committed-fixtures ${C2_WEBHOOKS_FIXTURES}`);
  }
  if (mode !== 'webhooks' && options.committedFixtures === C2_WEBHOOKS_FIXTURES) {
    throw new C2LaunchError(`--committed-fixtures ${C2_WEBHOOKS_FIXTURES} solo se admite en el modo webhooks`);
  }
  const spec = options.spec.replace(/\\/g, '/').replace(/^\.\//, '');
  if (options.authorizePartB !== undefined) {
    if (mode !== 'migration' || spec !== PART_B_SPEC || options.authorizePartB !== PART_B_AUTHORIZATION.value) {
      throw new C2LaunchError('--authorize-part-b solo se admite como 0014, en el modo migration y para el spec de la parte B');
    }
  }
  if (options.authorizePaymentsF1 !== undefined) {
    if (mode !== 'postgres' || spec !== PAYMENTS_F1_SPEC || options.authorizePaymentsF1 !== PAYMENTS_F1_AUTHORIZATION.value) {
      throw new C2LaunchError('--authorize-payments-f1 solo se admite como 0017, en el modo postgres y para el spec de Payments F1');
    }
    if (options.committedFixtures !== undefined) {
      throw new C2LaunchError('--authorize-payments-f1 no admite datos confirmados');
    }
  }

  const system = options.systemEnv ?? process.env;
  const env: NodeJS.ProcessEnv = {};
  for (const key of SYSTEM_KEYS) if (system[key] !== undefined) env[key] = system[key];
  for (const key of [...IDENTITY_KEYS, ...AUTH_KEYS]) env[key] = vars[key];
  // Vacías y definidas: dotenv no las sobrescribe aunque encontrara un .env.
  for (const key of NEUTRALIZED_ENV) env[key] = '';
  if (mode === 'r2') {
    for (const key of R2_ENV) env[key] = vars[key] ?? '';
    env.C2_EXPECTED_BUCKET = vars.C2_EXPECTED_BUCKET ?? '';
  }
  env.C2_MODE = mode;
  env.C2_RUN_ID = options.runId ?? newRunId();
  env.NODE_ENV = 'test';
  env.NODE_OPTIONS = '';
  if (options.committedFixtures !== undefined) env.C2_COMMITTED_FIXTURES = options.committedFixtures;
  if (options.authorizePartB !== undefined) env[PART_B_AUTHORIZATION.variable] = PART_B_AUTHORIZATION.value;
  if (options.authorizePaymentsF1 !== undefined) env[PAYMENTS_F1_AUTHORIZATION.variable] = PAYMENTS_F1_AUTHORIZATION.value;

  // Las mismas salvaguardas que ejecutará cada spec, antes de iniciar Jest.
  try {
    assertC2BranchTarget(env);
  } catch (error) {
    throw new C2LaunchError(error instanceof C2TargetError ? error.message : 'salvaguarda de destino fallida');
  }
  return env;
}

export function resolveSpec(mode: C2Mode, spec: string, backendRoot: string = BACKEND_ROOT): { config: string; spec: string } {
  const normalized = spec.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!MODE_CONFIG[mode].spec.test(normalized)) throw new C2LaunchError(`el spec no pertenece a la modalidad ${mode}`);
  const full = join(backendRoot, normalized);
  if (!existsSync(full)) throw new C2LaunchError('el spec no existe');
  return { config: join(backendRoot, MODE_CONFIG[mode].config), spec: full };
}

// Oculta en la salida cualquier valor sensible de .env.c2 y cualquier cadena de conexión PostgreSQL.
const SENSITIVE_KEYS = ['DATABASE_URL', 'BETTER_AUTH_SECRET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ACCOUNT_ID'];
export function makeRedactor(vars: Record<string, string>): (text: string) => string {
  const secrets = new Set<string>();
  for (const key of SENSITIVE_KEYS) {
    const value = vars[key];
    if (!value || value.length < 4) continue;
    secrets.add(value);
    if (key === 'DATABASE_URL') {
      try {
        const url = new URL(value);
        if (url.password) secrets.add(decodeURIComponent(url.password));
        if (url.password) secrets.add(url.password);
      } catch {
        // una URL inválida ya se rechaza antes; aquí solo se oculta el valor completo
      }
    }
  }
  const ordered = [...secrets].sort((a, b) => b.length - a.length);
  return (text: string) => {
    let out = text.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, '«conexión oculta»');
    for (const secret of ordered) out = out.split(secret).join('«oculto»');
    return out;
  };
}

export function jestArgs(backendRoot: string, config: string, spec: string): string[] {
  return ['--experimental-vm-modules', join(backendRoot, 'node_modules', 'jest', 'bin', 'jest.js'), '--config', config, '--runInBand', '--runTestsByPath', spec];
}
