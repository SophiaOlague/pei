import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { computeStripeSignature } from '../../src/modules/payments/infrastructure/stripe/stripe-webhook-authenticator';
import type { RawWebhookRequest } from '../../src/modules/payments/application/ports/provider-webhook.port';
import { syntheticCurp } from './synthetic-identity';

// Fixtures SINTÉTICOS de la suite H-5 (webhooks de Stripe sobre PostgreSQL real en C2). Autorizados el 2026-11-16.
//
// - Todo lleva la marca wh-h5-<C2_RUN_ID>: ids de usuario, correos (@h5.test.invalid), motivo de la cita, `source` de la
//   tarifa, ids del proveedor (pi_test_whh5_…) y de los eventos (evt_whh5…).
// - Las versiones de configuración (cancellation_policy, pei_fee_configuration, processor_fee_schedule) son ventanas de
//   UN minuto cerradas en el año 2000: nunca están vigentes, así que ningún findEffective las elige. La tarifa es
//   `stripe` con valores nulos y no es una tarifa: solo existe como destino de la llave foránea de payment.
// - No se copia ninguna configuración de desarrollo ni se modifica ninguna fila existente de C2.
// - Se confirman (autocommit), como en el flujo real. Los triggers impiden borrar payment, provider_webhook_event, las
//   configuraciones versionadas y audit_log: esas filas quedan en C2 y se identifican por la marca.

export const RUN_ID = process.env.C2_RUN_ID ?? '';
if (!/^c2-\d{14}-[0-9a-f]{4}$/.test(RUN_ID)) throw new Error('payments-webhook-fixtures: C2_RUN_ID ausente o inválido (solo con el lanzador C2)');
export const MARK = `wh-h5-${RUN_ID}`;
// Variante sin guiones para los ids de Stripe (pi_/evt_ solo admiten [A-Za-z0-9_]).
export const COMPACT = RUN_ID.replace(/-/g, '');
export const EMAIL_DOMAIN = 'h5.test.invalid';
export const SYNTHETIC_SOURCE = `SINTÉTICO ${MARK}: fixture de pruebas H-5, solo destino de llave foránea. No es una tarifa.`;
export const PRICE = '200.00';
export const PEI_FIXED_FEE = '20.00';
export const DOCTOR_NET = '180.00';

const rows = async <T>(q: ReturnType<typeof sql>) => (await db.execute(q)).rows as T[];
const one = async <T>(q: ReturnType<typeof sql>) => (await rows<T>(q))[0];

export interface BaseFixtures {
  adminProfileId: string;
  patientProfileId: string;
  doctorProfileId: string;
  policyId: string;
  peiFeeId: string;
  scheduleId: string;
}

async function syntheticUser(role: 'admin' | 'patient' | 'doctor'): Promise<string> {
  const userId = `${MARK}-${role}`;
  await db.execute(sql`insert into "user" (id, name, email) values (${userId}, ${`WH-H5 SINTÉTICO ${role}`}, ${`${MARK}-${role}@${EMAIL_DOMAIN}`})`);
  const curp = role === 'admin' ? null : syntheticCurp();
  const profile = await one<{ id: string }>(sql`
    insert into user_profile (user_id, role, first_name, last_name, curp)
    values (${userId}, ${role}::role_enum, 'WH-H5', ${`SINTÉTICO ${MARK}`}, ${curp}) returning id`);
  return profile.id;
}

// Siguiente minuto libre del año 2000 en una tabla versionada (las versiones no pueden solaparse).
async function freeMinute2000(table: 'cancellation_policy' | 'pei_fee_configuration' | 'processor_fee_schedule'): Promise<{ from: string; until: string }> {
  const r = await one<{ from: string }>(sql`
    select to_char(coalesce(max(effective_until), timestamptz '2000-01-01 00:00:00+00') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "from"
    from ${sql.identifier(table)} where effective_from >= timestamptz '2000-01-01 00:00:00+00' and effective_from < timestamptz '2001-01-01 00:00:00+00'`);
  const from = new Date(r.from);
  return { from: from.toISOString(), until: new Date(from.getTime() + 60_000).toISOString() };
}

export async function createBaseFixtures(): Promise<BaseFixtures> {
  const adminProfileId = await syntheticUser('admin');
  const patientUserProfileId = await syntheticUser('patient');
  const doctorUserProfileId = await syntheticUser('doctor');
  const patient = await one<{ id: string }>(sql`insert into patient_profile (user_profile_id) values (${patientUserProfileId}) returning id`);
  const specialty = await one<{ id: string }>(sql`select id from specialty order by id limit 1`);
  if (!specialty) throw new Error('C2 no tiene especialidades');
  const doctor = await one<{ id: string }>(sql`insert into doctor_profile (user_profile_id, specialty_id) values (${doctorUserProfileId}, ${specialty.id}) returning id`);

  const pw = await freeMinute2000('cancellation_policy');
  const policy = await one<{ id: string }>(sql`
    insert into cancellation_policy (refund_deadline_hours, max_reschedules, doctor_wait_minutes, patient_tolerance_minutes,
                                     max_protected_wait_minutes, reconnect_grace_minutes, effective_from, effective_until, created_by)
    values (24, 2, 30, 15, 60, 5, ${pw.from}::timestamptz, ${pw.until}::timestamptz, ${adminProfileId}) returning id`);
  const fw = await freeMinute2000('pei_fee_configuration');
  const fee = await one<{ id: string }>(sql`
    insert into pei_fee_configuration (fixed_fee, currency, effective_from, effective_until, created_by)
    values (${PEI_FIXED_FEE}, 'MXN', ${fw.from}::timestamptz, ${fw.until}::timestamptz, ${adminProfileId}) returning id`);
  const sw = await freeMinute2000('processor_fee_schedule');
  const schedule = await one<{ id: string }>(sql`
    insert into processor_fee_schedule (provider, percentage_rate, fixed_fee, vat_rate, release_days, currency, source, effective_from, effective_until, created_by)
    values ('stripe', 0, 0, 0, 0, 'MXN', ${SYNTHETIC_SOURCE}, ${sw.from}::timestamptz, ${sw.until}::timestamptz, ${adminProfileId}) returning id`);
  return { adminProfileId, patientProfileId: patient.id, doctorProfileId: doctor.id, policyId: policy.id, peiFeeId: fee.id, scheduleId: schedule.id };
}

