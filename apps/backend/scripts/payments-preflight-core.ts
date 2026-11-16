// Preflight de Payments, paso 0 de la Fase 1 (Payments-decisiones.md §3.7). Es de SOLO LECTURA y no contiene datos de
// ningún destino: la huella autorizada llega en un archivo aparte.
//
// Garantías (probadas en payments-preflight-core.spec.ts con un cliente pg falso):
// 1. Solo se ejecutan las sentencias de PREFLIGHT_ALLOWED_SQL. Cualquier otra se rechaza antes de llegar al driver, y
//    la lista no contiene escrituras.
// 2. Todo ocurre en UNA transacción BEGIN … READ ONLY, verificada con SHOW transaction_read_only. Siempre termina con
//    ROLLBACK.
// 3. Ninguna consulta de datos se ejecuta antes de validar la huella COMPLETA. Se aborta si falta un componente, si
//    está vacío, si no hay permiso para obtenerlo o si no coincide con la huella autorizada.
// 4. Nada de lo que se emite incluye la URL, el host, el usuario ni el mensaje del driver. Solo el paso y el SQLSTATE.
import { createHash } from 'crypto';

export class PreflightAbort extends Error {
  constructor(reason: string) {
    super(`preflight abortado: ${reason}`);
    this.name = 'PreflightAbort';
  }
}

export interface PgReadClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

// ---------------------------------------------------------------------------------------------------------------
// Entorno: DATABASE_URL solo del archivo indicado (sin process.env ni dotenv), exactamente una definición.
// ---------------------------------------------------------------------------------------------------------------
export function databaseUrlFromEnvFile(content: string | null | undefined): string {
  if (!content) throw new PreflightAbort('no se pudo leer el archivo de entorno indicado');
  const lines = content.split(/\r?\n/).filter((l) => /^\s*DATABASE_URL\s*=/.test(l));
  if (lines.length !== 1) throw new PreflightAbort(lines.length === 0 ? 'falta DATABASE_URL en el archivo de entorno' : 'DATABASE_URL aparece más de una vez');
  const raw = lines[0].slice(lines[0].indexOf('=') + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
  if (!raw) throw new PreflightAbort('DATABASE_URL vacía');
  return raw;
}

// Host de la URL. Solo se usa para calcular su hash; nunca se emite.
export function hostOf(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PreflightAbort('DATABASE_URL no es una URL válida');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') throw new PreflightAbort('DATABASE_URL no es una URL de PostgreSQL');
  if (!parsed.hostname) throw new PreflightAbort('DATABASE_URL sin host');
  return parsed.hostname.toLowerCase();
}

export const hostHash = (host: string): string => createHash('sha256').update(host, 'utf8').digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------------------------------------------
// Huella del destino
// ---------------------------------------------------------------------------------------------------------------
export const FINGERPRINT_COMPONENTS = [
  'database',
  'system_identifier',
  'server_version',
  'current_user',
  'neon_project_id',
  'neon_branch_id',
  'neon_endpoint_id',
  'host_sha256_16',
] as const;
export type FingerprintComponent = (typeof FINGERPRINT_COMPONENTS)[number];
export type Fingerprint = Record<FingerprintComponent, string>;

// La huella autorizada: un objeto con EXACTAMENTE los componentes, todos cadenas no vacías y un rótulo del destino.
export interface AuthorizedTarget {
  label: string;
  fingerprint: Fingerprint;
}

export function parseAuthorizedTarget(content: string | null | undefined): AuthorizedTarget {
  if (!content) throw new PreflightAbort('no se pudo leer la huella autorizada');
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new PreflightAbort('la huella autorizada no es JSON válido');
  }
  const obj = data as { label?: unknown; fingerprint?: Record<string, unknown> };
  if (typeof obj?.label !== 'string' || !obj.label.trim()) throw new PreflightAbort('la huella autorizada no tiene rótulo');
  const fp = obj.fingerprint;
  if (!fp || typeof fp !== 'object') throw new PreflightAbort('la huella autorizada no tiene componentes');
  const keys = Object.keys(fp).sort();
  const expected = [...FINGERPRINT_COMPONENTS].sort();
  if (keys.length !== expected.length || keys.some((k, i) => k !== expected[i])) {
    throw new PreflightAbort('la huella autorizada debe tener exactamente los componentes requeridos');
  }
  for (const c of FINGERPRINT_COMPONENTS) {
    if (typeof fp[c] !== 'string' || !(fp[c] as string).trim()) throw new PreflightAbort(`la huella autorizada tiene vacío el componente ${c}`);
  }
  return { label: obj.label.trim(), fingerprint: fp as Fingerprint };
}

