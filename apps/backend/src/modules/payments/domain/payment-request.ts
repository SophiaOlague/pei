import { consultationSplit, estimateProcessorFee, medicationSplit, type PaymentSplit, type PaymentType, type PeiFeeSnapshot, type ProcessorFeeSnapshot } from './payment-amounts';
import type { Money } from './money';
import { InvalidPaymentRequestError } from './payments.errors';

// Solicitud de pago (F2, primera entrega). Reúne el snapshot financiero que se guardará en `payment` (0017) y los datos
// que el proveedor necesita para crear el cobro. No contiene PAN ni CVV (PAY-12): la tarjeta llega tokenizada desde
// Card Payment Brick. No contiene datos clínicos: la descripción es genérica (PAY-20).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const GENERIC_DESCRIPTIONS: Readonly<Record<PaymentType, string>> = Object.freeze({
  consultation: 'Consulta PEI',
  medication: 'Pedido PEI',
});

export interface CardPaymentData {
  // Referencia de la tarjeta emitida por el proveedor en el cliente; nunca el número de la tarjeta. Con Stripe es el id
  // de un PaymentMethod (pm_…) creado por Stripe.js/Elements; con Mercado Pago, el token de Card Payment Brick.
  token: string;
  // Medio de pago: con Stripe siempre 'card'; con Mercado Pago, el de Card Payment Brick (visa, master…).
  paymentMethodId: string;
  issuerId?: string;
  installments: number;
  // Solo lo usa el adaptador de Mercado Pago. A Stripe no se le envía.
  payerEmail?: string;
}

export interface PaymentRequestInput {
  // Id interno del pago (payment.id). También es external_reference y la clave de idempotencia del proveedor.
  paymentId: string;
  type: PaymentType;
  gross: Money;
  peiFee?: PeiFeeSnapshot;
  processorFee: ProcessorFeeSnapshot;
  card: CardPaymentData;
}

export interface PaymentRequest {
  readonly paymentId: string;
  readonly idempotencyKey: string;
  readonly type: PaymentType;
  readonly split: PaymentSplit;
  readonly processorFeeScheduleId: string;
  readonly providerFeeEstimated: Money;
  readonly description: string;
  readonly card: Readonly<CardPaymentData>;
}

export function buildPaymentRequest(input: PaymentRequestInput): PaymentRequest {
  if (!UUID.test(input.paymentId)) throw new InvalidPaymentRequestError('paymentId debe ser un UUID');
  const card = input.card;
  if (!card || typeof card.token !== 'string' || !card.token.trim()) throw new InvalidPaymentRequestError('falta el token de la tarjeta');
  // El token del Brick nunca es un número de tarjeta: se rechaza cualquier valor con forma de PAN.
  if (/^\d{12,19}$/.test(card.token.replace(/[\s-]/g, ''))) throw new InvalidPaymentRequestError('el token no puede ser un número de tarjeta');
  if (!card.paymentMethodId?.trim()) throw new InvalidPaymentRequestError('falta el medio de pago');
  if (!Number.isInteger(card.installments) || card.installments < 1) throw new InvalidPaymentRequestError('mensualidades inválidas');
  // El correo es opcional (Stripe no lo necesita); si viene, debe ser válido.
  if (card.payerEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(card.payerEmail ?? '')) throw new InvalidPaymentRequestError('correo del pagador inválido');

  let split: PaymentSplit;
  if (input.type === 'consultation') {
    if (!input.peiFee) throw new InvalidPaymentRequestError('una consulta requiere el snapshot de la comisión fija de PEI');
    split = consultationSplit(input.gross, input.peiFee);
  } else if (input.type === 'medication') {
    if (input.peiFee) throw new InvalidPaymentRequestError('un pago de medicamento no lleva comisión fija de PEI');
    split = medicationSplit(input.gross);
  } else {
    throw new InvalidPaymentRequestError('tipo de pago desconocido');
  }

  return Object.freeze({
    paymentId: input.paymentId,
    idempotencyKey: input.paymentId,
    type: input.type,
    split,
    processorFeeScheduleId: input.processorFee.scheduleId,
    providerFeeEstimated: estimateProcessorFee(input.gross, input.processorFee),
    description: GENERIC_DESCRIPTIONS[input.type],
    card: Object.freeze({ ...card }),
  });
}
