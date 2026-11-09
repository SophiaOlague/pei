// Salvaguarda de destino para specs que SOLO deben ejecutarse contra la rama de pruebas de Neon a través de C2.
//
// C2 (lanzador: test/support/c2-launcher.ts y scripts/c2-run.ts) arranca Jest con un entorno de lista blanca leído
// solo de C:\pei-c2\.env.c2: DATABASE_URL de la rama, la identidad esperada (C2_EXPECTED_*), el modo (C2_MODE) y los
// servicios externos vacíos. Ejecutado de cualquier otra forma (por ejemplo, `pnpm test:int`), src/db cargaría el
// DATABASE_URL del .env, que apunta a la rama `production`. Esta comprobación no abre conexiones y nunca muestra
// valores: falla antes de cualquier consulta. La identidad real (parámetros neon.*) la contrasta el lanzador antes de
// iniciar Jest con verifyNeonRuntimeIdentity.

// Rama original del proyecto (la del .env): nunca es un destino válido para estas pruebas.
export const ORIGINAL_BRANCH = Object.freeze({ branch: 'br-royal-recipe-b54s5hnn', endpoint: 'ep-wandering-bonus-b5kxacor' });

// Único destino aprobado para las pruebas reales de M03 (2026-11-03). No basta con que C2_EXPECTED_* existan: deben
// ser exactamente estos valores. Un destino nuevo exige cambiar esta constante en una revisión explícita.
export const C2_TARGET = Object.freeze({
  project: 'royal-paper-10258990',
  branch: 'br-shy-pond-b50a3m8f',
  endpoint: 'ep-withered-block-b5e8v9ov',
});

// Destino AISLADO (2026-11-09): rama Neon desechable hija del respaldo c2-pre-0013 (esquema 0000–0012), solo para
// las pruebas de migración de M-1 (D y la parte B, TC-M08-300 a 307) en el modo `migration`. Ningún otro modo la admite y
// el modo `migration` no admite ningún otro destino. Se retira al eliminar la rama, en una revisión explícita.
export const C2_ISOLATED_TARGET = Object.freeze({
  project: 'royal-paper-10258990',
  branch: 'br-green-grass-b5yhyp89',
  endpoint: 'ep-nameless-sun-b5njoeb3',
  parent: 'br-silent-butterfly-b5z128fu',
});

// Ramas que nunca son destino del modo `migration`: C2, la base de desarrollo y los dos respaldos.
export const C2_FORBIDDEN_FOR_ISOLATED = Object.freeze([
  'br-shy-pond-b50a3m8f',
  'br-royal-recipe-b54s5hnn',
  'br-silent-butterfly-b5z128fu',
  'br-rapid-water-b5za50z4',
]);

// Marca de datos confirmados: la rama C2 es PERSISTENTE (2026-11-03) y conserva los registros sintéticos de los specs
// que no revierten (por ejemplo, concurrencia). No habilita ningún otro destino: la identidad exacta se exige antes.
export const C2_PERSISTENT_FIXTURES = 'c2-persistent-accepted';

// Bucket R2 exclusivo de C2. Solo los specs de R2 (modo `r2`) pueden tener credenciales R2.
export const C2_R2_BUCKET = 'pei-docs-c2-test';

