import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { attempt, fingerprint, insertAppointment, message, rawFixtures, run, tx, withIsolatedRollback, type RawFixtures } from '../support/m08-m1-sql';
import { assertAuthorizedConnection, diffObjects, loadAuthorizedTarget, objectsFingerprint, type ObjectsFingerprint, type Query } from '../support/payments-f1-guard';
import { authorizeProtectedMigration, readConnectionFingerprint, SQL_RESET_AUTHORIZATION, sqlSetAuthorization } from '../../scripts/migration-authorization';

// Compuerta: aplicar 0017 (aunque sea en transacciones revertidas) requiere autorización expresa. Sin
// PAYMENTS_F1_AUTHORIZED=0017 el spec se detiene al cargarse, antes de conectar y de leer 0017.
if (process.env.PAYMENTS_F1_AUTHORIZED !== '0017') {
  throw new Error('payments-f1 aplica 0017, que no está autorizada en ninguna base: el spec no se ejecuta (falta PAYMENTS_F1_AUTHORIZED=0017).');
}

// Salvaguarda de destino: solo contra una rama de pruebas mediante C2.
assertC2BranchTarget();
// B-2: la huella autorizada de C2 (8 componentes) se carga al inicio; sin ella el spec no se ejecuta.
const AUTHORIZED = loadAuthorizedTarget();
const DATABASE_URL = process.env.DATABASE_URL!;

// Payments F1 (0017) sobre PostgreSQL real: constraints, triggers e invariantes I-1 a I-10. Requiere el esquema
// 0000–0016 con las tablas de pagos VACÍAS (C2 verificado por el preflight 0.b). Cada prueba aplica 0017 DENTRO de
// una transacción revertida (el DDL de PostgreSQL es transaccional): la rama termina intacta, y afterAll lo comprueba
// con la huella del esquema. Las comprobaciones diferidas (I-2) se fuerzan con SET CONSTRAINTS … IMMEDIATE, porque
// la transacción nunca se confirma.
//
// Cada escenario verifica en SU conexión la huella autorizada antes de cualquier SQL de 0017 (B-2). La huella de
// objetos de public y de drizzle.__drizzle_migrations se compara antes y después de la suite (B-3).
//
// Ejecución SOLO con autorización: pnpm c2 run postgres test/integration/payments-f1.int-spec.ts --authorize-payments-f1 0017

const DIR = join(__dirname, '..', '..', 'src', 'db', 'proposals', 'payments-f1');
const UP = readFileSync(join(DIR, '0017_payments_f1.up.sql'), 'utf8');
const DOWN = readFileSync(join(DIR, '0017_payments_f1.down.sql'), 'utf8');

const one = async <T>(q: ReturnType<typeof sql>) => (await tx().execute(q)).rows[0] as T;
// Ejecuta una sentencia parametrizada en un savepoint y devuelve el mensaje de error (o '' si pasó).
async function tryRun(q: ReturnType<typeof sql>): Promise<string> {
  try {
    await tx().transaction((sp) => sp.execute(q));
    return '';
  } catch (e) {
    return message(e);
  }
}
type Savepoint = Parameters<Parameters<ReturnType<typeof tx>['transaction']>[0]>[0];
// Fuerza las comprobaciones diferidas pendientes (I-2) en un SAVEPOINT y restaura SIEMPRE el modo diferido.
async function checkDeferred(): Promise<string> {
  const result = await tryRun(sql`set constraints all immediate`);
  await tx().execute(sql`set constraints all deferred`);
  return result;
}
// Ejecuta `work` y la comprobación diferida en el MISMO savepoint: si falla, todo lo de `work` se deshace.
async function inSavepointWithCheck(work: (sp: Savepoint) => Promise<unknown>): Promise<string> {
  try {
    await tx().transaction(async (sp) => {
      await work(sp);
      await sp.execute(sql`set constraints all immediate`);
    });
    return '';
  } catch (e) {
    return message(e);
  } finally {
    await tx().execute(sql`set constraints all deferred`);
  }
}
const txQuery: Query = async (text) => (await tx().execute(sql.raw(text))).rows as Record<string, unknown>[];
const dbQuery: Query = async (text) => (await db.execute(sql.raw(text))).rows as Record<string, unknown>[];
// Cada escenario: conexión propia → huella autorizada (B-2) → autorización de sesión de 0017 (R-1, solo después de la
// huella completa y sin variable heredada) → trabajo → ROLLBACK (que también deshace el SET de la autorización).
const scenario = <T>(work: () => Promise<T>) =>
  withIsolatedRollback(async () => {
    await assertAuthorizedConnection(txQuery, DATABASE_URL, AUTHORIZED);
    await authorizeProtectedMigration(
      { fingerprint: () => readConnectionFingerprint(txQuery, DATABASE_URL), query: txQuery },
      '0017_payments_f1',
      () => AUTHORIZED,
    );
    return work();
  });

