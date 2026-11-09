import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { CLOCK, type Clock } from '../../../../common/application/ports/clock';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import {
  AppointmentNotFoundError, BookingDisabledError, CancellationPolicyNotConfiguredError, InvalidAppointmentInputError, InvalidAppointmentStateError,
  InvalidSlotError, PatientScheduleConflictError, SlotUnavailableError,
} from '../../domain/appointments.errors';
import { assertTransition } from '../../domain/appointment-status';
import { occupiesSchedule } from '../../domain/hold';
import { blockOf, occupancyOf, overlaps } from '../../domain/occupancy';
import { assertReschedulable, MAX_CHAIN_LENGTH } from '../../domain/reschedule-rules';
import { AppointmentAuditEvents } from '../appointments-audit-events';
import {
  APPOINTMENT_REPOSITORY, BOOKING_ELIGIBILITY, BOOKING_FEATURE, CANCELLATION_POLICY_REPOSITORY, type AppointmentRecord, type AppointmentRepository,
  type BookingEligibility, type BookingFeature, type CancellationPolicyRepository,
} from '../ports/appointments.ports';
import { PatientSlotsService, toAppointmentView, type AppointmentView } from './booking.use-cases';
import { requirePatient } from './actors';

// M08 RF-12, DA-6, DA-7, DA-8 (AP-7, AP-9, AP-26): el paciente propietario reagenda una cita confirmed a otro horario
// libre del mismo médico. Decisiones confirmadas (2026-11-09):
// - No es una reserva nueva para RN-140: no lee las aceptaciones vigentes; copia las dos referencias de la original.
// - Exige el médico habilitado y APPOINTMENTS_BOOKING_ENABLED; no vuelve a comprobar la identidad del paciente.
// - Plazo y límite con la política aplicada a la original; el contador se cuenta desde la raíz de la cadena.
// - La original pasa a rescheduled (deja de ocupar horario); la nueva nace confirmed con el mismo precio, política y
//   motivo, sin cobro ni reembolso (el pago queda en la raíz).
// Orden de candados (DA-2): doctor_profile → patient_profile → appointment (FOR UPDATE). Dos reagendamientos
// simultáneos de la misma cita: el segundo la encuentra rescheduled y recibe 409.

const DAY_MS = 86_400_000;

export interface RescheduleView extends AppointmentView {
  rescheduledFromAppointmentId: string;
}

@Injectable()
export class RescheduleByPatientUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(CANCELLATION_POLICY_REPOSITORY) private readonly policies: CancellationPolicyRepository,
    @Inject(BOOKING_ELIGIBILITY) private readonly eligibility: BookingEligibility,
    @Inject(BOOKING_FEATURE) private readonly feature: BookingFeature,
    private readonly slots: PatientSlotsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(actor: Actor, appointmentId: string, startsAt: Date): Promise<RescheduleView> {
    const userProfileId = requirePatient(actor);
    if (!this.feature.enabled()) throw new BookingDisabledError();
    if (!(startsAt instanceof Date) || Number.isNaN(startsAt.getTime())) throw new InvalidAppointmentInputError('startsAt no es una fecha válida');

    return this.uow.runInTransaction(async () => {
      // Propiedad antes de bloquear: la cita de otro paciente responde igual que una inexistente.
      const existing = await this.appointments.findById(appointmentId);
      const owner = await this.appointments.findPatientByUserProfileId(userProfileId);
      if (!existing || !owner || existing.patientId !== owner.patientProfileId) throw new AppointmentNotFoundError();
      const doctor = await this.appointments.lockDoctorById(existing.doctorId);
      if (!doctor) throw new AppointmentNotFoundError();
      await this.appointments.lockPatientByUserProfileId(userProfileId);
      const original = await this.appointments.lockById(appointmentId);
      if (!original) throw new AppointmentNotFoundError();
      if (original.status !== 'confirmed') throw new InvalidAppointmentStateError(original.status);
      assertTransition(original.status, 'rescheduled');
      await this.eligibility.assertDoctorCanOperate(doctor.doctorProfileId);

      const policy = await this.policies.findById(original.cancellationPolicyId);
      if (!policy) throw new CancellationPolicyNotConfiguredError();
      const now = this.clock.now();
      const chain = await this.chainOf(original);
      assertReschedulable({
        originalScheduledAt: original.scheduledAt, now, refundDeadlineHours: policy.refundDeadlineHours,
        previousReschedules: chain.depth, maxReschedules: policy.maxReschedules,
      });
      if (startsAt.getTime() === original.scheduledAt.getTime()) throw new InvalidAppointmentInputError('el nuevo horario debe ser distinto del actual');

      // Se cierra la original primero: deja de ocupar horario dentro de la misma transacción (si algo falla después,
      // todo se revierte y la original sigue confirmed).
      await this.appointments.changeStatus(original.id, { status: 'rescheduled', actorType: 'patient', actorUserProfileId: userProfileId, reason: 'rescheduled' });

      const block = occupancyOf(startsAt, doctor.durationMinutes);
      for (const a of await this.appointments.listPatientCandidates(original.patientId, new Date(block.startsAt.getTime() - DAY_MS), block.endsAt)) {
        if (!occupiesSchedule(a, now)) continue;
        const duration = a.doctorId === doctor.doctorProfileId ? doctor.durationMinutes : await this.appointments.doctorDuration(a.doctorId);
        if (overlaps(blockOf(a, duration), block)) throw new PatientScheduleConflictError();
      }
      // RB-1: exactamente un horario generado por M07 y libre.
      const slot = await this.slots.slotStatus(doctor.doctorProfileId, block.startsAt);
      if (slot === 'invalid') throw new InvalidSlotError();
      if (slot === 'taken') throw new SlotUnavailableError();

      const id = randomUUID();
      await this.appointments.insertRescheduled({
        id, rescheduledFromAppointmentId: original.id, patientId: original.patientId, doctorId: original.doctorId, scheduledAt: block.startsAt,
        agendaBlockEndsAt: block.endsAt,
        reason: original.reason, price: original.price, cancellationPolicyId: original.cancellationPolicyId,
        privacyLegalAcceptanceId: original.privacyLegalAcceptanceId, termsLegalAcceptanceId: original.termsLegalAcceptanceId,
        createdByUserProfileId: userProfileId,
      });
      await this.audit.record(AppointmentAuditEvents.rescheduled(AuditActor.fromActor(actor), {
        fromId: original.id, toId: id, rootId: chain.rootId, n: chain.depth + 1,
      }));
      const created = await this.appointments.findById(id);
      return { ...toAppointmentView(created!, now), rescheduledFromAppointmentId: original.id };
    });
  }

  // Raíz y profundidad de la cadena (DA-7): reagendamientos previos = número de antecesores de la cita.
  private async chainOf(a: AppointmentRecord): Promise<{ rootId: string; depth: number }> {
    let current = a;
    let depth = 0;
    while (current.rescheduledFromAppointmentId) {
      if (depth >= MAX_CHAIN_LENGTH) throw new InvalidAppointmentStateError(a.status);
      const previous = await this.appointments.findById(current.rescheduledFromAppointmentId);
      if (!previous) throw new AppointmentNotFoundError();
      current = previous;
      depth++;
    }
    return { rootId: current.id, depth };
  }
}