export const fingerprintDigest = (fp: Fingerprint): string =>
  createHash('sha256').update(FINGERPRINT_COMPONENTS.map((c) => `${c}=${fp[c]}`).join('\n'), 'utf8').digest('hex');

// ---------------------------------------------------------------------------------------------------------------
// SQL permitido (lista cerrada)
// ---------------------------------------------------------------------------------------------------------------
export const SQL_BEGIN = 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY';
export const SQL_ROLLBACK = 'ROLLBACK';
export const SQL_SESSION_READ_ONLY = 'SET SESSION default_transaction_read_only = on';
export const SQL_TIMEOUTS = ["SET LOCAL statement_timeout = '30s'", "SET LOCAL lock_timeout = '2s'", "SET LOCAL idle_in_transaction_session_timeout = '60s'"] as const;
export const SQL_SHOW_READ_ONLY = 'SHOW transaction_read_only';

// Cada componente sale de una sentencia separada, para que un permiso denegado identifique cuál falló.
export const SQL_FINGERPRINT: Record<Exclude<FingerprintComponent, 'host_sha256_16'>, string> = {
  database: 'SELECT current_database()::text AS v',
  system_identifier: 'SELECT system_identifier::text AS v FROM pg_control_system()',
  server_version: "SELECT current_setting('server_version_num') AS v",
  current_user: 'SELECT current_user::text AS v',
  neon_project_id: "SELECT current_setting('neon.project_id', true) AS v",
  neon_branch_id: "SELECT current_setting('neon.branch_id', true) AS v",
  neon_endpoint_id: "SELECT current_setting('neon.endpoint_id', true) AS v",
};

export const PREFLIGHT_TABLES = [
  'payment',
  'refund',
  'stripe_webhook_event',
  'stripe_connect_account',
  'stripe_payment_method',
  'consultation_commission_configuration',
  'doctor_payout',
  'doctor_payout_item',
  'doctor_payout_adjustment',
  'doctor_payout_adjustment_application',
] as const;

export const SQL_TABLES_PRESENT = `SELECT t AS table_name, to_regclass('public.' || quote_ident(t)) IS NOT NULL AS present
  FROM unnest(ARRAY[${PREFLIGHT_TABLES.map((t) => `'${t}'`).join(', ')}]::text[]) AS t`;

export const SQL_COUNTS = `SELECT ${PREFLIGHT_TABLES.map((t) => `(SELECT count(*) FROM public."${t}")::bigint::text AS "${t}"`).join(',\n  ')}`;

export const SQL_PAYMENT_STATUS_TYPE = `SELECT status::text AS status, type::text AS type, count(*)::bigint::text AS n
  FROM public.payment GROUP BY 1, 2 ORDER BY 1, 2`;

export const ANOMALY_SAMPLE = 20;
const anomaly = (from: string) =>
  `SELECT count(*)::bigint::text AS n, coalesce((array_agg(id::text ORDER BY id))[1:${ANOMALY_SAMPLE}], ARRAY[]::text[]) AS sample FROM (${from}) q`;

