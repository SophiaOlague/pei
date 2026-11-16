import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { FakeAgendaService, FixedClock, InMemoryAppointmentsUnitOfWork, InMemoryAppointmentsWorld } from '../../../../../test/support/appointments-in-memory';
import type { AgendaService } from '../../../agenda/application/use-cases/agenda.use-cases';
import { DoctorOccupancyService, HoldSlotUseCase, PatientSlotsService } from './booking.use-cases';
import { CancellationPolicyService, ConsultationPriceService } from './configuration.use-cases';
import { RescheduleByPatientUseCase } from './reschedule.use-cases';
import {
  AppointmentNotFoundError, BookingDisabledError, InvalidAppointmentInputError, InvalidAppointmentStateError, InvalidSlotError, PatientScheduleConflictError,
  RescheduleDeadlinePassedError, RescheduleLimitReachedError, SlotUnavailableError,
} from '../../domain/appointments.errors';
import { INITIAL_POLICY } from '../../domain/cancellation-policy';
import { APPOINTMENT_AUDIT_ACTIONS } from '../appointments-audit-events';

// DA-6, DA-7, DA-8, AP-7, AP-9 y AP-26: reagendamiento por el paciente, con los dobles en memoria (sin BD).

const NOW = new Date('2026-11-10T15:00:00Z');
const DAY = '2026-11-12';
const S1 = '2026-11-12T16:00:00.000Z';
const S2 = '2026-11-12T16:30:00.000Z';
const S3 = '2026-11-12T17:00:00.000Z';
const S4 = '2026-11-12T17:30:00.000Z';

const actor = (role: 'patient' | 'doctor' | 'admin', userProfileId: string = randomUUID()): Actor => ({
  userId: `u-${userProfileId}`, userProfileId, role, ipAddress: '203.0.113.9', userAgent: 'PEI-M08-test',
});

async function setup() {
  const world = new InMemoryAppointmentsWorld();
  const uow = new InMemoryAppointmentsUnitOfWork(world);
  const clock = new FixedClock(NOW);
  const agenda = new FakeAgendaService(world);
  agenda.days[DAY] = [S1, S2, S3, S4];
  const slots = new PatientSlotsService(agenda as unknown as AgendaService, new DoctorOccupancyService(world), clock);
  const prices = new ConsultationPriceService(uow, world, world, clock);
  const policies = new CancellationPolicyService(uow, world, world.policies, clock);
  const reschedule = new RescheduleByPatientUseCase(uow, world, world, world.policies, world, world, slots, clock, uow.events);
  const hold = new HoldSlotUseCase(uow, world, world, world, world.policies, world, world, slots, clock, world, uow.events);
  const admin = actor('admin');
  await prices.publish(admin, '200.00', 'initial_setup');
  await policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
  const policyId = (await policies.current(admin)).id;
  const doctorId = randomUUID();
  world.addDoctor({ id: doctorId, userProfileId: randomUUID() });
  const patient = actor('patient');
  const patientId = randomUUID();
  world.addPatient({ id: patientId, userProfileId: patient.userProfileId! });
  // Cita confirmada original, con precio y referencias propias (distintas de las "vigentes" del doble).
  const original = (over: Record<string, unknown> = {}) => {
    const id = randomUUID();
    world.seedAppointment({
      id, patientId, doctorId, scheduledAt: new Date(S1), cancellationPolicyId: policyId, price: '180.00', reason: 'Dolor de cabeza',
      privacyLegalAcceptanceId: 'acc-privacy-original', termsLegalAcceptanceId: 'acc-terms-original', ...over,
    });
    return id;
  };
  const run = (id: string, at: string, who: Actor = patient) => reschedule.execute(who, id, new Date(at));
  return { world, clock, policies, admin, policyId, doctorId, patient, patientId, original, run, hold };
}
type Env = Awaited<ReturnType<typeof setup>>;
const byId = (env: Env, id: string) => env.world.state.appointments.find((a) => a.id === id)!;
const snapshot = (env: Env) => structuredClone({ appointments: env.world.state.appointments, history: env.world.state.history, audit: env.world.state.audit.length });

