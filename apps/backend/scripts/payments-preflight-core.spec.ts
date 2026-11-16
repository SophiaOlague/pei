// Pruebas del preflight de Payments con un cliente PostgreSQL FALSO: no hay conexión ni driver real.
import {
  ANOMALY_CHECKS,
  assertDirectEndpoint,
  DATA_SQL,
  IDENTIFY_ALLOWED_SQL,
  runIdentify,
  userHash,
  assertReportHasNoSecrets,
  databaseUrlFromEnvFile,
  FINGERPRINT_COMPONENTS,
  fingerprintDigest,
  GuardedClient,
  hostHash,
  parseAuthorizedTarget,
  PREFLIGHT_ALLOWED_SQL,
  PREFLIGHT_TABLES,
  PreflightAbort,
  runPreflight,
  SQL_BEGIN,
  SQL_COUNTS,
  SQL_FINGERPRINT,
  SQL_PAYMENT_STATUS_TYPE,
  SQL_ROLLBACK,
  SQL_SESSION_READ_ONLY,
  SQL_SHOW_READ_ONLY,
  SQL_TABLES_PRESENT,
  WRITE_KEYWORDS,
  type AuthorizedTarget,
  type Fingerprint,
  type PgReadClient,
} from './payments-preflight-core';
import { parseArgs, runCli, type CliDeps, type ConnectedClient } from './payments-preflight';

const SECRET_USER = 'svc_secret_user';
const SECRET_PASS = 'Sup3r-S3cr3t-P4ss';
const SECRET_HOST = 'ep-fake-endpoint-123456.c-2.us-east-2.aws.neon.tech';
const URL_ = `postgresql://${SECRET_USER}:${SECRET_PASS}@${SECRET_HOST}/neondb?sslmode=require`;

const ACTUAL: Fingerprint = {
  database: 'neondb',
  system_identifier: '7400000000000000001',
  server_version: '170004',
  current_user: SECRET_USER,
  neon_project_id: 'fake-project-1',
  neon_branch_id: 'br-fake-branch-1',
  neon_endpoint_id: 'ep-fake-endpoint-123456',
  host_sha256_16: hostHash(SECRET_HOST),
};
const authorized = (over: Partial<Fingerprint> = {}): AuthorizedTarget => ({ label: 'C2 (prueba)', fingerprint: { ...ACTUAL, ...over } });

type Answer = Record<string, unknown>[] | Error;
const sqlError = (code: string, message = `fallo en ${SECRET_HOST} para ${SECRET_USER}`) => Object.assign(new Error(message), { code });

class FakePg implements PgReadClient {
  readonly log: string[] = [];
  readonly answers = new Map<string, Answer>();
  constructor(fp: Partial<Record<keyof typeof SQL_FINGERPRINT, unknown>> = {}) {
    this.answers.set(SQL_SHOW_READ_ONLY, [{ transaction_read_only: 'on' }]);
    for (const [k, sql] of Object.entries(SQL_FINGERPRINT)) {
      const v = k in fp ? fp[k as keyof typeof SQL_FINGERPRINT] : ACTUAL[k as keyof Fingerprint];
      this.answers.set(sql, [{ v }]);
    }
    this.answers.set(SQL_TABLES_PRESENT, PREFLIGHT_TABLES.map((t) => ({ table_name: t, present: true })));
    this.answers.set(SQL_COUNTS, [Object.fromEntries(PREFLIGHT_TABLES.map((t) => [t, '0']))]);
    this.answers.set(SQL_PAYMENT_STATUS_TYPE, []);
    for (const sql of Object.values(ANOMALY_CHECKS)) this.answers.set(sql, [{ n: '0', sample: [] }]);
  }
  query(text: string): Promise<{ rows: Record<string, unknown>[] }> {
    this.log.push(text);
    const a = this.answers.get(text);
    if (a instanceof Error) return Promise.reject(a);
    return Promise.resolve({ rows: a ?? [] });
  }
}

const run = (pg: FakePg, target = authorized()) => runPreflight({ databaseUrl: URL_, authorized: target, client: pg, now: () => new Date('2026-11-11T00:00:00Z') });
const failure = (p: Promise<unknown>): Promise<Error> =>
  p.then(() => {
    throw new Error('se esperaba un aborto');
  }, (e: unknown) => e as Error);
