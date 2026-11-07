import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { FakeDocumentStorage } from '../../../../../test/support/identity-in-memory';
import { InMemoryDoctorAuditTrail, InMemoryDoctorUnitOfWork, InMemoryDoctorWorld } from '../../../../../test/support/doctors-world';
import { FixedClock, InMemoryAgendaRepository, InMemoryAgendaUnitOfWork } from '../../../../../test/support/agenda-in-memory';
import { syntheticCurp } from '../../../../../test/support/synthetic-identity';
import { DoctorStatusService } from '../../../doctors/application/doctor-status.service';
import { DoctorOperationalPolicy } from '../../../doctors/application/policies/doctor-operational.policy';
import { RegisterDoctorProfileUseCase } from '../../../doctors/application/use-cases/register-doctor-profile.use-case';
import { SubmitDoctorIdentityVerificationUseCase, SubmitDoctorLicenseVerificationUseCase } from '../../../doctors/application/use-cases/doctor-submissions.use-cases';
import { DoctorIdentityDocumentPurger } from '../../../doctors/application/use-cases/doctor-identity-document-purger';
import { NoBusyIntervalsProvider, type BusyIntervalsProvider } from '../ports/busy-intervals.provider';
import { AGENDA_AUDIT_ACTIONS } from '../agenda-audit-events';
import {
  AddTimeOffUseCase, AgendaService, AgendaWriteGuard, ChangeAppointmentDurationUseCase, GetMyAgendaUseCase, PreviewMySlotsUseCase,
  RemoveTimeOffUseCase, ReplaceWeeklyAvailabilityUseCase,
} from './agenda.use-cases';
import {
  AgendaDoctorRequiredError, InvalidAppointmentDurationError, InvalidWeeklyScheduleError, TimeOffAlreadyEndedError, TimeOffNotFoundError,
} from '../../domain/agenda.errors';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1]);
const PDF = Buffer.from('%PDF-1.7 x');
const NOW = new Date('2026-11-08T12:00:00Z'); // domingo 8 de noviembre, 06:00 en el centro de México

function setup(busy: BusyIntervalsProvider = new NoBusyIntervalsProvider()) {
  const world = new InMemoryDoctorWorld();
  const agenda = new InMemoryAgendaRepository(world);
  const doctorUow = new InMemoryDoctorUnitOfWork(world);
  const uow = new InMemoryAgendaUnitOfWork(doctorUow, agenda);
  const audit = new InMemoryDoctorAuditTrail(world);
  const storage = new FakeDocumentStorage();
  const status = new DoctorStatusService(world, world);
  const clock = new FixedClock(NOW);
  // El FOR SHARE de la política queda registrado junto al FOR UPDATE de la agenda.
  const lockForShare = world.lockForShareById.bind(world);
  world.lockForShareById = async (id: string) => {
    agenda.locks.push('policy:for-share');
    return lockForShare(id);
  };
  const policy = new DoctorOperationalPolicy(world, status);
  const guard = new AgendaWriteGuard(agenda, policy);
  const service = new AgendaService(agenda, busy, clock);
  return {
    world, agenda, clock,
    register: new RegisterDoctorProfileUseCase(doctorUow, audit, world, world, world.catalog),
    submitIne: new SubmitDoctorIdentityVerificationUseCase(doctorUow, audit, storage, world, world, status, new DoctorIdentityDocumentPurger(storage, world)),
    submitLicense: new SubmitDoctorLicenseVerificationUseCase(doctorUow, audit, storage, world, world, status),
    get: new GetMyAgendaUseCase(agenda, policy, clock),
    slots: new PreviewMySlotsUseCase(agenda, service),
    service,
    replace: new ReplaceWeeklyAvailabilityUseCase(uow, audit, agenda, guard),
    duration: new ChangeAppointmentDurationUseCase(uow, audit, agenda, guard),
    addTimeOff: new AddTimeOffUseCase(uow, audit, agenda, guard, clock),
    removeTimeOff: new RemoveTimeOffUseCase(uow, audit, agenda, guard, clock),
  };
}
type Env = ReturnType<typeof setup>;

