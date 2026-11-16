import type { Money } from '../../domain/money';
import type { PaymentRequest } from '../../domain/payment-request';
import type { PaymentStatus } from '../../domain/payment-status';

// Puerto del proveedor de pagos. El dominio y los casos de uso solo conocen este contrato. Lo implementan el adaptador
// de Stripe (infrastructure/stripe; proveedor ACTIVO de ambos checkouts) y el de Mercado Pago (infrastructure/
// mercadopago; conservado, sin uso en los checkouts). Cada adaptador es el único que conoce la API de su proveedor.

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

// payment_provider_enum (0017 + 0018).
export type ProviderName = 'mercado_pago' | 'stripe';

// Paso que el CLIENTE debe completar para que el cobro avance (autenticación 3-D Secure). El secreto es de un solo pago,
// solo se entrega al paciente dueño del pago y nunca se guarda ni se registra.
export interface ProviderNextAction {
  type: 'stripe_sdk';
  clientSecret: string;
}

// Estado de un pago en el proveedor, ya normalizado. Los valores del proveedor se conservan aparte (provider*).
export interface ProviderPaymentSnapshot {
  provider: ProviderName;
  providerPaymentId: string;
  // Estado original del proveedor (payment.provider_status), p. ej. "approved/accredited".
  providerStatus: string;
  status: PaymentStatus;
  externalReference: string;
  amount: Money;
  refunded: Money;
  // Comisión real del procesador, cuando el proveedor ya la informa (si no, null). Costo de PEI (PAY-07).
  providerFeeActual: Money | null;
  netReceived: Money | null;
  moneyReleaseDate: Date | null;
  // H-2/H-3: true solo si providerFeeActual y netReceived salen de un balance_transaction verificado (tipo del cobro,
  // moneda, importe y neto = importe − comisión). Ausente o false: no se concilia. Nunca procede de una tarifa estimada.
  providerFeeVerified?: boolean;
  // Solo cuando el pago espera una acción del cliente (queda en processing). Ausente en los demás casos.
  nextAction?: ProviderNextAction | null;
}

export interface PaymentProviderPort {
  readonly name: ProviderName;
  // Crea el cobro. Es idempotente por request.idempotencyKey: repetir la misma solicitud no cobra dos veces.
  createPayment(request: PaymentRequest): Promise<ProviderPaymentSnapshot>;
  // Consulta el estado real (la verdad del pago; el webhook nunca basta, PAY-15).
  getPayment(providerPaymentId: string): Promise<ProviderPaymentSnapshot>;
}

export type PaymentProviderErrorKind =
  | 'rejected_request' // el proveedor rechazó la solicitud (4xx, datos inválidos)
  | 'unauthorized' // credenciales inválidas o sin permisos
  | 'not_found'
  | 'unavailable' // 5xx o red
  | 'timeout'
  | 'unexpected_response'; // respuesta que no cumple el contrato esperado

// Error del proveedor. Nunca incluye credenciales, token de tarjeta ni el cuerpo completo de la respuesta.
export class PaymentProviderError extends Error {
  constructor(
    readonly kind: PaymentProviderErrorKind,
    message: string,
    readonly httpStatus?: number,
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }

  // Indica si reintentar con la MISMA clave de idempotencia es razonable.
  get retryable(): boolean {
    return this.kind === 'unavailable' || this.kind === 'timeout';
  }
}
