import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { FakeAgendaService, FixedClock, InMemoryAppointmentsUnitOfWork, InMemoryAppointmentsWorld, DoctorNotOperationalTestError, PatientCannotBookTestError } from '../../../../../test/support/appointments-in-memory';
import type { AgendaService } from '../../../agenda/application/use-cases/agenda.use-cases';
import {
  DoctorAppointmentsQuery, DoctorOccupancyService, GetDoctorSlotsForPatientUseCase, HoldSlotUseCase, ListBookableDoctorsUseCase, PatientAppointmentsQuery,
  PatientSlotsService, ReleaseHoldUseCase,
} from './booking.use-cases';
import { CancelByDoctorUseCase, CancelByPatientUseCase } from './cancellation.use-cases';
import { CancellationPolicyService, ConsultationPriceService } from './configuration.use-cases';
import { AppointmentConfirmationService, AppointmentSessionService } from '../integration/appointment-integration.services';
import { APPOINTMENT_AUDIT_ACTIONS } from '../appointments-audit-events';
import {
  ActiveHoldExistsError, AdminRequiredError, AppointmentNotFoundError, BookingConfigurationMissingError, BookingDisabledError, InvalidAppointmentInputError,
  InvalidAppointmentStateError, InvalidSlotError, PatientProfileRequiredError, PatientScheduleConflictError, SlotUnavailableError,
  UnchangedCancellationPolicyError, UnchangedConsultationPriceError,
} from '../../domain/appointments.errors';
import { INITIAL_POLICY } from '../../domain/cancellation-policy';

const NOW = new Date('2026-11-10T15:00:00Z'); // martes 10 de noviembre, 09:00 en el centro de México
const DAY = '2026-11-11';
const S1 = '2026-11-11T16:00:00.000Z'; // 10:00 local
const S2 = '2026-11-11T16:30:00.000Z';
const S3 = '2026-11-11T17:00:00.000Z';

const actor = (role: 'patient' | 'doctor' | 'admin', userProfileId: string = randomUUID()): Actor => ({
  userId: `u-${userProfileId}`, userProfileId, role, ipAddress: '203.0.113.9', userAgent: 'PEI-M08-test',
});

function setup() {
  const world = new InMemoryAppointmentsWorld();
  const uow = new InMemoryAppointmentsUnitOfWork(world);
  const clock = new FixedClock(NOW);
  const agenda = new FakeAgendaService(world);
  agenda.days[DAY] = [S1, S2, S3];
  const occupancy = new DoctorOccupancyService(world);
  const slots = new PatientSlotsService(agenda as unknown as AgendaService, occupancy, clock);
  const prices = new ConsultationPriceService(uow, world, world, clock);
  const policies = new CancellationPolicyService(uow, world, world.policies, clock);
  return {
    world, uow, clock, agenda, prices, policies,
    hold: new HoldSlotUseCase(uow, world, world, world, world.policies, world, world, slots, clock),
    release: new ReleaseHoldUseCase(uow, world, world),
    patientQuery: new PatientAppointmentsQuery(world, clock),
    doctorQuery: new DoctorAppointmentsQuery(world, clock),
    cancelPatient: new CancelByPatientUseCase(uow, world, world, world.policies, clock),
    cancelDoctor: new CancelByDoctorUseCase(uow, world, world, world, clock),
    confirmation: new AppointmentConfirmationService(uow, world, world, clock),
    session: new AppointmentSessionService(uow, world, world, world.policies),
    listDoctors: new ListBookableDoctorsUseCase(world, world, slots, clock),
    doctorSlots: new GetDoctorSlotsForPatientUseCase(slots, world),
  };
}
type Env = ReturnType<typeof setup>;

