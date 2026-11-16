import { DomainError } from '../../../common/domain/domain-error';
import type { PaymentStatus } from '../domain/payment-status';

// F5: errores de reembolsos. Mensajes sin datos personales ni detalles del proveedor.

export class RefundNotFoundError extends DomainError {
  readonly kind = 'not_found' as const;
  constructor() {
    super('El reembolso no existe');
  }
}

// refund_guard: solo un pago capturado en succeeded o partially_refunded admite reembolsos.
export class PaymentNotRefundableError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor(readonly paymentStatus: PaymentStatus | 'without_provider_reference') {
    super('El pago no admite reembolsos en su estado actual');
  }

  override get details() {
    return { paymentStatus: this.paymentStatus };
  }
}

// refund_within_payment: el acumulado de reembolsos activos no supera el pago.
export class RefundExceedsAvailableError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor(readonly available: string) {
    super('El reembolso supera el importe disponible del pago');
  }

  override get details() {
    return { available: this.available };
  }
}

export class InvalidRefundRequestError extends DomainError {
  readonly kind = 'validation' as const;
  constructor(reason: string) {
    super(`Solicitud de reembolso inválida: ${reason}`);
  }
}

// PAY-17: aprobar o rechazar solo un reembolso registrado que espera aprobación.
export class RefundApprovalError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor(readonly reason: 'not_partial' | 'not_awaiting_approval' | 'invalid_approver') {
    super('El reembolso no admite esta aprobación');
  }

  override get details() {
    return { reason: this.reason };
  }
}

// No se pudo registrar el reembolso automático de un pago capturado sin cita confirmable (se reintenta).
export class UnconfirmableRefundRequestError extends Error {
  constructor() {
    super('No se pudo registrar el reembolso del pago no confirmable');
    this.name = 'UnconfirmableRefundRequestError';
  }
}
