import { randomUUID } from 'crypto';
import type { Actor } from '../../../common/application/actor';
import { FakeAgendaService, FixedClock, InMemoryAppointmentsUnitOfWork, InMemoryAppointmentsWorld } from '../../../../test/support/appointments-in-memory';
import type { AgendaService } from '../../agenda/application/use-cases/agenda.use-cases';
import { DoctorOccupancyService, HoldSlotUseCase, PatientSlotsService, ReleaseHoldUseCase } from './use-cases/booking.use-cases';
import { CancelByDoctorUseCase, CancelByPatientUseCase } from './use-cases/cancellation.use-cases';
import { CancellationPolicyService, ConsultationPriceService } from './use-cases/configuration.use-cases';
import { RescheduleByPatientUseCase } from './use-cases/reschedule.use-cases';
import { AppointmentConfirmationService } from './integration/appointment-integration.services';
import { APPOINTMENT_AUDIT_ACTIONS } from './appointments-audit-events';
import { AppointmentEventSubscribers, type AppointmentDomainEvent } from './appointment-events';
import { InvalidAppointmentStateError, SlotUnavailableError } from '../domain/appointments.errors';
import { INITIAL_POLICY } from '../domain/cancellation-policy';

// RF-51: eventos de dominio de M08, publicados solo después del «commit» de la unidad de trabajo en memoria (que
// reproduce la semántica AFTER_COMMIT de DrizzleUnitOfWork). Sin BD.

const NOW = new Date('2026-11-10T15:00:00Z');
const DAY = '2026-11-12';
const S1 = '2026-11-12T16:00:00.000Z';
const S2 = '2026-11-12T16:30:00.000Z';
const S3 = '2026-11-12T17:00:00.000Z';

const actor = (role: 'patient' | 'doctor' | 'admin', userProfileId: string = randomUUID()): Actor => ({
  userId: `u-${userProfileId}`, userProfileId, role, ipAddress: '203.0.113.9', userAgent: 'PEI-M08-test',
});

async function setup() {
  const world = new InMemoryAppointmentsWorld();
  const uow = new InMemoryAppointmentsUnitOfWork(world);
  const clock = new FixedClock(NOW);
  const agenda = new FakeAgendaService(world);
  agenda.days[DAY] = [S1, S2, S3];
  const slots = new PatientSlotsService(agenda as unknown as AgendaService, new DoctorOccupancyService(world), clock);
  const policies = new CancellationPolicyService(uow, world, world.policies, clock);
  const admin = actor('admin');
  await new ConsultationPriceService(uow, world, world, clock).publish(admin, '200.00', 'initial_setup');
  await policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
  const policyId = (await policies.current(admin)).id;
  const doctor = actor('doctor');
  const doctorId = randomUUID();
  world.addDoctor({ id: doctorId, userProfileId: doctor.userProfileId! });
  const patient = actor('patient');
  const patientId = randomUUID();
  world.addPatient({ id: patientId, userProfileId: patient.userProfileId! });
  const confirmed = (at = S1) => {
    const id = randomUUID();
    world.seedAppointment({ id, patientId, doctorId, scheduledAt: new Date(at), cancellationPolicyId: policyId, privacyLegalAcceptanceId: 'p', termsLegalAcceptanceId: 't' });
    return id;
  };
  const pending = (minutesLeft: number, at = S2) => {
    const id = randomUUID();
    world.seedAppointment({
      id, patientId, doctorId, scheduledAt: new Date(at), cancellationPolicyId: policyId, status: 'pending_payment',
      paymentHoldExpiresAt: new Date(NOW.getTime() + minutesLeft * 60_000),
    });
    return id;
  };
  // El paso del tiempo ocurre ANTES de cada caso, no entre la retención y su vencimiento.
  uow.published.length = 0;
  return {
    world, uow, clock, doctor, doctorId, patient, patientId, confirmed, pending,
    hold: new HoldSlotUseCase(uow, world, world, world, world.policies, world, world, slots, clock, world, uow.events),
    release: new ReleaseHoldUseCase(uow, world, world, clock, uow.events),
    cancelPatient: new CancelByPatientUseCase(uow, world, world, world.policies, clock, uow.events),
    cancelDoctor: new CancelByDoctorUseCase(uow, world, world, world, clock, uow.events),
    reschedule: new RescheduleByPatientUseCase(uow, world, world, world.policies, world, world, slots, clock, uow.events),
    confirmation: new AppointmentConfirmationService(uow, world, world, clock, uow.events),
  };
}
type Env = Awaited<ReturnType<typeof setup>>;
const types = (env: Env) => env.uow.published.map((e) => e.type);
const actions = (env: Env) => env.world.state.audit.map((e) => e.action);

