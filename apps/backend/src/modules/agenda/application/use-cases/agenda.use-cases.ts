import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { CLOCK, type Clock } from '../../../../common/application/ports/clock';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { DomainError } from '../../../../common/domain/domain-error';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { DoctorOperationalPolicy } from '../../../doctors/application/policies/doctor-operational.policy';
import { AGENDA_TIME_ZONE } from '../../domain/agenda-time';
import { assertAppointmentDuration, effectiveDuration } from '../../domain/appointment-duration';
import { AgendaDoctorNotFoundError, AgendaDoctorRequiredError, TimeOffAlreadyEndedError, TimeOffNotFoundError } from '../../domain/agenda.errors';
import { generateSlots, rangeBounds, resolveSlotRange, type Slot } from '../../domain/slot-generator';
import { validateTimeOff } from '../../domain/time-off';
import { buildWeeklySchedule, toWindowInput, type WeeklyWindowInput } from '../../domain/weekly-schedule';
import { AgendaAuditEvents } from '../agenda-audit-events';
import { AGENDA_REPOSITORY, type AgendaDoctor, type AgendaRepository, type TimeOffRecord } from '../ports/agenda.repository';
import { BUSY_INTERVALS_PROVIDER, type BusyIntervalsProvider } from '../ports/busy-intervals.provider';

// M07 Agenda médica (RF-10 horario y duración; RF-11 periodos no disponibles).
// Escrituras (D-2, D-4): UnitOfWork → candado FOR UPDATE del perfil → DoctorOperationalPolicy (canOperate) → cambio →
// auditoría, todo en la misma transacción. Lecturas: cualquier médico ve su agenda, opere o no.

export interface TimeOffView {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface AgendaView {
  timeZone: typeof AGENDA_TIME_ZONE;
  canOperate: boolean;
  durationMinutes: number;
  availability: WeeklyWindowInput[];
  timeOff: TimeOffView[];
}

export interface SlotsView {
  timeZone: typeof AGENDA_TIME_ZONE;
  durationMinutes: number;
  from: string;
  to: string;
  slots: Slot[];
}

function requireDoctorActor(actor: Actor): string {
  if (actor?.role !== 'doctor' || !actor.userProfileId) throw new AgendaDoctorRequiredError();
  return actor.userProfileId;
}

const toView = (t: TimeOffRecord): TimeOffView => ({ id: t.id, startsAt: t.startsAt.toISOString(), endsAt: t.endsAt.toISOString(), reason: t.reason });

// Pasos comunes de una escritura: candado exclusivo del perfil y, después, la política operativa.
@Injectable()
export class AgendaWriteGuard {
  constructor(
    @Inject(AGENDA_REPOSITORY) private readonly agenda: AgendaRepository,
    private readonly policy: DoctorOperationalPolicy,
  ) {}

  async lockOperatingDoctor(actor: Actor): Promise<AgendaDoctor> {
    const userProfileId = requireDoctorActor(actor);
    const doctor = await this.agenda.lockDoctorByUserProfileId(userProfileId);
    if (!doctor) throw new AgendaDoctorNotFoundError();
    await this.policy.assertActorCanOperate(actor);
    return doctor;
  }
}

// Servicio para M08: horarios libres de un médico concreto (sin candado ni política; M08 aplicará las suyas).
@Injectable()
export class AgendaService {
  constructor(
    @Inject(AGENDA_REPOSITORY) private readonly agenda: AgendaRepository,
    @Inject(BUSY_INTERVALS_PROVIDER) private readonly busy: BusyIntervalsProvider,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async generateSlots(doctorProfileId: string, from: string, to: string): Promise<SlotsView> {
    const doctor = await this.agenda.findDoctorById(doctorProfileId);
    if (!doctor) throw new AgendaDoctorNotFoundError();
    return this.slotsFor(doctor, from, to);
  }

  async slotsFor(doctor: AgendaDoctor, from: string, to: string): Promise<SlotsView> {
    const now = this.clock.now();
    const range = resolveSlotRange(from, to, now);
    const bounds = rangeBounds(range);
    const durationMinutes = effectiveDuration(doctor.durationMinutes);
    const [windows, timeOff, busy] = await Promise.all([
      this.agenda.listAvailability(doctor.doctorProfileId),
      this.agenda.listTimeOffOverlapping(doctor.doctorProfileId, bounds.startsAt, bounds.endsAt),
      this.busy.busyIntervals(doctor.doctorProfileId, bounds.startsAt, bounds.endsAt),
    ]);
    return { timeZone: AGENDA_TIME_ZONE, durationMinutes, from, to, slots: generateSlots({ range, windows, durationMinutes, timeOff, busy, now }) };
  }
}

@Injectable()
export class GetMyAgendaUseCase {
  constructor(
    @Inject(AGENDA_REPOSITORY) private readonly agenda: AgendaRepository,
    private readonly policy: DoctorOperationalPolicy,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor): Promise<AgendaView> {
    const doctor = await this.agenda.findDoctorByUserProfileId(requireDoctorActor(actor));
    if (!doctor) throw new AgendaDoctorNotFoundError();
    const [availability, timeOff, canOperate] = await Promise.all([
      this.agenda.listAvailability(doctor.doctorProfileId),
      this.agenda.listTimeOffEndingAfter(doctor.doctorProfileId, this.clock.now()),
      this.canOperate(actor),
    ]);
    return {
      timeZone: AGENDA_TIME_ZONE,
      canOperate,
      durationMinutes: effectiveDuration(doctor.durationMinutes),
      availability: availability.map(toWindowInput),
      timeOff: timeOff.map(toView),
    };
  }