// Comprobaciones de §3.7. Cada una devuelve un recuento y hasta ANOMALY_SAMPLE ids técnicos (uuid).
export const ANOMALY_CHECKS = {
  payment_doctor_amount_negative: anomaly('SELECT id FROM public.payment WHERE doctor_amount < 0'),
  payment_platform_amount_negative: anomaly('SELECT id FROM public.payment WHERE platform_amount < 0'),
  payment_consultation_split_mismatch: anomaly(
    "SELECT id FROM public.payment WHERE type = 'consultation' AND doctor_amount + platform_amount <> amount",
  ),
  payment_medication_doctor_amount_nonzero: anomaly("SELECT id FROM public.payment WHERE type = 'medication' AND doctor_amount <> 0"),
  payment_pending_or_requires_action: anomaly("SELECT id FROM public.payment WHERE status::text IN ('pending', 'requires_action')"),
  payment_status_outside_known: anomaly(
    "SELECT id FROM public.payment WHERE status::text NOT IN ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')",
  ),
  refund_total_exceeds_payment: anomaly(`SELECT p.id FROM public.payment p
    JOIN public.refund r ON r.payment_id = p.id AND r.status::text NOT IN ('failed', 'canceled')
    GROUP BY p.id, p.amount HAVING sum(r.amount) > p.amount`),
  refund_on_payment_not_succeeded: anomaly(`SELECT r.id FROM public.refund r JOIN public.payment p ON p.id = r.payment_id
    WHERE p.status::text <> 'succeeded'`),
  payment_succeeded_with_refunds: anomaly(`SELECT p.id FROM public.payment p WHERE p.status::text = 'succeeded'
    AND EXISTS (SELECT 1 FROM public.refund r WHERE r.payment_id = p.id)`),
  item_payment_not_consultation_or_not_succeeded: anomaly(`SELECT i.id FROM public.doctor_payout_item i
    JOIN public.payment p ON p.id = i.payment_id WHERE p.type::text <> 'consultation' OR p.status::text <> 'succeeded'`),
  item_amount_differs_from_doctor_amount: anomaly(`SELECT i.id FROM public.doctor_payout_item i
    JOIN public.payment p ON p.id = i.payment_id WHERE i.amount <> p.doctor_amount`),
  item_doctor_mismatch_with_payout: anomaly(`SELECT i.id FROM public.doctor_payout_item i
    JOIN public.payment p ON p.id = i.payment_id JOIN public.doctor_payout d ON d.id = i.payout_id
    WHERE p.doctor_id IS DISTINCT FROM d.doctor_id`),
  item_revoked_without_date: anomaly(
    "SELECT id FROM public.doctor_payout_item WHERE eligibility_status::text = 'revoked' AND eligibility_revoked_at IS NULL",
  ),
  item_revoked_with_adjustments: anomaly(`SELECT i.id FROM public.doctor_payout_item i
    WHERE i.eligibility_status::text = 'revoked'
      AND EXISTS (SELECT 1 FROM public.doctor_payout_adjustment a WHERE a.doctor_payout_item_id = i.id)`),
  adjustment_refund_or_chargeback_without_item: anomaly(`SELECT id FROM public.doctor_payout_adjustment
    WHERE type::text IN ('refund_reversal', 'chargeback') AND doctor_payout_item_id IS NULL`),
  adjustment_correction_or_other: anomaly("SELECT id FROM public.doctor_payout_adjustment WHERE type::text IN ('correction', 'other')"),
  adjustment_source_payout_doctor_mismatch: anomaly(`SELECT a.id FROM public.doctor_payout_adjustment a
    JOIN public.doctor_payout d ON d.id = a.source_payout_id WHERE d.doctor_id <> a.doctor_id`),
  adjustment_reversals_exceed_item: anomaly(`SELECT i.id FROM public.doctor_payout_item i
    JOIN public.doctor_payout_adjustment a ON a.doctor_payout_item_id = i.id AND a.type::text IN ('refund_reversal', 'chargeback')
    GROUP BY i.id, i.amount HAVING abs(sum(a.amount)) > i.amount`),
  application_exceeds_adjustment: anomaly(`SELECT a.id FROM public.doctor_payout_adjustment a
    JOIN public.doctor_payout_adjustment_application x ON x.adjustment_id = a.id
    GROUP BY a.id, a.amount HAVING abs(sum(x.amount)) > abs(a.amount)`),
  application_sign_mismatch: anomaly(`SELECT x.id FROM public.doctor_payout_adjustment_application x
    JOIN public.doctor_payout_adjustment a ON a.id = x.adjustment_id WHERE sign(x.amount) <> sign(a.amount)`),
  application_doctor_mismatch: anomaly(`SELECT x.id FROM public.doctor_payout_adjustment_application x
    JOIN public.doctor_payout_adjustment a ON a.id = x.adjustment_id
    JOIN public.doctor_payout d ON d.id = x.applied_payout_id WHERE d.doctor_id <> a.doctor_id`),
  payout_gross_differs_from_items: anomaly(`SELECT d.id FROM public.doctor_payout d
    WHERE d.gross_amount <> coalesce((SELECT sum(i.amount) FROM public.doctor_payout_item i WHERE i.payout_id = d.id), 0)`),
  payout_adjustment_differs_from_applications: anomaly(`SELECT d.id FROM public.doctor_payout d
    WHERE d.adjustment_amount <> coalesce((SELECT sum(x.amount) FROM public.doctor_payout_adjustment_application x
      WHERE x.applied_payout_id = d.id), 0)`),
  payout_net_differs_from_gross_plus_adjustment: anomaly(
    'SELECT id FROM public.doctor_payout WHERE net_amount <> gross_amount + adjustment_amount',
  ),
  payout_paid_transferred_differs_from_net: anomaly(
    "SELECT id FROM public.doctor_payout WHERE status::text = 'paid' AND transferred_amount <> net_amount",
  ),
  payout_paid_with_pending_adjustments: anomaly(`SELECT d.id FROM public.doctor_payout d
    WHERE d.status::text = 'paid' AND EXISTS (
      SELECT 1 FROM public.doctor_payout_item i JOIN public.doctor_payout_adjustment a ON a.doctor_payout_item_id = i.id
      WHERE i.payout_id = d.id
        AND abs(a.amount) > abs(coalesce((SELECT sum(x.amount) FROM public.doctor_payout_adjustment_application x
          WHERE x.adjustment_id = a.id), 0)))`),
} as const;
export type AnomalyCheck = keyof typeof ANOMALY_CHECKS;