interface World { f: RawFixtures; admin: string; feeId: string; scheduleId: string }

async function world(fee = '200.00'): Promise<World> {
  await run(UP);
  const f = await rawFixtures();
  const admin = f.admin.userProfileId!;
  const feeRow = await one<{ id: string }>(sql`insert into pei_fee_configuration (fixed_fee, effective_from, created_by)
    values (${fee}, now() - interval '1 day', ${admin}) returning id`);
  const schedule = await one<{ id: string }>(sql`insert into processor_fee_schedule (provider, percentage_rate, fixed_fee, vat_rate,
    release_days, source, effective_from, created_by)
    values ('mercado_pago', 0.0319, 4.00, 0.16, 14, 'Referencia del asistente de Mercado Pago, no contractual (PAY-08)', now() - interval '1 day', ${admin})
    returning id`);
  return { f, admin, feeId: feeRow.id, scheduleId: schedule.id };
}

async function consultationPayment(w: World, opts: { amount?: string; fee?: string; status?: string; providerId?: string } = {}) {
  const appointmentId = await insertAppointment(w.f, 'pending_payment');
  const amount = opts.amount ?? '1000.00';
  const fee = opts.fee ?? '200.00';
  const net = (Number(amount) - Number(fee)).toFixed(2);
  const row = await one<{ id: string }>(sql`insert into payment (doctor_id, patient_id, appointment_id, type, provider, provider_payment_id,
    status, amount, pei_fee_configuration_id, pei_fixed_fee, doctor_net_amount, processor_fee_schedule_id, provider_fee_estimated)
    values (${w.f.doctorId}, ${w.f.patientId}, ${appointmentId}, 'consultation', 'mercado_pago', ${opts.providerId ?? `mp-${appointmentId}`},
      ${opts.status ?? 'succeeded'}::payment_status_enum, ${amount}, ${w.feeId}, ${fee}, ${net}, ${w.scheduleId}, 40.64) returning id`);
  return { paymentId: row.id, appointmentId, net };
}

async function earning(w: World, paymentId: string, net: string) {
  const entry = await one<{ id: string }>(sql`insert into doctor_ledger_entry (doctor_id, payment_id, entry_type, source_type, source_ref,
    amount, created_by_type) values (${w.f.doctorId}, ${paymentId}, 'consultation_earning', 'payment', ${paymentId}, ${net}, 'system') returning id`);
  const item = await one<{ id: string }>(sql`insert into doctor_payout_item (payment_id, amount, eligible_at, ledger_entry_id)
    values (${paymentId}, ${net}, now() - interval '1 hour', ${entry.id}) returning id`);
  return { entryId: entry.id, itemId: item.id };
}

async function refund(w: World, paymentId: string, amount: string, pei: string, doctor: string, approved = true) {
  const r = await one<{ id: string }>(sql`insert into refund (payment_id, amount, reason, provider, pei_fee_share, doctor_share, approved_by)
    values (${paymentId}, ${amount}, 'patient_cancellation', 'mercado_pago', ${pei}, ${doctor}, ${approved ? w.admin : null}) returning id`);
  await run(`update refund set status = 'pending' where id = '${r.id}'`);
  await run(`update refund set status = 'processing' where id = '${r.id}'`);
  await run(`update refund set status = 'succeeded', provider_refund_id = 'mp-r-${r.id}', processed_at = now() where id = '${r.id}'`);
  return r.id;
}