const dataSql = new Set<string>([SQL_TABLES_PRESENT, SQL_COUNTS, SQL_PAYMENT_STATUS_TYPE, ...Object.values(ANOMALY_CHECKS)]);

describe('lista de SQL permitido', () => {
  it('no contiene ninguna escritura ni sentencia de control peligrosa', () => {
    for (const sql of PREFLIGHT_ALLOWED_SQL) expect({ sql, write: WRITE_KEYWORDS.test(sql) }).toEqual({ sql, write: false });
  });

  it('cada sentencia empieza por SELECT, SHOW, SET, BEGIN … READ ONLY o ROLLBACK', () => {
    for (const sql of PREFLIGHT_ALLOWED_SQL) {
      expect(/^(SELECT|SHOW|SET (LOCAL|SESSION) |ROLLBACK$)/.test(sql) || sql === SQL_BEGIN).toBe(true);
    }
    expect(SQL_BEGIN).toMatch(/READ ONLY$/);
  });

  it('GuardedClient rechaza cualquier sentencia fuera de la lista sin llegar al driver', async () => {
    const pg = new FakePg();
    const g = new GuardedClient(pg);
    for (const sql of ['INSERT INTO payment DEFAULT VALUES', 'UPDATE payment SET amount = 1', 'DELETE FROM refund', 'COMMIT',
      'SET SESSION default_transaction_read_only = off', 'SELECT 1']) {
      await expect(g.query(sql)).rejects.toThrow('sentencia no permitida');
    }
    expect(pg.log).toEqual([]);
  });

  it('GuardedClient no permite consultas de datos antes de validar la huella ni huella antes del modo de solo lectura', async () => {
    const g = new GuardedClient(new FakePg());
    await expect(g.query(SQL_COUNTS)).rejects.toThrow('antes de validar la huella');
    await expect(g.query(SQL_FINGERPRINT.database)).rejects.toThrow('antes de confirmar la transacción de solo lectura');
  });
});

describe('ejecución correcta', () => {
  it('sigue el orden modo → huella → datos y termina con ROLLBACK, sin escrituras', async () => {
    const pg = new FakePg();
    const report = await run(pg);
    expect(pg.log[0]).toBe(SQL_SESSION_READ_ONLY);
    expect(pg.log[1]).toBe(SQL_BEGIN);
    expect(pg.log.at(-1)).toBe(SQL_ROLLBACK);
    expect(pg.log.every((q) => PREFLIGHT_ALLOWED_SQL.has(q) && !WRITE_KEYWORDS.test(q))).toBe(true);
    const lastFingerprint = Math.max(...Object.values(SQL_FINGERPRINT).map((s) => pg.log.indexOf(s)));
    const firstData = pg.log.findIndex((q) => dataSql.has(q));
    expect(lastFingerprint).toBeLessThan(firstData);
    expect(pg.log.indexOf(SQL_SHOW_READ_ONLY)).toBeLessThan(pg.log.indexOf(SQL_FINGERPRINT.database));
    expect(report.gate).toEqual({ allTablesEmpty: true, anomaliesFound: [], directPathAllowed: true });
    expect(report.fingerprintSha256).toBe(fingerprintDigest(ACTUAL));
  });

  it('registra los estados históricos con su mapeo y marca los no seguros como pendientes', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_PAYMENT_STATUS_TYPE, [
      { status: 'requires_action', type: 'consultation', n: '2' },
      { status: 'succeeded', type: 'consultation', n: '5' },
      { status: 'weird', type: 'medication', n: '1' },
    ]);
    pg.answers.set(SQL_COUNTS, [Object.fromEntries(PREFLIGHT_TABLES.map((t) => [t, t === 'payment' ? '8' : '0']))]);
    const report = await run(pg);
    expect(report.paymentStatusByType.map((r) => [r.status, r.proposed])).toEqual([['requires_action', null], ['succeeded', 'succeeded'], ['weird', null]]);
    expect(report.gate.allTablesEmpty).toBe(false);
    expect(report.gate.directPathAllowed).toBe(false);
  });

  it('una anomalía cierra el camino directo e informa recuento y muestra', async () => {
    const pg = new FakePg();
    pg.answers.set(ANOMALY_CHECKS.payment_doctor_amount_negative, [{ n: '1', sample: ['00000000-0000-0000-0000-000000000001'] }]);
    const report = await run(pg);
    expect(report.anomalies.payment_doctor_amount_negative).toEqual({ n: '1', sample: ['00000000-0000-0000-0000-000000000001'] });
    expect(report.gate.anomaliesFound).toEqual(['payment_doctor_amount_negative']);
    expect(report.gate.directPathAllowed).toBe(false);
  });
});

