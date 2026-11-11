import { createHash } from 'crypto';
import type { PgSnapshot, PgTableFingerprint, RunTarget } from './c2-evidence';
import { verifyNeonRuntimeIdentity, type C2BranchTarget } from './c2-target-guard';

// Huella de PostgreSQL de las ejecuciones C2 (activación de pg-before.json / pg-after.json, 2026-11-10).
//
// Tablas: las 13 de la huella de solo lectura documentada en docs/testing/trazabilidad/M03-doctors.md («Validación con
// infraestructura real en la rama C2 persistente», 2026-11-03) y usada en la validación de R2 del 2026-11-04.
//
// Cálculo (determinista, sin filas en la evidencia):
// - Cada fila se serializa EN PostgreSQL con to_jsonb(fila)::text: todas las columnas, con su nombre; NULL es `null`
//   (distinto de "" o de una columna ausente); numeric conserva su precisión exacta; json/jsonb canónicos; fechas en
//   ISO 8601. Las opciones de sesión que afectan al texto se fijan con SET LOCAL (TimeZone UTC, bytea hex, …).
// - hash de fila = md5(texto). Hash de la tabla = md5(«total» + «\n» + hashes de fila ORDENADOS + «\n»…): no depende
//   del orden físico de lectura y cambia con cualquier fila, columna o recuento (es un multiconjunto).
// - Lectura por bloques con un cursor dentro de una transacción READ ONLY; solo se guardan los hashes de fila.
// - Antes de leer, la misma transacción confirma la identidad real de Neon (proyecto, rama y endpoint de C2).
// - `preexisting` cuenta las filas con created_at anterior al corte (byCreatedAt) o, sin esa columna, el total.

export const PG_FINGERPRINT_TABLES = [
  'user',
  'session',
  'account',
  'verification',
  'user_profile',
  'patient_profile',
  'doctor_profile',
  'doctor_identity_verification',
  'doctor_license_verification',
  'legal_document',
  'user_legal_acceptance',
  'audit_log',
  'specialty',
] as const;

export const FINGERPRINT_BATCH_SIZE = 500;

// Ajustes de sesión que fijan la representación textual de los tipos (solo dentro de la transacción).
export const FINGERPRINT_SESSION_SETTINGS = [
  "SET LOCAL TimeZone = 'UTC'",
  "SET LOCAL DateStyle = 'ISO, YMD'",
  "SET LOCAL IntervalStyle = 'iso_8601'",
  "SET LOCAL bytea_output = 'hex'",
  'SET LOCAL extra_float_digits = 3',
] as const;

export class PgFingerprintError extends Error {
  constructor(reason: string) {
    super(`Huella de PostgreSQL: ${reason}`);
    this.name = 'PgFingerprintError';
  }
}

export const rowHash = (rowText: string): string => createHash('md5').update(rowText, 'utf8').digest('hex');

// Hash de una tabla a partir de sus filas ya serializadas, leídas por bloques en cualquier orden.
export async function fingerprintRows(batches: AsyncIterable<readonly string[]>): Promise<{ total: number; hash: string }> {
  const hashes: string[] = [];
  for await (const batch of batches) for (const row of batch) hashes.push(rowHash(row));
  hashes.sort();
  const digest = createHash('md5').update(`${hashes.length}\n`);
  for (const h of hashes) digest.update(`${h}\n`);
  return { total: hashes.length, hash: digest.digest('hex') };
}

// Cliente mínimo (pg / @neondatabase/serverless): una sola conexión, consultas secuenciales.
export interface PgReadClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const quoteIdent = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new PgFingerprintError('nombre de tabla no admitido');
  return `"${name}"`;
};

async function* cursorBatches(client: PgReadClient, table: string, batchSize: number): AsyncGenerator<string[]> {
  await client.query(`DECLARE pei_fingerprint NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS r FROM ${quoteIdent(table)} t`);
  try {
    for (;;) {
      const { rows } = await client.query(`FETCH FORWARD ${batchSize} FROM pei_fingerprint`);
      if (rows.length === 0) return;
      yield rows.map((row) => {
        if (typeof row.r !== 'string') throw new PgFingerprintError('fila sin serialización de texto');
        return row.r;
      });
    }
  } finally {
    await client.query('CLOSE pei_fingerprint');
  }
}

