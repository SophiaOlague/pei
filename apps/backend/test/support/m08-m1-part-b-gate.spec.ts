import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ALLOWED_KEYS, buildChildEnv, C2LaunchError, secretFingerprint } from './c2-launcher';
import { C2_TARGET } from './c2-target-guard';

// La parte B de M-1 (0014) no está autorizada: ningún lanzador debe poder ejecutar TC-M08-307 por accidente.
// Pruebas de código fuente y del lanzador con configuración sintética, sin conexiones.
const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const PART_B = 'test/integration/m08-m1-part-b.int-spec.ts';

// Configuración sintética de .env.c2 (sin secretos reales): la de C2 y la de la rama aislada ya retirada.
const SECRET = 'S'.repeat(64);
const varsFor = (target: { project: string; branch: string; endpoint: string }): Record<string, string> => ({
  DATABASE_URL: `postgresql://rol:clave@${target.endpoint}.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require`,
  C2_EXPECTED_PROJECT: target.project,
  C2_EXPECTED_BRANCH: target.branch,
  C2_EXPECTED_ENDPOINT: target.endpoint,
  BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: SECRET,
  C2_AUTH_SECRET_FINGERPRINT: secretFingerprint(SECRET),
  C2_AUTH_SECRET_GENERATED_AT: '2026-11-09T00:00:00.000Z',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:3001',
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
});
const C2_VARS = varsFor(C2_TARGET);
const RETIRED_VARS = varsFor({ project: 'royal-paper-10258990', branch: 'br-green-grass-b5yhyp89', endpoint: 'ep-nameless-sun-b5njoeb3' });

describe('M-1 parte B (0014) bloqueada', () => {
  it('[TC-M08-340] el spec de parte B se detiene al cargarse sin M08_PART_B_AUTHORIZED=0014, antes de cualquier suite y de leer 0014', () => {
    const source = read(PART_B);
    const gate = source.search(/^if \(process\.env\.M08_PART_B_AUTHORIZED !== '0014'\) \{\r?\n\s+throw new Error/m);
    expect(gate).toBeGreaterThan(-1);
    expect(source.search(/^describe\(/m)).toBeGreaterThan(gate);
    expect(source.indexOf("file('0014_")).toBeGreaterThan(gate);
  });

  it('[TC-M08-341] TC-M08-307 existe solo en el spec de parte B, y solo ese spec lee 0014', () => {
    const dirs = ['test/integration', 'test/concurrency', 'test/support', 'test'];
    const files = dirs.flatMap((d) => readdirSync(join(ROOT, d)).filter((f) => f.endsWith('.ts')).map((f) => `${d}/${f}`));
    const self = 'test/support/m08-m1-part-b-gate.spec.ts';
    const with307 = files.filter((f) => f !== self && read(f).includes('[TC-M08-307]'));
    const with0014 = files.filter((f) => f !== self && /0014_m08_m1_legal_acceptance/.test(read(f)));
    expect(with307).toEqual([PART_B]);
    expect(with0014).toEqual([PART_B]);
  });

  it('[TC-M08-342][AP-26] M08_PART_B_AUTHORIZED no se hereda ni se acepta en .env.c2, y el indicador no habilita nada sin destino aprobado', () => {
    // No es una clave admitida en .env.c2: la carga se detiene.
    expect(ALLOWED_KEYS).not.toContain('M08_PART_B_AUTHORIZED');
    expect(() => buildChildEnv({ mode: 'postgres', spec: 'test/integration/identity.int-spec.ts', vars: { ...C2_VARS, M08_PART_B_AUTHORIZED: '0014' }, systemEnv: {} })).toThrow(C2LaunchError);
    // No se hereda del proceso padre.
    expect(buildChildEnv({ mode: 'postgres', spec: 'test/integration/identity.int-spec.ts', vars: C2_VARS, systemEnv: { PATH: '/usr/bin', M08_PART_B_AUTHORIZED: '0014' } }).M08_PART_B_AUTHORIZED).toBeUndefined();
    // El indicador se rechaza fuera del modo migration.
    expect(() => buildChildEnv({ mode: 'postgres', spec: PART_B, vars: C2_VARS, systemEnv: {}, authorizePartB: '0014' })).toThrow(C2LaunchError);
    // Sin destino aprobado, el modo migration no arranca con ninguna identidad, aunque se pase el indicador correcto.
    for (const vars of [RETIRED_VARS, C2_VARS]) {
      expect(() => buildChildEnv({ mode: 'migration', spec: PART_B, vars, systemEnv: {}, authorizePartB: '0014' })).toThrow(C2LaunchError);
      expect(() => buildChildEnv({ mode: 'migration', spec: PART_B, vars, systemEnv: {} })).toThrow(C2LaunchError);
    }
  });
});
