import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { getDbContext } from '../../src/db/transaction-context';
import { DrizzleUnitOfWork } from '../../src/common/infrastructure/drizzle-unit-of-work';
import { DrizzleAuditTrail } from '../../src/modules/audit/infrastructure/drizzle-audit-trail';
import { DoctorNotOperationalError } from '../../src/modules/doctors/domain/doctor.errors';
import { INITIAL_POLICY } from '../../src/modules/appointments/domain/cancellation-policy';
import { addLocalDays, localDateString } from '../../src/modules/appointments/domain/local-date';
import { OutcomeRecordedFeedService, type OutcomeRecordedNotice } from '../../src/modules/appointments/application/integration/outcome-recorded-feed';
import { DrizzleAppointmentRepository } from '../../src/modules/appointments/infrastructure/persistence/drizzle-appointment.repository';
import { DrizzleOutcomeRecordedAuditReader } from '../../src/modules/appointments/infrastructure/persistence/drizzle-outcome-recorded-audit.reader';
import { money } from '../../src/modules/payments/domain/money';
import { AppointmentNoShowRefundHandler, noticeFromOutcomeEvent } from '../../src/modules/payments/application/use-cases/appointment-no-show-refund.handler';
import { ReconcileNoShowRefundsUseCase } from '../../src/modules/payments/application/use-cases/reconcile-no-show-refunds.use-case';
import { REFUND_NO_SHOW_SCOPE, RefundsUseCases } from '../../src/modules/payments/application/use-cases/refunds.use-cases';
import { DrizzleIdempotencyKeyRepository, DrizzlePaymentRepository } from '../../src/modules/payments/infrastructure/persistence/drizzle-payments.repositories';
import { DrizzleRefundRepository } from '../../src/modules/payments/infrastructure/persistence/drizzle-refunds.repository';
import { DrizzleRootPaymentLookup } from '../../src/modules/payments/infrastructure/persistence/drizzle-root-payment-lookup';
import { SessionEngine } from '../../src/modules/video/application/session-engine';
import { DoctorSessionUseCases } from '../../src/modules/video/application/use-cases/doctor-session.use-cases';
import { EvaluateSessionsUseCase } from '../../src/modules/video/application/use-cases/evaluate-sessions.use-case';
import { PatientSessionUseCases } from '../../src/modules/video/application/use-cases/patient-session.use-cases';
import { SessionAccess } from '../../src/modules/video/application/use-cases/session-access';
import { PolicyDoctorOperationalCheck, RandomUuidGenerator } from '../../src/modules/video/infrastructure/doctor-operational.adapter';
import { DrizzleMeetingRepository } from '../../src/modules/video/infrastructure/persistence/drizzle-meeting.repository';
import { SessionNotOpenError } from '../../src/modules/video/domain/video.errors';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { captureError, withRollback } from '../support/with-rollback';
import { FixedClock } from '../support/appointments-in-memory';
import { FakeVideoProvider } from '../support/video-in-memory';
import { appointmentsUseCases, bookablePatient, countM08Residue, firstSlot, historyOf, newAdmin, operatingDoctor } from '../support/appointments-integration';
import { PDF } from '../support/doctors-integration';

// Salvaguarda de destino: solo contra la rama de pruebas mediante C2 (falla al cargar el módulo en cualquier otro caso).
assertC2BranchTarget();

// Videoconsulta, primera entrega, contra PostgreSQL real (0019 aplicada en C2). Todo dentro de withRollback: nada se
// confirma, así que no queda residuo (se comprueba al final). Adaptadores reales: Drizzle (meeting, eventos, citas,
// auditoría, pagos y reembolsos), M08, M03 y la unidad de trabajo. Dobles: solo el proveedor de video (decisión 13) y el
// proveedor de reembolsos (no se llama a Stripe). Las acciones AFTER_COMMIT (evento en memoria y revocación) no se
// ejecutan porque la transacción exterior nunca se confirma: el reembolso se prueba con el manejador y el barrido.

const tx = () => getDbContext();
const MINUTE = 60_000;