export interface CaseFixtures {
  caseId: string;
  appointmentId: string;
  paymentId: string;
  providerPaymentId: string;
}

let slot = 0;
// Cita en pending_payment (retención de 2 horas) y su pago en processing con un PaymentIntent ficticio.
// `atSlot` fija la hora (en horas desde 2099-01-01) para no coincidir con citas de otra ejecución del mismo médico.
export async function createCase(base: BaseFixtures, caseId: string, atSlot?: number): Promise<CaseFixtures> {
  slot += 1;
  const scheduledAt = new Date(Date.UTC(2099, 0, 1, 0, 0, 0) + (atSlot ?? slot) * 3_600_000);
  const appointment = await one<{ id: string }>(sql`
    insert into appointment (patient_id, doctor_id, type, status, scheduled_at, reason, price, cancellation_policy_id, payment_hold_expires_at, agenda_block_ends_at)
    values (${base.patientProfileId}, ${base.doctorProfileId}, 'scheduled', 'pending_payment', ${scheduledAt.toISOString()}::timestamptz, ${`${MARK}-${caseId}`},
            ${PRICE}, ${base.policyId}, now() + interval '2 hours', ${new Date(scheduledAt.getTime() + 1_800_000).toISOString()}::timestamptz) returning id`);
  const providerPaymentId = `pi_test_whh5_${COMPACT}_${caseId.replace(/-/g, '_')}`;
  const payment = await one<{ id: string }>(sql`
    insert into payment (doctor_id, patient_id, appointment_id, type, provider, provider_payment_id, provider_status, status, amount, currency,
                         pei_fee_configuration_id, pei_fixed_fee, doctor_net_amount, processor_fee_schedule_id, provider_fee_estimated)
    values (${base.doctorProfileId}, ${base.patientProfileId}, ${appointment.id}, 'consultation', 'stripe', ${providerPaymentId}, 'processing', 'processing',
            ${PRICE}, 'MXN', ${base.peiFeeId}, ${PEI_FIXED_FEE}, ${DOCTOR_NET}, ${base.scheduleId}, 0) returning id`);
  return { caseId, appointmentId: appointment.id, paymentId: payment.id, providerPaymentId };
}

// Evento de Stripe firmado EN MEMORIA con el secreto de la ejecución (no es el del endpoint real; nada sale a Stripe).
export function signedEvent(
  secret: string,
  input: { eventId: string; type: string; object: Record<string, unknown>; at: Date },
): RawWebhookRequest {
  const body = { id: input.eventId, object: 'event', type: input.type, livemode: false, created: Math.floor(input.at.getTime() / 1000), data: { object: input.object } };
  const rawBody = Buffer.from(JSON.stringify(body), 'utf8');
  const t = String(Math.floor(input.at.getTime() / 1000));
  return { url: '/webhooks/stripe', headers: { 'stripe-signature': `t=${t},v1=${computeStripeSignature(secret, t, rawBody)}` }, body, rawBody };
}

export const eventId = (caseId: string, n = 1) => `evt_whh5${COMPACT}${caseId.replace(/-/g, '')}${n}`;
export const newSecret = () => `whsec_h5${randomUUID().replace(/-/g, '')}`;

// Estado observable de un caso (para las invariantes).
export async function caseState(c: CaseFixtures) {
  const payment = await one<{ status: string; provider_fee_actual: string | null; net_received_amount: string | null; money_release_date: Date | null }>(sql`
    select status, provider_fee_actual::text, net_received_amount::text, money_release_date from payment where id = ${c.paymentId}`);
  const counts = await one<{ payments: number; history: number; confirmed: number; refunds: number }>(sql`
    select (select count(*)::int from payment where appointment_id = ${c.appointmentId}) as payments,
           (select count(*)::int from appointment_status_history where appointment_id = ${c.appointmentId}) as history,
           (select count(*)::int from appointment_status_history where appointment_id = ${c.appointmentId} and status = 'confirmed') as confirmed,
           (select count(*)::int from refund where payment_id = ${c.paymentId}) as refunds`);
  const appointment = await one<{ status: string }>(sql`select status::text from appointment where id = ${c.appointmentId}`);
  const events = await rows<{ request_id: string; status: string; processing_attempts: number; signature_valid: boolean; payment_id: string | null; last_error: string | null }>(sql`
    select request_id, status::text, processing_attempts, signature_valid, payment_id, last_error from provider_webhook_event
    where provider = 'stripe' and data_id = ${c.providerPaymentId} order by received_at, id`);
  return { payment, appointment: appointment.status, ...counts, events };
}