describe('Reagendamiento por el paciente (DA-6, AP-7, AP-26)', () => {
  it('[TC-M08-370][DA-6][RN-018][AP-26] la original pasa a rescheduled y la nueva nace confirmed con precio, política, motivo y referencias originales', async () => {
    const env = await setup();
    const fromId = env.original();
    const view = await env.run(fromId, S3);
    expect(byId(env, fromId).status).toBe('rescheduled');
    const created = byId(env, view.id);
    expect(created).toMatchObject({
      status: 'confirmed', doctorId: env.doctorId, patientId: env.patientId, scheduledAt: new Date(S3), price: '180.00', reason: 'Dolor de cabeza',
      cancellationPolicyId: env.policyId, paymentHoldExpiresAt: null, rescheduledFromAppointmentId: fromId,
      privacyLegalAcceptanceId: 'acc-privacy-original', termsLegalAcceptanceId: 'acc-terms-original',
    });
    expect(view).toMatchObject({ status: 'confirmed', scheduledAt: S3, price: '180.00', rescheduledFromAppointmentId: fromId, holdExpiresAt: null });
    expect(env.world.state.history.filter((h) => [fromId, view.id].includes(h.appointmentId))).toEqual([
      { appointmentId: fromId, status: 'rescheduled', changedByType: 'patient', changedByUserProfileId: env.patient.userProfileId, reason: 'rescheduled' },
      { appointmentId: view.id, status: 'confirmed', changedByType: 'patient', changedByUserProfileId: env.patient.userProfileId, reason: 'rescheduled' },
    ]);
    const audit = env.world.state.audit.filter((e) => e.action === APPOINTMENT_AUDIT_ACTIONS.rescheduled);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entityType: 'appointment', entityId: view.id, metadata: { fromId, toId: view.id, rootId: fromId, n: 1 } });
  });

  it('[TC-M08-371][AP-26][RN-140] no lee las aceptaciones vigentes: copia las originales aunque el paciente ya no tenga una pareja vigente', async () => {
    const env = await setup();
    env.world.legalByPatient.set(env.patient.userProfileId!, null);
    const view = await env.run(env.original(), S3);
    expect(env.world.locks).not.toContain('legal:read');
    expect(byId(env, view.id)).toMatchObject({ privacyLegalAcceptanceId: 'acc-privacy-original', termsLegalAcceptanceId: 'acc-terms-original' });
  });

  it('[TC-M08-372][AP-26] una cita anterior a 0014 (sin referencias) se reagenda con las dos nulas', async () => {
    const env = await setup();
    const view = await env.run(env.original({ privacyLegalAcceptanceId: null, termsLegalAcceptanceId: null }), S3);
    expect(byId(env, view.id)).toMatchObject({ privacyLegalAcceptanceId: null, termsLegalAcceptanceId: null });
  });

  it('[TC-M08-373][DA-6][RN-012] el horario anterior queda libre y otro paciente puede reservarlo', async () => {
    const env = await setup();
    await env.run(env.original(), S3);
    const other = actor('patient');
    env.world.addPatient({ id: randomUUID(), userProfileId: other.userProfileId! });
    await expect(env.hold.execute(other, { doctorProfileId: env.doctorId, startsAt: new Date(S1), reason: 'Revisión' })).resolves.toMatchObject({ status: 'pending_payment' });
  });

  it('[TC-M08-374][DA-8] dentro del plazo de la política aplicada no se reagenda y no cambia nada', async () => {
    const env = await setup();
    const id = env.original();
    env.clock.current = new Date(new Date(S1).getTime() - 23.5 * 3_600_000);
    const before = snapshot(env);
    await expect(env.run(id, S3)).rejects.toThrow(RescheduleDeadlinePassedError);
    expect(snapshot(env)).toEqual(before);
  });

  it('[TC-M08-375][DA-7][RN-017] el contador se cuenta desde la raíz: con máximo 2, el tercer reagendamiento se rechaza', async () => {
    const env = await setup();
    const root = env.original();
    const first = await env.run(root, S2);
    const second = await env.run(first.id, S3);
    const audit = env.world.state.audit.filter((e) => e.action === APPOINTMENT_AUDIT_ACTIONS.rescheduled).map((e) => e.metadata);
    expect(audit).toEqual([{ fromId: root, toId: first.id, rootId: root, n: 1 }, { fromId: first.id, toId: second.id, rootId: root, n: 2 }]);
    const before = snapshot(env);
    await expect(env.run(second.id, S4)).rejects.toThrow(RescheduleLimitReachedError);
    expect(snapshot(env)).toEqual(before);
    expect(byId(env, second.id)).toMatchObject({ status: 'confirmed', rescheduledFromAppointmentId: first.id, price: '180.00' });
  });

  it('[TC-M08-376][DA-6] solo el paciente propietario: otro paciente recibe 404 y un médico no puede usarlo', async () => {
    const env = await setup();
    const id = env.original();
    const stranger = actor('patient');
    env.world.addPatient({ id: randomUUID(), userProfileId: stranger.userProfileId! });
    await expect(env.run(id, S3, stranger)).rejects.toThrow(AppointmentNotFoundError);
    await expect(env.run(id, S3, actor('doctor'))).rejects.toThrow();
    await expect(env.run(randomUUID(), S3)).rejects.toThrow(AppointmentNotFoundError);
    expect(byId(env, id).status).toBe('confirmed');
  });

  it.each(['pending_payment', 'canceled', 'completed', 'rescheduled', 'expired'] as const)(
    '[TC-M08-377][DA-6] una cita %s no se reagenda (409)', async (status) => {
      const env = await setup();
      const id = env.original({ status, paymentHoldExpiresAt: status === 'pending_payment' ? new Date(NOW.getTime() + 60_000) : null });
      await expect(env.run(id, S3)).rejects.toThrow(InvalidAppointmentStateError);
      expect(env.world.state.appointments).toHaveLength(1);
    });

  it('[TC-M08-378][DA-6] el segundo reagendamiento de la misma cita encuentra la original cerrada (409) y no crea otra', async () => {
    const env = await setup();
    const id = env.original();
    await env.run(id, S3);
    await expect(env.run(id, S4)).rejects.toThrow(InvalidAppointmentStateError);
    expect(env.world.state.appointments).toHaveLength(2);
  });

  it('[TC-M08-379][RB-1][RN-140] horario ocupado, inválido, igual o con cruce; médico no habilitado; reservas desactivadas: rechazo sin cambios', async () => {
    const env = await setup();
    const id = env.original();
    env.world.seedAppointment({ id: randomUUID(), patientId: randomUUID(), doctorId: env.doctorId, scheduledAt: new Date(S3), cancellationPolicyId: env.policyId });
    const before = snapshot(env);
    await expect(env.run(id, S3)).rejects.toThrow(SlotUnavailableError);
    await expect(env.run(id, '2026-11-12T16:10:00.000Z')).rejects.toThrow(InvalidSlotError);
    await expect(env.run(id, S1)).rejects.toThrow(InvalidAppointmentInputError);
    // Una cita propia con otro médico que se cruza con el nuevo horario.
    const otherDoctor = randomUUID();
    env.world.addDoctor({ id: otherDoctor, userProfileId: randomUUID() });
    env.world.seedAppointment({ id: randomUUID(), patientId: env.patientId, doctorId: otherDoctor, scheduledAt: new Date(S4), cancellationPolicyId: env.policyId });
    const withCross = snapshot(env);
    await expect(env.run(id, S4)).rejects.toThrow(PatientScheduleConflictError);
    expect(snapshot(env)).toEqual(withCross);
    env.world.state.appointments = before.appointments;
    env.world.operating.delete(env.doctorId);
    await expect(env.run(id, S2)).rejects.toThrow();
    env.world.operating.add(env.doctorId);
    env.world.bookingEnabled = false;
    await expect(env.run(id, S2)).rejects.toThrow(BookingDisabledError);
    expect(byId(env, id).status).toBe('confirmed');
  });

  it('[TC-M08-380][DA-2] candados en orden médico → paciente → cita, y un fallo de auditoría revierte todo', async () => {
    const env = await setup();
    const id = env.original();
    env.world.locks = [];
    env.world.failAuditOnce = true;
    const before = snapshot(env);
    await expect(env.run(id, S3)).rejects.toThrow(/auditoría/);
    expect(env.world.locks.slice(0, 3)).toEqual(['doctor:for-update', 'patient:for-update', 'appointment:for-update']);
    expect(snapshot(env)).toEqual(before);
  });

  it('[TC-M08-382][DA-3][AP-23] la cita nueva guarda el fin de bloque con la duración vigente del médico al reagendar', async () => {
    const env = await setup();
    const id = env.original({ agendaBlockEndsAt: new Date('2026-11-12T16:30:00.000Z') });
    env.world.state.doctors.find((d) => d.id === env.doctorId)!.durationMinutes = 45;
    const view = await env.run(id, S3);
    expect(byId(env, view.id).agendaBlockEndsAt).toEqual(new Date('2026-11-12T17:45:00.000Z'));
    expect(Object.keys(view)).not.toContain('agendaBlockEndsAt');
  });
});
