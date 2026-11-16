import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { medicationOrder } from '../../../../db/schema';
import { fromDecimalString } from '../../domain/money';
import type { MedicationOrderForPayment, MedicationOrderPaymentReader } from '../../application/ports/medication-order-payment.reader';

// Lector de solo lectura sobre `medication_order` (mismo patrón que DrizzleAppointmentPaymentReader): selecciona solo
// las columnas que Payments necesita. No escribe, no cambia el estado del pedido y no lee sus partidas ni la dirección.
export const MEDICATION_ORDER_PAYMENT_COLUMNS = {
  id: medicationOrder.id,
  patientId: medicationOrder.patientId,
  status: medicationOrder.status,
  total: medicationOrder.total,
  currency: medicationOrder.currency,
};

export function toMedicationOrderForPayment(row: { id: string; patientId: string; status: string; total: string; currency: string }): MedicationOrderForPayment {
  // fromDecimalString rechaza una moneda distinta de MXN y un total con más de dos decimales (nunca redondea).
  return { medicationOrderId: row.id, patientId: row.patientId, status: row.status, total: fromDecimalString(row.total, row.currency) };
}

@Injectable()
export class DrizzleMedicationOrderPaymentReader implements MedicationOrderPaymentReader {
  async findForPayment(medicationOrderId: string): Promise<MedicationOrderForPayment | null> {
    const [row] = await getDbContext().select(MEDICATION_ORDER_PAYMENT_COLUMNS).from(medicationOrder).where(eq(medicationOrder.id, medicationOrderId)).limit(1);
    return row ? toMedicationOrderForPayment(row) : null;
  }
}
