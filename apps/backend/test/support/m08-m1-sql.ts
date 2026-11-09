import { readFileSync } from 'fs';
import { join } from 'path';
import { getTableColumns, getTableName, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { db } from '../../src/db';
import * as schema from '../../src/db/schema';
import { transactionStorage } from '../../src/db/transaction-context';
import { captureError, RollbackSignal, type Tx } from './with-rollback';
import { createAdminActor, createPatient, identityUseCases } from './identity-integration';
import { createDoctor, doctorUseCases } from './doctors-integration';

// Utilidades SQL de M-1 (M08) compartidas por los dos specs:
// - m08-m1-migration.int-spec.ts: aplica y revierte 0013 desde un esquema 0000–0012 (rama aislada o desechable);
// - m08-m1-schema.int-spec.ts: comprueba las garantías de 0013 ya aplicada de forma persistente (C2).
// Ninguna confirma datos: todo ocurre en transacciones revertidas sobre conexiones propias.

const DIR = join(__dirname, '..', '..', 'src', 'db', 'proposals', 'm08-m1');
export const file = (name: string) => readFileSync(join(DIR, name), 'utf8');
export const UP_A = file('0013_m08_m1_core.up.sql');
export const DOWN_A = file('0013_m08_m1_core.down.sql');
// La parte B (0014, no autorizada) NO se lee aquí: solo la carga m08-m1-part-b.int-spec.ts.
export const VALIDATE = file('validate.sql');

// SHA-256 del SQL registrado como migración 0013 (src/db/migrations/0013_m08_m1_core.sql, commit 67f266d).
export const M1_A_SHA256 = '2138d4064d8acd97e3189c38eace19e79fbf622b97ed53ecf772c205846b1472';

export const tx = () => transactionStorage.getStore()! as unknown as Tx;

// Cada prueba usa SU PROPIA conexión y la cierra: tras revertir una transacción que recreó el enum, una sesión
// reutilizada conserva en caché el tipo eliminado («cache lookup failed for type»). Mismo DATABASE_URL que src/db
// (la salvaguarda de destino ya se comprobó al cargar el spec). Siempre termina en ROLLBACK.
export async function withIsolatedRollback<T>(work: () => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const isolated = drizzle(pool, { schema });
  let result: T | undefined;
  try {
    await isolated.transaction(async (t) => {
      result = await transactionStorage.run(t as any, work);
      throw new RollbackSignal();
    });
  } catch (error) {
    if (!(error instanceof RollbackSignal)) throw error;
  } finally {
    await pool.end();
  }
  return result as T;
}

export const run = (text: string) => tx().execute(sql.raw(text));
// Intento aislado en un SAVEPOINT: devuelve el error (o null) sin abortar la transacción de la prueba.
export const attempt = (text: string) => captureError(tx().transaction((sp) => sp.execute(sql.raw(text))));
export const message = (e: unknown) => String((e as { cause?: Error })?.cause?.message ?? (e as Error)?.message ?? e);

export const STATUSES = ['pending_payment', 'expired', 'confirmed', 'completed', 'canceled', 'no_show_patient', 'no_show_doctor', 'no_show_both', 'rescheduled'] as const;
export type Status = (typeof STATUSES)[number];
// Matriz aprobada (M-1 #1b, A.14.2).
export const ALLOWED: Record<Status, Status[]> = {
  pending_payment: ['confirmed', 'expired'],
  confirmed: ['canceled', 'rescheduled', 'completed', 'no_show_patient', 'no_show_doctor', 'no_show_both'],
  no_show_patient: ['no_show_doctor', 'no_show_both', 'completed'],
  no_show_doctor: ['no_show_patient', 'no_show_both', 'completed'],
  no_show_both: ['no_show_patient', 'no_show_doctor', 'completed'],
  expired: [],
  completed: [],
  canceled: [],
  rescheduled: [],
};
export const TRANSITION_REJECTED = /Transición de cita no permitida/;

// Recorre la matriz completa por SQL directo (una cita nueva por par) y devuelve las discrepancias.
export async function transitionMismatches(f: RawFixtures): Promise<string[]> {
  const mismatches: string[] = [];
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      if (from === to) continue;
      const id = await insertAppointment(f, from);
      const err = await attempt(`update appointment set status = '${to}' where id = '${id}'`);
      const ok = err === null;
      if (ok !== ALLOWED[from].includes(to)) mismatches.push(`${from} → ${to}: ${ok ? 'aceptada' : 'rechazada'}`);
      if (!ok && !TRANSITION_REJECTED.test(message(err))) mismatches.push(`${from} → ${to}: error inesperado ${message(err)}`);
    }
  }
  return mismatches;
}