// Deben existir y estar VACÍAS: así dotenv no puede cargarlas desde el .env (no sobrescribe variables definidas).
export const RESEND_ENV = Object.freeze(['RESEND_API_KEY', 'EMAIL_FROM']);
export const R2_ENV = Object.freeze(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']);
export const NEUTRALIZED_ENV = Object.freeze([...RESEND_ENV, ...R2_ENV]);

// Modalidades de C2. `concurrency` exige conexión directa (los candados no se prueban a través del pooler);
// `r2` es la única que admite credenciales R2, y solo del bucket de C2. `migration` es la única que apunta a la rama
// aislada (C2_ISOLATED_TARGET) y también exige conexión directa.
export const C2_MODES = ['postgres', 'concurrency', 'r2', 'auth', 'migration'] as const;
export type C2Mode = (typeof C2_MODES)[number];

export interface C2BranchTarget { project: string; branch: string; endpoint: string }

// Destino aprobado de cada modo: la rama aislada solo para `migration`; C2 para todos los demás.
export function c2TargetFor(mode: C2Mode): C2BranchTarget {
  return mode === 'migration' ? C2_ISOLATED_TARGET : C2_TARGET;
}

export class C2TargetError extends Error {
  constructor(reason: string) {
    super(`Este spec solo se ejecuta contra la rama de pruebas mediante C2: ${reason}`);
    this.name = 'C2TargetError';
  }
}

export function c2ModeOf(env: NodeJS.ProcessEnv): C2Mode {
  const mode = env.C2_MODE;
  if (!mode) throw new C2TargetError('falta C2_MODE (el lanzador C2 lo define)');
  if (!(C2_MODES as readonly string[]).includes(mode)) throw new C2TargetError('C2_MODE no reconocido');
  return mode as C2Mode;
}

// R2 solo en el modo `r2` y solo con el bucket exacto de C2 (R2_BUCKET_NAME === C2_EXPECTED_BUCKET === pei-docs-c2-test).
export function assertC2R2Target(env: NodeJS.ProcessEnv = process.env): { bucket: string } {
  if (c2ModeOf(env) !== 'r2') throw new C2TargetError('las credenciales R2 solo se admiten en el modo r2');
  const missing = R2_ENV.filter((key) => !env[key]);
  if (missing.length > 0) throw new C2TargetError(`faltan variables R2: ${missing.join(', ')}`);
  if (env.C2_EXPECTED_BUCKET !== C2_R2_BUCKET) throw new C2TargetError('C2_EXPECTED_BUCKET no es el bucket de C2');
  if (env.R2_BUCKET_NAME !== env.C2_EXPECTED_BUCKET) throw new C2TargetError('R2_BUCKET_NAME no coincide con C2_EXPECTED_BUCKET');
  return { bucket: C2_R2_BUCKET };
}

export function assertC2BranchTarget(env: NodeJS.ProcessEnv = process.env): { branch: string; endpoint: string } {
  const mode = c2ModeOf(env);
  const branch = env.C2_EXPECTED_BRANCH;
  const endpoint = env.C2_EXPECTED_ENDPOINT;
  const project = env.C2_EXPECTED_PROJECT;
  if (!branch || !endpoint || !project) throw new C2TargetError('falta la identidad esperada (C2_EXPECTED_*)');
  if (branch === ORIGINAL_BRANCH.branch || endpoint === ORIGINAL_BRANCH.endpoint) {
    throw new C2TargetError('la identidad esperada es la de la rama original');
  }
  if (mode === 'migration' && C2_FORBIDDEN_FOR_ISOLATED.includes(branch)) {
    throw new C2TargetError('el modo migration no admite C2, la base de desarrollo ni los respaldos');
  }
  const target = c2TargetFor(mode);
  if (project !== target.project) throw new C2TargetError('C2_EXPECTED_PROJECT no es el proyecto aprobado');
  if (branch !== target.branch) throw new C2TargetError('C2_EXPECTED_BRANCH no es la rama aprobada');
  if (endpoint !== target.endpoint) throw new C2TargetError('C2_EXPECTED_ENDPOINT no es el endpoint aprobado');

  let host: string;
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    throw new C2TargetError('DATABASE_URL ausente o inválida');
  }
  if (!host) throw new C2TargetError('DATABASE_URL ausente o inválida');
  if (host.includes(ORIGINAL_BRANCH.endpoint)) throw new C2TargetError('DATABASE_URL apunta a la rama original');
  const firstLabel = host.split('.')[0];
  const pooled = firstLabel === `${endpoint}-pooler`;
  if (firstLabel !== endpoint && !pooled) throw new C2TargetError('DATABASE_URL no corresponde al endpoint esperado');
  if (pooled && mode === 'concurrency') throw new C2TargetError('las pruebas de concurrencia exigen conexión directa (sin -pooler)');
  if (pooled && mode === 'migration') throw new C2TargetError('las pruebas de migración exigen conexión directa (sin -pooler)');

  const resendSet = RESEND_ENV.filter((key) => env[key] !== '');
  if (resendSet.length > 0) throw new C2TargetError(`variables sin neutralizar: ${resendSet.join(', ')}`);
  if (mode === 'r2') {
    assertC2R2Target(env);
  } else {
    const r2Set = R2_ENV.filter((key) => env[key] !== '');
    if (r2Set.length > 0) throw new C2TargetError(`variables sin neutralizar: ${r2Set.join(', ')}`);
  }
  return { branch, endpoint };
}

// Identidad REAL de la conexión: los parámetros neon.* que expone el compute. Se contrasta con C2_TARGET antes de
// iniciar Jest (lanzador) y la puede usar cualquier spec. `readSetting` ejecuta, en una sesión de solo lectura,
// `SELECT current_setting($1, true)`. Comprueba identificadores, no el nombre de la rama (no está disponible por SQL).
// `expected` es el destino del modo (c2TargetFor); por omisión, C2.
export async function verifyNeonRuntimeIdentity(
  readSetting: (name: string) => Promise<string | null>,
  expected: C2BranchTarget = C2_TARGET,
): Promise<C2BranchTarget> {
  const actual = {
    project: await readSetting('neon.project_id'),
    branch: await readSetting('neon.branch_id'),
    endpoint: await readSetting('neon.endpoint_id'),
  };
  if (!actual.project || !actual.branch || !actual.endpoint) throw new C2TargetError('la conexión no expone la identidad de Neon (neon.*)');
  if (actual.branch === ORIGINAL_BRANCH.branch || actual.endpoint === ORIGINAL_BRANCH.endpoint) {
    throw new C2TargetError('la conexión real es la rama original');
  }
  if (expected !== C2_TARGET && C2_FORBIDDEN_FOR_ISOLATED.includes(actual.branch)) {
    throw new C2TargetError('la conexión real es C2, la base de desarrollo o un respaldo');
  }
  if (actual.project !== expected.project) throw new C2TargetError('el proyecto real no es el aprobado');
  if (actual.branch !== expected.branch) throw new C2TargetError('la rama real no es la aprobada');
  if (actual.endpoint !== expected.endpoint) throw new C2TargetError('el endpoint real no es el aprobado');
  return expected;
}
