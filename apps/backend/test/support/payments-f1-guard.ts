import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { assertFingerprintMatches, parseAuthorizedTarget, PreflightAbort, type AuthorizedTarget } from '../../scripts/payments-preflight-core';
import { readConnectionFingerprint } from '../../scripts/migration-authorization';

// Salvaguardas del spec de Payments F1 (payments-f1.int-spec.ts):
// - B-2: cada conexión verifica los OCHO componentes de la huella autorizada de C2 antes de ejecutar SQL de 0017.
// - B-3: la huella de objetos del esquema public y de drizzle.__drizzle_migrations, tomada antes y después de la suite,
//   detecta cualquier objeto persistente que introduzca la prueba.
// No conecta por sí mismo: recibe una función que ejecuta SQL de solo lectura sobre la conexión a comprobar.

export const AUTHORIZED_FINGERPRINT_FILE = 'C:\\pei-c2\\payments-preflight-c2.authorized.json';

export type Query = (text: string) => Promise<Record<string, unknown>[]>;

export function loadAuthorizedTarget(read: (path: string) => string | null = defaultRead): AuthorizedTarget {
  const target = parseAuthorizedTarget(read(AUTHORIZED_FINGERPRINT_FILE));
  if (target.label !== 'C2') throw new PreflightAbort('la huella autorizada no es la de C2');
  return target;
}

function defaultRead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

// La lectura de los ocho componentes es la misma que usan los ejecutores de migración (R-1).
export { readConnectionFingerprint };

export async function assertAuthorizedConnection(query: Query, databaseUrl: string, authorized: AuthorizedTarget): Promise<void> {
  assertFingerprintMatches(await readConnectionFingerprint(query, databaseUrl), authorized);
}

// Huella de objetos (B-3): todo el esquema public más el registro de migraciones. Solo catálogos; sin datos de negocio.
export const SQL_OBJECTS_FINGERPRINT = `select json_build_object(
  'relations', (select coalesce(json_agg(json_build_array(c.relname, c.relkind) order by c.relname, c.relkind), '[]'::json)
                  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'),
  'columns', (select coalesce(json_agg(json_build_array(table_name, column_name, data_type, udt_name, numeric_precision, numeric_scale,
                  is_nullable, column_default) order by table_name, column_name), '[]'::json)
                from information_schema.columns where table_schema = 'public'),
  'constraints', (select coalesce(json_agg(json_build_array(conrelid::regclass::text, conname, md5(pg_get_constraintdef(oid)))
                    order by conrelid::regclass::text, conname), '[]'::json)
                  from pg_constraint where connamespace = 'public'::regnamespace),
  'indexes', (select coalesce(json_agg(json_build_array(tablename, indexname, md5(indexdef)) order by tablename, indexname), '[]'::json)
                from pg_indexes where schemaname = 'public'),
  'triggers', (select coalesce(json_agg(json_build_array(tgrelid::regclass::text, tgname, md5(pg_get_triggerdef(oid))) order by tgrelid::regclass::text, tgname), '[]'::json)
                 from pg_trigger where not tgisinternal and tgrelid in (select c.oid from pg_class c where c.relnamespace = 'public'::regnamespace)),
  'functions', (select coalesce(json_agg(json_build_array(p.proname, pg_get_function_identity_arguments(p.oid), md5(pg_get_functiondef(p.oid)))
                  order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::json)
                from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'),
  'enums', (select coalesce(json_agg(json_build_array(t.typname, (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))
              order by t.typname), '[]'::json)
            from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype = 'e'),
  'types', (select coalesce(json_agg(json_build_array(t.typname, t.typtype) order by t.typname), '[]'::json)
            from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype in ('e', 'c', 'd', 'r')),
  'migrations', (select json_build_object('count', count(*), 'hash', md5(coalesce(string_agg(hash || '@' || created_at::text, ',' order by created_at, id), '')))
                   from drizzle.__drizzle_migrations)
) as f`;

export interface ObjectsFingerprint {
  digest: string;
  objects: unknown;
}

export async function objectsFingerprint(query: Query): Promise<ObjectsFingerprint> {
  const rows = await query(SQL_OBJECTS_FINGERPRINT);
  if (rows.length !== 1 || rows[0].f === null || rows[0].f === undefined) throw new PreflightAbort('huella de objetos: respuesta inválida');
  const objects = typeof rows[0].f === 'string' ? JSON.parse(rows[0].f) : rows[0].f;
  const digest = createHash('sha256').update(JSON.stringify(objects), 'utf8').digest('hex');
  return { digest, objects };
}

// Diferencias legibles entre dos huellas de objetos (por categoría): lo que apareció y lo que desapareció.
export function diffObjects(before: ObjectsFingerprint, after: ObjectsFingerprint): string[] {
  if (before.digest === after.digest) return [];
  const out: string[] = [];
  const b = before.objects as Record<string, unknown>;
  const a = after.objects as Record<string, unknown>;
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const left = new Set((Array.isArray(b[key]) ? (b[key] as unknown[]) : [b[key]]).map((x) => JSON.stringify(x)));
    const right = new Set((Array.isArray(a[key]) ? (a[key] as unknown[]) : [a[key]]).map((x) => JSON.stringify(x)));
    for (const x of right) if (!left.has(x)) out.push(`${key}: + ${x}`);
    for (const x of left) if (!right.has(x)) out.push(`${key}: - ${x}`);
  }
  return out.length > 0 ? out : ['la huella cambió'];
}
