import { readFileSync } from 'fs';
import { join } from 'path';
import { buildChildEnv, C2LaunchError, PAYMENTS_F1_AUTHORIZATION, PAYMENTS_F1_SPEC, secretFingerprint } from './c2-launcher';
import { C2_TARGET } from './c2-target-guard';
import {
  assertAuthorizedConnection,
  AUTHORIZED_FINGERPRINT_FILE,
  diffObjects,
  loadAuthorizedTarget,
  objectsFingerprint,
  readConnectionFingerprint,
  SQL_OBJECTS_FINGERPRINT,
  type Query,
} from './payments-f1-guard';
import { FINGERPRINT_COMPONENTS, hostHash, SQL_FINGERPRINT, WRITE_KEYWORDS, type Fingerprint } from '../../scripts/payments-preflight-core';

// Salvaguardas del spec de Payments F1 (B-1, B-2, B-3), sin conexiones: lanzador con configuración sintética y
// huellas con un ejecutor SQL falso.
const ROOT = join(__dirname, '..', '..');
const SPEC_SOURCE = readFileSync(join(ROOT, PAYMENTS_F1_SPEC), 'utf8');
const SECRET = 'S'.repeat(64);
const HOST = `${C2_TARGET.endpoint}.c-7.us-east-2.aws.neon.tech`;
const URL_ = `postgresql://rol_c2:clave-secreta@${HOST}/neondb?sslmode=require`;
const VARS: Record<string, string> = {
  DATABASE_URL: URL_,
  C2_EXPECTED_PROJECT: C2_TARGET.project,
  C2_EXPECTED_BRANCH: C2_TARGET.branch,
  C2_EXPECTED_ENDPOINT: C2_TARGET.endpoint,
  BETTER_AUTH_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: SECRET,
  C2_AUTH_SECRET_FINGERPRINT: secretFingerprint(SECRET),
  C2_AUTH_SECRET_GENERATED_AT: '2026-11-11T00:00:00.000Z',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:3001',
  RESEND_API_KEY: '',
  EMAIL_FROM: '',
};
const SYSTEM = { PATH: '/usr/bin', PAYMENTS_F1_AUTHORIZED: '0017' };

const FP: Fingerprint = {
  database: 'neondb',
  system_identifier: '7688416788070812297',
  server_version: '180006',
  current_user: 'rol_c2',
  neon_project_id: C2_TARGET.project,
  neon_branch_id: C2_TARGET.branch,
  neon_endpoint_id: C2_TARGET.endpoint,
  host_sha256_16: hostHash(HOST),
};
const AUTH_JSON = JSON.stringify({ label: 'C2', fingerprint: FP });

function fakeQuery(over: Partial<Record<keyof typeof SQL_FINGERPRINT, unknown>> = {}, errors: Partial<Record<string, Error>> = {}): Query & { log: string[] } {
  const log: string[] = [];
  const q = (async (text: string) => {
    log.push(text);
    const component = (Object.keys(SQL_FINGERPRINT) as (keyof typeof SQL_FINGERPRINT)[]).find((c) => SQL_FINGERPRINT[c] === text);
    if (component && errors[component]) throw errors[component];
    if (component) return [{ v: component in over ? over[component] : FP[component] }];
    if (text === SQL_OBJECTS_FINGERPRINT) return [{ f: { relations: [['payment', 'r']], migrations: { count: 17, hash: 'h' } } }];
    throw new Error('SQL inesperado');
  }) as unknown as Query & { log: string[] };
  q.log = log;
  return q;
}

