import { readFileSync } from 'fs';
import { join } from 'path';
import { assertC2BranchTarget, C2TargetError, NEUTRALIZED_ENV, ORIGINAL_BRANCH } from './c2-target-guard';

// Salvaguarda de destino (sin conexiones): solo acepta el entorno que prepara C2 para la rama temporal.

const BRANCH = 'br-autumn-sun-b52qoep4';
const ENDPOINT = 'ep-noisy-pond-b5owxox3';
const NEUTRAL = Object.fromEntries(NEUTRALIZED_ENV.map((key) => [key, '']));

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    C2_EXPECTED_BRANCH: BRANCH,
    C2_EXPECTED_ENDPOINT: ENDPOINT,
    C2_EXPECTED_PROJECT: 'royal-paper-10258990',
    DATABASE_URL: `postgresql://rol:clave-secreta@${ENDPOINT}.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require`,
    ...NEUTRAL,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('assertC2BranchTarget (salvaguarda de destino de C2)', () => {
  it('[TC-M02-246] acepta el entorno de C2 para la rama temporal (también con el host -pooler)', () => {
    expect(assertC2BranchTarget(env())).toEqual({ branch: BRANCH, endpoint: ENDPOINT });
    expect(() =>
      assertC2BranchTarget(env({ DATABASE_URL: `postgresql://rol:clave@${ENDPOINT}-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require` })),
    ).not.toThrow();
  });

  it.each([
    ['sin identidad esperada (ejecución manual con el .env)', { C2_EXPECTED_BRANCH: undefined, C2_EXPECTED_ENDPOINT: undefined, C2_EXPECTED_PROJECT: undefined }],
    ['sin proyecto esperado', { C2_EXPECTED_PROJECT: undefined }],
    ['identidad esperada = rama original (branch)', { C2_EXPECTED_BRANCH: ORIGINAL_BRANCH.branch }],
    ['identidad esperada = rama original (endpoint)', { C2_EXPECTED_ENDPOINT: ORIGINAL_BRANCH.endpoint }],
    ['identidad con formato inválido', { C2_EXPECTED_ENDPOINT: 'ep-x; drop' }],
    ['DATABASE_URL ausente', { DATABASE_URL: undefined }],
    ['DATABASE_URL inválida', { DATABASE_URL: 'no-es-url' }],
    ['DATABASE_URL de la rama original', { DATABASE_URL: `postgresql://rol:clave@${ORIGINAL_BRANCH.endpoint}.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require` }],
    ['DATABASE_URL de otro endpoint', { DATABASE_URL: 'postgresql://rol:clave@ep-otro-endpoint-123.c-2.us-east-2.aws.neon.tech/neondb' }],
    ['RESEND_API_KEY sin neutralizar (ausente: dotenv la cargaría del .env)', { RESEND_API_KEY: undefined }],
    ['R2_SECRET_ACCESS_KEY con valor', { R2_SECRET_ACCESS_KEY: 'valor' }],
  ])('[TC-M02-246] rechaza: %s, sin mostrar valores', (_label, overrides) => {
    const error = (() => {
      try {
        assertC2BranchTarget(env(overrides));
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(C2TargetError);
    expect((error as Error).message).not.toMatch(/clave|rol:|postgresql|neon\.tech|valor/);
  });
});

// Specs que usan la BD real y solo deben ejecutarse mediante C2. Cada uno llama a la salvaguarda en el nivel superior
// del módulo, ANTES de su primer describe/beforeAll: si falla, Jest no llega a definir ni ejecutar ninguna prueba.
const GUARDED_DB_SPECS = [
  'test/integration/actor-profile-reader.int-spec.ts',
  'test/integration/admin-bootstrap-better-auth.int-spec.ts',
  'test/integration/audit-trail.int-spec.ts',
  'test/integration/concurrency.int-spec.ts',
  'test/integration/curp-user-profile.int-spec.ts',
  'test/integration/doctors.int-spec.ts',
  'test/integration/identity.int-spec.ts',
  'test/integration/legal-acceptance-audit.int-spec.ts',
  'test/integration/legal-publication.int-spec.ts',
  'test/integration/legal-regime.int-spec.ts',
  'test/integration/postgres-errors.int-spec.ts',
  'test/integration/role-profile-coherence.int-spec.ts',
  'test/integration/unit-of-work.int-spec.ts',
  'test/audit-db.e2e-spec.ts',
  'test/me.e2e-spec.ts',
  'test/app.e2e-spec.ts',
];
// E2E con dobles (Better Auth en memoria y proveedores sustituidos): sin salvaguarda explícita para poder ejecutarse
// sin C2; el interceptor (db-tripwire) bloquea cualquier intento de conexión.
const DOUBLES_E2E_SPECS = [
  'test/agenda.e2e-spec.ts',
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
    expect([...integration, ...e2e].sort()).toEqual([...GUARDED_DB_SPECS, ...DOUBLES_E2E_SPECS].sort());
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
