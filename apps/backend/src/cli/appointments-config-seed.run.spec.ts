import {
  authorizeSeedTarget, EXIT_ABORTED, EXIT_OK, EXIT_USAGE, FORBIDDEN_TARGETS, MAIN_DEV_BRANCH_ID, parseSeedArgs, runAppointmentsConfigSeed,
  SEED_TARGETS, SeedTargetRejected, type NeonIdentity, type SeedContext,
} from './appointments-config-seed.run';

// Sin conexiones: el contexto (identidad, transacción y publicación) es un doble que registra cada paso.
const ADMIN = '11111111-1111-4111-8111-111111111111';
const DEV = SEED_TARGETS[MAIN_DEV_BRANCH_ID];
const DEV_ID: NeonIdentity = { project: DEV.project, branch: DEV.branch, endpoint: DEV.endpoint };
const C2_ID: NeonIdentity = { project: 'royal-paper-10258990', branch: 'br-shy-pond-b50a3m8f', endpoint: 'ep-withered-block-b5e8v9ov' };
const APPLY_DEV = ['--created-by', ADMIN, '--target-branch', MAIN_DEV_BRANCH_ID, '--apply', '--confirm-main-db'];

// `identities`: lo que devuelve identity() en cada llamada (la primera, fuera de la transacción; la segunda, dentro).
function ctx(over: Partial<SeedContext> = {}, identities: (NeonIdentity | null)[] = [DEV_ID, DEV_ID]) {
  const calls: string[] = [];
  let inTx = false;
  const queue = [...identities];
  const c: SeedContext = {
    identity: async () => {
      calls.push(inTx ? 'identity:tx' : 'identity');
      return queue.length ? queue.shift()! : null;
    },
    inTransaction: async (work) => {
      calls.push('begin');
      inTx = true;
      try {
        const r = await work();
        calls.push('commit');
        return r;
      } catch (e) {
        calls.push('rollback');
        throw e;
      } finally {
        inTx = false;
      }
    },
    isAdmin: async (id) => (id === ADMIN ? { userId: 'admin-1' } : null),
    hasPriceVersion: async () => false,
    hasPolicyVersion: async () => false,
    publishPrice: async () => void calls.push(inTx ? 'price:tx' : 'price:FUERA'),
    publishPolicy: async () => void calls.push(inTx ? 'policy:tx' : 'policy:FUERA'),
    ...over,
  };
  return { c, calls };
}
const run = async (argv: string[], c: SeedContext) => {
  const out: string[] = [];
  const code = await runAppointmentsConfigSeed(argv, c, (l) => out.push(l), (l) => out.push(l));
  return { code, out: out.join('\n') };
};
const writes = (calls: string[]) => calls.filter((c) => c.startsWith('price') || c.startsWith('policy'));

