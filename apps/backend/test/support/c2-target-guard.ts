// Salvaguarda de destino para specs que SOLO deben ejecutarse contra la rama temporal de Neon a través de C2.
//
// C2 (fuera del repositorio) arranca Jest con un entorno de lista blanca: DATABASE_URL de la rama, la identidad
// esperada (C2_EXPECTED_BRANCH/ENDPOINT/PROJECT) y los servicios externos vacíos. Ejecutado de cualquier otra forma
// (por ejemplo, `pnpm test:int`), src/db cargaría el DATABASE_URL del .env, que apunta a la rama `production`.
// Esta comprobación no abre conexiones y nunca muestra valores: falla antes de cualquier consulta.

// Rama original del proyecto (la del .env): nunca es un destino válido para estas pruebas.
export const ORIGINAL_BRANCH = Object.freeze({ branch: 'br-royal-recipe-b54s5hnn', endpoint: 'ep-wandering-bonus-b5kxacor' });

// Deben existir y estar VACÍAS: así dotenv no puede cargarlas desde el .env (no sobrescribe variables definidas).
export const NEUTRALIZED_ENV = Object.freeze(['RESEND_API_KEY', 'EMAIL_FROM', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']);

export class C2TargetError extends Error {
  constructor(reason: string) {
    super(`Este spec solo se ejecuta contra la rama temporal mediante C2: ${reason}`);
    this.name = 'C2TargetError';
  }
}

export function assertC2BranchTarget(env: NodeJS.ProcessEnv = process.env): { branch: string; endpoint: string } {
  const branch = env.C2_EXPECTED_BRANCH;
  const endpoint = env.C2_EXPECTED_ENDPOINT;
  if (!branch || !endpoint || !env.C2_EXPECTED_PROJECT) throw new C2TargetError('falta la identidad esperada (C2_EXPECTED_*)');
  if (!/^br-[a-z0-9]+(-[a-z0-9]+)+$/.test(branch) || !/^ep-[a-z0-9]+(-[a-z0-9]+)+$/.test(endpoint)) {
    throw new C2TargetError('identidad esperada con formato inválido');
  }
  if (branch === ORIGINAL_BRANCH.branch || endpoint === ORIGINAL_BRANCH.endpoint) {
    throw new C2TargetError('la identidad esperada es la de la rama original');
  }

  let host: string;
  try {
    host = new URL(env.DATABASE_URL ?? '').hostname;
  } catch {
    throw new C2TargetError('DATABASE_URL ausente o inválida');
  }
  const firstLabel = host.split('.')[0];
  if (firstLabel !== endpoint && firstLabel !== `${endpoint}-pooler`) throw new C2TargetError('DATABASE_URL no corresponde al endpoint esperado');
  if (host.includes(ORIGINAL_BRANCH.endpoint)) throw new C2TargetError('DATABASE_URL apunta a la rama original');

  const notNeutralized = NEUTRALIZED_ENV.filter((key) => env[key] !== '');
  if (notNeutralized.length > 0) throw new C2TargetError(`variables sin neutralizar: ${notNeutralized.join(', ')}`);
  return { branch, endpoint };
}