// Huella del esquema que toca M-1 (tipos, columnas, restricciones, triggers y funciones).
export async function fingerprint(executor: { execute: typeof db.execute } = db) {
  const { rows } = await executor.execute<{ f: unknown }>(sql`
    select json_build_object(
      'enum', (select json_agg(e.enumlabel order by e.enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'appointment_status_enum'),
      'types', (select json_agg(typname order by typname) from pg_type where typname like 'appointment_status_enum%'),
      'columns', (select json_agg(json_build_array(table_name, column_name, udt_name, is_nullable, column_default) order by table_name, column_name)
                    from information_schema.columns where table_schema = 'public'
                     and table_name in ('appointment', 'appointment_status_history', 'cancellation_policy', 'consultation_price_configuration')),
      'constraints', (select json_agg(conname order by conname) from pg_constraint
                       where conrelid in ('appointment'::regclass, 'cancellation_policy'::regclass, 'consultation_price_configuration'::regclass, 'appointment_status_history'::regclass)),
      'triggers', (select json_agg(json_build_array(tgrelid::regclass::text, tgname) order by tgrelid::regclass::text, tgname) from pg_trigger
                    where not tgisinternal and tgrelid in ('appointment'::regclass, 'cancellation_policy'::regclass, 'consultation_price_configuration'::regclass, 'appointment_status_history'::regclass)),
      'functions', (select json_agg(json_build_array(proname, md5(pg_get_functiondef(oid))) order by proname) from pg_proc
                     where proname in ('gst_appointment_guard', 'gst_appointment_lock_entries', 'gst_versioned_config_guard', 'gst_versioned_config_no_truncate')),
      'indexes', (select json_agg(indexname order by indexname) from pg_indexes where tablename = 'appointment')
    ) as f`);
  return rows[0].f;
}

// ¿El esquema conectado tiene M-1 parte A? Se decide por el valor 'rescheduled' del enum (lo introduce 0013).
export async function hasM1PartA(executor: { execute: typeof db.execute } = db): Promise<boolean> {
  const { rows } = await executor.execute<{ n: string }>(sql`
    select count(*) as n from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'appointment_status_enum' and e.enumlabel = 'rescheduled'`);
  return Number(rows[0].n) > 0;
}

// Tablas de M08 cuyos INSERT genera Drizzle con TODAS las columnas declaradas (buildInsertQuery usa `default` para las
// omitidas): si el esquema TypeScript declara una columna que la BD no tiene, cualquier insert falla.
export const M08_TABLES: PgTable[] = [schema.appointment, schema.appointmentStatusHistory, schema.cancellationPolicy, schema.consultationPriceConfiguration];

// Columnas declaradas en Drizzle que no existen en la BD conectada (vacío = los inserts de Drizzle son válidos).
export async function drizzleColumnsMissingInDb(executor: { execute: typeof db.execute } = db): Promise<string[]> {
  const declared = M08_TABLES.flatMap((t) => Object.values(getTableColumns(t)).map((c) => `${getTableName(t)}.${c.name}`));
  const { rows } = await executor.execute<{ c: string }>(sql`
    select table_name || '.' || column_name as c from information_schema.columns
     where table_schema = 'public' and table_name in ('appointment', 'appointment_status_history', 'cancellation_policy', 'consultation_price_configuration')`);
  const actual = new Set(rows.map((r) => r.c));
  return declared.filter((c) => !actual.has(c)).sort();
}

// Precondición de los specs que usan el esquema persistente de C2: 0013 aplicada y sin columnas de Drizzle ausentes.
// Falla con un mensaje claro en vez de producir errores «column does not exist» en mitad de las pruebas.
export async function assertSchemaHasM1PartA(executor: { execute: typeof db.execute } = db): Promise<void> {
  const missing = await drizzleColumnsMissingInDb(executor);
  if (!(await hasM1PartA(executor)) || missing.length > 0) {
    throw new Error(`El esquema conectado no tiene M08 M-1 parte A (0013)${missing.length ? `; faltan: ${missing.join(', ')}` : ''}. Aplique 0013 en C2 antes de este spec.`);
  }
}