function setup() {
  const clock = new FixedClock(new Date());
  const uc = appointmentsUseCases(clock);
  const uow = new DrizzleUnitOfWork();
  const meetings = new DrizzleMeetingRepository();
  const provider = new FakeVideoProvider();
  const operational = new PolicyDoctorOperationalCheck(uc.doctors.policy);
  const engine = new SessionEngine(meetings, new RandomUuidGenerator(), clock, uc.session);
  const access = new SessionAccess(meetings, provider);
  return {
    clock, uc, uow, meetings, provider,
    patient: new PatientSessionUseCases(uow, engine, access),
    doctor: new DoctorSessionUseCases(uow, uow, new DrizzleAuditTrail(), clock, meetings, provider, operational, uc.session, engine, access),
    sweep: new EvaluateSessionsUseCase(uow, meetings, clock, engine),
  };
}
type Env = ReturnType<typeof setup>;

async function configured(uc: Env['uc']) {
  const admin = await newAdmin();
  const current = await captureError(uc.prices.current(admin));
  if (current || (await uc.prices.current(admin)).price !== '200.00') await uc.prices.publish(admin, '200.00', 'initial_setup');
  // La versión vigente debe ser la configuración inicial (AP-22); solo se publica si no existe o es distinta.
  const policy = await captureError(uc.policies.current(admin));
  const p = policy ? null : await uc.policies.current(admin);
  const same = p && (Object.keys(INITIAL_POLICY) as (keyof typeof INITIAL_POLICY)[]).every((k) => (p as unknown as Record<string, unknown>)[k] === INITIAL_POLICY[k]);
  if (!same) await uc.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
  return admin;
}

// Cita confirmada real (reserva + confirmación de M08) con médico habilitado y paciente con registro completo.
async function confirmedAppointment(env: Env) {
  const admin = await configured(env.uc);
  const doctor = await operatingDoctor(env.uc, admin);
  const patient = await bookablePatient(admin);
  const day = addLocalDays(localDateString(env.clock.now()), 2);
  const startsAt = await firstSlot(env.uc, doctor.doctorProfileId, day);
  const hold = await env.uc.hold.execute(patient, { doctorProfileId: doctor.doctorProfileId, startsAt, reason: 'Videoconsulta C2' });
  expect(await env.uc.confirmation.confirmPaid(hold.id, 'pay-video-c2', hold.price)).toEqual({ result: 'confirmed' });
  return { admin, doctor, patient, id: hold.id, t0: startsAt, price: hold.price };
}

const at = (t0: Date, minutes: number, seconds = 0) => new Date(t0.getTime() + minutes * MINUTE + seconds * 1000);
async function keepAlive(env: Env, c: Awaited<ReturnType<typeof confirmedAppointment>>, who: ('patient' | 'doctor')[], from: number, to: number) {
  // Cada 40 s (por debajo del corte de 45 s) para limitar las idas y vueltas a Neon.
  for (let s = from * 60; s <= to * 60; s += 40) {
    env.clock.current = at(c.t0, 0, s);
    if (who.includes('patient')) await env.patient.presence(c.patient, c.id);
    if (who.includes('doctor')) await env.doctor.presence(c.doctor, c.id);
  }
}

async function meetingRow(appointmentId: string) {
  const { rows } = await tx().execute<Record<string, unknown>>(sql`select * from meeting where appointment_id = ${appointmentId}`);
  return rows[0];
}
async function eventsOf(appointmentId: string) {
  const { rows } = await tx().execute<{ participant: string; event_type: string; occurred_at: Date }>(sql`
    select e.participant, e.event_type, e.occurred_at from meeting_session_event e join meeting m on m.id = e.meeting_id
     where m.appointment_id = ${appointmentId} order by e.occurred_at, e.created_at, e.id`);
  return rows.map((r) => [r.participant, r.event_type, new Date(r.occurred_at).toISOString()]);
}
async function statusOf(appointmentId: string) {
  const { rows } = await tx().execute<{ status: string }>(sql`select status from appointment where id = ${appointmentId}`);
  return rows[0].status;
}
async function auditOf(appointmentId: string, action: string) {
  const { rows } = await tx().execute<{ metadata: Record<string, unknown> }>(sql`select metadata from audit_log where entity_id = ${appointmentId} and action = ${action}`);
  return rows.map((r) => r.metadata);
}
async function countVideoResidue() {
  const { rows } = await tx().execute<Record<string, string>>(sql`
    select (select count(*) from meeting) as meeting, (select count(*) from meeting_session_event) as meeting_session_event,
           (select count(*) from refund) as refund, (select count(*) from payment) as payment`);
  return Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v)]));
}