describe('M08 CLI appointments:seed-config (AP-11)', () => {
  it('[TC-M08-120] argumentos: --created-by con UUID obligatorio; banderas desconocidas rechazadas', () => {
    expect(parseSeedArgs([])).toBeNull();
    expect(parseSeedArgs(['--created-by', 'x'])).toBeNull();
    expect(parseSeedArgs(['--created-by', ADMIN, '--force'])).toBeNull();
    expect(parseSeedArgs(['--created-by', ADMIN])).toEqual({ createdBy: ADMIN, apply: false, confirmMainDb: false, targetBranch: null });
    expect(parseSeedArgs(APPLY_DEV)).toEqual({ createdBy: ADMIN, apply: true, confirmMainDb: true, targetBranch: MAIN_DEV_BRANCH_ID });
  });

  it.each([
    ['--apply sin --target-branch', ['--created-by', ADMIN, '--apply']],
    ['--target-branch sin valor', ['--created-by', ADMIN, '--apply', '--target-branch']],
    ['--target-branch vacío', ['--created-by', ADMIN, '--apply', '--target-branch', '']],
    ['--target-branch en blanco', ['--created-by', ADMIN, '--apply', '--target-branch', '  ']],
    ['--target-branch seguido de otra bandera', ['--created-by', ADMIN, '--target-branch', '--apply']],
    ['--target-branch repetido', [...APPLY_DEV, '--target-branch', MAIN_DEV_BRANCH_ID]],
    ['--target-branch repetido con otro valor', ['--created-by', ADMIN, '--target-branch', MAIN_DEV_BRANCH_ID, '--target-branch', 'br-otra', '--apply']],
    ['--apply repetido', [...APPLY_DEV, '--apply']],
    ['--created-by repetido', [...APPLY_DEV, '--created-by', ADMIN]],
  ])('[TC-M08-126] uso inválido (código 2, sin conexión): %s', async (_label, argv) => {
    expect(parseSeedArgs(argv)).toBeNull();
    const { c, calls } = ctx();
    expect((await run(argv, c)).code).toBe(EXIT_USAGE);
    expect(calls).toEqual([]);
  });

  it('[TC-M08-121][AP-11] por omisión es una simulación: muestra el destino real y no escribe ni abre transacción', async () => {
    const { c, calls } = ctx({}, [C2_ID]);
    const r = await run(['--created-by', ADMIN], c);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toContain('SIMULACIÓN');
    expect(r.out).toContain('200.00 MXN');
    expect(r.out).toContain('rama br-shy-pond-b50a3m8f');
    expect(calls).toEqual(['identity']);
  });

  it('[TC-M08-127] destino permitido: desarrollo con identidad coincidente y --confirm-main-db; identidad, validación y escrituras en la misma transacción', async () => {
    const { c, calls } = ctx();
    const r = await run(APPLY_DEV, c);
    expect(r.code).toBe(EXIT_OK);
    expect(r.out).toContain('DESARROLLO');
    expect(calls).toEqual(['identity', 'begin', 'identity:tx', 'price:tx', 'policy:tx', 'commit']);
  });

  it('[TC-M08-122][AP-11] desarrollo sin --confirm-main-db aborta sin escribir ni abrir transacción', async () => {
    const { c, calls } = ctx();
    const r = await run(['--created-by', ADMIN, '--target-branch', MAIN_DEV_BRANCH_ID, '--apply'], c);
    expect(r.code).toBe(EXIT_ABORTED);
    expect(r.out).toContain('--confirm-main-db');
    expect(calls).toEqual(['identity']);
  });

  it.each(Object.entries(FORBIDDEN_TARGETS))('[TC-M08-128] rechaza --target-branch %s (%s) aunque la identidad real coincida', async (branch) => {
    const real: NeonIdentity = { ...C2_ID, branch };
    const { c, calls } = ctx({}, [real, real]);
    const r = await run(['--created-by', ADMIN, '--target-branch', branch, '--apply', '--confirm-main-db'], c);
    expect(r.code).toBe(EXIT_ABORTED);
    expect(r.out).toMatch(/no es un destino de la carga inicial/);
    expect(writes(calls)).toEqual([]);
  });

  it('[TC-M08-129] rechaza una rama desconocida (no autorizada)', async () => {
    const real: NeonIdentity = { project: DEV.project, branch: 'br-desconocida-b5abcdef', endpoint: 'ep-desconocido' };
    const { c, calls } = ctx({}, [real, real]);
    const r = await run(['--created-by', ADMIN, '--target-branch', 'br-desconocida-b5abcdef', '--apply', '--confirm-main-db'], c);
    expect(r.code).toBe(EXIT_ABORTED);
    expect(r.out).toMatch(/no es un destino autorizado/);
    expect(writes(calls)).toEqual([]);
  });

  it.each([
    ['identidad nula', null],
    ['sin proyecto', { ...DEV_ID, project: null }],
    ['sin rama', { ...DEV_ID, branch: null }],
    ['sin endpoint', { ...DEV_ID, endpoint: null }],
  ])('[TC-M08-130] %s: aborta (sin valores por defecto)', async (_label, identity) => {
    const { c, calls } = ctx({}, [identity as NeonIdentity | null]);
    const r = await run(APPLY_DEV, c);
    expect(r.code).toBe(EXIT_ABORTED);
    expect(r.out).toMatch(/identidad de Neon/);
    expect(writes(calls)).toEqual([]);
  });

  it.each([
    ['la conexión real es C2', C2_ID, /conexión real es C2/],
    ['la conexión real es un respaldo', { ...DEV_ID, branch: 'br-rapid-water-b5za50z4' }, /conexión real es respaldo/],
    ['otra rama real', { ...DEV_ID, branch: 'br-otra-b5abcdef' }, /rama real no coincide/],
    ['otro proyecto real', { ...DEV_ID, project: 'otro-proyecto' }, /proyecto real no coincide/],
    ['otro endpoint real', { ...DEV_ID, endpoint: 'ep-otro' }, /endpoint real no coincide/],
  ])('[TC-M08-131] desajuste entre --target-branch (desarrollo) e identidad real: %s', async (_label, identity, reason) => {
    const { c, calls } = ctx({}, [identity as NeonIdentity]);
    const r = await run(APPLY_DEV, c);
    expect(r.code).toBe(EXIT_ABORTED);
    expect(r.out).toMatch(reason);
    expect(writes(calls)).toEqual([]);
  });

  it.each([
    ['cambia a C2', C2_ID],
    ['deja de exponer la identidad', null],
  ])('[TC-M08-132] la identidad %s antes de escribir: aborta dentro de la transacción y la revierte sin escribir', async (_label, second) => {
    const { c, calls } = ctx({}, [DEV_ID, second as NeonIdentity | null]);
    const r = await run(APPLY_DEV, c);
    expect(r.code).toBe(EXIT_ABORTED);
    expect(calls).toEqual(['identity', 'begin', 'identity:tx', 'rollback']);
  });

  it('[TC-M08-123] created_by debe ser un administrador existente (comprobado dentro de la transacción)', async () => {
    const { c, calls } = ctx();
    const r = await run(['--created-by', '22222222-2222-4222-8222-222222222222', '--target-branch', MAIN_DEV_BRANCH_ID, '--apply', '--confirm-main-db'], c);
    expect(r.code).toBe(EXIT_ABORTED);
    expect(calls).toEqual(['identity', 'begin', 'identity:tx', 'rollback']);
  });

  it('[TC-M08-124] idempotente: solo crea lo que falta; con todo creado no escribe', async () => {
    const first = ctx({ hasPriceVersion: async () => true });
    expect((await run(APPLY_DEV, first.c)).code).toBe(EXIT_OK);
    expect(writes(first.calls)).toEqual(['policy:tx']);
    const done = ctx({ hasPriceVersion: async () => true, hasPolicyVersion: async () => true });
    expect((await run(APPLY_DEV, done.c)).out).toContain('Nada que hacer');
    expect(writes(done.calls)).toEqual([]);
  });

  it('[TC-M08-125] uso inválido devuelve el código 2', async () => {
    expect((await run(['--apply'], ctx().c)).code).toBe(EXIT_USAGE);
  });

  it('[TC-M08-133] solo desarrollo es destino autorizado: ni C2, ni respaldos, ni producción', () => {
    expect(Object.keys(SEED_TARGETS)).toEqual([MAIN_DEV_BRANCH_ID]);
    expect(Object.values(SEED_TARGETS).map((t) => t.kind)).toEqual(['development']);
    for (const branch of Object.keys(FORBIDDEN_TARGETS)) expect(SEED_TARGETS[branch]).toBeUndefined();
    expect(() => authorizeSeedTarget('__proto__', DEV_ID, true)).toThrow(SeedTargetRejected);
    expect(() => authorizeSeedTarget('constructor', DEV_ID, true)).toThrow(SeedTargetRejected);
    expect(authorizeSeedTarget(MAIN_DEV_BRANCH_ID, DEV_ID, true)).toBe(DEV);
  });
});