  // Sin importar errores internos de M03: la política responde business_rule cuando el médico no está habilitado.
  private async canOperate(actor: Actor): Promise<boolean> {
    try {
      await this.policy.assertActorCanOperate(actor);
      return true;
    } catch (error) {
      if (error instanceof DomainError && error.kind === 'business_rule') return false;
      throw error;
    }
  }
}

@Injectable()
export class PreviewMySlotsUseCase {
  constructor(
    @Inject(AGENDA_REPOSITORY) private readonly agenda: AgendaRepository,
    private readonly service: AgendaService,
  ) {}

  async execute(actor: Actor, from: string, to: string): Promise<SlotsView> {
    const doctor = await this.agenda.findDoctorByUserProfileId(requireDoctorActor(actor));
    if (!doctor) throw new AgendaDoctorNotFoundError();
    return this.service.slotsFor(doctor, from, to);
  }
}

@Injectable()
export class ReplaceWeeklyAvailabilityUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(AGENDA_REPOSITORY) private readonly agenda: AgendaRepository,
    private readonly guard: AgendaWriteGuard,
  ) {}

  // D-4: reemplazo completo y transaccional (una lista vacía deja al médico sin horario).
  async execute(actor: Actor, inputs: WeeklyWindowInput[]): Promise<WeeklyWindowInput[]> {
    const windows = buildWeeklySchedule(inputs);
    const auditActor = AuditActor.fromActor(actor);
    return this.uow.runInTransaction(async () => {
      const doctor = await this.guard.lockOperatingDoctor(actor);
      const before = await this.agenda.listAvailability(doctor.doctorProfileId);
      await this.agenda.replaceAvailability(doctor.doctorProfileId, windows);
      await this.auditTrail.record(AgendaAuditEvents.availabilityReplaced(auditActor, doctor.doctorProfileId, before.length, windows.length));
      return windows.map(toWindowInput);
    });
  }
}

@Injectable()
export class ChangeAppointmentDurationUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(AGENDA_REPOSITORY) private readonly agenda: AgendaRepository,
    private readonly guard: AgendaWriteGuard,
  ) {}

  async execute(actor: Actor, minutes: number): Promise<{ durationMinutes: number }> {
    const durationMinutes = assertAppointmentDuration(minutes);
    const auditActor = AuditActor.fromActor(actor);
    return this.uow.runInTransaction(async () => {
      const doctor = await this.guard.lockOperatingDoctor(actor);
      if (doctor.durationMinutes !== durationMinutes) {
        await this.agenda.setDuration(doctor.doctorProfileId, durationMinutes);
        await this.auditTrail.record(AgendaAuditEvents.durationChanged(auditActor, doctor.doctorProfileId, doctor.durationMinutes, durationMinutes));
      }
      return { durationMinutes };
    });
  }
}

@Injectable()
export class AddTimeOffUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(AGENDA_REPOSITORY) private readonly agenda: AgendaRepository,
    private readonly guard: AgendaWriteGuard,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, input: { startsAt: Date; endsAt: Date; reason?: string | null }): Promise<TimeOffView> {
    const valid = validateTimeOff({ startsAt: input.startsAt, endsAt: input.endsAt, reason: input.reason ?? null }, this.clock.now());
    const auditActor = AuditActor.fromActor(actor);
    return this.uow.runInTransaction(async () => {
      const doctor = await this.guard.lockOperatingDoctor(actor);
      const record: TimeOffRecord = { id: randomUUID(), doctorId: doctor.doctorProfileId, ...valid };
      await this.agenda.insertTimeOff(record);
      await this.auditTrail.record(AgendaAuditEvents.timeOffCreated(auditActor, record.id, doctor.doctorProfileId));
      return toView(record);
    });
  }
}

@Injectable()
export class RemoveTimeOffUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(AGENDA_REPOSITORY) private readonly agenda: AgendaRepository,
    private readonly guard: AgendaWriteGuard,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // Solo los propios (uno ajeno responde 404, sin revelar que existe) y que no hayan terminado (D-6).
  async execute(actor: Actor, timeOffId: string): Promise<void> {
    const auditActor = AuditActor.fromActor(actor);
    await this.uow.runInTransaction(async () => {
      const doctor = await this.guard.lockOperatingDoctor(actor);
      const record = await this.agenda.findTimeOff(doctor.doctorProfileId, timeOffId);
      if (!record) throw new TimeOffNotFoundError();
      if (record.endsAt <= this.clock.now()) throw new TimeOffAlreadyEndedError();
      await this.agenda.deleteTimeOff(doctor.doctorProfileId, record.id);
      await this.auditTrail.record(AgendaAuditEvents.timeOffRemoved(auditActor, record.id, doctor.doctorProfileId));
    });
  }
}
