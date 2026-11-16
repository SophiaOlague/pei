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

// Modo `migration` (pruebas de migración de M-1) SIN destino aprobado: la rama aislada br-green-grass-b5yhyp89 se usó
// el 2026-11-09 y se eliminó. Sin conexiones: el modo debe fallar antes de conectarse con cualquier identidad, y los
// demás modos deben seguir apuntando exactamente a C2.

const NEUTRAL = Object.fromEntries(NEUTRALIZED_ENV.map((key) => [key, '']));
type Target = { project: string; branch: string; endpoint: string };
const RETIRED: Target = { project: 'royal-paper-10258990', branch: 'br-green-grass-b5yhyp89', endpoint: 'ep-nameless-sun-b5njoeb3' };
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
const settings = (target: Target) => {
  const values: Record<string, string> = { 'neon.project_id': target.project, 'neon.branch_id': target.branch, 'neon.endpoint_id': target.endpoint };
  return async (name: string) => values[name] ?? null;
};
const SECRET = 'S'.repeat(64);
const launcherVars = (target: Target): Record<string, string> => ({
  DATABASE_URL: url(target.endpoint), C2_EXPECTED_PROJECT: target.project, C2_EXPECTED_BRANCH: target.branch, C2_EXPECTED_ENDPOINT: target.endpoint,
  BETTER_AUTH_URL: 'http://localhost:3000', BETTER_AUTH_SECRET: SECRET, C2_AUTH_SECRET_FINGERPRINT: secretFingerprint(SECRET),
  C2_AUTH_SECRET_GENERATED_AT: '2026-11-09T00:00:00.000Z', AUTH_TRUSTED_ORIGINS: 'http://localhost:3001', RESEND_API_KEY: '', EMAIL_FROM: '',
});

describe('Modo migration sin destino aprobado (rama aislada retirada)', () => {
  it('[TC-M08-350] no hay destino aprobado para migration; la rama retirada queda prohibida; los demás modos apuntan a C2', () => {
    expect(C2_ISOLATED_TARGET).toBeNull();
    expect(() => c2TargetFor('migration')).toThrow(/no tiene destino aprobado/);
    expect(C2_FORBIDDEN_FOR_ISOLATED).toEqual(expect.arrayContaining([
      C2_TARGET.branch, ORIGINAL_BRANCH.branch, 'br-silent-butterfly-b5z128fu', 'br-rapid-water-b5za50z4', RETIRED.branch,
    ]));
    for (const mode of C2_MODES.filter((m) => m !== 'migration')) expect(c2TargetFor(mode)).toBe(C2_TARGET);
  });

  it.each([
    ['la rama aislada retirada', RETIRED],
    ['C2', C2_TARGET],
    ['el respaldo c2-pre-0013', { project: C2_TARGET.project, branch: 'br-silent-butterfly-b5z128fu', endpoint: 'ep-holy-sea-b5zxmnm6' }],
    ['el respaldo de desarrollo', { project: C2_TARGET.project, branch: 'br-rapid-water-b5za50z4', endpoint: 'ep-calm-snow-b5eox1a8' }],
    ['la base de desarrollo', { project: C2_TARGET.project, branch: ORIGINAL_BRANCH.branch, endpoint: ORIGINAL_BRANCH.endpoint }],
    ['una rama nueva no aprobada', { project: C2_TARGET.project, branch: 'br-nueva-rama-b5abcdef', endpoint: 'ep-nuevo-b5abcdef' }],
  ])('[TC-M08-351] el modo migration rechaza %s antes de conectarse', (_label, target) => {
    expect(() => assertC2BranchTarget(env('migration', target))).toThrow(C2TargetError);
  });

  it.each(C2_MODES.filter((m) => m !== 'migration'))('[TC-M08-352] el modo %s sigue exigiendo C2 y rechaza la rama retirada', (mode) => {
    // H-5: el modo webhooks exige además su marca de datos confirmados.
    const marker: Record<string, string> = mode === 'webhooks' ? { C2_COMMITTED_FIXTURES: 'wh-h5-committed' } : {};
    expect(() => assertC2BranchTarget(env(mode, RETIRED, marker))).toThrow(C2TargetError);
    if (mode !== 'r2') expect(assertC2BranchTarget(env(mode, C2_TARGET, marker))).toEqual({ branch: C2_TARGET.branch, endpoint: C2_TARGET.endpoint });
  });

  it('[TC-M08-353] la identidad real de C2 sigue verificándose; la de la rama retirada no pasa por ningún destino', async () => {
    await expect(verifyNeonRuntimeIdentity(settings(C2_TARGET))).resolves.toBe(C2_TARGET);
    await expect(verifyNeonRuntimeIdentity(settings(RETIRED))).rejects.toBeInstanceOf(C2TargetError);
  });

  it('[TC-M08-354] jest-migration.json conserva su configuración, pero el setupFile rechaza toda identidad sin destino aprobado', () => {
    const config = JSON.parse(readFileSync(join(__dirname, '..', 'jest-migration.json'), 'utf8')) as { setupFiles: string[] };
    expect(config.setupFiles).toEqual(['<rootDir>/test/support/db-tripwire.ts', '<rootDir>/test/support/c2-mode-migration.ts']);
    expect(() => assertJestConfigMode('migration', env('migration', RETIRED))).toThrow(C2TargetError);
    expect(() => assertJestConfigMode('migration', env('postgres', C2_TARGET))).toThrow(C2TargetError);
  });

  it('[TC-M08-355] el lanzador conserva el reparto de specs, pero migration no arranca sin destino aprobado', () => {
    expect(MODE_CONFIG.migration.config).toBe('test/jest-migration.json');
    for (const spec of MIGRATION_SPECS) {
      expect(resolveSpec('migration', spec).config).toMatch(/jest-migration\.json$/);
      expect(() => resolveSpec('postgres', spec)).toThrow(C2LaunchError);
    }
    expect(() => resolveSpec('migration', 'test/integration/appointments.int-spec.ts')).toThrow(C2LaunchError);
    expect(resolveSpec('postgres', 'test/integration/m08-m1-schema.int-spec.ts').config).toMatch(/jest-integration\.json$/);
    for (const target of [RETIRED, C2_TARGET]) {
      expect(() => buildChildEnv({ mode: 'migration', spec: MIGRATION_SPECS[0], vars: launcherVars(target), systemEnv: { PATH: '/usr/bin' } })).toThrow(C2LaunchError);
    }
    // El modo postgres con la configuración de C2 sigue funcionando igual.
    expect(buildChildEnv({ mode: 'postgres', spec: 'test/integration/identity.int-spec.ts', vars: launcherVars(C2_TARGET), systemEnv: {} }).C2_MODE).toBe('postgres');
  });
});
