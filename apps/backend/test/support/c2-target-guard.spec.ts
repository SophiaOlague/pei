import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assertC2BranchTarget,
  assertC2R2Target,
  C2_R2_BUCKET,
  C2_TARGET,
  C2TargetError,
  NEUTRALIZED_ENV,
  ORIGINAL_BRANCH,
  verifyNeonRuntimeIdentity,
} from './c2-target-guard';
import { assertJestConfigMode } from './c2-mode-setup';

// Salvaguarda de destino (sin conexiones): solo acepta el entorno que prepara el lanzador C2 para la rama de pruebas
// aprobada (C2_TARGET). Ninguna prueba abre conexiones.

const { project: PROJECT, branch: BRANCH, endpoint: ENDPOINT } = C2_TARGET;
const NEUTRAL = Object.fromEntries(NEUTRALIZED_ENV.map((key) => [key, '']));
const R2 = { R2_ACCOUNT_ID: 'cuenta-r2', R2_ACCESS_KEY_ID: 'id-r2', R2_SECRET_ACCESS_KEY: 'secreto-r2', R2_BUCKET_NAME: C2_R2_BUCKET, C2_EXPECTED_BUCKET: C2_R2_BUCKET };

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    C2_MODE: 'postgres',
    C2_EXPECTED_BRANCH: BRANCH,
    C2_EXPECTED_ENDPOINT: ENDPOINT,
    C2_EXPECTED_PROJECT: PROJECT,
    DATABASE_URL: `postgresql://rol:clave-secreta@${ENDPOINT}.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require`,
    ...NEUTRAL,
    ...overrides,
  } as NodeJS.ProcessEnv;
}
const POOLER_URL = `postgresql://rol:clave-secreta@${ENDPOINT}-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require`;

function errorOf(fn: () => unknown): Error | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e as Error;
  }
}
const SECRET_PATTERN = /clave|rol:|postgresql|neon\.tech|valor|secreto-r2|id-r2|cuenta-r2/;

describe('assertC2BranchTarget (salvaguarda de destino de C2)', () => {
  it('[TC-M02-246] acepta el destino aprobado con conexión directa; en modo postgres también con -pooler', () => {
    expect(assertC2BranchTarget(env())).toEqual({ branch: BRANCH, endpoint: ENDPOINT });
    expect(() => assertC2BranchTarget(env({ DATABASE_URL: POOLER_URL }))).not.toThrow();
  });

  it.each([
    ['sin identidad esperada (ejecución manual con el .env)', { C2_EXPECTED_BRANCH: undefined, C2_EXPECTED_ENDPOINT: undefined, C2_EXPECTED_PROJECT: undefined }],
    ['sin proyecto esperado', { C2_EXPECTED_PROJECT: undefined }],
    ['sin modo (C2_MODE)', { C2_MODE: undefined }],
    ['modo desconocido', { C2_MODE: 'produccion' }],
    ['proyecto distinto', { C2_EXPECTED_PROJECT: 'otro-proyecto-12345' }],
    ['branch distinta', { C2_EXPECTED_BRANCH: 'br-otra-rama-b5abcdef' }],
    ['endpoint distinto', { C2_EXPECTED_ENDPOINT: 'ep-otro-endpoint-b5abcdef' }],
    ['identidad esperada = rama original (branch)', { C2_EXPECTED_BRANCH: ORIGINAL_BRANCH.branch }],
    ['identidad esperada = rama original (endpoint)', { C2_EXPECTED_ENDPOINT: ORIGINAL_BRANCH.endpoint }],
    ['DATABASE_URL ausente', { DATABASE_URL: undefined }],
    ['DATABASE_URL inválida', { DATABASE_URL: 'no-es-url' }],
    ['DATABASE_URL de la rama original', { DATABASE_URL: `postgresql://rol:clave@${ORIGINAL_BRANCH.endpoint}.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require` }],
    ['DATABASE_URL de otro endpoint', { DATABASE_URL: 'postgresql://rol:clave@ep-otro-endpoint-123.c-7.us-east-2.aws.neon.tech/neondb' }],
    ['pooler en modo concurrency', { C2_MODE: 'concurrency', DATABASE_URL: POOLER_URL }],
    ['RESEND_API_KEY sin neutralizar (ausente: dotenv la cargaría del .env)', { RESEND_API_KEY: undefined }],
    ['R2_SECRET_ACCESS_KEY con valor fuera del modo r2', { R2_SECRET_ACCESS_KEY: 'valor' }],
    ['credenciales R2 completas en modo postgres', { ...R2 }],
  ])('[TC-M02-246] rechaza: %s, sin mostrar valores', (_label, overrides) => {
    const error = errorOf(() => assertC2BranchTarget(env(overrides)));
    expect(error).toBeInstanceOf(C2TargetError);
    expect(error!.message).not.toMatch(SECRET_PATTERN);
  });

  it('[TC-M03-277] concurrency acepta la conexión directa al endpoint aprobado', () => {
    expect(assertC2BranchTarget(env({ C2_MODE: 'concurrency' }))).toEqual({ branch: BRANCH, endpoint: ENDPOINT });
  });
});