export const PREFLIGHT_ALLOWED_SQL: ReadonlySet<string> = new Set([
  SQL_SESSION_READ_ONLY,
  SQL_BEGIN,
  ...SQL_TIMEOUTS,
  SQL_SHOW_READ_ONLY,
  ...Object.values(SQL_FINGERPRINT),
  SQL_TABLES_PRESENT,
  SQL_COUNTS,
  SQL_PAYMENT_STATUS_TYPE,
  ...Object.values(ANOMALY_CHECKS),
  SQL_ROLLBACK,
]);

// Modo --identify: lista cerrada SIN ninguna consulta de datos. Solo el modo de solo lectura y la huella.
export const IDENTIFY_ALLOWED_SQL: ReadonlySet<string> = new Set([
  SQL_SESSION_READ_ONLY,
  SQL_BEGIN,
  ...SQL_TIMEOUTS,
  SQL_SHOW_READ_ONLY,
  ...Object.values(SQL_FINGERPRINT),
  SQL_ROLLBACK,
]);

const FINGERPRINT_SQL = new Set<string>(Object.values(SQL_FINGERPRINT));
export const DATA_SQL: ReadonlySet<string> = new Set<string>([SQL_TABLES_PRESENT, SQL_COUNTS, SQL_PAYMENT_STATUS_TYPE, ...Object.values(ANOMALY_CHECKS)]);