describe('Videoconsulta contra PostgreSQL (C2, rollback)', () => {
  let before: Record<string, number>;

  beforeAll(async () => {
    before = await withRollback(async () => ({ ...(await countM08Residue()), ...(await countVideoResidue()) }));
  });

  afterAll(async () => {
    try {
      expect(await withRollback(async () => ({ ...(await countM08Residue()), ...(await countVideoResidue()) }))).toEqual(before);
    } finally {
      await db.$client.end();
      expect(db.$client.totalCount).toBe(0);
    }
  });

  it('[TC-VID-300] 0019 está aplicada: enums, columnas, room_id opcional y triggers de solo inserción', () =>
    withRollback(async () => {
      const { rows: enums } = await tx().execute<{ typname: string; labels: string[] }>(sql`
        select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels from pg_enum e join pg_type t on t.oid = e.enumtypid
         where t.typname in ('meeting_session_event_type_enum', 'refund_reason_enum') group by t.typname order by t.typname`);
      const labels = (v: string[] | string) => (Array.isArray(v) ? v : v.replace(/^\{|\}$/g, '').split(','));
      expect(labels(enums[0].labels)).toEqual(['joined', 'left', 'left_voluntarily']);
      expect(labels(enums[1].labels).slice(-2)).toEqual(['no_show_doctor', 'no_show_both']);
      const { rows: cols } = await tx().execute<{ column_name: string; is_nullable: string }>(sql`
        select column_name, is_nullable from information_schema.columns where table_name = 'meeting'
           and column_name in ('room_id', 'patient_last_seen_at', 'doctor_last_seen_at', 'patient_provider_participant_id', 'doctor_provider_participant_id')
         order by column_name`);
      expect(cols).toHaveLength(5);
      expect(cols.every((c) => c.is_nullable === 'YES')).toBe(true);
      const { rows: triggers } = await tx().execute<{ tgname: string }>(sql`
        select tgname from pg_trigger where tgrelid = 'public.meeting_session_event'::regclass and not tgisinternal order by tgname`);
      expect(triggers.map((t) => t.tgname)).toEqual(['meeting_session_event_append_only', 'meeting_session_event_no_truncate']);
    }));

  it('[TC-VID-301] entrada, latidos, desconexión, reconexión y salida voluntaria: meeting y eventos persistidos', () =>
    withRollback(async () => {
      const env = setup();
      const c = await confirmedAppointment(env);
      env.clock.current = at(c.t0, -15, -1);
      expect(await captureError(env.patient.enter(c.patient, c.id))).toBeInstanceOf(SessionNotOpenError);
      expect(await meetingRow(c.id)).toBeUndefined();

      env.clock.current = at(c.t0, -15);
      expect((await env.patient.enter(c.patient, c.id)).patient.present).toBe(true);
      const created = await meetingRow(c.id);
      expect(created).toMatchObject({ status: 'scheduled', room_id: null, started_at: null });
      expect(new Date(created.patient_joined_at as string).toISOString()).toBe(at(c.t0, -15).toISOString());

      await keepAlive(env, c, ['patient'], -15, -14); // latidos en T0−15:00 y T0−14:20
      env.clock.current = at(c.t0, -13); // 60 s sin latido
      const late = await env.patient.presence(c.patient, c.id);
      expect(late.patient.present).toBe(false);
      await env.patient.enter(c.patient, c.id); // reconexión
      await env.patient.leave(c.patient, c.id);
      expect(await eventsOf(c.id)).toEqual([
        ['patient', 'joined', at(c.t0, -15).toISOString()],
        ['patient', 'left', at(c.t0, -15, 40).toISOString()], // hora del último latido
        ['patient', 'joined', at(c.t0, -13).toISOString()],
        ['patient', 'left_voluntarily', at(c.t0, -13).toISOString()],
      ]);
      expect(await statusOf(c.id)).toBe('confirmed');
    }));

  it('[TC-VID-302][RN-031] meeting_session_event es de solo inserción (UPDATE y DELETE rechazados)', () =>
    withRollback(async () => {
      const env = setup();
      const c = await confirmedAppointment(env);
      env.clock.current = c.t0;
      await env.patient.enter(c.patient, c.id);
      const uow = new DrizzleUnitOfWork();
      const update = await captureError(uow.runInTransaction(() => tx().execute(sql`update meeting_session_event set event_type = 'left'`)));
      const remove = await captureError(uow.runInTransaction(() => tx().execute(sql`delete from meeting_session_event`)));
      expect(String((update as Error).message)).toMatch(/solo inserción/);
      expect(String((remove as Error).message)).toMatch(/solo inserción/);
      expect(await eventsOf(c.id)).toHaveLength(1);
    }));

  it('[TC-VID-303][RF-18][RF-22] admisión, credenciales y finalización: duración real, completed, historial y auditoría', () =>
    withRollback(async () => {
      const env = setup();
      const c = await confirmedAppointment(env);
      env.clock.current = c.t0;
      await env.patient.enter(c.patient, c.id);
      await env.doctor.enter(c.doctor, c.id);
      env.clock.current = at(c.t0, 0, 20);
      expect((await env.doctor.admit(c.doctor, c.id)).phase).toBe('active');
      await env.patient.token(c.patient, c.id);
      await env.doctor.token(c.doctor, c.id);
      const active = await meetingRow(c.id);
      expect(active).toMatchObject({ status: 'active', room_id: `room-${c.id}`, patient_provider_participant_id: `participant-${c.id}:patient`, doctor_provider_participant_id: `participant-${c.id}:doctor` });

      env.clock.current = at(c.t0, 42, 20);
      const ended = await env.doctor.end(c.doctor, c.id);
      expect(ended).toMatchObject({ phase: 'ended', appointmentStatus: 'completed', durationSeconds: 42 * 60 });
      const row = await meetingRow(c.id);
      expect(row.status).toBe('ended');
      expect(new Date(row.ended_at as string).getTime() - new Date(row.started_at as string).getTime()).toBe(42 * MINUTE);
      expect(await statusOf(c.id)).toBe('completed');
      expect((await historyOf(c.id)).map((h) => h.status)).toContain('completed');
      expect(await auditOf(c.id, 'appointment.outcome.recorded')).toEqual([expect.objectContaining({ status: 'completed', refundOutcome: 'no_refund' })]);
      expect(await auditOf(c.id, 'video.session.admitted')).toHaveLength(1);
      expect(await auditOf(c.id, 'video.session.ended')).toEqual([expect.objectContaining({ durationSeconds: 42 * 60, doctorCanOperate: true, outcomeRecorded: true })]);
    }));

  it('[TC-VID-304][RN-140][C-33] un médico que pierde canOperate no admite, pero sí finaliza su consulta activa', () =>
    withRollback(async () => {
      const env = setup();
      const c = await confirmedAppointment(env);
      env.clock.current = c.t0;
      await env.patient.enter(c.patient, c.id);
      await env.doctor.enter(c.doctor, c.id);
      await env.doctor.admit(c.doctor, c.id);
      // Una cédula nueva devuelve al médico a pending (RN-004, C-7): pierde canOperate.
      await env.uc.doctors.submitLicense.execute(c.doctor, { licenseNumber: `VID${Math.floor(Math.random() * 1e9)}`, document: PDF });
      expect(await captureError(env.doctor.token(c.doctor, c.id))).toBeInstanceOf(DoctorNotOperationalError);
      env.clock.current = at(c.t0, 10);
      expect((await env.doctor.end(c.doctor, c.id)).phase).toBe('ended');
      expect(await auditOf(c.id, 'video.session.ended')).toEqual([expect.objectContaining({ doctorCanOperate: false })]);
    }));

  it('[TC-VID-305][RF-21] inasistencias persistidas: N5 por la sala (no_show_doctor) y N3 por el barrido (no_show_both)', () =>
    withRollback(async () => {
      const env = setup();
      const n5 = await confirmedAppointment(env);
      env.clock.current = at(n5.t0, 5);
      await env.patient.enter(n5.patient, n5.id);
      // El paciente entró a tiempo y el médico nunca llega: en D es no_show_doctor esté o no conectado (RN-025, RN-032).
      env.clock.current = at(n5.t0, 30);
      await env.patient.presence(n5.patient, n5.id);
      expect(await statusOf(n5.id)).toBe('no_show_doctor');
      expect(await auditOf(n5.id, 'appointment.outcome.recorded')).toEqual([expect.objectContaining({ status: 'no_show_doctor', refundOutcome: 'full_refund' })]);

      const n3 = await confirmedAppointment(env);
      env.clock.current = at(n3.t0, 30);
      const summary = await env.sweep.execute();
      expect(summary.errors).toEqual([]);
      expect(await statusOf(n3.id)).toBe('no_show_both');
      expect(await meetingRow(n3.id)).toBeUndefined(); // nadie entró: no hay sala
      expect((await historyOf(n3.id)).map((h) => h.status)).toContain('no_show_both');
    }), 240_000);

  it('[TC-VID-306][hueco B2] paciente tardío presente sin admisión: no_show_doctor en D en la base', () =>
    withRollback(async () => {
      const env = setup();
      const c = await confirmedAppointment(env);
      env.clock.current = at(c.t0, 20);
      await env.patient.enter(c.patient, c.id);
      await keepAlive(env, c, ['patient'], 20, 25); // último latido en T0+24:40
      env.clock.current = at(c.t0, 25);
      await env.doctor.enter(c.doctor, c.id);
      await keepAlive(env, c, ['patient', 'doctor'], 25, 30.5);
      expect((await env.patient.state(c.patient, c.id)).pendingResolution).toBeNull();
      expect(await statusOf(c.id)).toBe('no_show_doctor');
    }), 240_000);

  it('[TC-VID-307] consulta duradera de M08: el resultado se lee de la auditoría, verificado y con la raíz', () =>
    withRollback(async () => {
      const env = setup();
      const c = await confirmedAppointment(env);
      env.clock.current = at(c.t0, 30);
      await env.sweep.execute();
      expect(await statusOf(c.id)).toBe('no_show_both');
      const feed = new OutcomeRecordedFeedService(new DrizzleOutcomeRecordedAuditReader(), new DrizzleAppointmentRepository());
      const mine: OutcomeRecordedNotice[] = [];
      const anomalies: string[] = [];
      let after = null;
      do {
        const page = await feed.listOutcomes({ after, limit: 500 });
        mine.push(...page.items.filter((i) => i.appointmentId === c.id));
        anomalies.push(...page.anomalies.filter((a) => a.appointmentId === c.id).map((a) => a.reason));
        after = page.next;
      } while (after);
      expect(anomalies).toEqual([]);
      expect(mine).toEqual([expect.objectContaining({ appointmentId: c.id, rootAppointmentId: c.id, status: 'no_show_both', refundOutcome: 'full_refund' })]);
    }), 240_000);

  it('[TC-VID-308][RN-030] reembolso por inasistencia sobre el pago real: uno solo, idempotente por evento y por barrido', () =>
    withRollback(async () => {
      const env = setup();
      const c = await confirmedAppointment(env);
      const admin = c.admin.userProfileId!;
      // Pago capturado de la cita (Stripe simulado: no se llama al proveedor). Reutiliza la comisión de PEI y la tarifa
      // vigentes de la rama (sus versiones no se solapan); solo inserta si no existen.
      const vigente = async (table: string, extra = sql``) =>
        (await tx().execute<{ id: string; fixed_fee: string }>(sql`select id, fixed_fee from ${sql.raw(table)} where effective_from <= now() and (effective_until is null or effective_until > now()) ${extra} limit 1`)).rows[0];
      const feeRow = (await vigente('pei_fee_configuration')) ?? (await tx().execute<{ id: string; fixed_fee: string }>(sql`insert into pei_fee_configuration (fixed_fee, effective_from, created_by)
        values ('20.00', now() - interval '1 day', ${admin}) returning id, fixed_fee`)).rows[0];
      const fee = feeRow.id;
      const peiFee = Number(feeRow.fixed_fee).toFixed(2);
      const schedule = (await vigente('processor_fee_schedule', sql`and provider = 'stripe'`))?.id ?? (await tx().execute<{ id: string }>(sql`insert into processor_fee_schedule (provider, percentage_rate, fixed_fee, vat_rate,
        release_days, source, effective_from, created_by) values ('stripe', 0.036, 3.00, 0.16, 7, 'Referencia sintética de prueba de videoconsulta', now() - interval '1 day', ${admin}) returning id`)).rows[0].id;
      const { rows: [appt] } = await tx().execute<{ doctor_id: string; patient_id: string }>(sql`select doctor_id, patient_id from appointment where id = ${c.id}`);
      const paymentId = (await tx().execute<{ id: string }>(sql`insert into payment (doctor_id, patient_id, appointment_id, type, provider, provider_payment_id,
        status, amount, pei_fee_configuration_id, pei_fixed_fee, doctor_net_amount, processor_fee_schedule_id, provider_fee_estimated)
        values (${appt.doctor_id}, ${appt.patient_id}, ${c.id}, 'consultation', 'stripe', ${`pi_video_${c.id.slice(0, 8)}`}, 'succeeded', ${c.price}, ${fee}, ${peiFee},
          ${(Number(c.price) - Number(peiFee)).toFixed(2)}, ${schedule}, 10.20) returning id`)).rows[0].id;

      env.clock.current = at(c.t0, 30);
      await env.sweep.execute();
      expect(await statusOf(c.id)).toBe('no_show_both');

      let refunded = 0;
      const payments = new DrizzlePaymentRepository();
      const refunds = new RefundsUseCases({
        uow: new DrizzleUnitOfWork(), clock: env.clock, payments, locks: payments, refunds: new DrizzleRefundRepository(), keys: new DrizzleIdempotencyKeyRepository(),
        provider: {
          name: 'stripe',
          createRefund: async (r) => {
            refunded += 1;
            return { provider: 'stripe', providerRefundId: `re_video_${refunded}`, providerPaymentId: r.providerPaymentId, providerStatus: 'succeeded', status: 'succeeded', amount: r.amount ?? money(Math.round(Number(c.price) * 100)) };
          },
          getRefund: async () => { throw new Error('no se consulta'); },
        },
        paymentProvider: {
          getPayment: async (id) => ({
            provider: 'stripe', providerPaymentId: id, providerStatus: 'succeeded', status: 'refunded', externalReference: paymentId,
            amount: money(Math.round(Number(c.price) * 100)), refunded: money(Math.round(Number(c.price) * 100)), providerFeeActual: null, netReceived: null, moneyReleaseDate: null,
          }),
        },
        ids: { newId: () => crypto.randomUUID() },
      });
      const root = new DrizzleRootPaymentLookup();
      const handler = new AppointmentNoShowRefundHandler({
        ledger: { paymentForAppointment: (id) => root.paymentForRootAppointment(id) }, rootPayments: root, payments, refunds,
      });
      const event = noticeFromOutcomeEvent({ type: 'AppointmentOutcomeRecorded', appointmentId: c.id, patientProfileId: appt.patient_id, doctorProfileId: appt.doctor_id, occurredAt: env.clock.now().toISOString(), status: 'no_show_both', refundOutcome: 'full_refund' });

      const first = await handler.handle(event);
      expect(first).toMatchObject({ outcome: 'requested', refund: { status: 'succeeded', reason: 'no_show_both', amount: c.price } });
      expect(await handler.handle(event)).toEqual({ outcome: 'already_covered' });
      const feed = new OutcomeRecordedFeedService(new DrizzleOutcomeRecordedAuditReader(), new DrizzleAppointmentRepository());
      const swept = await new ReconcileNoShowRefundsUseCase({ feed, handler }).execute();
      expect(swept.errorSample.filter((e) => e.includes(c.id))).toEqual([]);

      expect(refunded).toBe(1);
      const { rows: refundRows } = await tx().execute<{ reason: string; status: string; amount: string; requested_by_type: string }>(sql`
        select reason, status, amount, requested_by_type from refund where payment_id = ${paymentId}`);
      expect(refundRows).toEqual([{ reason: 'no_show_both', status: 'succeeded', amount: c.price, requested_by_type: 'system' }]);
      const { rows: keys } = await tx().execute<{ scope: string; key: string }>(sql`select scope, key from idempotency_key where payment_id = ${paymentId}`);
      expect(keys).toEqual([{ scope: REFUND_NO_SHOW_SCOPE, key: paymentId }]);
      const { rows: [pay] } = await tx().execute<{ status: string }>(sql`select status from payment where id = ${paymentId}`);
      expect(pay.status).toBe('refunded');
    }), 240_000);
});