describe('assertC2R2Target (bucket exclusivo de C2)', () => {
  it('[TC-M03-278] acepta solo R2_BUCKET_NAME === C2_EXPECTED_BUCKET === pei-docs-c2-test en modo r2', () => {
    expect(assertC2R2Target(env({ C2_MODE: 'r2', ...R2 }))).toEqual({ bucket: 'pei-docs-c2-test' });
    expect(() => assertC2BranchTarget(env({ C2_MODE: 'r2', ...R2 }))).not.toThrow();
  });

  it.each([
    ['bucket distinto', { R2_BUCKET_NAME: 'pei-docs' }],
    ['bucket esperado distinto (aunque coincidan entre sí)', { R2_BUCKET_NAME: 'pei-docs', C2_EXPECTED_BUCKET: 'pei-docs' }],
    ['C2_EXPECTED_BUCKET ausente', { C2_EXPECTED_BUCKET: undefined }],
    ['credenciales incompletas', { R2_SECRET_ACCESS_KEY: '' }],
    ['modo distinto de r2', { C2_MODE: 'postgres' }],
  ])('[TC-M03-279] rechaza: %s, sin mostrar valores', (_label, overrides) => {
    const error = errorOf(() => assertC2R2Target(env({ C2_MODE: 'r2', ...R2, ...overrides })));
    expect(error).toBeInstanceOf(C2TargetError);
    expect(error!.message).not.toMatch(SECRET_PATTERN);
  });
});

describe('Configuraciones de Jest de C2 (c2-mode-setup)', () => {
  it('[TC-M03-280] jest-concurrency exige C2_MODE=concurrency y conexión directa; jest-r2 exige el modo y el bucket de C2', () => {
    expect(() => assertJestConfigMode('concurrency', env({ C2_MODE: 'concurrency' }))).not.toThrow();
    expect(() => assertJestConfigMode('concurrency', env({ C2_MODE: 'postgres' }))).toThrow(C2TargetError);
    expect(() => assertJestConfigMode('concurrency', env({ C2_MODE: 'concurrency', DATABASE_URL: POOLER_URL }))).toThrow(C2TargetError);
    expect(() => assertJestConfigMode('r2', env({ C2_MODE: 'r2', ...R2 }))).not.toThrow();
    expect(() => assertJestConfigMode('r2', env({ C2_MODE: 'r2', ...R2, R2_BUCKET_NAME: 'otro' }))).toThrow(C2TargetError);
  });

  it('[TC-M03-280] la configuración de concurrencia carga su setupFile de modo después del tripwire', () => {
    const config = JSON.parse(readFileSync(join(__dirname, '..', 'jest-concurrency.json'), 'utf8')) as { setupFiles: string[] };
    expect(config.setupFiles).toEqual(['<rootDir>/test/support/db-tripwire.ts', '<rootDir>/test/support/c2-mode-concurrency.ts']);
  });

  it('[TC-M03-280] la configuración de R2 carga su setupFile de modo después del tripwire', () => {
    const config = JSON.parse(readFileSync(join(__dirname, '..', 'jest-r2.json'), 'utf8')) as { setupFiles: string[] };
    expect(config.setupFiles).toEqual(['<rootDir>/test/support/db-tripwire.ts', '<rootDir>/test/support/c2-mode-r2.ts']);
  });
});

describe('verifyNeonRuntimeIdentity (identidad real por neon.*)', () => {
  const settings = (overrides: Record<string, string | null> = {}) => {
    const values: Record<string, string | null> = { 'neon.project_id': PROJECT, 'neon.branch_id': BRANCH, 'neon.endpoint_id': ENDPOINT, ...overrides };
    return async (name: string) => values[name] ?? null;
  };

  it('[TC-M03-281] acepta la conexión cuyos neon.project_id, neon.branch_id y neon.endpoint_id son los aprobados', async () => {
    await expect(verifyNeonRuntimeIdentity(settings())).resolves.toEqual(C2_TARGET);
  });

  it.each([
    ['proyecto real distinto', { 'neon.project_id': 'otro-proyecto-12345' }],
    ['rama real distinta', { 'neon.branch_id': 'br-otra-rama-b5abcdef' }],
    ['rama real = production', { 'neon.branch_id': ORIGINAL_BRANCH.branch }],
    ['endpoint real = production', { 'neon.endpoint_id': ORIGINAL_BRANCH.endpoint }],
    ['sin parámetros neon.*', { 'neon.project_id': null }],
  ])('[TC-M03-281] rechaza: %s', async (_label, overrides) => {
    await expect(verifyNeonRuntimeIdentity(settings(overrides))).rejects.toBeInstanceOf(C2TargetError);
  });
});

