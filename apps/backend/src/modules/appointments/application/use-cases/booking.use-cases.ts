import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { CLOCK, type Clock } from '../../../../common/application/ports/clock';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { AgendaService } from '../../../agenda/application/use-cases/agenda.use-cases';
import {
  ActiveHoldExistsError, AppointmentNotFoundError, BookingConfigurationMissingError, BookingDisabledError, InvalidAppointmentInputError,
  InvalidAppointmentStateError, InvalidSlotError, LegalAcceptancesRequiredError, PatientScheduleConflictError, SlotUnavailableError,
} from '../../domain/appointments.errors';
import { assertTransition, type AppointmentStatus } from '../../domain/appointment-status';
import { holdExpiresAt, isHoldActive, occupiesSchedule } from '../../domain/hold';
import { addLocalDays, LISTING_HORIZON_DAYS, localDateString, PLATFORM_TIME_ZONE } from '../../domain/local-date';
import { blockOf, excludeBusy, occupancyOf, overlaps, type Interval } from '../../domain/occupancy';
import { AppointmentAuditEvents } from '../appointments-audit-events';
import {
  APPOINTMENT_REPOSITORY, BOOKABLE_DOCTORS_READER, BOOKING_ELIGIBILITY, BOOKING_FEATURE, BOOKING_LEGAL_ACCEPTANCES, CANCELLATION_POLICY_REPOSITORY,
  CONSULTATION_PRICE_REPOSITORY, type AppointmentRecord, type AppointmentRepository, type BookableDoctorsReader, type BookingEligibility,
  type BookingFeature, type BookingLegalAcceptances, type CancellationPolicyRepository, type ConsultationPriceRepository, type DoctorSummary,
} from '../ports/appointments.ports';
import { requireDoctor, requirePatient, SYSTEM_PROCESS, systemActor } from './actors';

// M08 RF-12 y RF-14: horarios para el paciente, retención de 5 minutos, liberación y consultas.
// La cita nace en pending_payment y solo se confirma con un pago exitoso (RN-008, RN-011): esa confirmación entra por
// AppointmentConfirmationService, que no tiene ruta HTTP (AP-16).

export const MAX_REASON_LENGTH = 500;
const DAY_MS = 86_400_000;

export interface AppointmentView {
  id: string;
  doctorProfileId: string;
  patientProfileId: string;
  status: AppointmentStatus;
  scheduledAt: string;
  reason: string;
  price: string;
  holdExpiresAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
}

export function toAppointmentView(a: AppointmentRecord, now: Date): AppointmentView {
  return {
    id: a.id, doctorProfileId: a.doctorId, patientProfileId: a.patientId,
    // Una retención vencida que aún no se marcó se muestra como expired (vencimiento perezoso, DA-9).
    status: a.status === 'pending_payment' && !isHoldActive(a, now) ? 'expired' : a.status,
    scheduledAt: a.scheduledAt.toISOString(), reason: a.reason, price: a.price,
    holdExpiresAt: a.status === 'pending_payment' ? a.paymentHoldExpiresAt?.toISOString() ?? null : null,
    cancelledAt: a.cancelledAt?.toISOString() ?? null, cancelledBy: a.cancelledByType,
  };
}

// Intervalos ocupados de un médico (citas confirmadas y retenciones vigentes): el fin de bloque guardado (DA-3), o O1
// con la duración actual solo para las citas históricas sin él.
@Injectable()
export class DoctorOccupancyService {
  constructor(@Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository) {}

  async busy(doctorProfileId: string, from: Date, to: Date, now: Date): Promise<Interval[]> {
    const duration = await this.appointments.doctorDuration(doctorProfileId);
    // Se amplía el rango hacia atrás para incluir citas que empiezan antes y terminan dentro.
    const candidates = await this.appointments.listDoctorCandidatesOverlapping(doctorProfileId, new Date(from.getTime() - DAY_MS), to);
    return candidates.filter((a) => occupiesSchedule(a, now)).map((a) => blockOf(a, duration));
  }
}

