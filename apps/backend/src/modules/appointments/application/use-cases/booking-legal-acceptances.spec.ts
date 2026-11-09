import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { FakeAgendaService, FixedClock, InMemoryAppointmentsUnitOfWork, InMemoryAppointmentsWorld } from '../../../../../test/support/appointments-in-memory';
import { InMemoryIdentityStore } from '../../../../../test/support/identity-in-memory';
import type { AgendaService } from '../../../agenda/application/use-cases/agenda.use-cases';
import { DoctorOccupancyService, HoldSlotUseCase, PatientSlotsService } from './booking.use-cases';
import { CancellationPolicyService, ConsultationPriceService } from './configuration.use-cases';
import { LegalAcceptancesRequiredError } from '../../domain/appointments.errors';
import { INITIAL_POLICY } from '../../domain/cancellation-policy';
import { ReaderBookingLegalAcceptances } from '../../infrastructure/booking-legal-acceptances.adapter';

// AP-26: la reserva exige las dos aceptaciones legales vigentes del paciente (privacidad y términos) y transporta sus
// identificadores en NewAppointment. Integración en memoria: el adaptador real de M08 sobre el doble del lector de M02
// (misma regla de régimen vigente que el adaptador Drizzle). Sin BD. Las referencias todavía NO se persisten en
// PostgreSQL (0014 sin aplicar): aquí solo las guarda el doble.

const NOW = new Date('2026-11-10T15:00:00Z');
const DAY = '2026-11-11';
const S1 = '2026-11-11T16:00:00.000Z';
const S2 = '2026-11-11T16:30:00.000Z';

const actor = (role: 'patient' | 'doctor' | 'admin', userProfileId: string = randomUUID()): Actor => ({
  userId: `u-${userProfileId}`, userProfileId, role, ipAddress: '203.0.113.9', userAgent: 'PEI-M08-test',
});

async function setup() {
  const world = new InMemoryAppointmentsWorld();
  const uow = new InMemoryAppointmentsUnitOfWork(world);
  const clock = new FixedClock(NOW);
  const agenda = new FakeAgendaService(world);
  agenda.days[DAY] = [S1, S2];
  const slots = new PatientSlotsService(agenda as unknown as AgendaService, new DoctorOccupancyService(world), clock);
  const prices = new ConsultationPriceService(uow, world, world, clock);
  const policies = new CancellationPolicyService(uow, world, world.policies, clock);
  // Lector real de M08 sobre el doble de M02.
  const identity = new InMemoryIdentityStore();
  world.legalSource = new ReaderBookingLegalAcceptances(identity);
  const hold = new HoldSlotUseCase(uow, world, world, world, world.policies, world, world, slots, clock, world);
  const admin = actor('admin');
  await prices.publish(admin, '200.00', 'initial_setup');
  await policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
  const doctorId = randomUUID();
  world.addDoctor({ id: doctorId, userProfileId: randomUUID() });
  const patient = actor('patient');
  const patientId = randomUUID();
  world.addPatient({ id: patientId, userProfileId: patient.userProfileId! });
  identity.state.userProfiles.push({ id: patient.userProfileId!, userId: patient.userId, role: 'patient' } as never);
  const publish = (type: Parameters<InMemoryIdentityStore['publishLegalDocument']>[0], secondsAgo = 120) =>
    identity.publishLegalDocument(type, `v-${randomUUID()}`, new Date(Date.now() - secondsAgo * 1000));
  const accept = (...documentIds: string[]) =>
    identity.recordAcceptances({ userProfileId: patient.userProfileId!, legalDocumentIds: documentIds, ipAddress: null, userAgent: null });
  const acceptanceId = (documentId: string) =>
    identity.state.acceptances.find((a) => a.userProfileId === patient.userProfileId && a.legalDocumentId === documentId)!.id;
  const book = (at = S1) => hold.execute(patient, { doctorProfileId: doctorId, startsAt: new Date(at), reason: 'Revisión' });
  return { world, identity, publish, accept, acceptanceId, book, patientId, doctorId, policies };
}
type Env = Awaited<ReturnType<typeof setup>>;

// Fotografía del estado que la reserva podría tocar (para comprobar que un rechazo no deja cambios).
const snapshot = (env: Env) => structuredClone({
  appointments: env.world.state.appointments, history: env.world.state.history, audit: env.world.state.audit.map((e) => e.action),
  legalReferences: env.world.state.legalReferences,
});

