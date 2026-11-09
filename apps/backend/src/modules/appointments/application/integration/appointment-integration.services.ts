import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/application/ports/clock';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AppointmentNotFoundError, CancellationPolicyNotConfiguredError, InvalidAppointmentStateError } from '../../domain/appointments.errors';
import { assertTransition, NO_SHOW_STATUS, type AppointmentStatus, type NoShowKind } from '../../domain/appointment-status';
import { isHoldActive } from '../../domain/hold';
import { AppointmentAuditEvents } from '../appointments-audit-events';
import { APPOINTMENT_EVENT_PUBLISHER, type AppointmentEventPublisher } from '../appointment-events';
import { APPOINTMENT_REPOSITORY, CANCELLATION_POLICY_REPOSITORY, type AppointmentRepository, type CancellationPolicyRepository } from '../ports/appointments.ports';
import { SYSTEM_PROCESS, systemActor } from '../use-cases/actors';

// M08: contratos internos para módulos posteriores. NO tienen ruta HTTP (AP-16): ninguna petición de un cliente puede
// confirmar una cita; solo el módulo de pagos, tras un pago exitoso, llamará confirmPaid. Una prueba de arquitectura
// impide que un controller los use.

export type ConfirmationResult =
  | { result: 'confirmed' }
  | { result: 'already_confirmed' }
  | { result: 'not_confirmable'; reason: 'expired' | 'amount_mismatch' | 'invalid_state' };

// CC-4 (AP-8): una cita expired nunca se reactiva. Ante not_confirmable, pagos reembolsa de forma idempotente
// (C-29); M08 deja el registro para la conciliación (appointment.payment.not_confirmable).
@Injectable()
export class AppointmentConfirmationService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APPOINTMENT_EVENT_PUBLISHER) private readonly events: AppointmentEventPublisher,
  ) {}

  async confirmPaid(appointmentId: string, paymentId: string, amount: string): Promise<ConfirmationResult> {
    return this.uow.runInTransaction(async () => {
      const existing = await this.appointments.findById(appointmentId);
      if (!existing) throw new AppointmentNotFoundError();
      await this.appointments.lockDoctorById(existing.doctorId);
      const a = await this.appointments.lockById(appointmentId);
      if (!a) throw new AppointmentNotFoundError();
      const actor = systemActor(SYSTEM_PROCESS.payments);
      const reject = async (reason: 'expired' | 'amount_mismatch' | 'invalid_state'): Promise<ConfirmationResult> => {
        await this.audit.record(AppointmentAuditEvents.paymentNotConfirmable(actor, a.id, paymentId, reason));
        return { result: 'not_confirmable', reason };
      };
      // Webhook duplicado: no hace nada. La idempotencia por evento la garantiza pagos (stripe_webhook_event).
      if (a.status === 'confirmed') return { result: 'already_confirmed' };
      if (a.status === 'expired') return reject('expired');
      if (a.status !== 'pending_payment') return reject('invalid_state');
      const now = this.clock.now();
      if (!isHoldActive(a, now)) {
        await this.appointments.changeStatus(a.id, { status: 'expired', actorType: 'system', actorUserProfileId: null, reason: 'hold_timeout' });
        await this.audit.record(AppointmentAuditEvents.holdExpired(actor, a.id, 'timeout'));
        this.events.publish({
          type: 'AppointmentExpired', appointmentId: a.id, patientProfileId: a.patientId, doctorProfileId: a.doctorId,
          occurredAt: now.toISOString(), cause: 'timeout',
        });
        return reject('expired');
      }
      if (Number(amount) !== Number(a.price)) return reject('amount_mismatch');
      assertTransition(a.status, 'confirmed');
      await this.appointments.changeStatus(a.id, { status: 'confirmed', actorType: 'system', actorUserProfileId: null, reason: 'payment_succeeded' });
      await this.audit.record(AppointmentAuditEvents.confirmed(actor, a.id, paymentId));
      this.events.publish({
        type: 'AppointmentConfirmed', appointmentId: a.id, patientProfileId: a.patientId, doctorProfileId: a.doctorId,
        occurredAt: now.toISOString(), scheduledAt: a.scheduledAt.toISOString(), paymentId,
      });
      return { result: 'confirmed' };
    });
  }

  // Pago fallido: la retención vence en ese momento (RN-012).
  async markPaymentFailed(appointmentId: string): Promise<void> {
    await this.uow.runInTransaction(async () => {
      const existing = await this.appointments.findById(appointmentId);
      if (!existing) throw new AppointmentNotFoundError();
      await this.appointments.lockDoctorById(existing.doctorId);
      const a = await this.appointments.lockById(appointmentId);
      if (!a || a.status !== 'pending_payment') return;
      await this.appointments.changeStatus(a.id, { status: 'expired', actorType: 'system', actorUserProfileId: null, reason: 'payment_failed' });
      await this.audit.record(AppointmentAuditEvents.holdExpired(systemActor(SYSTEM_PROCESS.payments), a.id, 'payment_failed'));
      this.events.publish({
        type: 'AppointmentExpired', appointmentId: a.id, patientProfileId: a.patientId, doctorProfileId: a.doctorId,
        occurredAt: this.clock.now().toISOString(), cause: 'payment_failed',
      });
    });
  }
}