describe('Eventos de dominio de la cita (RF-51)', () => {
  it('[TC-M08-400][RF-51] confirmPaid emite AppointmentConfirmed una sola vez; la retención no emite nada', async () => {
    const env = await setup();
    const held = await env.hold.execute(env.patient, { doctorProfileId: env.doctorId, startsAt: new Date(S1), reason: 'Revisión' });
    expect(env.uow.published).toEqual([]);
    expect(await env.confirmation.confirmPaid(held.id, 'pay-1', '200.00')).toEqual({ result: 'confirmed' });
    expect(env.uow.published).toEqual([{
      type: 'AppointmentConfirmed', appointmentId: held.id, patientProfileId: env.patientId, doctorProfileId: env.doctorId,
      occurredAt: NOW.toISOString(), scheduledAt: S1, paymentId: 'pay-1',
    }]);
    // Webhook duplicado e importe distinto: sin eventos nuevos; la auditoría se conserva.
    expect(await env.confirmation.confirmPaid(held.id, 'pay-1', '200.00')).toEqual({ result: 'already_confirmed' });
    const other = env.pending(5, S3);
    expect(await env.confirmation.confirmPaid(other, 'pay-2', '1.00')).toMatchObject({ result: 'not_confirmable', reason: 'amount_mismatch' });
    expect(types(env)).toEqual(['AppointmentConfirmed']);
    expect(actions(env)).toContain(APPOINTMENT_AUDIT_ACTIONS.confirmed);
    expect(actions(env)).toContain(APPOINTMENT_AUDIT_ACTIONS.paymentNotConfirmable);
  });

  it('[TC-M08-401][RF-15] la cancelación válida del paciente y del médico emite AppointmentCanceled con origen, motivo y resultado', async () => {
    const env = await setup();
    const byPatient = env.confirmed(S1);
    const byDoctor = env.confirmed(S3);
    await env.cancelPatient.execute(env.patient, byPatient, '  Viaje  ');
    await env.cancelDoctor.execute(env.doctor, byDoctor, 'Emergencia en hospital');
    expect(env.uow.published).toEqual([
      { type: 'AppointmentCanceled', appointmentId: byPatient, patientProfileId: env.patientId, doctorProfileId: env.doctorId, occurredAt: NOW.toISOString(), canceledBy: 'patient', reason: 'Viaje', refundOutcome: 'full_refund' },
      { type: 'AppointmentCanceled', appointmentId: byDoctor, patientProfileId: env.patientId, doctorProfileId: env.doctorId, occurredAt: NOW.toISOString(), canceledBy: 'doctor', reason: 'Emergencia en hospital', refundOutcome: 'full_refund' },
    ]);
    expect(actions(env).filter((a) => a === APPOINTMENT_AUDIT_ACTIONS.canceled)).toHaveLength(2);
  });

  it('[TC-M08-402][RF-15] una cancelación rechazada no emite eventos', async () => {
    const env = await setup();
    const held = env.pending(5);
    await expect(env.cancelPatient.execute(env.patient, held)).rejects.toThrow(InvalidAppointmentStateError);
    const done = env.confirmed();
    await env.cancelPatient.execute(env.patient, done);
    env.uow.published.length = 0;
    await expect(env.cancelPatient.execute(env.patient, done)).rejects.toThrow(InvalidAppointmentStateError);
    await expect(env.cancelDoctor.execute(env.doctor, env.confirmed(S3), 'corto')).rejects.toThrow();
    expect(env.uow.published).toEqual([]);
  });

  it('[TC-M08-403][DA-6] el reagendamiento emite un solo AppointmentRescheduled con la cita original, la nueva y la raíz', async () => {
    const env = await setup();
    const root = env.confirmed(S1);
    const first = await env.reschedule.execute(env.patient, root, new Date(S2));
    const second = await env.reschedule.execute(env.patient, first.id, new Date(S3));
    expect(env.uow.published).toEqual([
      {
        type: 'AppointmentRescheduled', appointmentId: first.id, patientProfileId: env.patientId, doctorProfileId: env.doctorId, occurredAt: NOW.toISOString(),
        fromAppointmentId: root, toAppointmentId: first.id, rootAppointmentId: root, rescheduleNumber: 1, scheduledAt: S2,
      },
      {
        type: 'AppointmentRescheduled', appointmentId: second.id, patientProfileId: env.patientId, doctorProfileId: env.doctorId, occurredAt: NOW.toISOString(),
        fromAppointmentId: first.id, toAppointmentId: second.id, rootAppointmentId: root, rescheduleNumber: 2, scheduledAt: S3,
      },
    ]);
    expect(actions(env).filter((a) => a === APPOINTMENT_AUDIT_ACTIONS.rescheduled)).toHaveLength(2);
    // Un reagendamiento rechazado no emite nada.
    env.uow.published.length = 0;
    await expect(env.reschedule.execute(env.patient, root, new Date(S2))).rejects.toThrow(InvalidAppointmentStateError);
    expect(env.uow.published).toEqual([]);
  });

  it('[TC-M08-404][RN-012][DA-9] cada vía de vencimiento emite AppointmentExpired una sola vez, con su causa', async () => {
    const env = await setup();
    // Liberación por el paciente.
    const released = env.pending(5, S1);
    await env.release.execute(env.patient, released);
    // Pago fallido, dos veces: la segunda no encuentra pending_payment.
    const failed = env.pending(5, S2);
    await env.confirmation.markPaymentFailed(failed);
    await env.confirmation.markPaymentFailed(failed);
    // Confirmación tardía: vence por tiempo; un pago fallido o una reserva posteriores ya no la vencen otra vez.
    const late = env.pending(-1, S3);
    expect(await env.confirmation.confirmPaid(late, 'pay-3', '200.00')).toMatchObject({ result: 'not_confirmable', reason: 'expired' });
    await env.confirmation.markPaymentFailed(late);
    expect(env.uow.published.map((e) => [e.type, e.appointmentId, (e as { cause?: string }).cause])).toEqual([
      ['AppointmentExpired', released, 'released'],
      ['AppointmentExpired', failed, 'payment_failed'],
      ['AppointmentExpired', late, 'timeout'],
    ]);
    expect(actions(env).filter((a) => a === APPOINTMENT_AUDIT_ACTIONS.holdExpired)).toHaveLength(2);
    expect(actions(env)).toContain(APPOINTMENT_AUDIT_ACTIONS.holdReleased);
  });

  it('[TC-M08-405][DA-9] el vencimiento perezoso en la reserva emite AppointmentExpired; una segunda reserva no lo repite', async () => {
    const env = await setup();
    const stale = env.pending(-1, S1);
    const other = actor('patient');
    env.world.addPatient({ id: randomUUID(), userProfileId: other.userProfileId! });
    await env.hold.execute(other, { doctorProfileId: env.doctorId, startsAt: new Date(S2), reason: 'Revisión' });
    await env.hold.execute(other, { doctorProfileId: env.doctorId, startsAt: new Date(S2), reason: 'Revisión' });
    expect(env.uow.published).toEqual([{
      type: 'AppointmentExpired', appointmentId: stale, patientProfileId: env.patientId, doctorProfileId: env.doctorId, occurredAt: NOW.toISOString(), cause: 'timeout',
    }]);
  });

  it('[TC-M08-406][RF-51] si la transacción se revierte no se publica nada, aunque el evento se haya preparado antes del fallo', async () => {
    const env = await setup();
    // La reserva vence una retención y después falla (horario ocupado): se revierte también el vencimiento.
    env.pending(-1, S1);
    env.confirmed(S2);
    const other = actor('patient');
    env.world.addPatient({ id: randomUUID(), userProfileId: other.userProfileId! });
    await expect(env.hold.execute(other, { doctorProfileId: env.doctorId, startsAt: new Date(S2), reason: 'Revisión' })).rejects.toThrow(SlotUnavailableError);
    // Fallo de auditoría después de cambiar el estado: cancelación, confirmación y reagendamiento revertidos.
    const toCancel = env.confirmed(S3);
    env.world.failAuditOnce = true;
    await expect(env.cancelPatient.execute(env.patient, toCancel)).rejects.toThrow(/auditoría/);
    const toConfirm = env.pending(5, '2026-11-12T18:00:00.000Z');
    env.world.failAuditOnce = true;
    await expect(env.confirmation.confirmPaid(toConfirm, 'pay-9', '200.00')).rejects.toThrow(/auditoría/);
    env.world.failAuditOnce = true;
    await expect(env.reschedule.execute(env.patient, toCancel, new Date(S1))).rejects.toThrow(/auditoría/);
    expect(env.uow.published).toEqual([]);
    expect(env.world.state.appointments.find((a) => a.id === toCancel)!.status).toBe('confirmed');
  });

  it('[TC-M08-407][RF-51] AFTER_COMMIT: una unidad interior fallida descarta sus eventos; fuera de una unidad se publica enseguida', async () => {
    const env = await setup();
    const event = (id: string): AppointmentDomainEvent => ({
      type: 'AppointmentExpired', appointmentId: id, patientProfileId: 'p', doctorProfileId: 'd', occurredAt: NOW.toISOString(), cause: 'timeout',
    });
    await env.uow.runInTransaction(async () => {
      env.uow.events.publish(event('outer'));
      await env.uow.runInTransaction(async () => {
        env.uow.events.publish(event('inner-ok'));
      });
      await env.uow.runInTransaction(async () => {
        env.uow.events.publish(event('inner-failed'));
        throw new Error('fallo interior');
      }).catch(() => undefined);
      // Antes del «commit» exterior no se ha publicado nada.
      expect(env.uow.published).toEqual([]);
    });
    await expect(env.uow.runInTransaction(async () => {
      env.uow.events.publish(event('outer-failed'));
      throw new Error('fallo exterior');
    })).rejects.toThrow('fallo exterior');
    env.uow.events.publish(event('no-transaction'));
    await new Promise((r) => setImmediate(r));
    expect(env.uow.published.map((e) => e.appointmentId)).toEqual(['outer', 'inner-ok', 'no-transaction']);
  });

  it('[TC-M08-408][RF-51] un suscriptor que falla no afecta a los demás ni a la operación confirmada', async () => {
    const subscribers = new AppointmentEventSubscribers();
    const seen: string[] = [];
    subscribers.subscribe(() => {
      throw new Error('notificación caída');
    });
    const unsubscribe = subscribers.subscribe((e) => {
      seen.push(e.appointmentId);
    });
    const e: AppointmentDomainEvent = { type: 'AppointmentExpired', appointmentId: 'a1', patientProfileId: 'p', doctorProfileId: 'd', occurredAt: NOW.toISOString(), cause: 'released' };
    await expect(subscribers.dispatch(e)).resolves.toBeUndefined();
    unsubscribe();
    await subscribers.dispatch({ ...e, appointmentId: 'a2' });
    expect(seen).toEqual(['a1']);
  });
});
