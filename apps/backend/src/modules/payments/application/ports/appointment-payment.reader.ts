import type { Money } from '../../domain/money';

// F3.1: lectura de la cita que se va a cobrar. Solo lectura y solo los datos que Payments necesita. La validación con
// autoridad (candado, retención, importe) la hace M08 en confirmPaid; esta lectura es una comprobación previa para no
// cobrar una cita que no se puede confirmar.
export const APPOINTMENT_PAYMENT_READER = Symbol('APPOINTMENT_PAYMENT_READER');

export interface AppointmentForPayment {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  // Estado de M08 tal cual (texto): Payments no interpreta otros estados que pending_payment.
  status: string;
  // Precio registrado en la cita (snapshot de M08, P-6), no la configuración vigente.
  price: Money;
  paymentHoldExpiresAt: Date | null;
}

export interface AppointmentPaymentReader {
  findForPayment(appointmentId: string): Promise<AppointmentForPayment | null>;
}
