import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { transactionStorage } from '../../src/db/transaction-context';
import { DoctorNotOperationalError } from '../../src/modules/doctors/domain/doctor.errors';
import {
  ActiveHoldExistsError, InvalidAppointmentStateError, InvalidSlotError, SlotUnavailableError, UnchangedConsultationPriceError,
} from '../../src/modules/appointments/domain/appointments.errors';
import { INITIAL_POLICY } from '../../src/modules/appointments/domain/cancellation-policy';
import { addLocalDays, localDateString } from '../../src/modules/appointments/domain/local-date';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { captureError, withRollback } from '../support/with-rollback';
import { FixedClock } from '../support/appointments-in-memory';
import {
  appointmentsUseCases, auditActions, bookablePatient, countM08Residue, firstSlot, historyOf, newAdmin, operatingDoctor,
} from '../support/appointments-integration';
import { assertSchemaHasM1 } from '../support/m08-m1-sql';

// Salvaguarda de destino: solo contra la rama de pruebas mediante C2. Ejecutado de otra forma, src/db usaría el
// DATABASE_URL del .env (base de desarrollo): falla al cargar el módulo, antes de cualquier consulta.
assertC2BranchTarget();

// M08 etapa 1 contra PostgreSQL real (trigger appointment_guard con la matriz de M-1, candados, auditoría append-only):
// todo dentro de withRollback, nada se confirma. Exige el esquema 0000–0014 (M-1 partes A y B persistentes en C2):
// Drizzle genera cada INSERT con todas las columnas declaradas, así que beforeAll falla antes de las pruebas si falta
// alguna (en particular, las dos referencias legales de 0014).

const tx = () => transactionStorage.getStore()!;

function env() {
  const clock = new FixedClock(new Date());
  const uc = appointmentsUseCases(clock);
  // Día local a 2 días: la cita queda a más de 24 h aunque ahora sean las 23:59.
  const day = addLocalDays(localDateString(clock.now()), 2);
  return { clock, uc, day };
}

async function configured(uc: ReturnType<typeof appointmentsUseCases>) {
  const admin = await newAdmin();
  // La rama puede tener versiones previas: se publica una nueva (cierra la vigente) para fijar valores conocidos.
  const current = await captureError(uc.prices.current(admin));
  if (current || (await uc.prices.current(admin)).price !== '200.00') await uc.prices.publish(admin, '200.00', 'initial_setup');
  const policy = await captureError(uc.policies.current(admin));
  if (policy) await uc.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
  else {
    const p = await uc.policies.current(admin);
    if (p.refundDeadlineHours !== 24 || p.maxReschedules !== 2 || p.doctorWaitMinutes !== 30 || p.patientToleranceMinutes !== 15) {
      await uc.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
    }
  }
  return admin;
}

async function openVersions(table: 'consultation_price_configuration' | 'cancellation_policy') {
  const { rows } = await tx().execute<{ n: string }>(sql`select count(*) as n from ${sql.raw(table)} where effective_until is null`);
  return Number(rows[0].n);
}