// Asiento y ajuste en la MISMA unidad transaccional (un savepoint), con la comprobación I-2 incluida: si el ajuste
// falla, el asiento también se deshace y no queda huérfano. Devuelve '' o el mensaje del error.
function refundAdjustment(w: World, itemId: string, paymentId: string, refundId: string, amount: string, sourcePayoutId: string | null) {
  return inSavepointWithCheck(async (sp) => {
    const { rows } = await sp.execute<{ id: string }>(sql`insert into doctor_ledger_entry (doctor_id, payment_id, entry_type, source_type,
      source_ref, amount, refund_id, created_by_type) values (${w.f.doctorId}, ${paymentId}, 'refund_reversal', 'refund_adjustment',
      ${`${itemId}:${refundId}`}, ${amount}, ${refundId}, 'system') returning id`);
    await sp.execute(sql`insert into doctor_payout_adjustment (doctor_id, source_payout_id, doctor_payout_item_id, payment_id, type, amount,
      reason, created_by_type, ledger_entry_id) values (${w.f.doctorId}, ${sourcePayoutId}, ${itemId}, ${paymentId}, 'refund_reversal', ${amount},
      'reembolso parcial', 'system', ${rows[0].id})`);
  });
}

async function payout(w: World, days: number) {
  return (await one<{ id: string }>(sql`insert into doctor_payout (doctor_id, period_start, period_end, gross_amount, net_amount)
    values (${w.f.doctorId}, now() - make_interval(days => ${days + 7}), now() - make_interval(days => ${days}), 0, 0) returning id`)).id;
}
const markPaid = (payoutId: string, w: World) => tryRun(sql`update doctor_payout set status = 'paid', paid_at = now(), transfer_method = 'manual',
  transfer_reference = 'SPEI-PRUEBA', transferred_by_user_id = ${w.admin}, transferred_amount = net_amount where id = ${payoutId}`);
const reconciliation = async () => (await tx().execute(sql`select * from gst_doctor_ledger_reconciliation()`)).rows;