async function doctor(env: Env, approve = true) {
  const base: Actor = { userId: `medico-${randomUUID()}`, userProfileId: null, role: null, ipAddress: null, userAgent: null };
  const { doctorProfileId, userProfileId } = await env.register.execute(base, {
    firstName: 'Ana', lastName: 'Pérez', curp: syntheticCurp(), specialtyId: env.world.catalog.byCode('medicina_general').id,
  });
  env.world.acceptDoctorRegime(userProfileId);
  const actor: Actor = { ...base, userProfileId, role: 'doctor' };
  await env.submitIne.execute(actor, { front: JPEG, back: JPEG });
  await env.submitLicense.execute(actor, { licenseNumber: `P${randomUUID().slice(0, 6)}`, document: PDF });
  if (approve) {
    env.world.review('identity', doctorProfileId, 'approved');
    env.world.review('license', doctorProfileId, 'approved');
  }
  return { actor, doctorProfileId };
}

const actions = (env: Env) => env.world.audit.map((e) => e.action).filter((a) => a.startsWith('agenda.'));
const MONDAY_MORNING = [{ weekday: 1, start: '09:00', end: '11:00' }];

describe('M07 casos de uso de la agenda', () => {
  it('[TC-M07-020][RF-10] GET: médico sin agenda ve duración 30, sin franjas, zona y canOperate', async () => {
    const env = setup();
    const ok = await doctor(env);
    const pending = await doctor(env, false);
    expect(await env.get.execute(ok.actor)).toEqual({ timeZone: 'America/Mexico_City', canOperate: true, durationMinutes: 30, availability: [], timeOff: [] });
    expect((await env.get.execute(pending.actor)).canOperate).toBe(false);
  });

  it('[TC-M07-021][RF-10][D-4] reemplaza el horario semanal completo y lo audita', async () => {
    const env = setup();
    const d = await doctor(env);
    await env.replace.execute(d.actor, [...MONDAY_MORNING, { weekday: 3, start: '16:00', end: '20:00' }]);
    const result = await env.replace.execute(d.actor, MONDAY_MORNING);
    expect(result).toEqual(MONDAY_MORNING);
    expect((await env.get.execute(d.actor)).availability).toEqual(MONDAY_MORNING);
    expect(actions(env)).toEqual([AGENDA_AUDIT_ACTIONS.availabilityReplaced, AGENDA_AUDIT_ACTIONS.availabilityReplaced]);
    expect(env.world.audit.at(-1)!.metadata).toMatchObject({ windowsBefore: 2, windowsAfter: 1 });
    await env.replace.execute(d.actor, []);
    expect((await env.get.execute(d.actor)).availability).toEqual([]);
  });

  it('[TC-M07-022][D-4] un horario inválido no cambia nada', async () => {
    const env = setup();
    const d = await doctor(env);
    await env.replace.execute(d.actor, MONDAY_MORNING);
    await expect(env.replace.execute(d.actor, [{ weekday: 1, start: '09:00', end: '10:00' }, { weekday: 1, start: '09:30', end: '11:00' }])).rejects.toThrow(InvalidWeeklyScheduleError);
    expect((await env.get.execute(d.actor)).availability).toEqual(MONDAY_MORNING);
  });

  it('[TC-M07-023][D-2][RN-004] un médico sin canOperate no puede modificar su agenda pero sí consultarla', async () => {
    const env = setup();
    const d = await doctor(env, false);
    await expect(env.replace.execute(d.actor, MONDAY_MORNING)).rejects.toMatchObject({ kind: 'business_rule' });
    await expect(env.duration.execute(d.actor, 45)).rejects.toMatchObject({ kind: 'business_rule' });
    await expect(env.addTimeOff.execute(d.actor, { startsAt: new Date('2026-11-20T06:00:00Z'), endsAt: new Date('2026-11-21T06:00:00Z') })).rejects.toMatchObject({ kind: 'business_rule' });
    expect(actions(env)).toEqual([]);
    await expect(env.get.execute(d.actor)).resolves.toMatchObject({ canOperate: false });
    await expect(env.slots.execute(d.actor, '2026-11-09', '2026-11-09')).resolves.toMatchObject({ slots: [] });
  });

  it('[TC-M07-024][D-4] orden de candados: FOR UPDATE de la agenda antes del FOR SHARE de la política', async () => {
    const env = setup();
    const d = await doctor(env);
    env.agenda.locks.length = 0;
    await env.replace.execute(d.actor, MONDAY_MORNING);
    expect(env.agenda.locks).toEqual(['agenda:for-update', 'policy:for-share']);
  });

  it('[TC-M07-025][D-3][RF-10] cambia la duración (15–120, múltiplos de 5) y audita solo si cambia', async () => {
    const env = setup();
    const d = await doctor(env);
    await expect(env.duration.execute(d.actor, 45)).resolves.toEqual({ durationMinutes: 45 });
    await env.duration.execute(d.actor, 45);
    await expect(env.duration.execute(d.actor, 47)).rejects.toThrow(InvalidAppointmentDurationError);
    expect((await env.get.execute(d.actor)).durationMinutes).toBe(45);
    expect(actions(env)).toEqual([AGENDA_AUDIT_ACTIONS.durationChanged]);
    expect(env.world.audit.at(-1)!.metadata).toMatchObject({ from: 30, to: 45 });
  });

  it('[TC-M07-026][RF-11] agrega y lista periodos no disponibles; elimina uno vigente; audita ambos', async () => {
    const env = setup();
    const d = await doctor(env);
    const t = await env.addTimeOff.execute(d.actor, { startsAt: new Date('2026-11-20T06:00:00Z'), endsAt: new Date('2026-11-21T06:00:00Z'), reason: 'Congreso' });
    expect((await env.get.execute(d.actor)).timeOff).toEqual([t]);
    await env.removeTimeOff.execute(d.actor, t.id);
    expect((await env.get.execute(d.actor)).timeOff).toEqual([]);
    expect(actions(env)).toEqual([AGENDA_AUDIT_ACTIONS.timeOffCreated, AGENDA_AUDIT_ACTIONS.timeOffRemoved]);
  });

  it('[TC-M07-027][D-6] los periodos terminados se conservan, no se listan y no se eliminan; uno ajeno es 404', async () => {
    const env = setup();
    const d = await doctor(env);
    const other = await doctor(env);
    const past = { id: randomUUID(), doctorId: d.doctorProfileId, startsAt: new Date('2026-10-01T06:00:00Z'), endsAt: new Date('2026-10-02T06:00:00Z'), reason: null };
    env.agenda.seedTimeOff(past);
    expect((await env.get.execute(d.actor)).timeOff).toEqual([]);
    await expect(env.removeTimeOff.execute(d.actor, past.id)).rejects.toThrow(TimeOffAlreadyEndedError);
    await expect(env.removeTimeOff.execute(other.actor, past.id)).rejects.toThrow(TimeOffNotFoundError);
    expect(env.agenda.state.timeOff).toHaveLength(1);
  });

  it('[TC-M07-028][RF-10][RF-11] vista previa de horarios: respeta duración, periodos no disponibles y ocupados', async () => {
    const busy: BusyIntervalsProvider = { busyIntervals: async () => [{ startsAt: new Date('2026-11-09T16:30:00Z'), endsAt: new Date('2026-11-09T17:00:00Z') }] };
    const env = setup(busy);
    const d = await doctor(env);
    await env.replace.execute(d.actor, MONDAY_MORNING);
    await env.addTimeOff.execute(d.actor, { startsAt: new Date('2026-11-09T15:00:00Z'), endsAt: new Date('2026-11-09T15:30:00Z') });
    const view = await env.slots.execute(d.actor, '2026-11-09', '2026-11-09');
    expect(view).toMatchObject({ timeZone: 'America/Mexico_City', durationMinutes: 30, from: '2026-11-09', to: '2026-11-09' });
    expect(view.slots.map((s) => s.start)).toEqual(['09:30', '10:00']);
    expect((await env.service.generateSlots(d.doctorProfileId, '2026-11-09', '2026-11-09')).slots).toHaveLength(2);
  });

  it('[TC-M07-029] si la auditoría falla, la transacción se revierte', async () => {
    const env = setup();
    const d = await doctor(env);
    env.world.failAudit = true;
    await expect(env.replace.execute(d.actor, MONDAY_MORNING)).rejects.toThrow('fallo simulado');
    await expect(env.duration.execute(d.actor, 60)).rejects.toThrow('fallo simulado');
    env.world.failAudit = false;
    const view = await env.get.execute(d.actor);
    expect(view.availability).toEqual([]);
    expect(view.durationMinutes).toBe(30);
  });

  it('[TC-M07-030] otro rol o un usuario sin perfil no accede a la agenda', async () => {
    const env = setup();
    const d = await doctor(env);
    for (const actor of [{ ...d.actor, role: 'patient' as const }, { ...d.actor, userProfileId: null }]) {
      await expect(env.get.execute(actor)).rejects.toThrow(AgendaDoctorRequiredError);
      await expect(env.replace.execute(actor, [])).rejects.toThrow(AgendaDoctorRequiredError);
    }
  });
});
