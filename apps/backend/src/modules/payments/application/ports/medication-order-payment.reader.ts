import type { Money } from '../../domain/money';

// Checkout de medicamentos (PAY-20): lectura del pedido que se va a cobrar. Solo lectura y solo los datos que Payments
// necesita. Payments NO crea, modifica ni despacha pedidos: solo cobra un pedido que ya existe (medication_order).
export const MEDICATION_ORDER_PAYMENT_READER = Symbol('MEDICATION_ORDER_PAYMENT_READER');

export interface MedicationOrderForPayment {
  medicationOrderId: string;
  patientId: string;
  // Estado del pedido tal cual (order_status_enum). Payments solo distingue los que admiten cobro.
  status: string;
  // Total registrado en el pedido (medication_order.total): es el importe que se cobra.
  total: Money;
}

export interface MedicationOrderPaymentReader {
  // Lanza InvalidAmountError si el total o la moneda registrados no son un importe válido en MXN.
  findForPayment(medicationOrderId: string): Promise<MedicationOrderForPayment | null>;
}
