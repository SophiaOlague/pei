import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { transactionStorage } from '../../src/db/transaction-context';
import { InvalidAppointmentStateError, SlotUnavailableError } from '../../src/modules/appointments/domain/appointments.errors';
import { INITIAL_POLICY } from '../../src/modules/appointments/domain/cancellation-policy';
import { addLocalDays, localDateString } from '../../src/modules/appointments/domain/local-date';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { captureError, withRollback } from '../support/with-rollback';
import { FixedClock } from '../support/appointments-in-memory';
import {
  appointmentsUseCases, auditActions, bookablePatient, countM08Residue, firstSlot, historyOf, newAdmin, operatingDoctor,
} from '../support/appointments-integration';
import { assertSchemaHasM1, attempt, message } from '../support/m08-m1-sql';

// Salvaguarda de destino: solo contra la rama de pruebas mediante C2.
assertC2BranchTarget();

// DA-6 (reagendamiento) contra PostgreSQL real, con los casos de uso y adaptadores reales (Drizzle, auditoría, políticas
// de M02/M03, AgendaService de M07). Exige 0013–0016 (assertSchemaHasM1 y agenda_block_ends_at NOT NULL). Todo ocurre
// dentro de withRollback: nada se confirma; afterAll compara los conteos de las tablas de M08 con los de beforeAll.

const tx = () => transactionStorage.getStore()!;

function env() {
  const clock = new FixedClock(new Date());
  const uc = appointmentsUseCases(clock);
  // Día local a 2 días: la cita original queda a más del plazo de 24 h aunque ahora sean las 23:59.
  const day = addLocalDays(localDateString(clock.now()), 2);
  return { clock, uc, day };
}

// Precio 200.00 y política inicial vigentes, como en appointments.int-spec.ts: solo se publica una versión nueva (dentro
// del rollback) si la vigente no tiene esos valores.
async function configured(uc: ReturnType<typeof appointmentsUseCases>) {
  const admin = await newAdmin();
  const current = await captureError(uc.prices.current(admin));
  if (current || (await uc.prices.current(admin)).price !== '200.00') await uc.prices.publish(admin, '200.00', 'initial_setup');
  const policy = await captureError(uc.policies.current(admin));
  if (policy) await uc.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
  else {
    const v = await uc.policies.current(admin);
    if (v.refundDeadlineHours !== 24 || v.maxReschedules !== 2 || v.doctorWaitMinutes !== 30 || v.patientToleranceMinutes !== 15) {
      await uc.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
    }
  }
  return admin;
}

// Cita confirmada por el flujo real: retención y pago exitoso (confirmPaid; el pago es un identificador sintético).
async function confirmedAppointment(e: ReturnType<typeof env>) {
  const admin = await configured(e.uc);
  const d = await operatingDoctor(e.uc, admin);
  const p = await bookablePatient(admin);
  // Secuencial: una sola conexión de la transacción.
  const s1 = await firstSlot(e.uc, d.doctorProfileId, e.day, 0);
  const s2 = await firstSlot(e.uc, d.doctorProfileId, e.day, 1);
  const s3 = await firstSlot(e.uc, d.doctorProfileId, e.day, 2);
  const h = await e.uc.hold.execute(p, { doctorProfileId: d.doctorProfileId, startsAt: s1, reason: 'Revisión DA-6' });
  expect(await e.uc.confirmation.confirmPaid(h.id, `pay-${randomUUID()}`, '200.00')).toEqual({ result: 'confirmed' });
  return { admin, d, p, s1, s2, s3, originalId: h.id };
}

async function row(id: string) {
  const { rows } = await tx().execute<{
    status: string; scheduled_at: string; agenda_block_ends_at: string | null; price: string; reason: string; cancellation_policy_id: string;
    rescheduled_from_appointment_id: string | null; privacy_legal_acceptance_id: string | null; terms_legal_acceptance_id: string | null;
    payment_hold_expires_at: string | null; doctor_id: string; patient_id: string;
  }>(sql`select status::text as status, scheduled_at, agenda_block_ends_at, price::text as price, reason, cancellation_policy_id,
              rescheduled_from_appointment_id, privacy_legal_acceptance_id, terms_legal_acceptance_id, payment_hold_expires_at,
              doctor_id, patient_id
           from appointment where id = ${id}`);
  return rows[0];
}

const ms = (v: string | Date | null) => (v === null ? null : new Date(v).getTime());