describe('Modo webhooks (H-5): C2, conexión directa y marca de datos confirmados', () => {
  const wh = (overrides: Record<string, string | undefined> = {}) => env({ C2_MODE: 'webhooks', C2_COMMITTED_FIXTURES: 'wh-h5-committed', ...overrides });

  it('[H5-GUARD-01] acepta C2 con conexión directa y la marca wh-h5-committed', () => {
    expect(assertC2BranchTarget(wh())).toEqual({ branch: BRANCH, endpoint: ENDPOINT });
    expect(() => assertJestConfigMode('webhooks', wh())).not.toThrow();
  });

  it.each([
    ['sin marca', { C2_COMMITTED_FIXTURES: undefined }],
    ['marca de otra suite', { C2_COMMITTED_FIXTURES: 'c2-persistent-accepted' }],
    ['pooler', { DATABASE_URL: POOLER_URL }],
    ['rama de desarrollo', { C2_EXPECTED_BRANCH: ORIGINAL_BRANCH.branch }],
    ['endpoint de desarrollo', { C2_EXPECTED_ENDPOINT: ORIGINAL_BRANCH.endpoint }],
    ['respaldo', { C2_EXPECTED_BRANCH: 'br-silent-butterfly-b5z128fu' }],
    ['URL de desarrollo', { DATABASE_URL: `postgresql://rol:clave@${ORIGINAL_BRANCH.endpoint}.c-7.us-east-2.aws.neon.tech/neondb` }],
    ['R2 sin neutralizar', { R2_BUCKET_NAME: 'pei-docs' }],
  ])('[H5-GUARD-02] rechaza: %s', (_label, overrides) => {
    expect(errorOf(() => assertC2BranchTarget(wh(overrides)))).toBeInstanceOf(C2TargetError);
  });

  it('[H5-GUARD-03] la marca de webhooks no vale en otro modo y jest-webhooks exige el modo webhooks', () => {
    for (const mode of ['postgres', 'concurrency', 'auth']) {
      expect(errorOf(() => assertC2BranchTarget(env({ C2_MODE: mode, C2_COMMITTED_FIXTURES: 'wh-h5-committed' })))).toBeInstanceOf(C2TargetError);
    }
    expect(errorOf(() => assertJestConfigMode('webhooks', env({ C2_MODE: 'postgres' })))).toBeInstanceOf(C2TargetError);
    const config = JSON.parse(readFileSync(join(__dirname, '..', 'jest-webhooks.json'), 'utf8')) as { setupFiles: string[]; testRegex: string };
    expect(config.setupFiles).toEqual(['<rootDir>/test/support/db-tripwire.ts', '<rootDir>/test/support/c2-mode-webhooks.ts']);
    expect(config.testRegex).toBe('test/webhooks/.*\\.wh-spec\\.ts$');
  });
});

