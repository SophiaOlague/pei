import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { appointment } from '../../../../db/schema';
import { fromDecimalString } from '../../domain/money';
import type { AppointmentForPayment, AppointmentPaymentReader } from '../../application/ports/appointment-payment.reader';

// Lector de solo lectura sobre `appointment` (mismo patrón que DrizzleBookableDoctorsReader en M08): selecciona solo las
// seis columnas que Payments necesita. No escribe ni replica reglas de M08.
export const APPOINTMENT_PAYMENT_COLUMNS = {
  id: appointment.id,
  patientId: appointment.patientId,
  doctorId: appointment.doctorId,
  status: appointment.status,
  price: appointment.price,
  paymentHoldExpiresAt: appointment.paymentHoldExpiresAt,
};

export function toAppointmentForPayment(row: { id: string; patientId: string; doctorId: string; status: string; price: string; paymentHoldExpiresAt: Date | null }): AppointmentForPayment {
  return {
    appointmentId: row.id,
    patientId: row.patientId,
    doctorId: row.doctorId,
    status: row.status,
    price: fromDecimalString(row.price),
    paymentHoldExpiresAt: row.paymentHoldExpiresAt,
  };
}

@Injectable()
export class DrizzleAppointmentPaymentReader implements AppointmentPaymentReader {
  async findForPayment(appointmentId: string): Promise<AppointmentForPayment | null> {
    const [row] = await getDbContext().select(APPOINTMENT_PAYMENT_COLUMNS).from(appointment).where(eq(appointment.id, appointmentId)).limit(1);
    return row ? toAppointmentForPayment(row) : null;
  }
}