describe('B-1 · autorización del lanzador', () => {
  it('sin --authorize-payments-f1, PAYMENTS_F1_AUTHORIZED no llega a Jest aunque el proceso padre la tenga', () => {
    const env = buildChildEnv({ mode: 'postgres', spec: PAYMENTS_F1_SPEC, vars: VARS, systemEnv: SYSTEM });
    expect(env[PAYMENTS_F1_AUTHORIZATION.variable]).toBeUndefined();
  });

  it('con --authorize-payments-f1 0017, en postgres y para el spec de F1, se transmite exactamente 0017', () => {
    const env = buildChildEnv({ mode: 'postgres', spec: PAYMENTS_F1_SPEC, vars: VARS, systemEnv: SYSTEM, authorizePaymentsF1: '0017' });
    expect(env.PAYMENTS_F1_AUTHORIZED).toBe('0017');
  });

  it.each([
    ['otro valor', { mode: 'postgres', spec: PAYMENTS_F1_SPEC, authorizePaymentsF1: '0018' }],
    ['valor vacío', { mode: 'postgres', spec: PAYMENTS_F1_SPEC, authorizePaymentsF1: '' }],
    ['otro spec', { mode: 'postgres', spec: 'test/integration/appointments.int-spec.ts', authorizePaymentsF1: '0017' }],
    ['otro modo', { mode: 'concurrency', spec: PAYMENTS_F1_SPEC, authorizePaymentsF1: '0017' }],
    ['con datos confirmados', { mode: 'postgres', spec: PAYMENTS_F1_SPEC, authorizePaymentsF1: '0017', committedFixtures: 'c2-persistent-accepted' }],
  ] as const)('rechaza %s', (_name, o) => {
    expect(() => buildChildEnv({ vars: VARS, systemEnv: SYSTEM, ...o } as Parameters<typeof buildChildEnv>[0])).toThrow(C2LaunchError);
  });

  it('el spec se detiene al cargarse sin la variable, antes de la salvaguarda de destino, de la huella y de leer 0017', () => {
    const gate = SPEC_SOURCE.search(/^if \(process\.env\.PAYMENTS_F1_AUTHORIZED !== '0017'\) \{\r?\n\s+throw new Error/m);
    expect(gate).toBeGreaterThan(-1);
    for (const later of ['assertC2BranchTarget();', 'loadAuthorizedTarget()', "readFileSync(join(DIR, '0017_payments_f1.up.sql')", 'describe(']) {
      expect({ later, after: SPEC_SOURCE.indexOf(later) > gate }).toEqual({ later, after: true });
    }
  });

  it('cada escenario pasa por scenario() (huella antes del trabajo) y ninguno usa withIsolatedRollback directamente', () => {
    expect(SPEC_SOURCE.match(/^ {4}scenario\(async \(\) => \{/gm)).toHaveLength(11);
    expect(SPEC_SOURCE.match(/withIsolatedRollback\(/g)).toHaveLength(1);
    // Orden dentro de cada escenario: huella autorizada (B-2) → autorización de sesión de 0017 (R-1) → trabajo.
    expect(SPEC_SOURCE).toMatch(/withIsolatedRollback\(async \(\) => \{\r?\n\s+await assertAuthorizedConnection\(txQuery, DATABASE_URL, AUTHORIZED\);\r?\n\s+await authorizeProtectedMigration\([\s\S]*?'0017_payments_f1',[\s\S]*?\);\r?\n\s+return work\(\);/);
    // El SQL de 0017 solo se ejecuta dentro de escenarios, después de esa autorización.
    expect(SPEC_SOURCE.indexOf('const scenario =')).toBeLessThan(SPEC_SOURCE.search(/run\(UP\)|attempt\(UP\)/));
  });
});

describe('B-2 · huella autorizada por conexión', () => {
  const authorized = loadAuthorizedTarget((p) => (p === AUTHORIZED_FINGERPRINT_FILE ? AUTH_JSON : null));

  it('lee la huella autorizada de C2 desde el archivo fijo y exige el rótulo C2', () => {
    expect(AUTHORIZED_FINGERPRINT_FILE).toBe('C:\\pei-c2\\payments-preflight-c2.authorized.json');
    expect(authorized.fingerprint).toEqual(FP);
    expect(() => loadAuthorizedTarget(() => null)).toThrow('no se pudo leer');
    expect(() => loadAuthorizedTarget(() => JSON.stringify({ label: 'otro', fingerprint: FP }))).toThrow('no es la de C2');
  });

  it('acepta la conexión cuando los ocho componentes coinciden', async () => {
    const q = fakeQuery();
    await expect(assertAuthorizedConnection(q, URL_, authorized)).resolves.toBeUndefined();
    expect(q.log).toEqual(Object.values(SQL_FINGERPRINT));
    expect(FINGERPRINT_COMPONENTS).toHaveLength(8);
  });

  it.each(Object.keys(SQL_FINGERPRINT))('aborta si %s no coincide', async (component) => {
    await expect(assertAuthorizedConnection(fakeQuery({ [component]: 'otro' }), URL_, authorized)).rejects.toThrow(new RegExp(`no coincide.*${component}`));
  });

  it('aborta si el host de la conexión no es el autorizado', async () => {
    await expect(assertAuthorizedConnection(fakeQuery(), URL_.replace(HOST, 'otro.example'), authorized)).rejects.toThrow(/host_sha256_16/);
  });

  it.each([null, '', '  '])('aborta si un componente falta o está vacío (%j)', async (v) => {
    await expect(readConnectionFingerprint(fakeQuery({ neon_branch_id: v }), URL_)).rejects.toThrow('huella incompleta: no se obtuvo neon_branch_id');
  });

  it('aborta sin permiso (SQLSTATE) y sin revelar el mensaje del driver', async () => {
    const error = await readConnectionFingerprint(fakeQuery({}, { system_identifier: Object.assign(new Error(`sin permiso en ${HOST}`), { code: '42501' }) }), URL_)
      .catch((e: Error) => e);
    expect((error as Error).message).toBe('preflight abortado: no se pudo obtener system_identifier (SQLSTATE 42501)');
  });

  it('las consultas de huella son de solo lectura', () => {
    for (const text of Object.values(SQL_FINGERPRINT)) expect(WRITE_KEYWORDS.test(text)).toBe(false);
  });
});

describe('B-3 · huella de objetos', () => {
  it('cubre tablas, columnas, constraints, índices, triggers, funciones, enums, tipos y drizzle.__drizzle_migrations, sin escrituras', () => {
    for (const key of ['relations', 'columns', 'constraints', 'indexes', 'triggers', 'functions', 'enums', 'types', 'migrations']) {
      expect(SQL_OBJECTS_FINGERPRINT).toContain(`'${key}'`);
    }
    expect(SQL_OBJECTS_FINGERPRINT).toMatch(/from drizzle\.__drizzle_migrations/);
    expect(SQL_OBJECTS_FINGERPRINT).toMatch(/md5\(pg_get_functiondef/);
    expect(SQL_OBJECTS_FINGERPRINT).toMatch(/md5\(pg_get_triggerdef/);
    expect(SQL_OBJECTS_FINGERPRINT).toMatch(/md5\(pg_get_constraintdef/);
    expect(WRITE_KEYWORDS.test(SQL_OBJECTS_FINGERPRINT)).toBe(false);
  });

  it('el digest es determinista y diffObjects detecta objetos añadidos o retirados', async () => {
    const a = await objectsFingerprint(fakeQuery());
    const b = await objectsFingerprint(fakeQuery());
    expect(a.digest).toBe(b.digest);
    expect(diffObjects(a, b)).toEqual([]);
    const added = { digest: 'x', objects: { relations: [['payment', 'r'], ['doctor_ledger_entry', 'r']], migrations: { count: 17, hash: 'h' } } };
    expect(diffObjects(a, added)).toEqual(['relations: + ["doctor_ledger_entry","r"]']);
    const migrated = { digest: 'y', objects: { relations: [['payment', 'r']], migrations: { count: 18, hash: 'h2' } } };
    expect(diffObjects(a, migrated)).toEqual(['migrations: + {"count":18,"hash":"h2"}', 'migrations: - {"count":17,"hash":"h"}']);
  });

  it('el spec toma la huella de objetos antes y después y exige que no haya diferencias', () => {
    const before = SPEC_SOURCE.indexOf('objectsBefore = await objectsFingerprint(dbQuery)');
    const check = SPEC_SOURCE.indexOf('await assertAuthorizedConnection(dbQuery, DATABASE_URL, AUTHORIZED)');
    expect(check).toBeGreaterThan(-1);
    expect(before).toBeGreaterThan(check);
    expect(SPEC_SOURCE).toMatch(/expect\(diffObjects\(objectsBefore, after\)\)\.toEqual\(\[\]\)/);
  });
});

describe('B-4 · escenarios corregidos', () => {
  it('no queda SET CONSTRAINTS IMMEDIATE sin restaurar: cada uso restaura DEFERRED', () => {
    const immediates = SPEC_SOURCE.match(/set constraints all immediate/g) ?? [];
    const deferreds = SPEC_SOURCE.match(/set constraints all deferred/g) ?? [];
    expect(immediates).toHaveLength(2);
    expect(deferreds).toHaveLength(2);
    expect(SPEC_SOURCE).not.toMatch(/immediate\(\)/);
  });

  it('el asiento y el ajuste de refundAdjustment comparten un único savepoint', () => {
    const fn = /function refundAdjustment[\s\S]*?\n}\n/.exec(SPEC_SOURCE.replace(/\r\n/g, '\n'))![0];
    expect(fn).toMatch(/return inSavepointWithCheck\(async \(sp\) => \{/);
    expect(fn.match(/sp\.execute/g)).toHaveLength(2);
    expect(fn).not.toMatch(/\bone</);
  });
});
