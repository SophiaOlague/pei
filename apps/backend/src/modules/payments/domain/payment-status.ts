// Estados internos de PEI (PAY-11; payment_status_enum de 0017). El estado original del proveedor se conserva aparte
// (payment.provider_status). Ningún estado del proveedor se usa como estado interno.
export const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'canceled',
  'refunded',
  'partially_refunded',
  'charged_back',
  'in_dispute',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// AP-27a: conjunto capturado. Pertenecer a él no hace al pago elegible para liquidación ni permite confirmar una cita.
export const CAPTURED_STATUSES: readonly PaymentStatus[] = ['succeeded', 'partially_refunded', 'refunded', 'in_dispute', 'charged_back'];
export const TERMINAL_STATUSES: readonly PaymentStatus[] = ['failed', 'canceled', 'refunded', 'charged_back'];

export const isCaptured = (s: PaymentStatus) => CAPTURED_STATUSES.includes(s);