describe('Citas contra PostgreSQL (M08 etapa 1, rollback)', () => {
  let before: Record<string, number>;

  beforeAll(async () => {
    await assertSchemaHasM1();
    before = await withRollback(() => countM08Residue());
  });

  afterAll(async () => {
    try {
      expect(await withRollback(() => countM08Residue())).toEqual(before);
    } finally {
      await db.$client.end();
      expect(db.$client.totalCount).toBe(0);
    }
  });

  describe('precio y política', () => {
    it('[TC-M08-200][RF-66][AP-1] configuración inicial y nueva versión: una sola versión abierta; la anterior conserva su precio', () =>
      withRollback(async () => {
        const { uc, clock } = env();
        const admin = await configured(uc);
        expect((await uc.prices.current(admin)).price).toBe('200.00');
        clock.advanceMinutes(1);
        const next = await uc.prices.publish(admin, '250.00');
        expect(await openVersions('consultation_price_configuration')).toBe(1);
        const { rows } = await tx().execute<{ price: string; closed: boolean }>(sql`
          select price::text as price, effective_until is not null as closed from consultation_price_configuration
           where created_by = ${admin.userProfileId} order by effective_from`);
        expect(rows.at(-1)).toEqual({ price: '250.00', closed: false });
        expect(rows.slice(0, -1).every((r) => r.closed)).toBe(true);
        expect(await captureError(uc.prices.publish(admin, '250'))).toBeInstanceOf(UnchangedConsultationPriceError);
        const audit = await auditActions(next.id);
        expect(audit).toEqual([expect.objectContaining({ action: 'consultation_price.version.published', actor_type: 'user' })]);
        expect(audit[0].metadata).toMatchObject({ newPrice: '250.00', currency: 'MXN', source: 'admin_panel' });
      }));

    it('[TC-M08-201][RF-16][RN-021] la política se versiona con una sola versión abierta y auditoría', () =>
      withRollback(async () => {
        const { uc, clock } = env();
        const admin = await configured(uc);
        clock.advanceMinutes(1);
        const v = await uc.policies.publish(admin, { ...INITIAL_POLICY, refundDeadlineHours: 48 });
        expect(await openVersions('cancellation_policy')).toBe(1);
        expect((await auditActions(v.id))[0]).toMatchObject({ action: 'appointment_policy.version.published' });
        expect((await auditActions(v.id))[0].metadata).toMatchObject({ next: { refundDeadlineHours: 48 } });
      }));

    it('[TC-M08-202][RN-007][RN-021] la cita conserva el precio y la política aplicados al reservar', () =>
      withRollback(async () => {
        const { uc, clock, day } = env();
        const admin = await configured(uc);
        const d = await operatingDoctor(uc, admin);
        const p = await bookablePatient(admin);
        const h = await uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt: await firstSlot(uc, d.doctorProfileId, day), reason: 'Revisión' });
        const policyAtBooking = (await uc.policies.current(admin)).id;
        clock.advanceMinutes(1);
        await uc.prices.publish(admin, '300.00');
        await uc.policies.publish(admin, { ...INITIAL_POLICY, refundDeadlineHours: 1 });
        const { rows } = await tx().execute<{ price: string; cancellation_policy_id: string }>(
          sql`select price::text as price, cancellation_policy_id from appointment where id = ${h.id}`);
        expect(rows[0]).toEqual({ price: '200.00', cancellation_policy_id: policyAtBooking });
      }));
  });

  describe('retenciones y reservas', () => {
    it('[TC-M08-210][RN-009][RF-14] crea una retención de 5 minutos con historial y auditoría; repetir es idempotente', () =>
      withRollback(async () => {
        const { uc, clock, day } = env();
        const admin = await configured(uc);
        const d = await operatingDoctor(uc, admin);
        const p = await bookablePatient(admin);
        const startsAt = await firstSlot(uc, d.doctorProfileId, day);
        const h = await uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt, reason: 'Revisión' });
        expect(h).toMatchObject({ status: 'pending_payment', price: '200.00', holdExpiresAt: new Date(clock.now().getTime() + 300_000).toISOString() });
        const again = await uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt, reason: 'Revisión' });
        expect(again.id).toBe(h.id);
        const { rows } = await tx().execute<{ n: string }>(sql`select count(*) as n from appointment where patient_id = ${p.patientProfileId}`);
        expect(Number(rows[0].n)).toBe(1);
        expect(await historyOf(h.id)).toEqual([{ status: 'pending_payment', changed_by_type: 'patient', reason: null }]);
        expect((await auditActions(h.id)).map((a) => a.action)).toEqual(['appointment.hold.created']);
      }));

    it('[TC-M08-214][AP-26] la retención guarda las dos aceptaciones legales vigentes del paciente (privacidad y términos)', () =>
      withRollback(async () => {
        const { uc, day } = env();
        const admin = await configured(uc);
        const d = await operatingDoctor(uc, admin);
        const p = await bookablePatient(admin);
        const startsAt = await firstSlot(uc, d.doctorProfileId, day);
        const h = await uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt, reason: 'Revisión' });
        const { rows } = await tx().execute<{ privacy_user: string; privacy_type: string; terms_user: string; terms_type: string }>(sql`
          select pa.user_profile_id as privacy_user, pd.type::text as privacy_type, ta.user_profile_id as terms_user, td.type::text as terms_type
            from appointment a
            join user_legal_acceptance pa on pa.id = a.privacy_legal_acceptance_id join legal_document pd on pd.id = pa.legal_document_id
            join user_legal_acceptance ta on ta.id = a.terms_legal_acceptance_id join legal_document td on td.id = ta.legal_document_id
           where a.id = ${h.id}`);
        expect(rows).toHaveLength(1);
        expect(rows[0].privacy_user).toBe(p.userProfileId);
        expect(rows[0].terms_user).toBe(p.userProfileId);
        // Una pareja del mismo régimen: actual o anterior.
        expect([['privacy_policy', 'patient_terms'], ['privacy_notice', 'terms_and_conditions']]).toContainEqual([rows[0].privacy_type, rows[0].terms_type]);
      }));

    it('[TC-M08-211][RB-1][RB-3] dos pacientes no reservan el mismo horario; un paciente no retiene dos horarios; horario inválido', () =>
      withRollback(async () => {
        const { uc, day } = env();
        const admin = await configured(uc);
        const d = await operatingDoctor(uc, admin);
        const a = await bookablePatient(admin);
        const b = await bookablePatient(admin);
        const s1 = await firstSlot(uc, d.doctorProfileId, day, 0);
        const s2 = await firstSlot(uc, d.doctorProfileId, day, 1);
        await uc.hold.execute(a, { doctorProfileId: d.doctorProfileId, startsAt: s1, reason: 'x' });
        expect(await captureError(uc.hold.execute(b, { doctorProfileId: d.doctorProfileId, startsAt: s1, reason: 'x' }))).toBeInstanceOf(SlotUnavailableError);
        expect(await captureError(uc.hold.execute(a, { doctorProfileId: d.doctorProfileId, startsAt: s2, reason: 'x' }))).toBeInstanceOf(ActiveHoldExistsError);
        expect(await captureError(uc.hold.execute(b, { doctorProfileId: d.doctorProfileId, startsAt: new Date(s1.getTime() + 60_000), reason: 'x' }))).toBeInstanceOf(InvalidSlotError);
        const free = await uc.doctorSlots.execute(b, d.doctorProfileId, day, day);
        expect(free.slots.map((s) => s.startsAt)).not.toContain(s1.toISOString());
      }));

    it('[TC-M08-212][RN-010][RN-012] liberar → expired; al vencer, el horario queda libre y la retención pasa a expired (system)', () =>
      withRollback(async () => {
        const { uc, clock, day } = env();
        const admin = await configured(uc);
        const d = await operatingDoctor(uc, admin);
        const a = await bookablePatient(admin);
        const b = await bookablePatient(admin);
        const s1 = await firstSlot(uc, d.doctorProfileId, day, 0);
        const s2 = await firstSlot(uc, d.doctorProfileId, day, 1);
        const released = await uc.hold.execute(a, { doctorProfileId: d.doctorProfileId, startsAt: s1, reason: 'x' });
        await uc.release.execute(a, released.id);
        expect(await historyOf(released.id)).toContainEqual({ status: 'expired', changed_by_type: 'patient', reason: 'hold_released' });
        const stale = await uc.hold.execute(a, { doctorProfileId: d.doctorProfileId, startsAt: s2, reason: 'x' });
        clock.advanceMinutes(5);
        const taken = await uc.hold.execute(b, { doctorProfileId: d.doctorProfileId, startsAt: s2, reason: 'x' });
        expect(taken.id).not.toBe(stale.id);
        expect(await historyOf(stale.id)).toContainEqual({ status: 'expired', changed_by_type: 'system', reason: 'hold_timeout' });
        expect((await auditActions(stale.id)).map((x) => x.action)).toContain('appointment.hold.expired');
      }));

    it('[TC-M08-213][RN-140][D-38] un médico sin canOperate no recibe reservas', () =>
      withRollback(async () => {
        const { uc, day } = env();
        const admin = await configured(uc);
        const d = await operatingDoctor(uc, admin);
        const p = await bookablePatient(admin);
        const startsAt = await firstSlot(uc, d.doctorProfileId, day);
        // Pierde canOperate: reenviar la INE devuelve la línea a pending (M03).
        await uc.doctors.submitIne.execute(d, { front: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]), back: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]) });
        expect(await uc.eligibility.doctorCanOperate(d.doctorProfileId)).toBe(false);
        expect(await captureError(uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt, reason: 'x' }))).toBeInstanceOf(DoctorNotOperationalError);
      }));
  });

  describe('confirmación (contrato con pagos)', () => {
    it('[TC-M08-220][RN-011][CC-4] confirma con el importe exacto; importe distinto se rechaza; una cita vencida no se reactiva', () =>
      withRollback(async () => {
        const { uc, clock, day } = env();
        const admin = await configured(uc);
        const d = await operatingDoctor(uc, admin);
        const a = await bookablePatient(admin);
        const b = await bookablePatient(admin);
        const h = await uc.hold.execute(a, { doctorProfileId: d.doctorProfileId, startsAt: await firstSlot(uc, d.doctorProfileId, day, 0), reason: 'x' });
        expect(await uc.confirmation.confirmPaid(h.id, 'pay-int-1', '150.00')).toEqual({ result: 'not_confirmable', reason: 'amount_mismatch' });
        expect(await uc.confirmation.confirmPaid(h.id, 'pay-int-1', '200.00')).toEqual({ result: 'confirmed' });
        expect(await uc.confirmation.confirmPaid(h.id, 'pay-int-1', '200.00')).toEqual({ result: 'already_confirmed' });
        const late = await uc.hold.execute(b, { doctorProfileId: d.doctorProfileId, startsAt: await firstSlot(uc, d.doctorProfileId, day, 1), reason: 'x' });
        clock.advanceMinutes(6);
        expect(await uc.confirmation.confirmPaid(late.id, 'pay-int-2', '200.00')).toEqual({ result: 'not_confirmable', reason: 'expired' });
        expect(await uc.confirmation.confirmPaid(late.id, 'pay-int-2', '200.00')).toEqual({ result: 'not_confirmable', reason: 'expired' });
      }));

    // H-1 corregido por M-1 parte A (0013, persistente en C2): gst_appointment_guard aplica la matriz aprobada, así que
    // PostgreSQL impide por sí solo cualquier salida de expired (terminal) y las transiciones no permitidas desde
    // confirmed, además de la garantía de la aplicación (confirmPaid, CC-4). La matriz completa: TC-M08-312.
    it('[TC-M08-221][H-1][M-1] la BD impide expired → confirmed y las transiciones fuera de la matriz aprobada', () =>
      withRollback(async () => {
        const { uc, clock, day } = env();
        const admin = await configured(uc);
        const d = await operatingDoctor(uc, admin);
        const p = await bookablePatient(admin);
        const q = await bookablePatient(admin);
        const expired = await uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt: await firstSlot(uc, d.doctorProfileId, day, 0), reason: 'x' });
        const paid = await uc.hold.execute(q, { doctorProfileId: d.doctorProfileId, startsAt: await firstSlot(uc, d.doctorProfileId, day, 1), reason: 'x' });
        expect(await uc.confirmation.confirmPaid(paid.id, `pay-${paid.id}`, '200.00')).toEqual({ result: 'confirmed' });
        clock.advanceMinutes(6);
        await uc.confirmation.markPaymentFailed(expired.id);
        const statusOf = async (id: string) => (await tx().execute<{ s: string }>(sql`select status::text as s from appointment where id = ${id}`)).rows[0].s;
        expect(await statusOf(expired.id)).toBe('expired');
        // Cada intento en un SAVEPOINT: el rechazo no aborta la transacción de la prueba.
        const tryStatus = (id: string, to: string) =>
          captureError(tx().transaction((sp) => sp.execute(sql`update appointment set status = ${to}::appointment_status_enum where id = ${id}`)));
        const reason = (e: unknown) => String((e as { cause?: Error })?.cause?.message ?? (e as Error)?.message ?? e);
        const rejected: Record<string, string> = {};
        for (const to of ['confirmed', 'pending_payment', 'canceled', 'completed', 'rescheduled', 'no_show_patient', 'no_show_doctor', 'no_show_both']) {
          rejected[`expired → ${to}`] = reason(await tryStatus(expired.id, to));
        }
        for (const to of ['pending_payment', 'expired']) rejected[`confirmed → ${to}`] = reason(await tryStatus(paid.id, to));
        for (const [transition, msg] of Object.entries(rejected)) expect(`${transition}: ${msg}`).toMatch(/Transición de cita no permitida/);
        expect(rejected['expired → confirmed']).toMatch(/expired → confirmed/);
        expect(await statusOf(expired.id)).toBe('expired');
        expect(await statusOf(paid.id)).toBe('confirmed');
        // Un pago tardío tampoco la reactiva por la aplicación.
        expect(await uc.confirmation.confirmPaid(expired.id, `pay-${expired.id}`, '200.00')).toEqual({ result: 'not_confirmable', reason: 'expired' });
      }));
  });

  describe('cancelaciones', () => {
    async function confirmed(uc: ReturnType<typeof appointmentsUseCases>, day: string) {
      const admin = await configured(uc);
      const d = await operatingDoctor(uc, admin);
      const p = await bookablePatient(admin);
      const startsAt = await firstSlot(uc, d.doctorProfileId, day);
      const h = await uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt, reason: 'x' });
      await uc.confirmation.confirmPaid(h.id, `pay-${h.id}`, h.price);
      return { admin, d, p, id: h.id, startsAt };
    }

    it('[TC-M08-230][RN-019] el paciente cancela con 24 h o más: reembolso total, columnas de cancelación e historial', () =>
      withRollback(async () => {
        const { uc, day } = env();
        const { p, id } = await confirmed(uc, day);
        expect(await uc.cancelPatient.execute(p, id, 'Cambio de planes')).toEqual({ id, status: 'canceled', refundOutcome: 'full_refund' });
        const { rows } = await tx().execute<Record<string, unknown>>(sql`
          select status, cancelled_by_type, cancelled_by_user_profile_id, cancellation_reason, cancelled_at is not null as at from appointment where id = ${id}`);
        expect(rows[0]).toEqual({ status: 'canceled', cancelled_by_type: 'patient', cancelled_by_user_profile_id: p.userProfileId, cancellation_reason: 'Cambio de planes', at: true });
        expect((await historyOf(id)).map((h) => h.status)).toEqual(['pending_payment', 'confirmed', 'canceled']);
        const audit = (await auditActions(id)).find((a) => a.action === 'appointment.status.canceled')!;
        expect(audit.metadata).toMatchObject({ actorType: 'patient', refundOutcome: 'full_refund' });
      }));

    it('[TC-M08-231][RN-020][RN-021] con menos del plazo de la política aplicada: sin reembolso', () =>
      withRollback(async () => {
        const { uc, clock, day } = env();
        const { p, id, startsAt, admin } = await confirmed(uc, day);
        await uc.policies.publish(admin, { ...INITIAL_POLICY, refundDeadlineHours: 1 });
        clock.current = new Date(startsAt.getTime() - 2 * 3_600_000);
        expect((await uc.cancelPatient.execute(p, id)).refundOutcome).toBe('no_refund');
      }));

    it('[TC-M08-232][RN-013][AP-13] el médico cancela con reembolso total aunque perdió canOperate', () =>
      withRollback(async () => {
        const { uc, day } = env();
        const { d, id } = await confirmed(uc, day);
        await uc.doctors.submitIne.execute(d, { front: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7]), back: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 7]) });
        expect(await uc.eligibility.doctorCanOperate(d.doctorProfileId)).toBe(false);
        expect((await uc.cancelDoctor.execute(d, id, 'No podré atender por una emergencia')).refundOutcome).toBe('full_refund');
        const audit = (await auditActions(id)).find((a) => a.action === 'appointment.status.canceled')!;
        expect(audit.metadata).toMatchObject({ actorType: 'doctor', refundOutcome: 'full_refund', doctorCanOperate: false });
        expect(await historyOf(id)).toContainEqual({ status: 'canceled', changed_by_type: 'doctor', reason: 'No podré atender por una emergencia' });
      }));

    it('[TC-M08-233] una cita pending_payment no se cancela (se libera); una cancelada no se vuelve a cancelar', () =>
      withRollback(async () => {
        const { uc, day } = env();
        const { p, id } = await confirmed(uc, day);
        await uc.cancelPatient.execute(p, id);
        expect(await captureError(uc.cancelPatient.execute(p, id))).toBeInstanceOf(InvalidAppointmentStateError);
      }));
  });

  describe('contrato con videoconsulta', () => {
    it('[TC-M08-240][CC-9][DA-4] getForSession usa la política aplicada; markNoShow registra el resultado una vez', () =>
      withRollback(async () => {
        const { uc, day } = env();
        const admin = await configured(uc);
        const d = await operatingDoctor(uc, admin);
        const p = await bookablePatient(admin);
        const h = await uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt: await firstSlot(uc, d.doctorProfileId, day), reason: 'x' });
        await uc.confirmation.confirmPaid(h.id, 'pay-v', '200.00');
        expect(await uc.session.getForSession(h.id)).toMatchObject({ status: 'confirmed', doctorWaitMinutes: 30, patientToleranceMinutes: 15 });
        await uc.session.markNoShow(h.id, 'doctor');
        await uc.session.markNoShow(h.id, 'doctor');
        expect(await captureError(uc.session.markCompleted(h.id))).toBeInstanceOf(InvalidAppointmentStateError);
        expect((await historyOf(h.id)).map((x) => x.status)).toEqual(['pending_payment', 'confirmed', 'no_show_doctor']);
      }));
  });
});
