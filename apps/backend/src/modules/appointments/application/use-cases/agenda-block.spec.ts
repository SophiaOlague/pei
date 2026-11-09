import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { FakeAgendaService, FixedClock, InMemoryAppointmentsUnitOfWork, InMemoryAppointmentsWorld } from '../../../../../test/support/appointments-in-memory';
import type { AgendaService } from '../../../agenda/application/use-cases/agenda.use-cases';
import { DoctorOccupancyService, HoldSlotUseCase, PatientSlotsService } from './booking.use-cases';
import { CancellationPolicyService, ConsultationPriceService } from './configuration.use-cases';
import { AppointmentSessionService } from '../integration/appointment-integration.services';
import { INITIAL_POLICY } from '../../domain/cancellation-policy';

// DA-3 / AP-23 (fin del bloque guardado, O1 solo para históricas) y AP-22 (L y G en la política y en getForSession).

const NOW = new Date('2026-11-10T15:00:00Z');
const DAY = '2026-11-12';
const S1 = '2026-11-12T16:00:00.000Z';
const S2 = '2026-11-12T16:30:00.000Z';
const S3 = '2026-11-12T17:00:00.000Z';

const actor = (role: 'patient' | 'admin', userProfileId: string = randomUUID()): Actor => ({
  userId: `u-${userProfileId}`, userProfileId, role, ipAddress: '203.0.113.9', userAgent: 'PEI-M08-test',
});

async function setup(durationMinutes = 30) {
  const world = new InMemoryAppointmentsWorld();
  const uow = new InMemoryAppointmentsUnitOfWork(world);
  const clock = new FixedClock(NOW);
  const agenda = new FakeAgendaService(world);
  agenda.days[DAY] = [S1, S2, S3];
  const occupancy = new DoctorOccupancyService(world);
  const slots = new PatientSlotsService(agenda as unknown as AgendaService, occupancy, clock);
  const policies = new CancellationPolicyService(uow, world, world.policies, clock);
  const hold = new HoldSlotUseCase(uow, world, world, world, world.policies, world, world, slots, clock, world);
  const admin = actor('admin');
  await new ConsultationPriceService(uow, world, world, clock).publish(admin, '200.00', 'initial_setup');
  await policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
  const doctorId = randomUUID();
  world.addDoctor({ id: doctorId, userProfileId: randomUUID(), durationMinutes });
  const patient = actor('patient');
  world.addPatient({ id: randomUUID(), userProfileId: patient.userProfileId! });
  const doctor = world.state.doctors.find((d) => d.id === doctorId)!;
  return { world, uow, clock, occupancy, slots, policies, hold, admin, doctorId, doctor, patient };
}

describe('Fin del bloque de agenda (DA-3, AP-23) y parámetros de espera (AP-22)', () => {
  it('[TC-M08-383][DA-3] la reserva guarda agenda_block_ends_at con la duración del médico vigente al reservar', async () => {
    const env = await setup(45);
    const view = await env.hold.execute(env.patient, { doctorProfileId: env.doctorId, startsAt: new Date(S1), reason: 'Revisión' });
    expect(env.world.state.appointments.find((a) => a.id === view.id)!.agendaBlockEndsAt).toEqual(new Date('2026-11-12T16:45:00.000Z'));
    expect(Object.keys(view)).not.toContain('agendaBlockEndsAt');
  });

  it('[TC-M08-384][DA-3] la ocupación usa el fin guardado aunque el médico cambie su duración después', async () => {
    const env = await setup(30);
    await env.hold.execute(env.patient, { doctorProfileId: env.doctorId, startsAt: new Date(S1), reason: 'Revisión' });
    // El médico pasa a 60 min: con O1 la cita de 16:00 ocuparía también 16:30. Con el fin guardado, 16:30 sigue libre.
    env.doctor.durationMinutes = 60;
    const free = (await env.slots.freeSlots(env.doctorId, DAY, DAY)).slots.map((s) => s.startsAt);
    expect(free).not.toContain(S1);
    expect(free).toContain(S2);
  });

  it('[TC-M08-385][DA-3] las citas históricas sin fin guardado se ocupan con O1 y la duración actual', async () => {
    const env = await setup(30);
    const policyId = (await env.policies.current(env.admin)).id;
    env.world.seedAppointment({ id: randomUUID(), patientId: randomUUID(), doctorId: env.doctorId, scheduledAt: new Date(S1), cancellationPolicyId: policyId, agendaBlockEndsAt: null });
    env.doctor.durationMinutes = 60;
    const busy = await env.occupancy.busy(env.doctorId, new Date(S1), new Date(S3), NOW);
    expect(busy).toEqual([{ startsAt: new Date(S1), endsAt: new Date(S3) }]);
    const free = (await env.slots.freeSlots(env.doctorId, DAY, DAY)).slots.map((s) => s.startsAt);
    expect(free).not.toContain(S2);
  });

  it('[TC-M08-386][AP-22] publicar y leer la política incluye L y G; si se omiten, 60 y 5; la auditoría los registra', async () => {
    const env = await setup();
    const published = await env.policies.publish(env.admin, { ...INITIAL_POLICY, doctorWaitMinutes: 40, maxProtectedWaitMinutes: 90, reconnectGraceMinutes: 7 });
    expect(published).toMatchObject({ doctorWaitMinutes: 40, maxProtectedWaitMinutes: 90, reconnectGraceMinutes: 7 });
    expect(await env.policies.current(env.admin)).toMatchObject({ maxProtectedWaitMinutes: 90, reconnectGraceMinutes: 7 });
    const audit = env.world.state.audit.at(-1)!;
    expect(audit.metadata).toMatchObject({ next: { maxProtectedWaitMinutes: 90, reconnectGraceMinutes: 7 } });
    const { maxProtectedWaitMinutes: _l, reconnectGraceMinutes: _g, ...withoutWait } = INITIAL_POLICY;
    const defaults = await env.policies.publish(env.admin, { ...withoutWait, refundDeadlineHours: 48 });
    expect(defaults).toMatchObject({ maxProtectedWaitMinutes: 60, reconnectGraceMinutes: 5 });
  });

  it('[TC-M08-387][AP-22][AP-23] getForSession devuelve W, Tol, L y G de la política aplicada, sin el fin del bloque', async () => {
    const env = await setup();
    const applied = await env.policies.publish(env.admin, { ...INITIAL_POLICY, maxProtectedWaitMinutes: 75, reconnectGraceMinutes: 4 });
    const id = randomUUID();
    env.world.seedAppointment({ id, patientId: randomUUID(), doctorId: env.doctorId, scheduledAt: new Date(S1), cancellationPolicyId: applied.id, agendaBlockEndsAt: new Date(S2) });
    // Una versión posterior no cambia las ventanas de la cita.
    await env.policies.publish(env.admin, { ...INITIAL_POLICY, maxProtectedWaitMinutes: 120 });
    const session = await new AppointmentSessionService(env.uow, env.world, env.world, env.world.policies).getForSession(id);
    expect(session).toMatchObject({ doctorWaitMinutes: 30, patientToleranceMinutes: 15, maxProtectedWaitMinutes: 75, reconnectGraceMinutes: 4 });
    expect(Object.keys(session)).not.toContain('agendaBlockEndsAt');
  });
});
