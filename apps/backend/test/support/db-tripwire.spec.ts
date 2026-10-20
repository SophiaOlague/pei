import { assertC2BranchTarget, NEUTRALIZED_ENV } from './c2-target-guard';

// Interceptor de conexiones (sin red): se carga en un registro de módulos aislado, con un driver de Neon nuevo, para
// comprobar su efecto real sobre Pool y Client. Los hosts son .invalid: aunque fallara, no habría conexión posible.

const BRANCH = 'br-autumn-sun-b52qoep4';
const ENDPOINT = 'ep-noisy-pond-b5owxox3';
const C2_ENV = {
  C2_EXPECTED_BRANCH: BRANCH,
  C2_EXPECTED_ENDPOINT: ENDPOINT,
  C2_EXPECTED_PROJECT: 'royal-paper-10258990',
  DATABASE_URL: `postgresql://rol:clave@${ENDPOINT}.example.invalid/neondb?sslmode=require`,
  ...Object.fromEntries(NEUTRALIZED_ENV.map((key) => [key, ''])),
};
const C2_KEYS = [...Object.keys(C2_ENV)];

type Driver = { Pool: new (config: object) => any; Client: new (config: object) => any };

// Carga el interceptor (que se instala al importarse) y un driver nuevo con el entorno indicado.
function loadIsolated(env: Record<string, string | undefined>): { driver: Driver; tripwire: typeof import('./db-tripwire') } {
  const saved = Object.fromEntries(C2_KEYS.map((key) => [key, process.env[key]]));
  let loaded!: { driver: Driver; tripwire: typeof import('./db-tripwire') };
  try {
    for (const key of C2_KEYS) delete process.env[key];
    Object.assign(process.env, env);
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tripwire = require('./db-tripwire') as typeof import('./db-tripwire');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const driver = require('@neondatabase/serverless') as Driver;
      loaded = { driver, tripwire };
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  return loaded;
}

describe('db-tripwire: conexiones a PostgreSQL fuera de C2', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it.each([
    ['sin identidad de C2 (ejecución manual)', { DATABASE_URL: `postgresql://rol:clave@${ENDPOINT}.example.invalid/neondb` }],
    ['con la URL de la rama original', { ...C2_ENV, DATABASE_URL: 'postgresql://rol:clave@ep-wandering-bonus-b5kxacor.example.invalid/neondb?sslmode=require' }],
    ['con Resend sin neutralizar', { ...C2_ENV, RESEND_API_KEY: undefined }],
  ])('[TC-M02-248] %s: Pool y Client fallan en connect y query antes de abrir la red', async (_label, env) => {
    const { driver, tripwire } = loadIsolated(env);
    for (const Cls of [driver.Pool, driver.Client]) {
      expect(Cls.prototype.connect.name).toBe('blockedByDbTripwire');
      expect(Cls.prototype.query.name).toBe('blockedByDbTripwire');
    }
    const pool = new driver.Pool({ connectionString: env.DATABASE_URL });
    await expect(async () => pool.query('select 1')).rejects.toBeInstanceOf(tripwire.DbTripwireError);
    await expect(async () => pool.connect()).rejects.toThrow(/Conexión a PostgreSQL bloqueada fuera de C2/);
    const client = new driver.Client({ connectionString: env.DATABASE_URL });
    await expect(async () => client.connect()).rejects.toBeInstanceOf(tripwire.DbTripwireError);
    // El mensaje no muestra valores.
    const error = await (async () => pool.query('select 1'))().catch((e: Error) => e);
    expect((error as Error).message).not.toMatch(/clave|rol:|postgresql|invalid/);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/^\[db-tripwire\] intento de (connect|query) bloqueado/));
  });

  it('[TC-M02-248] con la identidad de C2 de la rama temporal no intercepta nada', () => {
    const { driver, tripwire } = loadIsolated(C2_ENV);
    for (const Cls of [driver.Pool, driver.Client]) {
      expect(Cls.prototype.connect.name).not.toBe('blockedByDbTripwire');
      expect(Cls.prototype.query.name).not.toBe('blockedByDbTripwire');
    }
    expect(tripwire.installDbTripwire(C2_ENV as NodeJS.ProcessEnv)).toEqual({ active: false });
  });

  it('[TC-M02-248] en esta misma suite, el setupFile intercepta el driver si y solo si no hay identidad de C2 válida', () => {
    // Vale para la ejecución local (sin C2: interceptado) y para la operación test-unit de C2 (sin interceptar).
    const c2Valid = (() => {
      try {
        assertC2BranchTarget();
        return true;
      } catch {
        return false;
      }
    })();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const driver = require('@neondatabase/serverless') as Driver;
    expect(driver.Pool.prototype.query.name === 'blockedByDbTripwire').toBe(!c2Valid);
    expect(driver.Client.prototype.connect.name === 'blockedByDbTripwire').toBe(!c2Valid);
  });
});