export interface SessionView {
  appointmentId: string;
  status: AppointmentStatus;
  patientProfileId: string;
  doctorProfileId: string;
  scheduledAt: string;
  // Ventanas de la versión de la política aplicada a la cita (A.9.5, AP-22). No incluye el fin del bloque de agenda
  // (AP-23: nunca es un límite para la videoconsulta).
  doctorWaitMinutes: number;
  patientToleranceMinutes: number;
  maxProtectedWaitMinutes: number;
  reconnectGraceMinutes: number;
}

// CC-9 (AP-15): videoconsulta consulta la cita y registra el resultado final; M08 conserva el estado y su historial.
@Injectable()
export class AppointmentSessionService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: AppointmentRepository,
    @Inject(CANCELLATION_POLICY_REPOSITORY) private readonly policies: CancellationPolicyRepository,
  ) {}

  async getForSession(appointmentId: string): Promise<SessionView> {
    const a = await this.appointments.findById(appointmentId);
    if (!a) throw new AppointmentNotFoundError();
    const policy = await this.policies.findById(a.cancellationPolicyId);
    if (!policy) throw new CancellationPolicyNotConfiguredError();
    return {
      appointmentId: a.id, status: a.status, patientProfileId: a.patientId, doctorProfileId: a.doctorId, scheduledAt: a.scheduledAt.toISOString(),
      doctorWaitMinutes: policy.doctorWaitMinutes, patientToleranceMinutes: policy.patientToleranceMinutes,
      maxProtectedWaitMinutes: policy.maxProtectedWaitMinutes, reconnectGraceMinutes: policy.reconnectGraceMinutes,
    };
  }

  async markCompleted(appointmentId: string): Promise<void> {
    await this.recordOutcome(appointmentId, 'completed');
  }

  async markNoShow(appointmentId: string, kind: NoShowKind): Promise<void> {
    await this.recordOutcome(appointmentId, NO_SHOW_STATUS[kind]);
  }

  // Idempotente ante el mismo resultado; 409 ante uno distinto o desde un estado que no es confirmed.
  private async recordOutcome(appointmentId: string, status: AppointmentStatus): Promise<void> {
    await this.uow.runInTransaction(async () => {
      const existing = await this.appointments.findById(appointmentId);
      if (!existing) throw new AppointmentNotFoundError();
      await this.appointments.lockDoctorById(existing.doctorId);
      const a = await this.appointments.lockById(appointmentId);
      if (!a) throw new AppointmentNotFoundError();
      if (a.status === status) return;
      if (a.status !== 'confirmed') throw new InvalidAppointmentStateError(a.status);
      assertTransition(a.status, status);
      await this.appointments.changeStatus(a.id, { status, actorType: 'system', actorUserProfileId: null, reason: null });
      await this.audit.record(AppointmentAuditEvents.outcomeRecorded(systemActor(SYSTEM_PROCESS.videoconsultation), a.id, status));
    });
  }
}
