import { DomainError } from '../../../common/domain/domain-error';

// Payments (F2): errores de dominio. Los errores del proveedor son de infraestructura (PaymentProviderError, en el puerto).

export class InvalidAmountError extends DomainError {
  readonly kind = 'validation' as const;
  constructor(reason: string) {
    super(`Importe inválido: ${reason}`);
  }
}

// PAY-10: el neto inicial del médico no puede ser negativo (precio publicado menor que la comisión fija de PEI).
export class NegativeDoctorNetError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('La comisión fija de PEI supera el precio de la consulta: el neto del médico sería negativo');
  }
}

export class InvalidPaymentRequestError extends DomainError {
  readonly kind = 'validation' as const;
  constructor(reason: string) {
    super(`Solicitud de pago inválida: ${reason}`);
  }
}