describe('aborta y no lee datos', () => {
  const expectAbortWithoutData = async (pg: FakePg, message: RegExp, target = authorized()) => {
    await expect(run(pg, target)).rejects.toThrow(message);
    expect(pg.log.some((q) => dataSql.has(q))).toBe(false);
    expect(pg.log.at(-1)).toBe(SQL_ROLLBACK);
  };

  it('si la transacción no es de solo lectura', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_SHOW_READ_ONLY, [{ transaction_read_only: 'off' }]);
    await expectAbortWithoutData(pg, /no es de solo lectura/);
    expect(pg.log.some((q) => Object.values(SQL_FINGERPRINT).includes(q))).toBe(false);
  });

  it.each(Object.keys(SQL_FINGERPRINT))('si falta el componente %s (nulo)', async (component) => {
    await expectAbortWithoutData(new FakePg({ [component]: null }), new RegExp(`huella incompleta: no se obtuvo ${component}`));
  });

  it.each(['', '   '])('si un componente está vacío (%j)', async (value) => {
    await expectAbortWithoutData(new FakePg({ neon_branch_id: value }), /huella incompleta: no se obtuvo neon_branch_id/);
  });

  it('si no hay permiso para obtener un componente (42501), sin sustituirlo por otro dato', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_FINGERPRINT.system_identifier, sqlError('42501'));
    await expectAbortWithoutData(pg, /sin permiso en el paso «huella: system_identifier» \(SQLSTATE 42501\)/);
  });

  it('si una consulta de huella devuelve más de una fila', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_FINGERPRINT.database, [{ v: 'a' }, { v: 'b' }]);
    await expectAbortWithoutData(pg, /exactamente una fila/);
  });

  it.each(FINGERPRINT_COMPONENTS)('si el componente %s no coincide con la huella autorizada', async (component) => {
    await expectAbortWithoutData(new FakePg(), new RegExp(`no coincide con la autorizada.*${component}`), authorized({ [component]: 'otro-valor' }));
  });

  it('si el host de la URL no corresponde al hash autorizado', async () => {
    const pg = new FakePg();
    await expect(runPreflight({ databaseUrl: URL_.replace(SECRET_HOST, 'otro-host.example'), authorized: authorized(), client: pg })).rejects.toThrow(/host_sha256_16/);
    expect(pg.log.some((q) => dataSql.has(q))).toBe(false);
  });

  it('si falta una tabla esperada (después de validar la huella)', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_TABLES_PRESENT, PREFLIGHT_TABLES.map((t) => ({ table_name: t, present: t !== 'refund' })));
    await expect(run(pg)).rejects.toThrow('faltan tablas esperadas: refund');
    expect(pg.log).not.toContain(SQL_COUNTS);
  });
});

