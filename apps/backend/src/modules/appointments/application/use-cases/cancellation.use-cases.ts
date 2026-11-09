import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { CLOCK, type Clock } from '../../../../common/application/ports/clock';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { AppointmentNotFoundError, CancellationPolicyNotConfiguredError, InvalidAppointmentInputError, InvalidAppointmentStateError } from '../../domain/appointments.errors';
import { assertTransition } from '../../domain/appointment-status';
import { DOCTOR_CANCELLATION_OUTCOME, hoursUntil, MAX_REASON, MIN_DOCTOR_REASON, patientCancellationOutcome, type RefundOutcome } from '../../domain/cancellation-rules';
import { AppointmentAuditEvents } from '../appointments-audit-events';
import { APPOINTMENT_EVENT_PUBLISHER, type AppointmentEventPublisher } from '../appointment-events';
import {
  APPOINTMENT_REPOSITORY, BOOKING_ELIGIBILITY, CANCELLATION_POLICY_REPOSITORY, type AppointmentRepository, type BookingEligibility,
  type CancellationPolicyRepository,
} from '../ports/appointments.ports';
import { requireDoctor, requirePatient } from './actors';

// M08 RF-15: cancelación de citas confirmadas. El resultado económico usa la versión de la política aplicada a la cita
// (RN-021), nunca la vigente. El reembolso lo ejecuta pagos (RF-46) a partir del evento auditado.
// Orden de candados (DA-2): doctor_profile → patient_profile → appointment.

export interface CancellationResult {
  id: string;
  status: 'canceled';
  refundOutcome: RefundOutcome;
}

const round = (h: number) => Math.round(h * 100) / 100;

@Injectable()
export class CancelByPatientUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(CANCELLATION_POLICY_REPOSITORY) private readonly policies: CancellationPolicyRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APPOINTMENT_EVENT_PUBLISHER) private readonly events: AppointmentEventPublisher,
  ) {}

  async execute(actor: Actor, appointmentId: string, rawReason?: string | null): Promise<CancellationResult> {
    const userProfileId = requirePatient(actor);
    const reason = rawReason?.trim() || null;
    if (reason && reason.length > MAX_REASON) throw new InvalidAppointmentInputError(`el motivo admite ${MAX_REASON} caracteres como máximo`);
    return this.uow.runInTransaction(async () => {
      const existing = await this.appointments.findById(appointmentId);
      const patient = await this.appointments.findPatientByUserProfileId(userProfileId);
      if (!existing || !patient || existing.patientId !== patient.patientProfileId) throw new AppointmentNotFoundError();
      await this.appointments.lockDoctorById(existing.doctorId);
      await this.appointments.lockPatientByUserProfileId(userProfileId);
      const a = await this.appointments.lockById(appointmentId);
      if (!a) throw new AppointmentNotFoundError();
      // Desde pending_payment no se cancela: se libera la retención (→ expired).
      if (a.status !== 'confirmed') throw new InvalidAppointmentStateError(a.status);
      assertTransition(a.status, 'canceled');
      const policy = await this.policies.findById(a.cancellationPolicyId);
      if (!policy) throw new CancellationPolicyNotConfiguredError();
      const now = this.clock.now();
      const refundOutcome = patientCancellationOutcome(a.scheduledAt, now, policy.refundDeadlineHours);
      await this.appointments.changeStatus(a.id, {
        status: 'canceled', actorType: 'patient', actorUserProfileId: userProfileId, reason, cancellation: { reason, at: now },
      });
      await this.audit.record(AppointmentAuditEvents.canceled(AuditActor.fromActor(actor), a.id, {
        actorType: 'patient', refundOutcome, hoursBefore: round(hoursUntil(a.scheduledAt, now)),
      }));
      this.events.publish({
        type: 'AppointmentCanceled', appointmentId: a.id, patientProfileId: a.patientId, doctorProfileId: a.doctorId,
        occurredAt: now.toISOString(), canceledBy: 'patient', reason, refundOutcome,
      });
      return { id: a.id, status: 'canceled', refundOutcome };
    });
  }
}

// RN-013 y DX-1 (AP-13): el médico cancela con reembolso total aunque haya perdido canOperate. Solo cancela sus propias
// citas confirmadas, con motivo obligatorio; la auditoría registra si podía operar.
@Injectable()
export class CancelByDoctorUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(BOOKING_ELIGIBILITY) private readonly eligibility: BookingEligibility,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APPOINTMENT_EVENT_PUBLISHER) private readonly events: AppointmentEventPublisher,
  ) {}

  async execute(actor: Actor, appointmentId: string, rawReason: string): Promise<CancellationResult> {
    const userProfileId = requireDoctor(actor);
    const reason = rawReason?.trim() ?? '';
    if (reason.length < MIN_DOCTOR_REASON || reason.length > MAX_REASON) {
      throw new InvalidAppointmentInputError(`el motivo debe tener de ${MIN_DOCTOR_REASON} a ${MAX_REASON} caracteres`);
    }
    return this.uow.runInTransaction(async () => {
      const doctor = await this.appointments.lockDoctorByUserProfileId(userProfileId);
      const existing = await this.appointments.findById(appointmentId);
      if (!doctor || !existing || existing.doctorId !== doctor.doctorProfileId) throw new AppointmentNotFoundError();
      const a = await this.appointments.lockById(appointmentId);
      if (!a) throw new AppointmentNotFoundError();
      if (a.status !== 'confirmed') throw new InvalidAppointmentStateError(a.status);
      assertTransition(a.status, 'canceled');
      const doctorCanOperate = await this.eligibility.doctorCanOperate(doctor.doctorProfileId);
      const now = this.clock.now();
      await this.appointments.changeStatus(a.id, {
        status: 'canceled', actorType: 'doctor', actorUserProfileId: userProfileId, reason, cancellation: { reason, at: now },
      });
      await this.audit.record(AppointmentAuditEvents.canceled(AuditActor.fromActor(actor), a.id, {
        actorType: 'doctor', refundOutcome: DOCTOR_CANCELLATION_OUTCOME, hoursBefore: round(hoursUntil(a.scheduledAt, now)), doctorCanOperate,
      }));
      this.events.publish({
        type: 'AppointmentCanceled', appointmentId: a.id, patientProfileId: a.patientId, doctorProfileId: a.doctorId,
        occurredAt: now.toISOString(), canceledBy: 'doctor', reason, refundOutcome: DOCTOR_CANCELLATION_OUTCOME,
      });
      return { id: a.id, status: 'canceled', refundOutcome: DOCTOR_CANCELLATION_OUTCOME };
    });
  }
}