// Palabras que nunca deben aparecer en el SQL permitido (comprobado por prueba sobre la lista completa).
export const WRITE_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|TRUNCATE|COPY|ALTER|DROP|CREATE|GRANT|REVOKE|COMMIT|VACUUM|REINDEX|CLUSTER|LOCK|CALL|DO|NOTIFY|LISTEN|SECURITY|PREPARE|EXECUTE|COMMENT|REFRESH|IMPORT|nextval|setval|pg_terminate_backend|pg_cancel_backend|lo_import|lo_export|lo_unlink|dblink\w*)\b/i;

// Envuelve el cliente: rechaza cualquier SQL fuera de la lista, toda consulta de datos antes de validar la huella y
// toda consulta de huella antes de confirmar el modo de solo lectura.
export type GuardMode = 'preflight' | 'identify';

export class GuardedClient {
  private readOnlyConfirmed = false;
  private fingerprintValidated = false;
  readonly executed: string[] = [];
  constructor(
    private readonly inner: PgReadClient,
    private readonly mode: GuardMode = 'preflight',
  ) {}

  confirmReadOnly() {
    this.readOnlyConfirmed = true;
  }
  markFingerprintValidated() {
    this.fingerprintValidated = true;
  }

  async query(text: string): Promise<{ rows: Record<string, unknown>[] }> {
    const allowed = this.mode === 'identify' ? IDENTIFY_ALLOWED_SQL : PREFLIGHT_ALLOWED_SQL;
    if (!allowed.has(text) || WRITE_KEYWORDS.test(text)) throw new PreflightAbort(`sentencia no permitida por la lista del modo ${this.mode}`);
    if (this.mode === 'identify' && DATA_SQL.has(text)) throw new PreflightAbort('consulta de datos no permitida en modo identify');
    if (FINGERPRINT_SQL.has(text) && !this.readOnlyConfirmed) throw new PreflightAbort('consulta de huella antes de confirmar la transacción de solo lectura');
    if (DATA_SQL.has(text) && !this.fingerprintValidated) throw new PreflightAbort('consulta de datos antes de validar la huella');
    this.executed.push(text);
    return this.inner.query(text);
  }
}

// Mensaje seguro de un error del driver: solo el SQLSTATE, nunca el texto (puede llevar host, usuario o valores).
export function sqlState(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : 'desconocido';
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof PreflightAbort) throw error;
    const code = sqlState(error);
    if (code === '42501') throw new PreflightAbort(`sin permiso en el paso «${name}» (SQLSTATE 42501)`);
    throw new PreflightAbort(`fallo en el paso «${name}» (SQLSTATE ${code})`);
  }
}

const single = (rows: Record<string, unknown>[], what: string): Record<string, unknown> => {
  if (rows.length !== 1) throw new PreflightAbort(`${what}: se esperaba exactamente una fila`);
  return rows[0];
};

export async function readFingerprint(client: GuardedClient, databaseUrl: string): Promise<Fingerprint> {
  const fp: Partial<Fingerprint> = {};
  for (const [component, sql] of Object.entries(SQL_FINGERPRINT) as [Exclude<FingerprintComponent, 'host_sha256_16'>, string][]) {
    const row = await step(`huella: ${component}`, async () => single((await client.query(sql)).rows, `huella: ${component}`));
    const v = row.v;
    if (typeof v !== 'string' || !v.trim()) throw new PreflightAbort(`huella incompleta: no se obtuvo ${component}`);
    fp[component] = v.trim();
  }
  fp.host_sha256_16 = hostHash(hostOf(databaseUrl));
  return fp as Fingerprint;
}

export function assertFingerprintMatches(actual: Fingerprint, authorized: AuthorizedTarget): void {
  const mismatched = FINGERPRINT_COMPONENTS.filter((c) => actual[c] !== authorized.fingerprint[c]);
  if (mismatched.length > 0) throw new PreflightAbort(`la huella no coincide con la autorizada para «${authorized.label}» (componentes: ${mismatched.join(', ')})`);
}