export interface PatientSlotsView {
  timeZone: string;
  doctorProfileId: string;
  durationMinutes: number;
  from: string;
  to: string;
  slots: { startsAt: string; endsAt: string; date: string; start: string; end: string }[];
}

@Injectable()
export class PatientSlotsService {
  constructor(
    private readonly agenda: AgendaService,
    private readonly occupancy: DoctorOccupancyService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async freeSlots(doctorProfileId: string, from: string, to: string): Promise<PatientSlotsView> {
    const view = await this.agenda.generateSlots(doctorProfileId, from, to);
    if (view.slots.length === 0) return { timeZone: view.timeZone, doctorProfileId, durationMinutes: view.durationMinutes, from, to, slots: [] };
    const first = new Date(view.slots[0].startsAt);
    const last = new Date(view.slots[view.slots.length - 1].endsAt);
    const busy = await this.occupancy.busy(doctorProfileId, first, last, this.clock.now());
    return { timeZone: view.timeZone, doctorProfileId, durationMinutes: view.durationMinutes, from, to, slots: excludeBusy(view.slots, busy) };
  }

  // RB-1: 'invalid' si M07 no genera ese horario; 'taken' si lo ocupa otra cita; 'free' en otro caso.
  async slotStatus(doctorProfileId: string, startsAt: Date): Promise<'free' | 'taken' | 'invalid'> {
    const day = localDateString(startsAt);
    const view = await this.agenda.generateSlots(doctorProfileId, day, day);
    const slot = view.slots.find((s) => new Date(s.startsAt).getTime() === startsAt.getTime());
    if (!slot) return 'invalid';
    const busy = await this.occupancy.busy(doctorProfileId, new Date(slot.startsAt), new Date(slot.endsAt), this.clock.now());
    return excludeBusy([slot], busy).length === 1 ? 'free' : 'taken';
  }
}

@Injectable()
export class GetDoctorSlotsForPatientUseCase {
  constructor(
    private readonly slots: PatientSlotsService,
    @Inject(BOOKING_ELIGIBILITY) private readonly eligibility: BookingEligibility,
  ) {}

