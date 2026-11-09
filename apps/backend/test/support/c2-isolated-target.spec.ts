import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assertC2BranchTarget,
  C2_FORBIDDEN_FOR_ISOLATED,
  C2_ISOLATED_TARGET,
  C2_MODES,
  C2_TARGET,
  C2TargetError,
  c2TargetFor,
  NEUTRALIZED_ENV,
  ORIGINAL_BRANCH,
  verifyNeonRuntimeIdentity,
} from './c2-target-guard';
import { assertJestConfigMode } from './c2-mode-setup';
import { buildChildEnv, C2LaunchError, MIGRATION_SPECS, MODE_CONFIG, resolveSpec, secretFingerprint } from './c2-launcher';

// Modo `migration` y destino aislado (rama desechable hija de c2-pre-0013) para las pruebas de migración de M-1.
// Sin conexiones: la salvaguarda, la identidad real con lecturas simuladas, la configuración de Jest y el lanzador.

const NEUTRAL = Object.fromEntries(NEUTRALIZED_ENV.map((key) => [key, '']));
type Target = { project: string; branch: string; endpoint: string };
const url = (endpoint: string) => `postgresql://rol:clave-secreta@${endpoint}.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require`;
function env(mode: string, target: Target, overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    C2_MODE: mode,
    C2_EXPECTED_PROJECT: target.project,
    C2_EXPECTED_BRANCH: target.branch,
    C2_EXPECTED_ENDPOINT: target.endpoint,
    DATABASE_URL: url(target.endpoint),
    ...NEUTRAL,
    ...overrides,
  } as NodeJS.ProcessEnv;
}
const settings = (actual: Partial<Record<'neon.project_id' | 'neon.branch_id' | 'neon.endpoint_id', string | null>>) => {
  const values: Record<string, string | null> = {
    'neon.project_id': C2_ISOLATED_TARGET.project,
    'neon.branch_id': C2_ISOLATED_TARGET.branch,
    'neon.endpoint_id': C2_ISOLATED_TARGET.endpoint,
    ...actual,
  };
  return async (name: string) => values[name] ?? null;
};