export interface SnapshotOptions {
  identity: RunTarget;
  expected: C2BranchTarget;
  // Corte para `preexisting`: el instante de pg-before (en pg-after se reutiliza el de pg-before).
  cutoff?: string;
  now?: () => Date;
  tables?: readonly string[];
  batchSize?: number;
}

// Toma la huella en UNA transacción READ ONLY, después de confirmar la identidad real de Neon. Termina siempre con
// ROLLBACK (no hay nada que confirmar). Cualquier fallo se propaga: el llamador decide (antes: no se ejecuta el spec).
export async function takePgSnapshot(client: PgReadClient, options: SnapshotOptions): Promise<PgSnapshot> {
  const now = options.now ?? (() => new Date());
  const tables = options.tables ?? PG_FINGERPRINT_TABLES;
  const batchSize = options.batchSize ?? FINGERPRINT_BATCH_SIZE;
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const readOnly = (await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only;
    if (readOnly !== 'on') throw new PgFingerprintError('la transacción no es de solo lectura');
    await verifyNeonRuntimeIdentity(async (name) => {
      const value = (await client.query('SELECT current_setting($1, true) AS v', [name])).rows[0]?.v;
      return typeof value === 'string' ? value : null;
    }, options.expected);
    for (const setting of FINGERPRINT_SESSION_SETTINGS) await client.query(setting);

    const takenAt = now().toISOString();
    const cutoff = options.cutoff ?? takenAt;
    const result: Record<string, PgTableFingerprint> = {};
    for (const table of tables) {
      const { rows: columns } = await client.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'created_at'",
        [table],
      );
      const byCreatedAt = columns.length > 0;
      const { total, hash } = await fingerprintRows(cursorBatches(client, table, batchSize));
      let preexisting = total;
      if (byCreatedAt) {
        const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${quoteIdent(table)} WHERE created_at < $1::timestamptz`, [cutoff]);
        preexisting = Number(rows[0]?.n);
      }
      result[table] = { total, preexisting, hash, byCreatedAt };
    }
    return { takenAt, cutoff, identity: options.identity, tables: result };
  } finally {
    await client.query('ROLLBACK');
  }
}

// --- Comparación ------------------------------------------------------------------------------------------------------
// equal: todas las tablas con el mismo recuento y hash · different: al menos una difiere · incomplete: falta pg-after
// (o una tabla) · error: no se pudo tomar pg-before (el spec no se ejecutó).
export type PgComparisonStatus = 'equal' | 'different' | 'incomplete' | 'error';
export interface PgTableComparison {
  table: string;
  totalBefore: number | null;
  totalAfter: number | null;
  hashBefore: string | null;
  hashAfter: string | null;
  equal: boolean | null;
}
export interface PgComparison {
  status: PgComparisonStatus;
  comparedAt: string;
  tables: PgTableComparison[];
  // Solo el nombre del error y la fase (nunca su mensaje).
  failure?: { phase: 'before' | 'after'; error: string };
}

export const errorName = (error: unknown) => (error instanceof Error ? error.name : 'Error');

export function comparePgSnapshots(
  before: PgSnapshot | null,
  after: PgSnapshot | null,
  options: { failure?: PgComparison['failure']; now?: Date; tables?: readonly string[] } = {},
): PgComparison {
  const tables = options.tables ?? PG_FINGERPRINT_TABLES;
  const rows: PgTableComparison[] = tables.map((table) => {
    const b = before?.tables[table];
    const a = after?.tables[table];
    return {
      table,
      totalBefore: b?.total ?? null,
      totalAfter: a?.total ?? null,
      hashBefore: b?.hash ?? null,
      hashAfter: a?.hash ?? null,
      equal: b && a ? b.total === a.total && b.hash === a.hash : null,
    };
  });
  let status: PgComparisonStatus;
  if (!before) status = 'error';
  else if (!after || rows.some((r) => r.equal === null)) status = 'incomplete';
  else status = rows.every((r) => r.equal) ? 'equal' : 'different';
  return {
    status,
    comparedAt: (options.now ?? new Date()).toISOString(),
    tables: rows,
    ...(options.failure ? { failure: options.failure } : {}),
  };
}
