import { DomainError } from '../../../../common/domain/domain-error';
import type { AppointmentConfirmationService } from '../../../appointments/application/integration/appointment-integration.services';
import type { AppointmentPaymentReader } from '../ports/appointment-payment.reader';
import type { PaymentRepository } from '../ports/payments.repositories';
import { PaymentNotFoundError } from '../payments-use-case.errors';
import { AppointmentPatientMismatchError, confirmCapturedPayment, isAppointmentConfirmed, type ConfirmationOutcome, type UnconfirmableRefunds } from './payment-appointment-identity';
import type { PaymentsUseCases, PaymentView } from './payments.use-cases';

// F3.2: sincroniza un pago de consulta con Mercado Pago y, si quedó capturado, reintenta la confirmación con M08.
// - Nunca cobra: solo usa la consulta del proveedor (getPayment con refresh), que persiste el estado real con las
//   transiciones de payment_guard.
// - Recupera los pagos que pasaron de processing a succeeded y los succeeded cuya confirmación falló (confirmPaid es
//   idempotente: already_confirmed también es satisfactorio).
// - authorized (processing) no se considera capturado: no se confirma.
// - CC-4: si quien sincroniza es un paciente, debe ser el del pago. La identidad del pago con la cita (cita, paciente y
//   médico) la valida el paso compartido confirmCapturedPayment, igual que en el pago y en el webhook.

export interface SyncAppointmentPaymentInput {
  paymentId: string;
  // Paciente autenticado, cuando la sincronización la pide él (CC-4). Un proceso del sistema no lo indica.
  requestingPatientId?: string;
}

export interface SyncAppointmentPaymentResult {
  payment: PaymentView;
  confirmation: ConfirmationOutcome;
  appointmentConfirmed: boolean;
}

export class NotAnAppointmentPaymentError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('El pago no corresponde a una consulta');
  }
}

export interface SyncAppointmentPaymentDeps {
  payments: PaymentsUseCases;
  paymentRecords: PaymentRepository;
  appointments: AppointmentPaymentReader;
  confirmation: Pick<AppointmentConfirmationService, 'confirmPaid'>;
  // F5: reembolso idempotente del pago capturado cuya cita no se puede confirmar (paso compartido).
  refunds?: UnconfirmableRefunds;
}

export class SyncAppointmentPaymentUseCase {
  constructor(private readonly deps: SyncAppointmentPaymentDeps) {}

  async execute(input: SyncAppointmentPaymentInput): Promise<SyncAppointmentPaymentResult> {
    const record = await this.deps.paymentRecords.findById(input.paymentId);
    if (!record) throw new PaymentNotFoundError();
    if (record.type !== 'consultation' || !record.appointmentId) throw new NotAnAppointmentPaymentError();
    // CC-4 antes de consultar al proveedor: un paciente solo sincroniza sus propios pagos.
    if (input.requestingPatientId !== undefined && input.requestingPatientId !== record.patientId) throw new AppointmentPatientMismatchError();

    const payment = await this.deps.payments.getPayment(record.id, { refresh: true });
    // Identidad: campos inmutables del registro (payment_guard); estado: el recién verificado con el proveedor.
    const confirmation = await confirmCapturedPayment(this.deps, { ...record, status: payment.status });
    return { payment, confirmation, appointmentConfirmed: isAppointmentConfirmed(confirmation) };
  }
}