describe('Destino aislado y modo migration (pruebas de migración de M-1)', () => {
  it('[TC-M08-350] el destino aislado es la rama desechable hija de c2-pre-0013 y nunca C2, desarrollo ni un respaldo', () => {
    expect(C2_ISOLATED_TARGET).toEqual({
      project: 'royal-paper-10258990', branch: 'br-green-grass-b5yhyp89', endpoint: 'ep-nameless-sun-b5njoeb3', parent: 'br-silent-butterfly-b5z128fu',
    });
    expect(C2_FORBIDDEN_FOR_ISOLATED).toEqual(expect.arrayContaining([C2_TARGET.branch, ORIGINAL_BRANCH.branch, 'br-silent-butterfly-b5z128fu', 'br-rapid-water-b5za50z4']));
    expect(C2_FORBIDDEN_FOR_ISOLATED).not.toContain(C2_ISOLATED_TARGET.branch);
    expect(c2TargetFor('migration')).toBe(C2_ISOLATED_TARGET);
    for (const mode of C2_MODES.filter((m) => m !== 'migration')) expect(c2TargetFor(mode)).toBe(C2_TARGET);
  });

  it('[TC-M08-351] el modo migration acepta solo la rama aislada, con conexión directa', () => {
    expect(assertC2BranchTarget(env('migration', C2_ISOLATED_TARGET))).toEqual({ branch: C2_ISOLATED_TARGET.branch, endpoint: C2_ISOLATED_TARGET.endpoint });
    const pooled = env('migration', C2_ISOLATED_TARGET, { DATABASE_URL: url(`${C2_ISOLATED_TARGET.endpoint}-pooler`) });
    expect(() => assertC2BranchTarget(pooled)).toThrow(C2TargetError);
  });

  it.each([
    ['C2', C2_TARGET],
    ['el respaldo c2-pre-0013', { project: C2_TARGET.project, branch: 'br-silent-butterfly-b5z128fu', endpoint: 'ep-holy-sea-b5zxmnm6' }],
    ['el respaldo de desarrollo', { project: C2_TARGET.project, branch: 'br-rapid-water-b5za50z4', endpoint: 'ep-calm-snow-b5eox1a8' }],
    ['la base de desarrollo', { project: C2_TARGET.project, branch: ORIGINAL_BRANCH.branch, endpoint: ORIGINAL_BRANCH.endpoint }],
    ['otra rama', { project: C2_TARGET.project, branch: 'br-otra-rama-b5abcdef', endpoint: 'ep-otro-b5abcdef' }],
  ])('[TC-M08-351] el modo migration rechaza %s', (_label, target) => {
    expect(() => assertC2BranchTarget(env('migration', target))).toThrow(C2TargetError);
  });

  it.each(C2_MODES.filter((m) => m !== 'migration'))('[TC-M08-352] el modo %s rechaza la rama aislada', (mode) => {
    expect(() => assertC2BranchTarget(env(mode, C2_ISOLATED_TARGET))).toThrow(C2TargetError);
  });

  it('[TC-M08-353] la identidad real se compara con la rama aislada y rechaza C2, desarrollo y los respaldos', async () => {
    await expect(verifyNeonRuntimeIdentity(settings({}), C2_ISOLATED_TARGET)).resolves.toBe(C2_ISOLATED_TARGET);
    for (const branch of C2_FORBIDDEN_FOR_ISOLATED) {
      await expect(verifyNeonRuntimeIdentity(settings({ 'neon.branch_id': branch }), C2_ISOLATED_TARGET)).rejects.toBeInstanceOf(C2TargetError);
    }
    await expect(verifyNeonRuntimeIdentity(settings({ 'neon.endpoint_id': C2_TARGET.endpoint }), C2_ISOLATED_TARGET)).rejects.toBeInstanceOf(C2TargetError);
    await expect(verifyNeonRuntimeIdentity(settings({ 'neon.project_id': null }), C2_ISOLATED_TARGET)).rejects.toBeInstanceOf(C2TargetError);
    // Sin destino explícito se sigue exigiendo C2: la rama aislada no pasa por el camino de los demás modos.
    await expect(verifyNeonRuntimeIdentity(settings({}))).rejects.toBeInstanceOf(C2TargetError);
  });

  it('[TC-M08-354] jest-migration.json carga el tripwire y después exige C2_MODE=migration', () => {
    const config = JSON.parse(readFileSync(join(__dirname, '..', 'jest-migration.json'), 'utf8')) as { setupFiles: string[] };
    expect(config.setupFiles).toEqual(['<rootDir>/test/support/db-tripwire.ts', '<rootDir>/test/support/c2-mode-migration.ts']);
    expect(() => assertJestConfigMode('migration', env('migration', C2_ISOLATED_TARGET))).not.toThrow();
    expect(() => assertJestConfigMode('migration', env('postgres', C2_TARGET))).toThrow(C2TargetError);
  });

  it('[TC-M08-355] el lanzador asigna a migration solo los dos specs de migración, sin datos confirmados, y postgres ya no los admite', () => {
    expect(MODE_CONFIG.migration.config).toBe('test/jest-migration.json');
    for (const spec of MIGRATION_SPECS) {
      expect(resolveSpec('migration', spec).config).toMatch(/jest-migration\.json$/);
      expect(() => resolveSpec('postgres', spec)).toThrow(C2LaunchError);
    }
    expect(() => resolveSpec('migration', 'test/integration/appointments.int-spec.ts')).toThrow(C2LaunchError);
    expect(() => resolveSpec('migration', 'test/integration/m08-m1-schema.int-spec.ts')).toThrow(C2LaunchError);
    expect(resolveSpec('postgres', 'test/integration/m08-m1-schema.int-spec.ts').config).toMatch(/jest-integration\.json$/);
    const secret = 'S'.repeat(64);
    const vars = {
      DATABASE_URL: url(C2_ISOLATED_TARGET.endpoint), C2_EXPECTED_PROJECT: C2_ISOLATED_TARGET.project,
      C2_EXPECTED_BRANCH: C2_ISOLATED_TARGET.branch, C2_EXPECTED_ENDPOINT: C2_ISOLATED_TARGET.endpoint,
      BETTER_AUTH_URL: 'http://localhost:3000', BETTER_AUTH_SECRET: secret, C2_AUTH_SECRET_FINGERPRINT: secretFingerprint(secret),
      C2_AUTH_SECRET_GENERATED_AT: '2026-11-09T00:00:00.000Z', AUTH_TRUSTED_ORIGINS: 'http://localhost:3001', RESEND_API_KEY: '', EMAIL_FROM: '',
    };
    const childEnv = buildChildEnv({ mode: 'migration', spec: MIGRATION_SPECS[0], vars, systemEnv: { PATH: '/usr/bin' } });
    expect(childEnv.C2_MODE).toBe('migration');
    expect(childEnv.C2_COMMITTED_FIXTURES).toBeUndefined();
    expect(() => buildChildEnv({ mode: 'migration', spec: MIGRATION_SPECS[0], vars, systemEnv: {}, committedFixtures: 'c2-persistent-accepted' })).toThrow(C2LaunchError);
    // La configuración de C2 no sirve para el modo migration.
    expect(() => buildChildEnv({ mode: 'migration', spec: MIGRATION_SPECS[0], vars: { ...vars, DATABASE_URL: url(C2_TARGET.endpoint), C2_EXPECTED_BRANCH: C2_TARGET.branch, C2_EXPECTED_ENDPOINT: C2_TARGET.endpoint }, systemEnv: {} })).toThrow(C2LaunchError);
  });
});