// ---------------------------------------------------------------------------------------------------------------
// Estados históricos (§3.7): mapeo propuesto; los no seguros quedan pendientes de decisión.
// ---------------------------------------------------------------------------------------------------------------
export const HISTORICAL_STATUS_MAPPING: Readonly<Record<string, { internal: string | null; note: string }>> = Object.freeze({
  succeeded: { internal: 'succeeded', note: 'seguro; si tiene reembolsos, pendiente de decisión' },
  failed: { internal: 'failed', note: 'seguro' },
  canceled: { internal: 'canceled', note: 'seguro' },
  pending: { internal: null, note: 'pendiente de decisión: la migración aborta' },
  requires_action: { internal: null, note: 'pendiente de decisión: la migración aborta' },
});

export interface PreflightReport {
  target: string;
  fingerprintSha256: string;
  readOnly: true;
  takenAt: string;
  counts: Record<string, string>;
  paymentStatusByType: { status: string; type: string; n: string; proposed: string | null; note: string }[];
  anomalies: Record<AnomalyCheck, { n: string; sample: string[] }>;
  gate: { allTablesEmpty: boolean; anomaliesFound: AnomalyCheck[]; directPathAllowed: boolean };
}

export interface PreflightDeps {
  databaseUrl: string;
  authorized: AuthorizedTarget;
  client: PgReadClient;
  now?: () => Date;
}

// Abre la transacción de solo lectura, confirma el modo y ejecuta `body`. Siempre termina con ROLLBACK. Si el ROLLBACK
// falla tras un `body` correcto, el resultado se descarta y se aborta: nunca se informa éxito sin ROLLBACK confirmado.
// Si `body` falla, prevalece su error (el ROLLBACK se intenta igualmente).
export async function withReadOnlyTransaction<T>(client: GuardedClient, body: () => Promise<T>): Promise<T> {
  await step('sesión de solo lectura', () => client.query(SQL_SESSION_READ_ONLY));
  await step('inicio de transacción', () => client.query(SQL_BEGIN));
  let result: T;
  try {
    for (const sql of SQL_TIMEOUTS) await step('límites de tiempo', () => client.query(sql));
    const ro = await step('modo de solo lectura', async () => single((await client.query(SQL_SHOW_READ_ONLY)).rows, 'modo de solo lectura'));
    if (ro.transaction_read_only !== 'on') throw new PreflightAbort('la transacción no es de solo lectura');
    client.confirmReadOnly();
    result = await body();
  } catch (error) {
    await client.query(SQL_ROLLBACK).catch(() => undefined);
    throw error;
  }
  await step('rollback', () => client.query(SQL_ROLLBACK));
  return result;
}

// Una sola transacción READ ONLY: modo → huella → validación → datos. Siempre ROLLBACK.
export async function runPreflight(deps: PreflightDeps): Promise<PreflightReport> {
  const now = deps.now ?? (() => new Date());
  const client = new GuardedClient(deps.client, 'preflight');
  return withReadOnlyTransaction(client, async () => {
    const fingerprint = await readFingerprint(client, deps.databaseUrl);
    assertFingerprintMatches(fingerprint, deps.authorized);
    client.markFingerprintValidated();

    const present = await step('tablas', async () => (await client.query(SQL_TABLES_PRESENT)).rows);
    const missing = PREFLIGHT_TABLES.filter((t) => !present.some((r) => r.table_name === t && r.present === true));
    if (missing.length > 0) throw new PreflightAbort(`faltan tablas esperadas: ${missing.join(', ')}`);

    const countRow = await step('conteos', async () => single((await client.query(SQL_COUNTS)).rows, 'conteos'));
    const counts: Record<string, string> = {};
    for (const t of PREFLIGHT_TABLES) {
      if (typeof countRow[t] !== 'string') throw new PreflightAbort(`conteo inválido para ${t}`);
      counts[t] = countRow[t] as string;
    }

    const statusRows = await step('estados de pago', async () => (await client.query(SQL_PAYMENT_STATUS_TYPE)).rows);
    const paymentStatusByType = statusRows.map((r) => {
      const status = String(r.status);
      const m = HISTORICAL_STATUS_MAPPING[status];
      return { status, type: String(r.type), n: String(r.n), proposed: m?.internal ?? null, note: m?.note ?? 'estado desconocido: pendiente de decisión' };
    });

    const anomalies = {} as PreflightReport['anomalies'];
    for (const [name, sql] of Object.entries(ANOMALY_CHECKS) as [AnomalyCheck, string][]) {
      const row = await step(`comprobación ${name}`, async () => single((await client.query(sql)).rows, name));
      const sample = Array.isArray(row.sample) ? row.sample.map(String) : [];
      anomalies[name] = { n: String(row.n), sample };
    }

    const allTablesEmpty = PREFLIGHT_TABLES.every((t) => counts[t] === '0');
    const anomaliesFound = (Object.keys(anomalies) as AnomalyCheck[]).filter((k) => anomalies[k].n !== '0');
    return {
      target: deps.authorized.label,
      fingerprintSha256: fingerprintDigest(fingerprint),
      readOnly: true,
      takenAt: now().toISOString(),
      counts,
      paymentStatusByType,
      anomalies,
      gate: { allTablesEmpty, anomaliesFound, directPathAllowed: allTablesEmpty && anomaliesFound.length === 0 },
    };
  });
}