// Paciente, médico y política mínimos para insertar citas directamente por SQL.
export async function rawFixtures() {
  const admin = await createAdminActor(identityUseCases());
  const p = await createPatient(identityUseCases());
  const d = await createDoctor(doctorUseCases());
  const { rows } = await tx().execute<{ id: string }>(sql`
    insert into cancellation_policy (refund_deadline_hours, max_reschedules, doctor_wait_minutes, patient_tolerance_minutes, effective_from, effective_until, created_by)
    values (24, 2, 30, 15, now() - interval '400 days', now() - interval '399 days', ${admin.userProfileId}) returning id`);
  return { admin, patientId: p.patientProfileId, doctorId: d.doctorProfileId, policyId: rows[0].id };
}
export type RawFixtures = Awaited<ReturnType<typeof rawFixtures>>;

let offset = 0;
export async function insertAppointment(f: RawFixtures, status: Status) {
  offset++;
  const { rows } = await tx().execute<{ id: string }>(sql`
    insert into appointment (patient_id, doctor_id, type, status, scheduled_at, reason, price, cancellation_policy_id, agenda_block_ends_at)
    values (${f.patientId}, ${f.doctorId}, 'scheduled', ${status}::appointment_status_enum, now() + make_interval(days => 300, mins => ${offset * 30}),
            'm08-m1-sintetico', 200.00, ${f.policyId}, now() + make_interval(days => 300, mins => ${offset * 30 + 30})) returning id`);
  return rows[0].id;
}

// Copias de la reserva (RN-007, RN-018): ninguna cambia por SQL directo; la cancelación sí escribe sus columnas.
export async function assertReservationCopiesImmutable(f: RawFixtures) {
  const id = await insertAppointment(f, 'confirmed');
  const results: Record<string, string> = {};
  for (const [col, value] of [['price', '150.00'], ['scheduled_at', `now() + interval '301 days'`], ['agenda_block_ends_at', `now() + interval '302 days'`], ['doctor_id', `'${f.patientId}'`]] as const) {
    results[col] = message(await attempt(`update appointment set ${col} = ${value} where id = '${id}'`));
  }
  const cancel = await attempt(`update appointment set status = 'canceled', cancelled_at = now(), cancelled_by_type = 'patient' where id = '${id}'`);
  return { results, cancel };
}
export const IMMUTABLE_COPY = /no puede cambiar|no pueden cambiar|no cambia/;

// Versiones de precio y política (RN-021, AP-2): solo se cierran una vez; sin DELETE, TRUNCATE ni cambios.
export async function versionedConfigOutcomes(adminProfileId: string | null) {
  const open = await tx().execute<{ id: string }>(sql`select id from consultation_price_configuration where effective_until is null limit 1`);
  // La versión abierta de la rama (o una nueva, si no hay): EXCLUDE … no_overlap de 0001 impide otra solapada.
  const id = open.rows[0]?.id ?? (await tx().execute<{ id: string }>(sql`
    insert into consultation_price_configuration (price, currency, effective_from, created_by)
    values (999.00, 'MXN', now(), ${adminProfileId}) returning id`)).rows[0].id;
  return {
    changePrice: message(await attempt(`update consultation_price_configuration set price = 1 where id = '${id}'`)),
    remove: message(await attempt(`delete from consultation_price_configuration where id = '${id}'`)),
    truncate: message(await attempt(`truncate consultation_price_configuration cascade`)),
    close: await attempt(`update consultation_price_configuration set effective_until = now() + interval '1 day' where id = '${id}'`),
    reopen: message(await attempt(`update consultation_price_configuration set effective_until = null where id = '${id}'`)),
    changePolicy: message(await attempt(`update cancellation_policy set doctor_wait_minutes = 10 where effective_until is null`)),
    badWindows: message(await attempt(`insert into cancellation_policy (refund_deadline_hours, max_reschedules, doctor_wait_minutes, patient_tolerance_minutes, max_protected_wait_minutes, reconnect_grace_minutes, effective_from, created_by)
      values (24, 2, 30, 40, 60, 5, now() + interval '600 days', '${adminProfileId}')`)),
  };
}
export function expectVersionedConfigGuarded(o: Awaited<ReturnType<typeof versionedConfigOutcomes>>) {
  expect(o.changePrice).toMatch(/solo puede cerrarse|no se modifica/);
  expect(o.remove).toMatch(/no admite DELETE/);
  expect(o.truncate).toMatch(/no admite TRUNCATE/);
  expect(o.close).toBeNull();
  expect(o.reopen).toMatch(/solo puede cerrarse/);
  expect(o.changePolicy).toMatch(/solo puede cerrarse|no se modifica|windows_chk/);
  expect(o.badWindows).toMatch(/windows_chk/);
}
