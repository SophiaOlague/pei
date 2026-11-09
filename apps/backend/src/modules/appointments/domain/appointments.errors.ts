import { DomainError } from '../../../common/domain/domain-error';

// M08 Citas médicas: errores de dominio. La presentación traduce cada kind a HTTP (DomainExceptionFilter).

export class AppointmentNotFoundError extends DomainError {
  readonly kind = 'not_found' as const;
  constructor() {
    super('La cita no existe');
  }
}

export class PatientProfileRequiredError extends DomainError {
  readonly kind = 'forbidden' as const;
  constructor() {
    super('Solo un paciente con perfil puede realizar esta operación');
  }
}

export class DoctorProfileRequiredError extends DomainError {
  readonly kind = 'forbidden' as const;
  constructor() {
    super('Solo un médico con perfil puede realizar esta operación');
  }
}

export class AdminRequiredError extends DomainError {
  readonly kind = 'forbidden' as const;
  constructor() {
    super('Solo un administrador puede realizar esta operación');
  }
}

export class BookingDisabledError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('Las reservas no están disponibles en este momento');
  }
}

export class BookingConfigurationMissingError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor(readonly missing: 'price' | 'policy') {
    super('Las reservas no están disponibles: falta la configuración vigente');
  }
  override get details() {
    return { missing: this.missing };
  }
}

export class SlotUnavailableError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor() {
    super('El horario ya no está disponible');
  }
}

export class InvalidSlotError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('El horario no corresponde a un horario disponible del médico');
  }
}

export class PatientScheduleConflictError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor() {
    super('Ya tienes una cita que se cruza con ese horario');
  }
}

// AP-26: sin las dos aceptaciones legales vigentes (privacidad y términos) no se crea la reserva.
export class LegalAcceptancesRequiredError extends DomainError {
  readonly kind = 'forbidden' as const;
  constructor() {
    super('Para reservar debes tener aceptados el aviso de privacidad y los términos vigentes');
  }
}

export class ActiveHoldExistsError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor() {
    super('Ya tienes un horario retenido; libéralo o espera a que venza');
  }
}

export class InvalidAppointmentStateError extends DomainError {
  readonly kind = 'conflict' as const;
  constructor(readonly status: string) {
    super('La cita no admite esta operación en su estado actual');
  }
  override get details() {
    return { status: this.status };
  }
}

export class InvalidAppointmentInputError extends DomainError {
  readonly kind = 'validation' as const;
  constructor(reason: string) {
    super(`Datos de la cita inválidos: ${reason}`);
  }
}

export class InvalidConsultationPriceError extends DomainError {
  readonly kind = 'validation' as const;
  constructor(reason: string) {
    super(`Precio de consulta inválido: ${reason}`);
  }
}

export class UnchangedConsultationPriceError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('El precio es igual al vigente; no se crea una versión nueva');
  }
}

export class ConsultationPriceNotConfiguredError extends DomainError {
  readonly kind = 'not_found' as const;
  constructor() {
    super('No hay un precio de consulta vigente');
  }
}

export class InvalidCancellationPolicyError extends DomainError {
  readonly kind = 'validation' as const;
  constructor(reason: string) {
    super(`Política de citas inválida: ${reason}`);
  }
}

export class UnchangedCancellationPolicyError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('Los parámetros son iguales a los vigentes; no se crea una versión nueva');
  }
}

export class CancellationPolicyNotConfiguredError extends DomainError {
  readonly kind = 'not_found' as const;
  constructor() {
    super('No hay una política de citas vigente');
  }
}