  async execute(actor: Actor, doctorProfileId: string, from: string, to: string): Promise<PatientSlotsView> {
    requirePatient(actor);
    await this.eligibility.assertDoctorCanOperate(doctorProfileId);
    return this.slots.freeSlots(doctorProfileId, from, to);
  }
}

// CC-6 (AP-12): solo médicos con canOperate y con al menos un horario libre en los próximos 31 días.
@Injectable()
export class ListBookableDoctorsUseCase {
  constructor(
    @Inject(BOOKABLE_DOCTORS_READER) private readonly reader: BookableDoctorsReader,
    @Inject(BOOKING_ELIGIBILITY) private readonly eligibility: BookingEligibility,
    private readonly slots: PatientSlotsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, specialtyId?: string): Promise<{ timeZone: string; doctors: DoctorSummary[] }> {
    requirePatient(actor);
    const from = localDateString(this.clock.now());
    const to = addLocalDays(from, LISTING_HORIZON_DAYS - 1);
    const doctors: DoctorSummary[] = [];
    for (const d of await this.reader.listCandidates(specialtyId)) {
      if (!(await this.eligibility.doctorCanOperate(d.doctorProfileId))) continue;
      if ((await this.slots.freeSlots(d.doctorProfileId, from, to)).slots.length > 0) doctors.push(d);
    }
    return { timeZone: PLATFORM_TIME_ZONE, doctors };
  }
}

export interface HoldInput {
  doctorProfileId: string;
  startsAt: Date;
  reason: string;
}

@Injectable()
export class HoldSlotUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(CONSULTATION_PRICE_REPOSITORY) private readonly prices: ConsultationPriceRepository,
    @Inject(CANCELLATION_POLICY_REPOSITORY) private readonly policies: CancellationPolicyRepository,
    @Inject(BOOKING_ELIGIBILITY) private readonly eligibility: BookingEligibility,
    @Inject(BOOKING_FEATURE) private readonly feature: BookingFeature,
    private readonly slots: PatientSlotsService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(BOOKING_LEGAL_ACCEPTANCES) private readonly legal: BookingLegalAcceptances,
  ) {}

  async execute(actor: Actor, input: HoldInput): Promise<AppointmentView> {
    const userProfileId = requirePatient(actor);
    if (!this.feature.enabled()) throw new BookingDisabledError();
    const reason = input.reason?.trim() ?? '';
    if (reason.length < 1 || reason.length > MAX_REASON_LENGTH) throw new InvalidAppointmentInputError(`el motivo debe tener de 1 a ${MAX_REASON_LENGTH} caracteres`);
    if (Number.isNaN(input.startsAt?.getTime())) throw new InvalidAppointmentInputError('startsAt no es una fecha válida');

    return this.uow.runInTransaction(async () => {
      // DA-2: médico → paciente → políticas.
      const doctor = await this.appointments.lockDoctorById(input.doctorProfileId);
      if (!doctor) throw new InvalidSlotError();
      const patient = await this.appointments.lockPatientByUserProfileId(userProfileId);
      if (!patient) throw new InvalidAppointmentInputError('el paciente no tiene perfil');
      await this.eligibility.assertPatientCanBook(actor);
      await this.eligibility.assertDoctorCanOperate(doctor.doctorProfileId);
      const now = this.clock.now();

      await this.expireStaleHolds(doctor.doctorProfileId, now);

      const block = occupancyOf(input.startsAt, doctor.durationMinutes);
      const patientAppointments = await this.appointments.listPatientCandidates(patient.patientProfileId, new Date(block.startsAt.getTime() - DAY_MS), block.endsAt);
      // RB-2: pedir otra vez el mismo horario con una retención vigente devuelve la misma retención.
      const same = patientAppointments.find((a) => a.doctorId === doctor.doctorProfileId && a.scheduledAt.getTime() === block.startsAt.getTime() && isHoldActive(a, now));
      if (same) return toAppointmentView(same, now);
      // RB-3: como máximo una retención vigente por paciente y sin cruces con sus otras citas.
      if ((await this.appointments.listPatientHolds(patient.patientProfileId)).some((a) => isHoldActive(a, now))) throw new ActiveHoldExistsError();
      for (const a of patientAppointments) {
        if (!occupiesSchedule(a, now)) continue;
        const duration = a.doctorId === doctor.doctorProfileId ? doctor.durationMinutes : await this.appointments.doctorDuration(a.doctorId);
        if (overlaps(blockOf(a, duration), block)) throw new PatientScheduleConflictError();
      }

      // RB-1: el horario debe ser exactamente uno de los generados por M07 y no estar ocupado.
      const slot = await this.slots.slotStatus(doctor.doctorProfileId, block.startsAt);
      if (slot === 'invalid') throw new InvalidSlotError();
      if (slot === 'taken') throw new SlotUnavailableError();

      const price = await this.prices.findEffective(now);
      if (!price) throw new BookingConfigurationMissingError('price');
      const policy = await this.policies.findEffective(now);
      if (!policy) throw new BookingConfigurationMissingError('policy');
      // AP-26: las dos aceptaciones legales vigentes, leídas en la misma transacción justo antes de crear la cita.
      const legal = await this.legal.currentFor(userProfileId);
      if (!legal) throw new LegalAcceptancesRequiredError();

      const id = randomUUID();
      const expiresAt = holdExpiresAt(now);
      await this.appointments.insert({
        id, patientId: patient.patientProfileId, doctorId: doctor.doctorProfileId, scheduledAt: block.startsAt, reason,
        price: price.price, cancellationPolicyId: policy.id, paymentHoldExpiresAt: expiresAt, agendaBlockEndsAt: block.endsAt, createdByUserProfileId: userProfileId,
        privacyLegalAcceptanceId: legal.privacyLegalAcceptanceId, termsLegalAcceptanceId: legal.termsLegalAcceptanceId,
      });
      await this.audit.record(AppointmentAuditEvents.holdCreated(AuditActor.fromActor(actor), id, {
        doctorProfileId: doctor.doctorProfileId, holdExpiresAt: expiresAt.toISOString(), cancellationPolicyId: policy.id, price: price.price,
      }));
      const created = await this.appointments.findById(id);
      return toAppointmentView(created!, now);
    });
  }

  // DA-9: las retenciones vencidas del médico se marcan como expired dentro de la transacción de la reserva.
  private async expireStaleHolds(doctorProfileId: string, now: Date): Promise<void> {
    for (const stale of await this.appointments.listExpiredHolds(doctorProfileId, now)) {
      await this.appointments.changeStatus(stale.id, { status: 'expired', actorType: 'system', actorUserProfileId: null, reason: 'hold_timeout' });
      await this.audit.record(AppointmentAuditEvents.holdExpired(systemActor(SYSTEM_PROCESS.holdExpiry), stale.id, 'timeout'));
    }
  }
}