// Specs que usan la BD real y solo deben ejecutarse mediante C2. Cada uno llama a la salvaguarda en el nivel superior
// del módulo, ANTES de su primer describe/beforeAll: si falla, Jest no llega a definir ni ejecutar ninguna prueba.
const GUARDED_DB_SPECS = [
  'test/integration/actor-profile-reader.int-spec.ts',
  'test/integration/appointments.int-spec.ts',
  'test/integration/appointments-reschedule.int-spec.ts',
  'test/integration/admin-bootstrap-better-auth.int-spec.ts',
  'test/integration/audit-trail.int-spec.ts',
  'test/integration/booking-legal-acceptance.int-spec.ts',
  'test/integration/concurrency.int-spec.ts',
  'test/integration/curp-user-profile.int-spec.ts',
  'test/integration/doctors.int-spec.ts',
  'test/integration/identity.int-spec.ts',
  'test/integration/legal-acceptance-audit.int-spec.ts',
  'test/integration/legal-publication.int-spec.ts',
  'test/integration/legal-regime.int-spec.ts',
  'test/integration/m08-m1-migration.int-spec.ts',
  'test/integration/m08-m1-part-b.int-spec.ts',
  'test/integration/m08-m1-schema.int-spec.ts',
  'test/integration/m08-0014-verify.int-spec.ts',
  'test/integration/payments-f1.int-spec.ts',
  'test/integration/postgres-errors.int-spec.ts',
  'test/integration/role-profile-coherence.int-spec.ts',
  'test/integration/unit-of-work.int-spec.ts',
  'test/audit-db.e2e-spec.ts',
  'test/me.e2e-spec.ts',
  'test/app.e2e-spec.ts',
  'test/webhooks/stripe-webhook-idempotency.wh-spec.ts',
  'test/webhooks/stripe-webhook-redelivery.wh-spec.ts',
  'test/webhooks/stripe-webhook-retry-worker.wh-spec.ts',
  'test/webhooks/stripe-webhook-retry-policy.wh-spec.ts',
  'test/webhooks/payments-fee-reconciliation.wh-spec.ts',
  'test/webhooks/payments-fee-reconciliation-verify.wh-spec.ts',
];
// E2E con dobles (Better Auth en memoria y proveedores sustituidos): sin salvaguarda explícita para poder ejecutarse
// sin C2; el interceptor (db-tripwire) bloquea cualquier intento de conexión.
const DOUBLES_E2E_SPECS = [
  'test/agenda.e2e-spec.ts',
  'test/appointments.e2e-spec.ts',
  'test/audit.e2e-spec.ts',
  'test/auth-flows.e2e-spec.ts',
  'test/auth-guards.e2e-spec.ts',
  'test/auth-rate-limit.e2e-spec.ts',
  'test/cors.e2e-spec.ts',
  'test/identity.e2e-spec.ts',
  'test/legal-regime.e2e-spec.ts',
  'test/doctors-security.e2e-spec.ts',
  'test/doctors.e2e-spec.ts',
  'test/specialties.e2e-spec.ts',
];
const ROOT = join(__dirname, '..', '..');

describe('Specs con BD protegidos por la salvaguarda de destino', () => {
  it.each(GUARDED_DB_SPECS)('[TC-M02-247] %s importa assertC2BranchTarget y lo llama al cargarse, antes de cualquier describe', (file) => {
    const source = readFileSync(join(__dirname, '..', '..', file), 'utf8');
    expect(source).toMatch(/import \{ assertC2BranchTarget \} from '\.{1,2}\/(support|\.\.\/support)\/c2-target-guard';/);
    const call = source.search(/^assertC2BranchTarget\(\);$/m);
    const firstSuite = source.search(/^(describe|beforeAll|beforeEach|it|test)\(/m);
    expect(call).toBeGreaterThan(-1);
    expect(firstSuite).toBeGreaterThan(call);
    // La llamada es incondicional: no está dentro de un if ni comentada.
    expect(source.slice(0, call)).not.toMatch(/\bif\s*\([^)]*\)\s*\{?\s*$/);
  });

  it('[TC-M02-247] el inventario está completo: todo spec de integración o E2E está clasificado como con BD o con dobles', () => {
    const { readdirSync } = require('fs') as typeof import('fs');
    const integration = readdirSync(join(ROOT, 'test', 'integration')).filter((f) => f.endsWith('.int-spec.ts')).map((f) => `test/integration/${f}`);
    const e2e = readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.e2e-spec.ts')).map((f) => `test/${f}`);
    const webhooks = readdirSync(join(ROOT, 'test', 'webhooks')).filter((f) => f.endsWith('.wh-spec.ts')).map((f) => `test/webhooks/${f}`);
    expect([...integration, ...e2e, ...webhooks].sort()).toEqual([...GUARDED_DB_SPECS, ...DOUBLES_E2E_SPECS].sort());
  });

  it.each(DOUBLES_E2E_SPECS)('[TC-M02-247] %s (con dobles) no lleva salvaguarda explícita ni importa src/db directamente', (file) => {
    const source = readFileSync(join(ROOT, file), 'utf8');
    expect(source).not.toMatch(/^assertC2BranchTarget\(\);$/m);
    expect(source).not.toMatch(/from '\.\.\/src\/db'|from '\.\/support\/with-rollback'|from '\.\/support\/residue'|from '\.\/support\/fixtures'/);
  });

  it.each([
    ['jest.config.ts', /setupFiles: \['<rootDir>\/test\/support\/db-tripwire\.ts'\]/],
    ['test/jest-integration.json', /"setupFiles": \["<rootDir>\/test\/support\/db-tripwire\.ts"\]/],
    ['test/jest-e2e.json', /"setupFiles": \["<rootDir>\/support\/db-tripwire\.ts"\]/],
  ])('[TC-M02-247] %s carga el interceptor de conexiones en setupFiles', (file, pattern) => {
    expect(readFileSync(join(ROOT, file), 'utf8')).toMatch(pattern);
  });
});
