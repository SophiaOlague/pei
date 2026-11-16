import { DomainError } from '../../../../common/domain/domain-error';
import type { AppointmentConfirmationService, ConfirmationResult } from '../../../appointments/application/integration/appointment-integration.services';
import { toDecimalString } from '../../domain/money';
import type { AppointmentForPayment, AppointmentPaymentReader } from '../ports/appointment-payment.reader';
import type { PaymentRecord } from '../ports/payments.repositories';
import { UnconfirmableRefundRequestError } from '../refunds.errors';

// Reglas compartidas para confirmar una cita a partir de un pago (CC-4, AP-27a). Las usan EXACTAMENTE igual:
// - PayAppointmentUseCase (pago con el token del Brick),
// - SyncAppointmentPaymentUseCase (sincronización manual del paciente),
// - ProcessProviderWebhookEventUseCase (webhook).
// Ninguno llama a confirmPaid por otro camino.

export type ConfirmationOutcome =
  | ConfirmationResult
  // El pago no está capturado: no se pidió confirmación.
  | { result: 'not_requested' }
  // confirmPaid falló o no respondió: el pago sigue succeeded y la cita sin confirmar; se puede reintentar.
  | { result: 'confirmation_failed' };

export class AppointmentNotFoundForPaymentError extends DomainError {
  readonly kind = 'not_found' as const;
  constructor() {
    super('La cita no existe');
  }
}

// CC-4: quien paga (o el pago) no corresponde a la cita. Mensaje genérico: no revela de quién es la cita.
export class AppointmentPatientMismatchError extends DomainError {
  readonly kind = 'forbidden' as const;
  constructor() {
    super('No puede pagar esta cita');
  }
}

// El pago no es de esta cita: otra cita, otro paciente u otro médico. Hereda la respuesta genérica (403) de
// AppointmentPatientMismatchError, así que el contrato HTTP de la sincronización no cambia; `party` es solo interno.
export type PaymentAppointmentParty = 'appointment' | 'patient' | 'doctor';

export class PaymentAppointmentMismatchError extends AppointmentPatientMismatchError {
  constructor(readonly party: PaymentAppointmentParty) {
    super();
  }
}

// Identidad mínima del pago (campos inmutables por payment_guard).
export type PaymentIdentity = Pick<PaymentRecord, 'id' | 'type' | 'appointmentId' | 'patientId' | 'doctorId'>;

// El pago pertenece a la cita: es de consulta, de esa cita, del mismo paciente y del mismo médico (el neto del pago es
// de ese médico). Una consulta siempre tiene médico (payment_consultation_split_chk): un doctorId nulo no coincide.
export function assertPaymentMatchesAppointment(payment: PaymentIdentity, appointment: AppointmentForPayment): void {
  if (payment.type !== 'consultation' || payment.appointmentId !== appointment.appointmentId) throw new PaymentAppointmentMismatchError('appointment');
  if (payment.patientId !== appointment.patientId) throw new PaymentAppointmentMismatchError('patient');
  if (payment.doctorId !== appointment.doctorId) throw new PaymentAppointmentMismatchError('doctor');
}

export const SATISFIED_CONFIRMATIONS: ReadonlySet<ConfirmationOutcome['result']> = new Set(['confirmed', 'already_confirmed']);
export const isAppointmentConfirmed = (o: ConfirmationOutcome): boolean => SATISFIED_CONFIRMATIONS.has(o.result);

// F5 (CC-4, AP-8, C-29): un pago capturado cuya cita NUNCA pudo confirmarse se reembolsa por completo.
// - expired: la retención venció antes de confirmar (una cita expired nunca estuvo confirmada).
// - amount_mismatch: el importe del pago no es el de la cita.
// - invalid_state NO reembolsa: la cita ya pasó por confirmed con este pago (AP-27a: un solo pago activo por cita) y
//   ahora está rescheduled, canceled, completed o no_show. Un webhook tardío o repetido no debe devolver el dinero; las
//   cancelaciones se reembolsan por AppointmentCanceled según la política de M08.
export const requiresPaymentErrorRefund = (o: ConfirmationOutcome): boolean =>
  o.result === 'not_confirmable' && (o.reason === 'expired' || o.reason === 'amount_mismatch');

export interface UnconfirmableRefunds {
  requestForUnconfirmablePayment(paymentId: string): Promise<unknown>;
}

export interface ConfirmCapturedPaymentDeps {
  appointments: AppointmentPaymentReader;
  confirmation: Pick<AppointmentConfirmationService, 'confirmPaid'>;
  // Si se indica, un pago no confirmable (requiresPaymentErrorRefund) pide su reembolso idempotente.
  refunds?: UnconfirmableRefunds;
}

// Paso único de confirmación. Solo un pago `succeeded` (verificado con la API por quien llama) pide confirmPaid; antes se
// comprueba la identidad con la cita. El importe es el bruto del pago, en el formato decimal que M08 compara.
// `appointment` permite reutilizar una lectura ya hecha de la cita. Un fallo de confirmPaid se devuelve como
// confirmation_failed (recuperable); la cita inexistente y la identidad distinta se lanzan.
export async function confirmCapturedPayment(
  deps: ConfirmCapturedPaymentDeps,
  payment: PaymentIdentity & Pick<PaymentRecord, 'status' | 'gross'>,
  appointment?: AppointmentForPayment,
): Promise<ConfirmationOutcome> {
  if (payment.status !== 'succeeded') return { result: 'not_requested' };
  if (!payment.appointmentId) throw new PaymentAppointmentMismatchError('appointment');
  const a = appointment ?? (await deps.appointments.findForPayment(payment.appointmentId));
  if (!a) throw new AppointmentNotFoundForPaymentError();
  assertPaymentMatchesAppointment(payment, a);
  let outcome: ConfirmationOutcome;
  try {
    outcome = await deps.confirmation.confirmPaid(a.appointmentId, payment.id, toDecimalString(payment.gross));
  } catch {
    return { result: 'confirmation_failed' };
  }
  if (deps.refunds && requiresPaymentErrorRefund(outcome)) {
    // Idempotente (refund.payment_error por pago y refund_payment_error_uq): repetirlo nunca crea otro reembolso. Si falla
    // el registro, se lanza para que quien llama reintente (webhook) o el paciente vuelva a sincronizar.
    try {
      await deps.refunds.requestForUnconfirmablePayment(payment.id);
    } catch {
      throw new UnconfirmableRefundRequestError();
    }
  }
  return outcome;
}