// El informe solo puede contener lo que se declara arriba. Esta comprobación final impide emitir algo que coincida
// con la URL, el host o el usuario de la conexión.
export function assertReportHasNoSecrets(serialized: string, databaseUrl: string): void {
  const secrets = new Set<string>();
  try {
    const u = new URL(databaseUrl);
    for (const s of [databaseUrl, u.hostname, u.username, decodeURIComponent(u.password), u.password, u.host]) if (s && s.length >= 3) secrets.add(s);
  } catch {
    secrets.add(databaseUrl);
  }
  for (const s of secrets) if (serialized.includes(s)) throw new PreflightAbort('el informe contendría datos de la conexión; no se emite');
}

// ---------------------------------------------------------------------------------------------------------------
// Endpoint directo (ambos modos): se comprueba ANTES de connect(). Con el pooler de Neon (modo transacción), el
// SET SESSION podría quedar en una conexión compartida y la sesión validada no sería necesariamente la que lee.
// ---------------------------------------------------------------------------------------------------------------
export function assertDirectEndpoint(databaseUrl: string): void {
  const first = hostOf(databaseUrl).split('.')[0];
  if (first.endsWith('-pooler')) throw new PreflightAbort('la URL apunta al pooler; se requiere el endpoint directo');
}

export const userHash = (user: string): string => createHash('sha256').update(user, 'utf8').digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------------------------------------------
// Modo --identify: obtiene la huella para que la responsable construya la huella autorizada. No consulta datos.
// `authorizedDraft` es una plantilla INCOMPLETA (label y current_user vacíos): parseAuthorizedTarget la rechaza.
// ---------------------------------------------------------------------------------------------------------------
export interface IdentifyReport {
  mode: 'identify';
  takenAt: string;
  fingerprintSha256: string;
  components: Omit<Fingerprint, 'current_user'> & { current_user_sha256_16: string };
  authorizedDraft: { label: ''; fingerprint: Fingerprint };
  note: string;
}

export async function runIdentify(deps: { databaseUrl: string; client: PgReadClient; now?: () => Date }): Promise<IdentifyReport> {
  const now = deps.now ?? (() => new Date());
  const client = new GuardedClient(deps.client, 'identify');
  const fp = await withReadOnlyTransaction(client, () => readFingerprint(client, deps.databaseUrl));
  const { current_user, ...visible } = fp;
  return {
    mode: 'identify',
    takenAt: now().toISOString(),
    fingerprintSha256: fingerprintDigest(fp),
    components: { ...visible, current_user_sha256_16: userHash(current_user) },
    authorizedDraft: { label: '', fingerprint: { ...fp, current_user: '' } },
    note: 'Plantilla incompleta: escriba el rótulo y el rol (verificado contra current_user_sha256_16) y confirme los ids de Neon en la consola. No es una autorización.',
  };
}