describe('Reagendamiento contra PostgreSQL (DA-6, rollback)', () => {
  let before: Record<string, number>;

  beforeAll(async () => {
    await assertSchemaHasM1();
    // M-1c (0015): la columna es NOT NULL en el esquema conectado.
    const { rows } = await db.execute<{ is_nullable: string }>(sql`
      select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'appointment' and column_name = 'agenda_block_ends_at'`);
    if (rows[0]?.is_nullable !== 'NO') throw new Error('appointment-reschedule exige 0015 (agenda_block_ends_at NOT NULL)');
    before = await withRollback(() => countM08Residue());
  });

  afterAll(async () => {
    try {
      expect(await withRollback(() => countM08Residue())).toEqual(before);
    } finally {
      await db.$client.end();
    }
  });

  it('[TC-M08-420][DA-6][AP-26][DA-3] confirmed → rescheduled y cita nueva confirmed con precio, política, motivo, referencias legales y bloque', () =>
    withRollback(async () => {
      const e = env();
      const { d, p, s2, originalId } = await confirmedAppointment(e);
      const original = await row(originalId);
      expect(original.status).toBe('confirmed');
      expect(original.privacy_legal_acceptance_id).not.toBeNull();

      const view = await e.uc.reschedule.execute(p, originalId, s2);

      expect((await row(originalId)).status).toBe('rescheduled');
      const created = await row(view.id);
      const { rows: dur } = await tx().execute<{ m: number }>(sql`select appointment_duration_minutes as m from doctor_profile where id = ${d.doctorProfileId}`);
      expect(created).toMatchObject({
        status: 'confirmed', rescheduled_from_appointment_id: originalId, price: original.price, reason: original.reason,
        cancellation_policy_id: original.cancellation_policy_id, doctor_id: original.doctor_id, patient_id: original.patient_id,
        privacy_legal_acceptance_id: original.privacy_legal_acceptance_id, terms_legal_acceptance_id: original.terms_legal_acceptance_id,
        payment_hold_expires_at: null,
      });
      expect(ms(created.scheduled_at)).toBe(s2.getTime());
      // Bloque guardado: inicio nuevo + duración vigente del médico (DA-3).
      expect(ms(created.agenda_block_ends_at)).toBe(s2.getTime() + Number(dur[0].m) * 60_000);
      expect(view).toMatchObject({ status: 'confirmed', rescheduledFromAppointmentId: originalId });

      expect(await historyOf(originalId)).toContainEqual({ status: 'rescheduled', changed_by_type: 'patient', reason: 'rescheduled' });
      expect(await historyOf(view.id)).toEqual([{ status: 'confirmed', changed_by_type: 'patient', reason: 'rescheduled' }]);
      const audit = (await auditActions(view.id)).filter((a) => a.action === 'appointment.status.rescheduled');
      expect(audit).toHaveLength(1);
      expect(audit[0].metadata).toMatchObject({ fromId: originalId, toId: view.id, rootId: originalId, n: 1 });
    }));

  it('[TC-M08-421][DA-6][DA-7] una segunda reprogramación desde la nueva cuenta la cadena desde la raíz; la original ya no se reprograma (409)', () =>
    withRollback(async () => {
      const e = env();
      const { p, s2, s3, originalId } = await confirmedAppointment(e);
      const first = await e.uc.reschedule.execute(p, originalId, s2);
      expect(await captureError(e.uc.reschedule.execute(p, originalId, s3))).toBeInstanceOf(InvalidAppointmentStateError);
      const second = await e.uc.reschedule.execute(p, first.id, s3);
      expect((await row(first.id)).status).toBe('rescheduled');
      expect((await row(second.id)).rescheduled_from_appointment_id).toBe(first.id);
      const audit = (await auditActions(second.id)).filter((a) => a.action === 'appointment.status.rescheduled');
      expect(audit[0].metadata).toMatchObject({ fromId: first.id, toId: second.id, rootId: originalId, n: 2 });
    }));

  it('[TC-M08-422][DA-6][RB-1] un horario ocupado se rechaza y la operación se revierte entera: la original sigue confirmed y no hay cita nueva', () =>
    withRollback(async () => {
      const e = env();
      const { admin, d, p, s2, originalId } = await confirmedAppointment(e);
      const other = await bookablePatient(admin);
      await e.uc.hold.execute(other, { doctorProfileId: d.doctorProfileId, startsAt: s2, reason: 'otra' });
      const count = async () => Number((await tx().execute<{ n: string }>(sql`select count(*) as n from appointment where doctor_id = ${d.doctorProfileId}`)).rows[0].n);
      const n = await count();
      expect(await captureError(e.uc.reschedule.execute(p, originalId, s2))).toBeInstanceOf(SlotUnavailableError);
      // El cambio a rescheduled se hizo antes de comprobar el horario: el SAVEPOINT de la unidad lo revirtió.
      expect((await row(originalId)).status).toBe('confirmed');
      expect(await count()).toBe(n);
      expect(await historyOf(originalId)).not.toContainEqual(expect.objectContaining({ status: 'rescheduled' }));
    }));

  it('[TC-M08-423][DA-6][RN-012] tras reprogramar, el horario original queda libre para otro paciente', () =>
    withRollback(async () => {
      const e = env();
      const { admin, d, p, s1, s2, originalId } = await confirmedAppointment(e);
      await e.uc.reschedule.execute(p, originalId, s2);
      const other = await bookablePatient(admin);
      const taken = await e.uc.hold.execute(other, { doctorProfileId: d.doctorProfileId, startsAt: s1, reason: 'horario liberado' });
      expect(taken.status).toBe('pending_payment');
    }));

  it('[TC-M08-424][DA-6][AP-26][M-1c] la BD protege el resultado: rescheduled es final; referencias y fin del bloque inmutables; NOT NULL', () =>
    withRollback(async () => {
      const e = env();
      const { p, s2, originalId } = await confirmedAppointment(e);
      const view = await e.uc.reschedule.execute(p, originalId, s2);
      expect(message(await attempt(`update appointment set status = 'confirmed' where id = '${originalId}'`))).toMatch(/Transición de cita no permitida/);
      expect(message(await attempt(`update appointment set privacy_legal_acceptance_id = null, terms_legal_acceptance_id = null where id = '${view.id}'`))).toMatch(/no pueden cambiar después de reservar/);
      expect(message(await attempt(`update appointment set agenda_block_ends_at = agenda_block_ends_at + interval '5 minutes' where id = '${view.id}'`))).toMatch(/no puede cambiar/);
      // NOT NULL de 0015: una cita sin fin de bloque no se puede insertar.
      expect(message(await attempt(`insert into appointment (patient_id, doctor_id, type, status, scheduled_at, reason, price, cancellation_policy_id)
        select patient_id, doctor_id, type, 'confirmed', scheduled_at + interval '400 days', reason, price, cancellation_policy_id from appointment where id = '${view.id}'`)))
        .toMatch(/agenda_block_ends_at|null value/);
    }));
});