describe('Payments F1 · 0017 sobre PostgreSQL (C2, transacciones revertidas)', () => {
  let before: unknown;
  let objectsBefore: ObjectsFingerprint | undefined;
  beforeAll(async () => {
    // La conexión de las huellas también debe ser C2 (B-2) antes de leer nada.
    await assertAuthorizedConnection(dbQuery, DATABASE_URL, AUTHORIZED);
    objectsBefore = await objectsFingerprint(dbQuery);
    before = await fingerprint();
    console.log(`[payments-f1] huella de objetos antes: ${objectsBefore.digest}`);
  });
  afterAll(async () => {
    try {
      if (objectsBefore !== undefined) {
        const after = await objectsFingerprint(dbQuery);
        console.log(`[payments-f1] huella de objetos después: ${after.digest}`);
        expect(diffObjects(objectsBefore, after)).toEqual([]);
      }
      if (before !== undefined) expect(await fingerprint()).toEqual(before);
    } finally {
      await db.$client.end();
    }
  });

  it('[PAY-F1-01] se aplica en el camino directo, rechaza una segunda aplicación y se revierte limpiamente', () =>
    scenario(async () => {
      // R-1: sin la autorización de sesión, 0017 se detiene antes de cualquier DDL.
      await run(SQL_RESET_AUTHORIZATION);
      expect(message(await attempt(UP))).toMatch(/requiere autorización explícita/);
      expect((await one<{ t: string | null }>(sql`select to_regclass('public.doctor_ledger_entry')::text as t`)).t).toBeNull();
      await run(sqlSetAuthorization('0017'));
      await run(UP);
      expect(message(await attempt(UP))).toMatch(/ya está aplicada/);
      await run(DOWN);
      expect((await one<{ t: string | null }>(sql`select to_regclass('public.stripe_webhook_event')::text as t`)).t).toBe('stripe_webhook_event');
      expect((await one<{ t: string | null }>(sql`select to_regclass('public.doctor_ledger_entry')::text as t`)).t).toBeNull();
      await run(UP);
    }));

  it('[PAY-F1-02] aborta sin cambios si alguna tabla de pagos tiene filas', () =>
    scenario(async () => {
      const f = await rawFixtures();
      const appointmentId = await insertAppointment(f, 'pending_payment');
      await tx().execute(sql`insert into payment (doctor_id, patient_id, appointment_id, type, amount, stripe_payment_intent_id, platform_amount, doctor_amount)
        values (${f.doctorId}, ${f.patientId}, ${appointmentId}, 'consultation', 100, 'pi_sintetico', 20, 80)`);
      expect(message(await attempt(UP))).toMatch(/solo implementa el camino directo.*payment=1/);
      expect((await one<{ t: string | null }>(sql`select to_regclass('public.doctor_ledger_entry')::text as t`)).t).toBeNull();
    }));

  it('[PAY-F1-03] pagos: neto no negativo, reparto, un pago activo por cita, transiciones y snapshot inmutable', () =>
    scenario(async () => {
      const w = await world();
      expect(await tryRun(sql`select 1`)).toBe('');
      const p = await consultationPayment(w);
      // Neto negativo o reparto incoherente.
      const appt = await insertAppointment(w.f, 'pending_payment');
      expect(await tryRun(sql`insert into payment (doctor_id, patient_id, appointment_id, type, provider, status, amount, pei_fee_configuration_id,
        pei_fixed_fee, doctor_net_amount, processor_fee_schedule_id, provider_fee_estimated) values (${w.f.doctorId}, ${w.f.patientId}, ${appt},
        'consultation', 'mercado_pago', 'pending', 100, ${w.feeId}, 200, -100, ${w.scheduleId}, 8)`)).toMatch(/payment_doctor_net_nonnegative_chk|payment_consultation_split_chk/);
      expect(await tryRun(sql`insert into payment (doctor_id, patient_id, appointment_id, type, provider, status, amount, pei_fee_configuration_id,
        pei_fixed_fee, doctor_net_amount, processor_fee_schedule_id, provider_fee_estimated) values (${w.f.doctorId}, ${w.f.patientId}, ${appt},
        'consultation', 'mercado_pago', 'pending', 1000, ${w.feeId}, 200, 900, ${w.scheduleId}, 8)`)).toMatch(/payment_consultation_split_chk/);
      // Un pago activo por cita raíz (AP-27a); tras un intento fallido se admite otro.
      expect(await tryRun(sql`insert into payment (doctor_id, patient_id, appointment_id, type, provider, status, amount, pei_fee_configuration_id,
        pei_fixed_fee, doctor_net_amount, processor_fee_schedule_id, provider_fee_estimated) values (${w.f.doctorId}, ${w.f.patientId}, ${p.appointmentId},
        'consultation', 'mercado_pago', 'pending', 1000, ${w.feeId}, 200, 800, ${w.scheduleId}, 8)`)).toMatch(/payment_active_appointment_uq/);
      const failed = await consultationPayment(w, { status: 'failed' });
      expect(await tryRun(sql`insert into payment (doctor_id, patient_id, appointment_id, type, provider, status, amount, pei_fee_configuration_id,
        pei_fixed_fee, doctor_net_amount, processor_fee_schedule_id, provider_fee_estimated) values (${w.f.doctorId}, ${w.f.patientId}, ${failed.appointmentId},
        'consultation', 'mercado_pago', 'pending', 1000, ${w.feeId}, 200, 800, ${w.scheduleId}, 8)`)).toBe('');
      // Transiciones y snapshot.
      expect(await tryRun(sql`update payment set status = 'pending' where id = ${p.paymentId}`)).toMatch(/Transición de pago no permitida/);
      expect(await tryRun(sql`update payment set amount = 1 where id = ${p.paymentId}`)).toMatch(/snapshot de un pago no se modifica/);
      expect(await tryRun(sql`update payment set provider_payment_id = 'otro' where id = ${p.paymentId}`)).toMatch(/se fija una sola vez/);
      expect(await tryRun(sql`update payment set provider_fee_actual = 41.00 where id = ${p.paymentId}`)).toBe('');
      expect(await tryRun(sql`update payment set provider_fee_actual = 42.00 where id = ${p.paymentId}`)).toMatch(/se fijan una sola vez/);
      expect(await tryRun(sql`delete from payment where id = ${p.paymentId}`)).toMatch(/solo inserción/);
      expect(await tryRun(sql`truncate payment cascade`)).toMatch(/no admite TRUNCATE/);
      // Medicamento: 100 % PEI, sin comisión ni neto del médico.
      expect(await tryRun(sql`insert into payment (patient_id, medication_order_id, type, provider, status, amount, pei_fee_configuration_id,
        pei_fixed_fee, doctor_net_amount, processor_fee_schedule_id, provider_fee_estimated) values (${w.f.patientId}, gen_random_uuid(),
        'medication', 'mercado_pago', 'pending', 500, ${w.feeId}, 10, 0, ${w.scheduleId}, 8)`)).toMatch(/payment_medication_split_chk|foreign key/);
    }));

  it('[PAY-F1-04] precisión numeric(12,2) en pagos', () =>
    scenario(async () => {
      const w = await world('0.00');
      expect((await consultationPayment(w, { amount: '9999999999.99', fee: '0.00' })).paymentId).toBeTruthy();
      expect(await tryRun(sql`select 10000000000.00::numeric(12,2)`)).toMatch(/numeric field overflow/);
    }));

  it('[PAY-F1-05] reembolsos: prorrata exacta y acumulativa, aprobación de parciales y tope del pago', () =>
    scenario(async () => {
      const w = await world();
      const p = await consultationPayment(w);
      // 333.33 sobre 1000 con comisión 200: PEI 66.67, médico 266.66.
      expect(await tryRun(sql`insert into refund (payment_id, amount, reason, provider, pei_fee_share, doctor_share)
        values (${p.paymentId}, 333.33, 'patient_cancellation', 'mercado_pago', 66.66, 266.67)`)).toMatch(/prorrata/);
      const r1 = await one<{ id: string }>(sql`insert into refund (payment_id, amount, reason, provider, pei_fee_share, doctor_share)
        values (${p.paymentId}, 333.33, 'patient_cancellation', 'mercado_pago', 66.67, 266.66) returning id`);
      expect(await tryRun(sql`update refund set status = 'pending' where id = ${r1.id}`)).toMatch(/requiere aprobación administrativa/);
      // Acumulativo: el segundo de 333.33 da PEI round(666.66·0.2) − 66.67 = 66.66.
      expect(await tryRun(sql`insert into refund (payment_id, amount, reason, provider, pei_fee_share, doctor_share)
        values (${p.paymentId}, 333.33, 'patient_cancellation', 'mercado_pago', 66.66, 266.67)`)).toBe('');
      expect(await tryRun(sql`insert into refund (payment_id, amount, reason, provider, pei_fee_share, doctor_share)
        values (${p.paymentId}, 400.00, 'patient_cancellation', 'mercado_pago', 80.00, 320.00)`)).toMatch(/excede el pago/);
      expect(await tryRun(sql`update refund set amount = 1 where id = ${r1.id}`)).toMatch(/no se modifican/);
      expect(await tryRun(sql`delete from refund where id = ${r1.id}`)).toMatch(/solo inserción/);
    }));

  it('[PAY-F1-06] I-2: asiento y unidad 1:1, inmutabilidad del ledger e idempotencia de asientos', () =>
    scenario(async () => {
      const w = await world();
      const p = await consultationPayment(w);
      const { entryId, itemId } = await earning(w, p.paymentId, p.net);
      expect(await checkDeferred()).toBe('');
      expect(await tryRun(sql`insert into doctor_ledger_entry (doctor_id, payment_id, entry_type, source_type, source_ref, amount, created_by_type)
        values (${w.f.doctorId}, ${p.paymentId}, 'consultation_earning', 'payment', ${p.paymentId}, ${p.net}, 'system')`)).toMatch(/doctor_ledger_entry_key_uq|earning_uq/);
      expect(await tryRun(sql`update doctor_ledger_entry set amount = 1 where id = ${entryId}`)).toMatch(/solo inserción/);
      expect(await tryRun(sql`delete from doctor_ledger_entry where id = ${entryId}`)).toMatch(/solo inserción/);
      // Asiento sin unidad: se inserta (la comprobación es diferida) y falla al forzarla en su propio savepoint.
      const q = await consultationPayment(w);
      expect(await inSavepointWithCheck((sp) => sp.execute(sql`insert into doctor_ledger_entry (doctor_id, payment_id, entry_type, source_type,
        source_ref, amount, created_by_type) values (${w.f.doctorId}, ${q.paymentId}, 'consultation_earning', 'payment', ${q.paymentId}, ${q.net},
        'system')`))).toMatch(/no tiene exactamente una unidad/);
      // Un item de otro pago no puede reutilizar el asiento de p.
      expect(await tryRun(sql`insert into doctor_payout_item (payment_id, amount, eligible_at, ledger_entry_id)
        values (${q.paymentId}, ${q.net}, now(), ${entryId})`)).toMatch(/asiento de origen de su pago/);
      // Tras los intentos fallidos el estado sigue coherente: solo el asiento y el item de p.
      expect(await checkDeferred()).toBe('');
      expect((await one<{ n: string }>(sql`select count(*)::text as n from doctor_ledger_entry`)).n).toBe('1');
      expect((await one<{ n: string }>(sql`select count(*)::text as n from doctor_payout_item where id = ${itemId}`)).n).toBe('1');
    }));

  it('[PAY-F1-07] I-7: revocación completa, irreversible y prohibida con ajustes; I-1 cuadra', () =>
    scenario(async () => {
      const w = await world();
      const p = await consultationPayment(w);
      const { entryId, itemId } = await earning(w, p.paymentId, p.net);
      const r = await refund(w, p.paymentId, '1000.00', '200.00', '800.00');
      const rev = await one<{ id: string }>(sql`insert into doctor_ledger_entry (doctor_id, payment_id, entry_type, source_type, source_ref, amount,
        refund_id, reverses_entry_id, created_by_type) values (${w.f.doctorId}, ${p.paymentId}, 'refund_reversal', 'item_revocation', ${itemId},
        -800.00, ${r}, ${entryId}, 'system') returning id`);
      expect(await tryRun(sql`update doctor_payout_item set eligibility_status = 'revoked', eligibility_revoked_at = now(),
        revocation_ledger_entry_id = ${rev.id} where id = ${itemId}`)).toBe('');
      expect(await checkDeferred()).toBe('');
      expect(await tryRun(sql`update doctor_payout_item set eligibility_status = 'eligible', revocation_ledger_entry_id = null,
        eligibility_revoked_at = null where id = ${itemId}`)).toMatch(/irreversible|una sola vez/);
      expect(await reconciliation()).toEqual([]);
    }));

  it('[PAY-F1-08] C-4: reembolso parcial antes de liquidar, aplicación obligatoria antes de paid (I-6) e I-5', () =>
    scenario(async () => {
      const w = await world();
      const p = await consultationPayment(w);
      const { itemId } = await earning(w, p.paymentId, p.net);
      const r = await refund(w, p.paymentId, '333.33', '66.67', '266.66');
      expect(await refundAdjustment(w, itemId, p.paymentId, r, '-266.66', null)).toBe('');
      expect(await checkDeferred()).toBe('');
      // No se puede revocar un importe con ajustes.
      expect(await tryRun(sql`update doctor_payout_item set eligibility_status = 'revoked', eligibility_revoked_at = now() where id = ${itemId}`))
        .toMatch(/con ajustes no se revoca|revocation_chk/);
      const po = await payout(w, 1);
      await run(`update doctor_payout_item set payout_id = '${po}' where id = '${itemId}'`);
      expect(await markPaid(po, w)).toMatch(/ajustes de sus importes sin aplicar/);
      const adj = await one<{ id: string }>(sql`select id from doctor_payout_adjustment where doctor_payout_item_id = ${itemId}`);
      await run(`insert into doctor_payout_adjustment_application (adjustment_id, applied_payout_id, amount) values ('${adj.id}', '${po}', -266.66)`);
      expect((await one<{ net_amount: string }>(sql`select net_amount from doctor_payout where id = ${po}`)).net_amount).toBe('533.34');
      expect(await markPaid(po, w)).toBe('');
      expect(await reconciliation()).toEqual([]);
    }));

  it('[PAY-F1-09] C-4: reembolso parcial después de liquidar exige el payout pagado como origen y se aplica en el siguiente', () =>
    scenario(async () => {
      const w = await world();
      const p = await consultationPayment(w);
      const { itemId } = await earning(w, p.paymentId, p.net);
      const po1 = await payout(w, 10);
      await run(`update doctor_payout_item set payout_id = '${po1}' where id = '${itemId}'`);
      expect(await markPaid(po1, w)).toBe('');
      const r = await refund(w, p.paymentId, '333.33', '66.67', '266.66');
      // Primer intento (sin origen) en su propio savepoint: falla por I-4 y no deja asiento huérfano.
      expect(await refundAdjustment(w, itemId, p.paymentId, r, '-266.66', null)).toMatch(/source_payout_id debe ser su payout/);
      expect((await one<{ n: string }>(sql`select count(*)::text as n from doctor_ledger_entry where refund_id = ${r}`)).n).toBe('0');
      // Segundo intento, con el payout pagado como origen: pasa con la misma clave de asiento (no hubo residuo).
      expect(await refundAdjustment(w, itemId, p.paymentId, r, '-266.66', po1)).toBe('');
      expect(await checkDeferred()).toBe('');
      // Un importe transferido no se revoca: se ajusta.
      expect(await tryRun(sql`update doctor_payout_item set eligibility_status = 'revoked', eligibility_revoked_at = now() where id = ${itemId}`))
        .toMatch(/ya transferido no se revoca/);
      expect(await reconciliation()).toEqual([]);
      // F1 no admite correction: el trigger lo rechaza (ningún asiento F1 corresponde a ese tipo) antes del CHECK
      // doctor_payout_adjustment_type_f1_chk, cuya existencia se verifica de forma estática.
      const entry = await one<{ id: string }>(sql`select id from doctor_ledger_entry where refund_id = ${r}`);
      expect(await tryRun(sql`insert into doctor_payout_adjustment (doctor_id, source_payout_id, doctor_payout_item_id, payment_id, type, amount,
        reason, created_by_type, ledger_entry_id) values (${w.f.doctorId}, ${po1}, ${itemId}, ${p.paymentId}, 'correction', -1.00, 'x', 'system',
        ${entry.id})`)).toMatch(/debe apuntar a su asiento/);
    }));

  it('[PAY-F1-10] webhooks e idempotencia: evento único, recibido inmutable, clave única', () =>
    scenario(async () => {
      await world();
      const ins = sql`insert into provider_webhook_event (provider, topic, data_id, request_id, signature_valid, payload)
        values ('mercado_pago', 'payment', '123', 'req-1', true, '{}'::jsonb)`;
      expect(await tryRun(ins)).toBe('');
      expect(await tryRun(ins)).toMatch(/provider_webhook_event_uq/);
      expect(await tryRun(sql`update provider_webhook_event set payload = '{"x":1}'::jsonb where data_id = '123'`)).toMatch(/no se modifica/);
      expect(await tryRun(sql`insert into provider_webhook_event (provider, topic, data_id, request_id, signature_valid, payload, status)
        values ('mercado_pago', 'payment', '124', 'req-2', false, '{}'::jsonb, 'processing')`)).toMatch(/signature_chk/);
      const key = sql`insert into idempotency_key (scope, key, request_hash) values ('payment.create', 'k-1', ${'a'.repeat(64)})`;
      expect(await tryRun(key)).toBe('');
      expect(await tryRun(key)).toMatch(/idempotency_key_uq/);
    }));

  it('[PAY-F1-11] configuración versionada: sin solapamientos y versiones inmutables', () =>
    scenario(async () => {
      const w = await world();
      expect(await tryRun(sql`insert into pei_fee_configuration (fixed_fee, effective_from, created_by) values (150, now(), ${w.admin})`))
        .toMatch(/pei_fee_configuration_no_overlap/);
      expect(await tryRun(sql`update pei_fee_configuration set fixed_fee = 1 where id = ${w.feeId}`)).toMatch(/no se modifica|solo puede cerrarse/);
      expect(await tryRun(sql`insert into processor_fee_schedule (provider, percentage_rate, fixed_fee, vat_rate, release_days, source,
        effective_from, created_by) values ('mercado_pago', 0.03, 4, 0.16, 14, 'x', now(), ${w.admin})`)).toMatch(/se solapa/);
    }));
});