describe('no se emiten credenciales', () => {
  const secrets = [URL_, SECRET_USER, SECRET_PASS, SECRET_HOST];

  it('los errores del driver se reducen al SQLSTATE, sin su mensaje', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_FINGERPRINT.database, sqlError('08006'));
    const error = await failure(run(pg));
    expect(error).toBeInstanceOf(PreflightAbort);
    expect(error.message).toContain('SQLSTATE 08006');
    for (const s of secrets) expect(error.message).not.toContain(s);
  });

  it('un error sin código se informa como desconocido, sin su mensaje', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_COUNTS, new Error(`timeout hacia ${SECRET_HOST}`));
    const error = await failure(run(pg));
    expect(error.message).toContain('SQLSTATE desconocido');
    expect(error.message).not.toContain(SECRET_HOST);
  });

  it('el informe no contiene la URL, el host, el usuario ni la contraseña', async () => {
    const report = await run(new FakePg());
    const serialized = JSON.stringify(report);
    for (const s of secrets) expect(serialized).not.toContain(s);
    expect(() => assertReportHasNoSecrets(serialized, URL_)).not.toThrow();
  });

  it('assertReportHasNoSecrets bloquea un informe que incluya datos de la conexión', () => {
    for (const s of [SECRET_HOST, SECRET_USER, SECRET_PASS]) {
      expect(() => assertReportHasNoSecrets(JSON.stringify({ x: s }), URL_)).toThrow('no se emite');
    }
  });

  it('los mensajes de entorno inválido no incluyen el contenido del archivo', () => {
    const twice = `DATABASE_URL=${URL_}\nDATABASE_URL=${URL_}\n`;
    const error = (() => {
      try {
        databaseUrlFromEnvFile(twice);
      } catch (e) {
        return e as Error;
      }
      return null;
    })();
    expect(error?.message).toBe('preflight abortado: DATABASE_URL aparece más de una vez');
  });
});

describe('entradas', () => {
  it('lee DATABASE_URL solo del contenido del archivo, con o sin comillas', () => {
    expect(databaseUrlFromEnvFile(`OTHER=1\nDATABASE_URL="${URL_}"\n`)).toBe(URL_);
    expect(() => databaseUrlFromEnvFile('')).toThrow('no se pudo leer');
    expect(() => databaseUrlFromEnvFile('OTHER=1')).toThrow('falta DATABASE_URL');
    expect(() => databaseUrlFromEnvFile('DATABASE_URL=')).toThrow('vacía');
  });

  it('la huella autorizada exige exactamente los componentes, todos no vacíos, y un rótulo', () => {
    const ok = { label: 'C2', fingerprint: ACTUAL };
    expect(parseAuthorizedTarget(JSON.stringify(ok)).label).toBe('C2');
    expect(() => parseAuthorizedTarget(null)).toThrow('no se pudo leer');
    expect(() => parseAuthorizedTarget('{')).toThrow('JSON válido');
    expect(() => parseAuthorizedTarget(JSON.stringify({ fingerprint: ACTUAL }))).toThrow('rótulo');
    const { neon_branch_id: _omit, ...partial } = ACTUAL;
    expect(() => parseAuthorizedTarget(JSON.stringify({ label: 'C2', fingerprint: partial }))).toThrow('exactamente los componentes');
    expect(() => parseAuthorizedTarget(JSON.stringify({ label: 'C2', fingerprint: { ...ACTUAL, extra: 'x' } }))).toThrow('exactamente los componentes');
    expect(() => parseAuthorizedTarget(JSON.stringify({ label: 'C2', fingerprint: { ...ACTUAL, database: ' ' } }))).toThrow('vacío el componente database');
  });

  it('los argumentos son obligatorios, únicos y sin valores por defecto', () => {
    expect(parseArgs(['--env-file', 'a', '--authorized', 'b', '--out', 'c'])).toEqual({ mode: 'preflight', envFile: 'a', authorized: 'b', out: 'c' });
    expect(() => parseArgs([])).toThrow('--env-file');
    expect(() => parseArgs(['--env-file', 'a', '--authorized', 'b'])).toThrow('--out');
    expect(() => parseArgs(['--env-file', 'a', '--env-file', 'x', '--authorized', 'b', '--out', 'c'])).toThrow('más de una vez');
    expect(() => parseArgs(['--env-file', 'a', '--authorized', 'b', '--out', 'c', '--apply'])).toThrow('no reconocido');
  });
});

// ------------------------------------------------------------------------------------------------------------------
// Modo --identify y ejecutable (runCli), con pg falso.
// ------------------------------------------------------------------------------------------------------------------
const IDENTIFY_SEQUENCE = [
  SQL_SESSION_READ_ONLY,
  SQL_BEGIN,
  "SET LOCAL statement_timeout = '30s'",
  "SET LOCAL lock_timeout = '2s'",
  "SET LOCAL idle_in_transaction_session_timeout = '60s'",
  SQL_SHOW_READ_ONLY,
  ...Object.values(SQL_FINGERPRINT),
  SQL_ROLLBACK,
];
const identify = (pg: FakePg) => runIdentify({ databaseUrl: URL_, client: pg, now: () => new Date('2026-11-11T00:00:00Z') });

