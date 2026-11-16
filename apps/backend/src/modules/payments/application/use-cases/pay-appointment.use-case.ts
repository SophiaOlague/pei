import { DomainError } from '../../../../common/domain/domain-error';
import type { Clock } from '../../../../common/application/ports/clock';
import type { AppointmentConfirmationService } from '../../../appointments/application/integration/appointment-integration.services';
import type { AppointmentStatus } from '../../../appointments/domain/appointment-status';
import { isHoldActive } from '../../../appointments/domain/hold';
import type { CardPaymentData } from '../../domain/payment-request';
import type { AppointmentPaymentReader } from '../ports/appointment-payment.reader';
import type { IdempotencyKeyRepository, PaymentRepository } from '../ports/payments.repositories';
import { PaymentNotFoundError } from '../payments-use-case.errors';
import {
  AppointmentNotFoundForPaymentError,
  AppointmentPatientMismatchError,
  confirmCapturedPayment,
  isAppointmentConfirmed,
  type ConfirmationOutcome,
  type UnconfirmableRefunds,
} from './payment-appointment-identity';
import { PAYMENT_CREATE_SCOPE, type CreatePaymentResult, type PaymentsUseCases, type PaymentView } from './payments.use-cases';

// Reexportados para conservar las rutas de importación existentes (la definición vive en payment-appointment-identity).
export { AppointmentNotFoundForPaymentError, AppointmentPatientMismatchError, type ConfirmationOutcome };

// F3.1: cobrar una consulta y confirmarla con M08. Dependencia en una sola dirección: Payments → M08
// (AppointmentConfirmationService, exportado por AppointmentsModule). M08 no se modifica.
//
// Flujo: leer la cita → CC-4 (el paciente es el de la cita) → pending_payment con retención vigente → cobrar con el
// flujo de creación existente (importe = appointment.price) → si el pago queda succeeded, confirmPaid.
// - authorized/in_process quedan como processing: no se confirman (F3.2 sincronizará esos pagos).
// - Una tarjeta rechazada NO llama a markPaymentFailed (T-1): el paciente puede reintentar dentro de la retención.
// - Recuperación: con la MISMA clave de idempotencia, un pago ya succeeded no se vuelve a cobrar (el flujo de creación lo
//   devuelve sin llamar al proveedor) y se reintenta solo confirmPaid, que es idempotente.

export interface PayAppointmentInput {
  idempotencyKey: string;
  // Paciente autenticado que paga (CC-4).
  patientId: string;
  appointmentId: string;
  card: CardPaymentData;
}

export interface PayAppointmentResult {
  payment: PaymentView;
  confirmation: ConfirmationOutcome;
  // La cita quedó confirmada (confirmed o already_confirmed).
  appointmentConfirmed: boolean;
  recoverable: boolean;
  providerError?: CreatePaymentResult['providerError'];
  nextAction?: CreatePaymentResult['nextAction'];
}

export class AppointmentNotPayableError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor(readonly reason: 'invalid_state' | 'hold_expired') {
    super(reason === 'hold_expired' ? 'La retención de la cita venció' : 'La cita no admite pago en su estado actual');
  }

  override get details() {
    return { reason: this.reason };
  }
}

export interface PayAppointmentDeps {
  clock: Clock;
  appointments: AppointmentPaymentReader;
  payments: PaymentsUseCases;
  paymentRecords: PaymentRepository;
  keys: IdempotencyKeyRepository;
  confirmation: Pick<AppointmentConfirmationService, 'confirmPaid'>;
  // F5: reembolso idempotente del pago capturado cuya cita no se puede confirmar (paso compartido).
  refunds?: UnconfirmableRefunds;
}

export class PayAppointmentUseCase {
  constructor(private readonly deps: PayAppointmentDeps) {}

  async execute(input: PayAppointmentInput): Promise<PayAppointmentResult> {
    const a = await this.deps.appointments.findForPayment(input.appointmentId);
    if (!a) throw new AppointmentNotFoundForPaymentError();
    if (a.patientId !== input.patientId) throw new AppointmentPatientMismatchError();

    // Reintento de una solicitud cuyo pago ya está capturado: no se cobra de nuevo ni se exige la retención (la cita
    // puede haberse confirmado ya); solo se reintenta la confirmación.
    const retryingCaptured = await this.capturedPaymentFor(input, a.appointmentId);
    if (!retryingCaptured) {
      if (a.status !== 'pending_payment') throw new AppointmentNotPayableError('invalid_state');
      const hold = { status: a.status as AppointmentStatus, paymentHoldExpiresAt: a.paymentHoldExpiresAt };
      if (!isHoldActive(hold, this.deps.clock.now())) throw new AppointmentNotPayableError('hold_expired');
    }

    const created = await this.deps.payments.createConsultationPayment({
      idempotencyKey: input.idempotencyKey,
      patientId: a.patientId,
      doctorId: a.doctorId,
      appointmentId: a.appointmentId,
      gross: a.price,
      card: input.card,
    });

    if (created.payment.status !== 'succeeded') {
      return {
        payment: created.payment, confirmation: { result: 'not_requested' }, appointmentConfirmed: false, recoverable: created.recoverable, providerError: created.providerError,
        // 3-D Secure pendiente: el cliente lo completa y el pago se confirma por webhook o al sincronizar. Nunca aquí.
        ...(created.nextAction ? { nextAction: created.nextAction } : {}),
      };
    }

    // Paso de confirmación compartido con la sincronización y el webhook: se valida la identidad del pago PERSISTIDO con la
    // cita (cita, paciente y médico) antes de confirmPaid.
    const record = await this.deps.paymentRecords.findById(created.payment.paymentId);
    if (!record) throw new PaymentNotFoundError();
    const confirmation = await confirmCapturedPayment(this.deps, { ...record, status: created.payment.status }, a);
    const appointmentConfirmed = isAppointmentConfirmed(confirmation);
    return { payment: created.payment, confirmation, appointmentConfirmed, recoverable: confirmation.result === 'confirmation_failed' };
  }

  // ¿Esta misma clave ya tiene un pago succeeded de esta cita? (sin llamar al proveedor)
  private async capturedPaymentFor(input: PayAppointmentInput, appointmentId: string): Promise<boolean> {
    const key = await this.deps.keys.find(PAYMENT_CREATE_SCOPE, input.idempotencyKey);
    if (!key?.paymentId) return false;
    const p = await this.deps.paymentRecords.findById(key.paymentId);
    return !!p && p.appointmentId === appointmentId && p.status === 'succeeded';
  }
}