describe('Reserva con las dos aceptaciones legales vigentes (AP-26)', () => {
  it('[TC-M08-360][AP-26] régimen actual: la cita transporta los ids de privacy_policy y patient_terms', async () => {
    const env = await setup();
    const pp = env.publish('privacy_policy');
    const pt = env.publish('patient_terms');
    await env.accept(pp.id, pt.id);
    const view = await env.book();
    expect(env.world.state.legalReferences).toEqual([
      { appointmentId: view.id, privacyLegalAcceptanceId: env.acceptanceId(pp.id), termsLegalAcceptanceId: env.acceptanceId(pt.id) },
    ]);
    expect(env.world.locks).toContain('legal:read');
  });

  it('[TC-M08-361][AP-26] régimen anterior: la cita transporta los ids de privacy_notice y terms_and_conditions', async () => {
    const env = await setup();
    const pn = env.publish('privacy_notice');
    const tc = env.publish('terms_and_conditions');
    await env.accept(pn.id, tc.id);
    const view = await env.book();
    expect(env.world.state.legalReferences).toEqual([
      { appointmentId: view.id, privacyLegalAcceptanceId: env.acceptanceId(pn.id), termsLegalAcceptanceId: env.acceptanceId(tc.id) },
    ]);
  });

  it.each([
    ['sin aceptaciones', async (env: Env) => { env.publish('privacy_policy'); env.publish('patient_terms'); }],
    ['falta la de privacidad', async (env: Env) => { env.publish('privacy_policy'); await env.accept(env.publish('patient_terms').id); }],
    ['falta la de términos', async (env: Env) => { await env.accept(env.publish('privacy_policy').id); env.publish('patient_terms'); }],
    ['se publicó una versión nueva no aceptada', async (env: Env) => {
      const pp = env.publish('privacy_policy', 300);
      const pt = env.publish('patient_terms', 300);
      await env.accept(pp.id, pt.id);
      env.publish('patient_terms', 60);
    }],
  ])('[TC-M08-362][AP-26] %s: LegalAcceptancesRequiredError y ninguna cita', async (_label, arrange) => {
    const env = await setup();
    await arrange(env);
    await expect(env.book()).rejects.toThrow(LegalAcceptancesRequiredError);
    expect(env.world.state.appointments).toEqual([]);
    expect(env.world.state.legalReferences).toEqual([]);
  });

  it('[TC-M08-363][AP-26] el rechazo revierte toda la transacción, incluido el vencimiento de retenciones hecho antes', async () => {
    const env = await setup();
    // Una retención vencida del médico: la reserva la marca expired dentro de la misma transacción antes de leer.
    env.world.seedAppointment({
      id: randomUUID(), patientId: randomUUID(), doctorId: env.doctorId, scheduledAt: new Date(S2), cancellationPolicyId: (await env.policies.current(actor('admin'))).id,
      status: 'pending_payment', paymentHoldExpiresAt: new Date(NOW.getTime() - 60_000),
    });
    const before = snapshot(env);
    await expect(env.book()).rejects.toThrow(LegalAcceptancesRequiredError);
    expect(snapshot(env)).toEqual(before);
    expect(env.world.state.appointments[0].status).toBe('pending_payment');
  });

  it('[TC-M08-364][AP-26][RB-2] repetir la misma reserva devuelve la retención existente sin volver a leer las aceptaciones', async () => {
    const env = await setup();
    const pp = env.publish('privacy_policy', 300);
    const pt = env.publish('patient_terms', 300);
    await env.accept(pp.id, pt.id);
    const first = await env.book();
    // Después se publica una versión nueva no aceptada: una reserva NUEVA se rechazaría, pero la repetición es idempotente.
    env.publish('patient_terms', 60);
    const reads = env.world.locks.filter((l) => l === 'legal:read').length;
    const again = await env.book();
    expect(again.id).toBe(first.id);
    expect(env.world.locks.filter((l) => l === 'legal:read').length).toBe(reads);
    expect(env.world.state.appointments).toHaveLength(1);
    expect(env.world.state.legalReferences).toHaveLength(1);
    await expect(env.book(S2)).rejects.toThrow(); // otra reserva nueva no es una repetición (RB-3 o legal)
  });
});
