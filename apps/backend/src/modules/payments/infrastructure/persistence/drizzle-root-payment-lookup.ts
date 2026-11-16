import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { payment } from '../../../../db/schema';
import type { PaymentReference, RootPaymentLookup } from '../../../appointments/application/integration/appointment-chain.services';
import { CAPTURED_STATUSES } from '../../domain/payment-status';

// F3.2: implementación de RootPaymentLookup (contrato de M08, A.20) con la regla AP-27a:
// - busca SOLO por el id de la cita raíz recibido (nunca por una cita derivada de un reagendamiento: la raíz la resuelve
//   M08 con rootOf, vía RootResolvingPaymentLedger);
// - type = 'consultation' y estado en el conjunto capturado (succeeded, partially_refunded, refunded, in_dispute,
//   charged_back): la referencia al pago original se conserva aunque su estado cambie;
// - ninguna fila → null; una → { paymentId, rootAppointmentId }; varias → error de integridad, sin elegir una.
// Pertenecer al conjunto capturado no hace al pago elegible para liquidación ni permite confirmar una cita.

export class RootPaymentIntegrityError extends Error {
  constructor(readonly rootAppointmentId: string, readonly count: number) {
    super(`Integridad de pagos: la cita raíz tiene ${count === 2 ? 'al menos 2' : count} pagos capturados (se esperaba a lo sumo uno)`);
    this.name = 'RootPaymentIntegrityError';
  }
}

export function pickRootPayment(rows: readonly { id: string }[], rootAppointmentId: string): PaymentReference | null {
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new RootPaymentIntegrityError(rootAppointmentId, rows.length);
  return { paymentId: rows[0].id, rootAppointmentId };
}

@Injectable()
export class DrizzleRootPaymentLookup implements RootPaymentLookup {
  async paymentForRootAppointment(rootAppointmentId: string): Promise<PaymentReference | null> {
    // limit(2): basta para distinguir «una» de «varias».
    const rows = await getDbContext()
      .select({ id: payment.id })
      .from(payment)
      .where(and(eq(payment.appointmentId, rootAppointmentId), eq(payment.type, 'consultation'), inArray(payment.status, [...CAPTURED_STATUSES])))
      .limit(2);
    return pickRootPayment(rows, rootAppointmentId);
  }
}