async function configured(env: Env) {
  const admin = actor('admin');
  await env.prices.publish(admin, '200.00', 'initial_setup');
  await env.policies.publish(admin, { ...INITIAL_POLICY }, 'initial_setup');
  return admin;
}
function doctor(env: Env, opts: { operating?: boolean; durationMinutes?: number } = {}) {
  const id = randomUUID();
  const a = actor('doctor');
  env.world.addDoctor({ id, userProfileId: a.userProfileId!, ...opts });
  return { id, actor: a };
}
function patient(env: Env) {
  const id = randomUUID();
  const a = actor('patient');
  env.world.addPatient({ id, userProfileId: a.userProfileId! });
  return { id, actor: a };
}
const actions = (env: Env) => env.world.state.audit.map((e) => e.action);

async function confirmedAppointment(env: Env, d = doctor(env), p = patient(env), at = S1) {
  const h = await env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(at), reason: 'Revisión' });
  expect(await env.confirmation.confirmPaid(h.id, `pay-${randomUUID()}`, h.price)).toEqual({ result: 'confirmed' });
  return { d, p, id: h.id };
}

describe('M08 casos de uso de citas', () => {
  describe('precio global (RF-66 propuesto, AP-1, AP-2, AP-9)', () => {
    it('[TC-M08-030][AP-2] solo el administrador publica; paciente y médico reciben forbidden', async () => {
      const env = setup();
      await expect(env.prices.publish(actor('patient'), '200.00')).rejects.toThrow(AdminRequiredError);
      await expect(env.prices.current(actor('doctor'))).rejects.toThrow(AdminRequiredError);
    });

    it('[TC-M08-031][P-2][AP-9] publicar cierra la vigente e inserta otra con vigencia inmediata; la anterior no cambia de precio', async () => {
      const env = setup();
      const admin = await configured(env);
      env.clock.advanceMinutes(60);
      const next = await env.prices.publish(admin, '250');
      const versions = await env.prices.versions(admin);
      expect(versions).toHaveLength(2);
      expect(next).toMatchObject({ price: '250.00', currency: 'MXN', effectiveUntil: null, effectiveFrom: env.clock.now().toISOString() });
      expect(versions[1]).toMatchObject({ price: '200.00', effectiveUntil: env.clock.now().toISOString() });
      expect((await env.prices.current(admin)).price).toBe('250.00');
      expect(env.world.locks).toContain('price:advisory');
    });

    it('[TC-M08-032][AP-2] la auditoría guarda el precio anterior y el nuevo, y quién lo cambió', async () => {
      const env = setup();
      const admin = await configured(env);
      await env.prices.publish(admin, '300.00');
      const event = env.world.state.audit.filter((e) => e.action === APPOINTMENT_AUDIT_ACTIONS.pricePublished).at(-1)!;
      expect(event.metadata).toMatchObject({ previousPrice: '200.00', newPrice: '300.00', currency: 'MXN', source: 'admin_panel' });
      expect(event.actor).toMatchObject({ type: 'user', userProfileId: admin.userProfileId });
    });

    it('[TC-M08-033][P-4] un precio igual al vigente no crea versión', async () => {
      const env = setup();
      const admin = await configured(env);
      await expect(env.prices.publish(admin, '200')).rejects.toThrow(UnchangedConsultationPriceError);
      expect(await env.prices.versions(admin)).toHaveLength(1);
    });

    it('[TC-M08-034][RN-007][P-6] un cambio de precio no modifica las citas ya reservadas', async () => {
      const env = setup();
      const admin = await configured(env);
      const { id } = await confirmedAppointment(env);
      await env.prices.publish(admin, '350.00');
      expect(env.world.state.appointments.find((a) => a.id === id)!.price).toBe('200.00');
    });

    it('[TC-M08-035] si la auditoría falla, la versión nueva se revierte', async () => {
      const env = setup();
      const admin = await configured(env);
      env.world.failAuditOnce = true;
      await expect(env.prices.publish(admin, '250.00')).rejects.toThrow('fallo de auditoría simulado');
      expect((await env.prices.current(admin)).price).toBe('200.00');
      expect(await env.prices.versions(admin)).toHaveLength(1);
    });
  });

  describe('política de citas (RF-16, RN-021, AP-4)', () => {
    it('[TC-M08-036][RN-021] versiones: la nueva cierra la anterior; las citas conservan la versión de su reserva', async () => {
      const env = setup();
      const admin = await configured(env);
      const { id } = await confirmedAppointment(env);
      const before = env.world.state.appointments.find((a) => a.id === id)!.cancellationPolicyId;
      env.clock.advanceMinutes(1);
      const next = await env.policies.publish(admin, { ...INITIAL_POLICY, refundDeadlineHours: 48 });
      expect(next.id).not.toBe(before);
      expect(env.world.state.appointments.find((a) => a.id === id)!.cancellationPolicyId).toBe(before);
      expect((await env.policies.versions(admin))[1].effectiveUntil).toBe(env.clock.now().toISOString());
    });

    it('[TC-M08-037] parámetros iguales no crean versión; sin administrador, forbidden', async () => {
      const env = setup();
      const admin = await configured(env);
      await expect(env.policies.publish(admin, { ...INITIAL_POLICY })).rejects.toThrow(UnchangedCancellationPolicyError);
      await expect(env.policies.publish(actor('doctor'), { ...INITIAL_POLICY })).rejects.toThrow(AdminRequiredError);
    });
  });

  describe('retención (RF-12, RF-14)', () => {
    it('[TC-M08-040][AP-16] con la bandera desactivada no se puede reservar', async () => {
      const env = setup();
      await configured(env);
      env.world.bookingEnabled = false;
      const d = doctor(env);
      const p = patient(env);
      await expect(env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' })).rejects.toThrow(BookingDisabledError);
      expect(env.world.state.appointments).toHaveLength(0);
    });

    it('[TC-M08-041][RN-009][RN-007] la reserva crea pending_payment con 5 min, el precio vigente y la política vigente', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const p = patient(env);
      const view = await env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: '  Dolor de cabeza  ' });
      expect(view).toMatchObject({ status: 'pending_payment', price: '200.00', holdExpiresAt: '2026-11-10T15:05:00.000Z', reason: 'Dolor de cabeza' });
      const stored = env.world.state.appointments[0];
      expect(stored.cancellationPolicyId).toBe(env.world.state.policies[0].id);
      expect(env.world.state.history).toEqual([expect.objectContaining({ status: 'pending_payment', changedByType: 'patient', changedByUserProfileId: p.actor.userProfileId })]);
      expect(actions(env)).toContain(APPOINTMENT_AUDIT_ACTIONS.holdCreated);
    });

    it('[TC-M08-042][DA-2] orden de candados: médico → paciente → política del médico', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const p = patient(env);
      env.world.locks.length = 0;
      await env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' });
      expect(env.world.locks.slice(0, 3)).toEqual(['doctor:for-update', 'patient:for-update', 'policy:for-share']);
    });

    it('[TC-M08-043][RN-140] aplica CanBookAppointmentsPolicy y canOperate del médico, sin efectos', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const off = doctor(env, { operating: false });
      const p = patient(env);
      env.world.blockedPatients.add(p.actor.userProfileId!);
      await expect(env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' })).rejects.toThrow(PatientCannotBookTestError);
      env.world.blockedPatients.clear();
      await expect(env.hold.execute(p.actor, { doctorProfileId: off.id, startsAt: new Date(S1), reason: 'x' })).rejects.toThrow(DoctorNotOperationalTestError);
      expect(env.world.state.appointments).toHaveLength(0);
      expect(env.world.state.audit.filter((e) => e.action.startsWith('appointment.'))).toHaveLength(0);
    });

    it('[TC-M08-044][RB-1] un horario que M07 no genera es inválido; uno ocupado, conflicto (409)', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const a = patient(env);
      const b = patient(env);
      await expect(env.hold.execute(a.actor, { doctorProfileId: d.id, startsAt: new Date('2026-11-11T16:10:00Z'), reason: 'x' })).rejects.toThrow(InvalidSlotError);
      await env.hold.execute(a.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' });
      await expect(env.hold.execute(b.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' })).rejects.toThrow(SlotUnavailableError);
    });

    it('[TC-M08-045][RB-2] pedir otra vez el mismo horario devuelve la misma retención', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const p = patient(env);
      const first = await env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' });
      const again = await env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' });
      expect(again.id).toBe(first.id);
      expect(env.world.state.appointments).toHaveLength(1);
    });

    it('[TC-M08-046][RB-3] una sola retención vigente por paciente y sin cruces con sus citas', async () => {
      const env = setup();
      await configured(env);
      const d1 = doctor(env);
      const d2 = doctor(env);
      const p = patient(env);
      await env.hold.execute(p.actor, { doctorProfileId: d1.id, startsAt: new Date(S1), reason: 'x' });
      await expect(env.hold.execute(p.actor, { doctorProfileId: d1.id, startsAt: new Date(S2), reason: 'x' })).rejects.toThrow(ActiveHoldExistsError);
      // Con la cita ya confirmada, otro médico a la misma hora se cruza.
      const [h] = env.world.state.appointments;
      await env.confirmation.confirmPaid(h.id, 'pay-1', h.price);
      await expect(env.hold.execute(p.actor, { doctorProfileId: d2.id, startsAt: new Date(S1), reason: 'x' })).rejects.toThrow(PatientScheduleConflictError);
    });

    it('[TC-M08-047][RN-012][DA-9] al vencer, el horario vuelve a estar libre y la retención se marca expired con actor system', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const a = patient(env);
      const b = patient(env);
      const first = await env.hold.execute(a.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' });
      env.clock.advanceMinutes(5);
      const second = await env.hold.execute(b.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' });
      expect(second.id).not.toBe(first.id);
      expect(env.world.state.appointments.find((x) => x.id === first.id)!.status).toBe('expired');
      expect(env.world.state.history).toContainEqual(expect.objectContaining({ appointmentId: first.id, status: 'expired', changedByType: 'system' }));
      expect(actions(env)).toContain(APPOINTMENT_AUDIT_ACTIONS.holdExpired);
    });

    it('[TC-M08-048][DA-10] sin precio o sin política vigentes no se reserva (422)', async () => {
      const env = setup();
      const d = doctor(env);
      const p = patient(env);
      await expect(env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' })).rejects.toThrow(BookingConfigurationMissingError);
      await env.prices.publish(actor('admin'), '200.00');
      await expect(env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' })).rejects.toMatchObject({ missing: 'policy' });
    });

    it('[TC-M08-049] valida el motivo y el rol', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const p = patient(env);
      await expect(env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: '   ' })).rejects.toThrow(InvalidAppointmentInputError);
      await expect(env.hold.execute(d.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' })).rejects.toThrow(PatientProfileRequiredError);
    });

    it('[TC-M08-050][RN-010] el paciente libera su retención: expired, nunca canceled', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const p = patient(env);
      const h = await env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' });
      await env.release.execute(p.actor, h.id);
      expect(env.world.state.appointments[0].status).toBe('expired');
      await expect(env.release.execute(p.actor, h.id)).rejects.toThrow(InvalidAppointmentStateError);
      await expect(env.release.execute(patient(env).actor, h.id)).rejects.toThrow(AppointmentNotFoundError);
    });
  });

  describe('confirmación por pagos (DA-1, CC-4)', () => {
    it('[TC-M08-060][RN-011] confirmPaid dentro de la retención confirma; repetirlo es idempotente', async () => {
      const env = setup();
      await configured(env);
      const { id } = await confirmedAppointment(env);
      expect(await env.confirmation.confirmPaid(id, 'pay-dup', '200.00')).toEqual({ result: 'already_confirmed' });
      expect(env.world.state.history.filter((h) => h.appointmentId === id).map((h) => h.status)).toEqual(['pending_payment', 'confirmed']);
    });

    it('[TC-M08-061][CC-4][AP-8] un pago que llega después del vencimiento no confirma: expired y registro para conciliación', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const p = patient(env);
      const h = await env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' });
      env.clock.advanceMinutes(6);
      expect(await env.confirmation.confirmPaid(h.id, 'pay-late', '200.00')).toEqual({ result: 'not_confirmable', reason: 'expired' });
      expect(env.world.state.appointments[0].status).toBe('expired');
      // Un segundo webhook retrasado tampoco la reactiva.
      expect(await env.confirmation.confirmPaid(h.id, 'pay-late', '200.00')).toEqual({ result: 'not_confirmable', reason: 'expired' });
      expect(env.world.state.audit.filter((e) => e.action === APPOINTMENT_AUDIT_ACTIONS.paymentNotConfirmable)).toHaveLength(2);
    });

    it('[TC-M08-062][CC-4] un monto distinto del precio de la cita no confirma', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const p = patient(env);
      const h = await env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' });
      expect(await env.confirmation.confirmPaid(h.id, 'pay-x', '150.00')).toEqual({ result: 'not_confirmable', reason: 'amount_mismatch' });
      expect(env.world.state.appointments[0].status).toBe('pending_payment');
    });

    it('[TC-M08-063][RN-012] markPaymentFailed vence la retención', async () => {
      const env = setup();
      await configured(env);
      const d = doctor(env);
      const p = patient(env);
      const h = await env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S1), reason: 'x' });
      await env.confirmation.markPaymentFailed(h.id);
      expect(env.world.state.appointments[0].status).toBe('expired');
    });
  });

  describe('cancelación (RF-15)', () => {
    it('[TC-M08-070][RN-019] el paciente cancela con 24 h o más: reembolso total', async () => {
      const env = setup();
      await configured(env);
      const { p, id } = await confirmedAppointment(env);
      // NOW + 25 h = 2026-11-11T16:00Z (la cita); con 25 h de anticipación hay reembolso.
      const res = await env.cancelPatient.execute(p.actor, id, 'Cambio de planes');
      expect(res).toEqual({ id, status: 'canceled', refundOutcome: 'full_refund' });
      expect(env.world.state.appointments[0]).toMatchObject({ status: 'canceled', cancelledByType: 'patient', cancellationReason: 'Cambio de planes' });
    });

    it('[TC-M08-071][RN-020][RN-021] con menos del plazo de SU versión de política: sin reembolso', async () => {
      const env = setup();
      const admin = await configured(env);
      const { p, id } = await confirmedAppointment(env);
      // Una versión nueva más laxa no se aplica a la cita ya reservada.
      await env.policies.publish(admin, { ...INITIAL_POLICY, refundDeadlineHours: 1 });
      env.clock.advanceMinutes(2 * 60);
      expect((await env.cancelPatient.execute(p.actor, id)).refundOutcome).toBe('no_refund');
    });

    it('[TC-M08-072] solo se cancela una cita confirmada propia; otra persona recibe not_found', async () => {
      const env = setup();
      await configured(env);
      const { id } = await confirmedAppointment(env);
      await expect(env.cancelPatient.execute(patient(env).actor, id)).rejects.toThrow(AppointmentNotFoundError);
      const d = doctor(env);
      const p = patient(env);
      const h = await env.hold.execute(p.actor, { doctorProfileId: d.id, startsAt: new Date(S3), reason: 'x' });
      await expect(env.cancelPatient.execute(p.actor, h.id)).rejects.toThrow(InvalidAppointmentStateError);
    });

    it('[TC-M08-073][RN-013][DX-1][AP-13] el médico cancela con reembolso total aunque haya perdido canOperate', async () => {
      const env = setup();
      await configured(env);
      const { d, id } = await confirmedAppointment(env);
      env.world.operating.delete(d.id);
      const res = await env.cancelDoctor.execute(d.actor, id, 'No podré atender por una emergencia');
      expect(res.refundOutcome).toBe('full_refund');
      const event = env.world.state.audit.find((e) => e.action === APPOINTMENT_AUDIT_ACTIONS.canceled)!;
      expect(event.metadata).toMatchObject({ actorType: 'doctor', refundOutcome: 'full_refund', doctorCanOperate: false });
    });

    it('[TC-M08-074] el médico necesita motivo de 10 a 500 caracteres y solo cancela sus citas', async () => {
      const env = setup();
      await configured(env);
      const { d, id } = await confirmedAppointment(env);
      await expect(env.cancelDoctor.execute(d.actor, id, 'corto')).rejects.toThrow(InvalidAppointmentInputError);
      await expect(env.cancelDoctor.execute(doctor(env).actor, id, 'Motivo suficientemente largo')).rejects.toThrow(AppointmentNotFoundError);
    });
  });

  describe('contrato con videoconsulta (CC-9, DA-4)', () => {
    it('[TC-M08-080][AP-15] getForSession expone las ventanas de la política aplicada y no el fin del bloque', async () => {
      const env = setup();
      await configured(env);
      const { id } = await confirmedAppointment(env);
      const view = await env.session.getForSession(id);
      expect(view).toMatchObject({ status: 'confirmed', doctorWaitMinutes: 30, patientToleranceMinutes: 15 });
      expect(Object.keys(view)).not.toContain('agendaBlockEndsAt');
    });

    it('[TC-M08-081][DA-4] el resultado lo registra videoconsulta; idempotente y sin transiciones automáticas', async () => {
      const env = setup();
      await configured(env);
      const { id } = await confirmedAppointment(env);
      env.clock.advanceMinutes(60 * 30); // la hora de la cita ya pasó: sigue confirmed
      expect((await env.patientQuery.list(env.world.state.patients.map((p) => actor('patient', p.userProfileId))[0]))[0].status).toBe('confirmed');
      await env.session.markNoShow(id, 'doctor');
      await env.session.markNoShow(id, 'doctor');
      await expect(env.session.markCompleted(id)).rejects.toThrow(InvalidAppointmentStateError);
      expect(env.world.state.appointments[0].status).toBe('no_show_doctor');
    });
  });

  describe('listado y horarios para el paciente (CC-6, DA-5)', () => {
    it('[TC-M08-090][AP-12] solo médicos con canOperate y con horario libre', async () => {
      const env = setup();
      await configured(env);
      const ok = doctor(env);
      doctor(env, { operating: false });
      const p = patient(env);
      const res = await env.listDoctors.execute(p.actor);
      expect(res.doctors.map((d) => d.doctorProfileId)).toEqual([ok.id]);
      expect(Object.keys(res.doctors[0]).sort()).toEqual(['displayName', 'doctorProfileId', 'specialty']);
      env.agenda.days = {};
      expect((await env.listDoctors.execute(p.actor)).doctors).toEqual([]);
    });

    it('[TC-M08-091][DA-5] los horarios del paciente excluyen citas confirmadas y retenciones vigentes', async () => {
      const env = setup();
      await configured(env);
      const { d } = await confirmedAppointment(env);
      const other = patient(env);
      await env.hold.execute(other.actor, { doctorProfileId: d.id, startsAt: new Date(S2), reason: 'x' });
      const res = await env.doctorSlots.execute(patient(env).actor, d.id, DAY, DAY);
      expect(res.slots.map((s) => s.startsAt)).toEqual([S3]);
    });

    it('[TC-M08-092] el médico ve sus citas confirmadas y no las retenciones vencidas', async () => {
      const env = setup();
      await configured(env);
      const { d } = await confirmedAppointment(env);
      await env.hold.execute(patient(env).actor, { doctorProfileId: d.id, startsAt: new Date(S2), reason: 'x' });
      env.clock.advanceMinutes(10);
      const list = await env.doctorQuery.list(d.actor, new Date('2026-11-11T00:00:00Z'), new Date('2026-11-12T00:00:00Z'));
      expect(list.map((a) => a.status)).toEqual(['confirmed']);
    });
  });
});
