import { DomainError } from '../../../common/domain/domain-error';

// Errores de los casos de uso de pagos (F2, segunda entrega). Mensajes sin datos personales ni detalles internos.

export class PaymentNotFoundError extends DomainError {
  readonly kind = 'not_found' as const;
  constructor() {
    super('El pago no existe');
  }
}

// La misma clave de idempotencia con una solicitud distinta.
export class IdempotencyKeyConflictError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor() {
    super('La clave de idempotencia ya se usó con una solicitud distinta');
  }
}

// Otra solicitud con la misma clave está en curso: reintente más tarde con la misma clave.
export class PaymentInProgressError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor() {
    super('El pago se está procesando; reintente con la misma clave de idempotencia');
  }
}

// AP-27a / PAY-14: ya hay un pago activo (pendiente, en proceso o capturado) para la cita o para el pedido.
export class ActivePaymentExistsError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor(readonly subject: 'appointment' | 'order' = 'appointment') {
    super(subject === 'order' ? 'El pedido ya tiene un pago activo' : 'La cita ya tiene un pago activo');
  }
}

// PAY-06: sin comisión fija vigente no se cobra (no hay importe predeterminado).
export class NoEffectivePeiFeeError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('No hay una comisión fija de PEI vigente');
  }
}

// PAY-08: sin tarifa vigente del procesador no hay estimación ni snapshot.
export class NoEffectiveProcessorFeeError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('No hay una tarifa vigente del procesador de pagos');
  }
}

// PAY-20: el checkout de medicamentos y PrEP no forma parte de esta entrega.
export class PaymentTypeNotEnabledError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('Este tipo de pago no está habilitado');
  }
}

// La respuesta del proveedor contradice lo registrado (otra referencia, otro importe o una transición no permitida).
export class ProviderStateConflictError extends DomainError {
  readonly kind = 'conflict' as const;
  // reason: texto técnico corto, sin datos personales (lo registra el procesamiento de webhooks en last_error).
  constructor(readonly reason: string) {
    super(`El estado del proveedor no es coherente con el pago registrado: ${reason}`);
  }
}
