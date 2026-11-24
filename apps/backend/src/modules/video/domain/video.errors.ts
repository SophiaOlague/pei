import { DomainError } from '../../../common/domain/domain-error';

// Videoconsulta: errores de dominio. La presentación traduce cada kind a HTTP (DomainExceptionFilter).

export class SessionNotOpenError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor(readonly opensAt: Date) {
    super('La sala de espera todavía no está abierta');
  }
  override get details() {
    return { opensAt: this.opensAt.toISOString() };
  }
}

export class SessionEndedError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor() {
    super('La consulta ya terminó');
  }
}

export class SessionNotActiveError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor() {
    super('La consulta no está en curso');
  }
}

export class PatientNotWaitingError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor() {
    super('El paciente no está en la sala de espera');
  }
}

export class DoctorNotInRoomError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor() {
    super('Entra a la sala de la cita antes de admitir al paciente');
  }
}

export class DoctorBusyError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor() {
    super('Tienes otra consulta en curso: finalízala antes de continuar');
  }
}

// El DomainExceptionFilter no tiene un kind para 503: se responde 422, como los proveedores sin configurar de pagos.
export class VideoProviderUnavailableError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('La videollamada no está disponible en este momento');
  }
}