describe('modo identify: lista cerrada', () => {
  it('no contiene escrituras ni ninguna consulta de datos y es subconjunto estricto de la del preflight', () => {
    for (const sql of IDENTIFY_ALLOWED_SQL) {
      expect(WRITE_KEYWORDS.test(sql)).toBe(false);
      expect(DATA_SQL.has(sql)).toBe(false);
      expect(PREFLIGHT_ALLOWED_SQL.has(sql)).toBe(true);
    }
    expect(IDENTIFY_ALLOWED_SQL.size).toBeLessThan(PREFLIGHT_ALLOWED_SQL.size);
    expect(new Set(IDENTIFY_SEQUENCE)).toEqual(IDENTIFY_ALLOWED_SQL);
  });

  it('GuardedClient en modo identify rechaza cada consulta de datos sin llegar al driver', async () => {
    const pg = new FakePg();
    const g = new GuardedClient(pg, 'identify');
    g.confirmReadOnly();
    g.markFingerprintValidated();
    for (const sql of DATA_SQL) await expect(g.query(sql)).rejects.toThrow('no permitida por la lista del modo identify');
    expect(pg.log).toEqual([]);
  });
});

describe('modo identify: ejecución', () => {
  it('ejecuta exactamente modo → SHOW → 7 componentes → ROLLBACK, sin ninguna otra sentencia', async () => {
    const pg = new FakePg();
    await identify(pg);
    expect(pg.log).toEqual(IDENTIFY_SEQUENCE);
  });

  it('la salida muestra los componentes no sensibles y solo hashes del host y del usuario', async () => {
    const out = await identify(new FakePg());
    expect(out.components).toEqual({
      database: ACTUAL.database,
      system_identifier: ACTUAL.system_identifier,
      server_version: ACTUAL.server_version,
      neon_project_id: ACTUAL.neon_project_id,
      neon_branch_id: ACTUAL.neon_branch_id,
      neon_endpoint_id: ACTUAL.neon_endpoint_id,
      host_sha256_16: hostHash(SECRET_HOST),
      current_user_sha256_16: userHash(SECRET_USER),
    });
    expect(out.fingerprintSha256).toBe(fingerprintDigest(ACTUAL));
    const serialized = JSON.stringify(out);
    for (const s of [URL_, SECRET_HOST, SECRET_USER, SECRET_PASS]) expect(serialized).not.toContain(s);
  });

  it('authorizedDraft tiene los 8 componentes, con label y current_user vacíos, y no se acepta como autorización', async () => {
    const out = await identify(new FakePg());
    expect(Object.keys(out.authorizedDraft.fingerprint).sort()).toEqual([...FINGERPRINT_COMPONENTS].sort());
    expect(out.authorizedDraft.label).toBe('');
    expect(out.authorizedDraft.fingerprint.current_user).toBe('');
    expect(() => parseAuthorizedTarget(JSON.stringify(out.authorizedDraft))).toThrow(PreflightAbort);
    expect(() => parseAuthorizedTarget(JSON.stringify({ ...out.authorizedDraft, label: 'C2' }))).toThrow('vacío el componente current_user');
  });

  it('userHash y hostHash son deterministas', () => {
    expect(userHash('x')).toBe(userHash('x'));
    expect(userHash('x')).not.toBe(userHash('y'));
    expect(hostHash('h')).toHaveLength(16);
  });

  it('aborta sin consultar la huella si la transacción no es de solo lectura', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_SHOW_READ_ONLY, [{ transaction_read_only: 'off' }]);
    await expect(identify(pg)).rejects.toThrow('no es de solo lectura');
    expect(pg.log.some((q) => Object.values(SQL_FINGERPRINT).includes(q))).toBe(false);
    expect(pg.log.at(-1)).toBe(SQL_ROLLBACK);
  });

  it.each([
    ['42501', /sin permiso en el paso «huella: system_identifier» \(SQLSTATE 42501\)/],
    ['0A000', /fallo en el paso «huella: system_identifier» \(SQLSTATE 0A000\)/],
  ])('si pg_control_system() falla con %s, aborta con el SQLSTATE y hace ROLLBACK', async (code, message) => {
    const pg = new FakePg();
    pg.answers.set(SQL_FINGERPRINT.system_identifier, sqlError(code));
    const error = await failure(identify(pg));
    expect(error.message).toMatch(message);
    for (const s of [SECRET_HOST, SECRET_USER]) expect(error.message).not.toContain(s);
    expect(pg.log.at(-1)).toBe(SQL_ROLLBACK);
  });

  it.each(Object.keys(SQL_FINGERPRINT))('aborta si el componente %s falta', async (component) => {
    await expect(identify(new FakePg({ [component]: null }))).rejects.toThrow(`huella incompleta: no se obtuvo ${component}`);
  });

  it('aborta si un componente devuelve más de una fila', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_FINGERPRINT.server_version, [{ v: '1' }, { v: '2' }]);
    await expect(identify(pg)).rejects.toThrow('exactamente una fila');
  });

  it('no informa éxito si el ROLLBACK falla', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_ROLLBACK, sqlError('08006'));
    await expect(identify(pg)).rejects.toThrow('fallo en el paso «rollback» (SQLSTATE 08006)');
  });
});

