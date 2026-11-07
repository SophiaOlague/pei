import { EXIT_ABORTED, EXIT_OK, EXIT_USAGE, PRODUCTION_BRANCH_ID, parseSeedArgs, runAppointmentsConfigSeed, type SeedContext } from './appointments-config-seed.run';

const ADMIN = '11111111-1111-4111-8111-111111111111';

function ctx(over: Partial<SeedContext> = {}) {
  const calls: string[] = [];
  const c: SeedContext = {
    branchId: async () => 'br-c2',
    isAdmin: async (id) => (id === ADMIN ? { userId: 'admin-1' } : null),
    hasPriceVersion: async () => false,
    hasPolicyVersion: async () => false,
    publishPrice: async () => void calls.push('price'),
    publishPolicy: async () => void calls.push('policy'),
    ...over,
  };
  return { c, calls };
}
const run = async (argv: string[], c: SeedContext) => {
  const out: string[] = [];
  const code = await runAppointmentsConfigSeed(argv, c, (l) => out.push(l), (l) => out.push(l));
  return { code, out: out.join('\n') };
};

describe('M08 CLI appointments:seed-config (AP-11)', () => {
  it('[TC-M08-120] argumentos: --created-by con UUID obligatorio; banderas desconocidas rechazadas', () => {
    expect(parseSeedArgs([])).toBeNull();
    expect(parseSeedArgs(['--created-by', 'x'])).toBeNull();
    expect(parseSeedArgs(['--created-by', ADMIN, '--force'])).toBeNull();
    expect(parseSeedArgs(['--created-by', ADMIN, '--apply'])).toEqual({ createdBy: ADMIN, apply: true, confirmProduction: false });
  });

  it('[TC-M08-121][AP-11] por omisión es una simulación: no escribe nada', async () => {
    const { c, calls } = ctx();
    const r = await run(['--created-by', ADMIN], c);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toContain('SIMULACIÓN');
    expect(r.out).toContain('200.00 MXN');
    expect(calls).toEqual([]);
  });

  it('[TC-M08-122][AP-11] en producción, --apply sin --confirm-production aborta sin escribir', async () => {
    const { c, calls } = ctx({ branchId: async () => PRODUCTION_BRANCH_ID });
    const r = await run(['--created-by', ADMIN, '--apply'], c);
    expect(r.code).toBe(EXIT_ABORTED);
    expect(calls).toEqual([]);
  });

  it('[TC-M08-123] created_by debe ser un administrador existente', async () => {
    const { c, calls } = ctx();
    expect((await run(['--created-by', '22222222-2222-4222-8222-222222222222', '--apply'], c)).code).toBe(EXIT_ABORTED);
    expect(calls).toEqual([]);
  });

  it('[TC-M08-124] idempotente: solo crea lo que falta; con todo creado no hace nada', async () => {
    const first = ctx({ hasPriceVersion: async () => true });
    expect((await run(['--created-by', ADMIN, '--apply'], first.c)).code).toBe(EXIT_OK);
    expect(first.calls).toEqual(['policy']);
    const done = ctx({ hasPriceVersion: async () => true, hasPolicyVersion: async () => true });
    expect((await run(['--created-by', ADMIN, '--apply'], done.c)).out).toContain('Nada que hacer');
    expect(done.calls).toEqual([]);
  });

  it('[TC-M08-125] uso inválido devuelve el código 2', async () => {
    expect((await run(['--apply'], ctx().c)).code).toBe(EXIT_USAGE);
  });
});
