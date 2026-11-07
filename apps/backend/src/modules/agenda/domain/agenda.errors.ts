import { DomainError } from '../../../common/domain/domain-error';

// M07 Agenda médica: errores de dominio. La presentación traduce cada kind a HTTP (DomainExceptionFilter).

export class InvalidAppointmentDurationError extends DomainError {
  readonly kind = 'validation' as const;
  constructor() {
    super('La duración de la consulta debe estar entre 15 y 120 minutos, en múltiplos de 5');
  }
}

export class InvalidWeeklyScheduleError extends DomainError {
  readonly kind = 'validation' as const;
  constructor(reason: string) {
    super(`Horario semanal inválido: ${reason}`);
  }
}

export class InvalidTimeOffError extends DomainError {
  readonly kind = 'validation' as const;
  constructor(reason: string) {
    super(`Periodo no disponible inválido: ${reason}`);
  }
}

export class InvalidSlotRangeError extends DomainError {
  readonly kind = 'validation' as const;
  constructor(reason: string) {
    super(`Rango de consulta inválido: ${reason}`);
  }
}

export class TimeOffNotFoundError extends DomainError {
  readonly kind = 'not_found' as const;
  constructor() {
    super('El periodo no disponible no existe');
  }
}

// D-6: los periodos ya terminados se conservan como historial.
export class TimeOffAlreadyEndedError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('No se puede eliminar un periodo no disponible que ya terminó');
  }
}

export class AgendaDoctorRequiredError extends DomainError {
  readonly kind = 'forbidden' as const;
  constructor() {
    super('La agenda solo está disponible para médicos');
  }
}

export class AgendaDoctorNotFoundError extends DomainError {
  readonly kind = 'not_found' as const;
  constructor() {
    super('El perfil de médico no existe');
  }
}