describe('endpoint directo', () => {
  it('rechaza el pooler y acepta el endpoint directo, sin revelar el host', () => {
    const pooler = URL_.replace('ep-fake-endpoint-123456.', 'ep-fake-endpoint-123456-pooler.');
    expect(() => assertDirectEndpoint(pooler)).toThrow(new PreflightAbort('la URL apunta al pooler; se requiere el endpoint directo'));
    expect(() => assertDirectEndpoint(URL_)).not.toThrow();
  });

  it('el preflight tampoco informa éxito si el ROLLBACK falla', async () => {
    const pg = new FakePg();
    pg.answers.set(SQL_ROLLBACK, sqlError('08006'));
    await expect(run(pg)).rejects.toThrow('«rollback»');
  });
});

describe('runCli', () => {
  const POOLER = URL_.replace('ep-fake-endpoint-123456.', 'ep-fake-endpoint-123456-pooler.');
  const AUTH_JSON = JSON.stringify({ label: 'C2 (prueba)', fingerprint: ACTUAL });

  interface HarnessOptions {
    url?: string;
    pg?: FakePg;
    connectError?: Error;
    endError?: Error;
    writeError?: boolean;
  }
  const harness = (opts: HarnessOptions = {}) => {
    const pg = opts.pg ?? new FakePg();
    const state = { connected: 0, ended: 0, written: [] as [string, string][], logs: [] as string[] };
    const files: Record<string, string> = { env: `DATABASE_URL=${opts.url ?? URL_}\n`, auth: AUTH_JSON };
    const deps: CliDeps = {
      readFile: (p) => files[p] ?? null,
      writeFile: (p, c) => {
        if (opts.writeError) throw new Error(`EACCES ${SECRET_HOST}`);
        state.written.push([p, c]);
      },
      connect: (): Promise<ConnectedClient> => {
        state.connected += 1;
        if (opts.connectError) return Promise.reject(opts.connectError);
        return Promise.resolve({
          query: (t: string) => pg.query(t),
          end: () => {
            state.ended += 1;
            return opts.endError ? Promise.reject(opts.endError) : Promise.resolve();
          },
        });
      },
      log: (l) => state.logs.push(l),
    };
    return { pg, state, deps };
  };
  const withAnswer = (sql: string, answer: Answer) => {
    const pg = new FakePg();
    pg.answers.set(sql, answer);
    return harness({ pg });
  };
  const IDENTIFY_ARGS = ['--identify', '--env-file', 'env', '--out', 'out.json'];
  const PREFLIGHT_ARGS = ['--env-file', 'env', '--authorized', 'auth', '--out', 'out.json'];
  const noSecrets = (text: string) => {
    for (const s of [URL_, SECRET_HOST, SECRET_USER, SECRET_PASS]) expect(text).not.toContain(s);
  };

  it('identify correcto: escribe la salida, cierra la conexión y solo entonces informa éxito', async () => {
    const h = harness();
    await runCli(IDENTIFY_ARGS, h.deps);
    expect(h.state).toMatchObject({ connected: 1, ended: 1 });
    expect(h.state.written).toHaveLength(1);
    expect(h.state.logs).toHaveLength(1);
    expect(h.state.logs[0]).toContain('identificación completada');
    noSecrets(h.state.written[0][1] + h.state.logs[0]);
    expect(h.pg.log).toEqual(IDENTIFY_SEQUENCE);
  });

  it('preflight correcto: escribe el informe y cierra la conexión', async () => {
    const h = harness();
    await runCli(PREFLIGHT_ARGS, h.deps);
    expect(h.state).toMatchObject({ connected: 1, ended: 1 });
    expect(h.state.logs[0]).toContain('preflight completado');
    noSecrets(h.state.written[0][1] + h.state.logs[0]);
  });

  it.each([
    ['identify', IDENTIFY_ARGS],
    ['preflight', PREFLIGHT_ARGS],
  ])('%s rechaza el pooler antes de connect()', async (_mode, args) => {
    const h = harness({ url: POOLER });
    await expect(runCli(args, h.deps)).rejects.toThrow('pooler');
    expect(h.state.connected).toBe(0);
    expect(h.state.logs).toEqual([]);
  });

  it('un fallo de connect() solo informa el SQLSTATE', async () => {
    const h = harness({ connectError: sqlError('28P01') });
    const error = await failure(runCli(IDENTIFY_ARGS, h.deps));
    expect(error.message).toBe('preflight abortado: no se pudo conectar (SQLSTATE 28P01)');
    expect(h.state.logs).toEqual([]);
  });

  const failingCases: [string, () => ReturnType<typeof harness>, RegExp][] = [
    ['fallo de SHOW', () => withAnswer(SQL_SHOW_READ_ONLY, sqlError('57P01')), /modo de solo lectura/],
    ['fallo de huella', () => withAnswer(SQL_FINGERPRINT.system_identifier, sqlError('42501')), /42501/],
    ['fallo de ROLLBACK', () => withAnswer(SQL_ROLLBACK, sqlError('08006')), /rollback/],
    ['fallo de escritura', () => harness({ writeError: true }), /no se pudo escribir el archivo de salida/],
    ['fallo al cerrar la conexión', () => harness({ endError: sqlError('08003') }), /no se pudo cerrar la conexión \(SQLSTATE 08003\)/],
  ];

  it.each(failingCases)('%s: no informa éxito, cierra la conexión y no revela datos', async (_name, make, message) => {
    const h = make();
    const error = await failure(runCli(IDENTIFY_ARGS, h.deps));
    expect(error).toBeInstanceOf(PreflightAbort);
    expect(error.message).toMatch(message);
    noSecrets(error.message);
    expect(h.state.logs).toEqual([]);
    expect(h.state.ended).toBe(1);
  });

  it('un fallo de escritura del preflight tampoco informa éxito', async () => {
    const h = harness({ writeError: true });
    await expect(runCli(PREFLIGHT_ARGS, h.deps)).rejects.toThrow('no se pudo escribir');
    expect(h.state.logs).toEqual([]);
    expect(h.state.ended).toBe(1);
  });
});

describe('argumentos de los dos modos', () => {
  it('identify exige --env-file y --out, y rechaza --authorized, repetidos y desconocidos', () => {
    expect(parseArgs(['--identify', '--env-file', 'a', '--out', 'b'])).toEqual({ mode: 'identify', envFile: 'a', out: 'b' });
    expect(() => parseArgs(['--identify', '--out', 'b'])).toThrow('--env-file');
    expect(() => parseArgs(['--identify', '--env-file', 'a'])).toThrow('--out');
    expect(() => parseArgs(['--identify', '--env-file', 'a', '--authorized', 'x', '--out', 'b'])).toThrow('--identify no admite --authorized');
    expect(() => parseArgs(['--identify', '--identify', '--env-file', 'a', '--out', 'b'])).toThrow('más de una vez');
    expect(() => parseArgs(['--identify', '--env-file', 'a', '--out', 'b', '--apply'])).toThrow('no reconocido');
  });
});