// El paciente libera su retención: pending_payment → expired (nunca canceled; trigger appointment_guard).
@Injectable()
export class ReleaseHoldUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
  ) {}

  async execute(actor: Actor, appointmentId: string): Promise<void> {
    const userProfileId = requirePatient(actor);
    await this.uow.runInTransaction(async () => {
      const existing = await this.appointments.findById(appointmentId);
      const patient = await this.appointments.findPatientByUserProfileId(userProfileId);
      if (!existing || !patient || existing.patientId !== patient.patientProfileId) throw new AppointmentNotFoundError();
      await this.appointments.lockDoctorById(existing.doctorId);
      await this.appointments.lockPatientByUserProfileId(userProfileId);
      const a = await this.appointments.lockById(appointmentId);
      if (!a) throw new AppointmentNotFoundError();
      if (a.status !== 'pending_payment') throw new InvalidAppointmentStateError(a.status);
      assertTransition(a.status, 'expired');
      await this.appointments.changeStatus(a.id, { status: 'expired', actorType: 'patient', actorUserProfileId: userProfileId, reason: 'hold_released' });
      await this.audit.record(AppointmentAuditEvents.holdReleased(AuditActor.fromActor(actor), a.id));
    });
  }
}

@Injectable()
export class PatientAppointmentsQuery {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(actor: Actor): Promise<AppointmentView[]> {
    const patient = await this.appointments.findPatientByUserProfileId(requirePatient(actor));
    if (!patient) return [];
    const now = this.clock.now();
    return (await this.appointments.listForPatient(patient.patientProfileId)).map((a) => toAppointmentView(a, now));
  }

  async get(actor: Actor, id: string): Promise<AppointmentView> {
    const patient = await this.appointments.findPatientByUserProfileId(requirePatient(actor));
    const a = await this.appointments.findById(id);
    // La cita de otro paciente responde igual que una inexistente.
    if (!a || !patient || a.patientId !== patient.patientProfileId) throw new AppointmentNotFoundError();
    return toAppointmentView(a, this.clock.now());
  }
}

@Injectable()
export class DoctorAppointmentsQuery {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(actor: Actor, from: Date, to: Date): Promise<AppointmentView[]> {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 31 * DAY_MS) {
      throw new InvalidAppointmentInputError('el rango debe ser válido y de 31 días como máximo');
    }
    const doctor = await this.appointments.findDoctorByUserProfileId(requireDoctor(actor));
    if (!doctor) return [];
    const now = this.clock.now();
    // El médico ve sus citas confirmadas y cerradas; las retenciones vencidas no le interesan.
    return (await this.appointments.listForDoctor(doctor.doctorProfileId, from, to))
      .filter((a) => a.status !== 'expired' && (a.status !== 'pending_payment' || isHoldActive(a, now)))
      .map((a) => toAppointmentView(a, now));
  }
}
