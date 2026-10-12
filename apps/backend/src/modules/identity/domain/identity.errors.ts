import { DomainError } from '../../../common/domain/domain-error';

// Errores de Identity (M02). Sus mensajes se muestran al cliente: nunca incluyen CURP, nombres,
// correos, claves de objetos ni URLs.

export class InvalidCurpError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('La CURP no tiene un formato válido');
  }
}

// 409 genérico: no confirma que la CURP pertenezca a otra cuenta más allá de lo indispensable.
export class DuplicateCurpError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('No fue posible completar el registro con los datos proporcionados');
  }
}

export class InvalidBirthDateError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('La fecha de nacimiento debe ser una fecha válida en el pasado');
  }
}

export class ProfileAlreadyExistsError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('La cuenta ya tiene un perfil');
  }
}

export class PatientProfileRequiredError extends DomainError {
  readonly kind = 'forbidden';
  constructor() {
    super('La operación requiere un perfil de paciente');
  }
}

export class PatientProfileNotFoundError extends DomainError {
  readonly kind = 'not_found';
  constructor() {
    super('No se encontró el perfil del paciente');
  }
}

export class NoEditableFieldsError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('Debes enviar al menos un campo editable');
  }
}

export class LegalDocumentsNotPublishedError extends DomainError {
  readonly kind = 'conflict'; // 409: el sistema no está listo, no es culpa del cliente
  constructor() {
    super('No hay aviso de privacidad o términos y condiciones publicados');
  }
}

// El documento está vigente, pero pertenece al régimen de otro rol (M03 D-32).
export class LegalDocumentNotRequiredForRoleError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('El documento legal no corresponde a tu tipo de cuenta');
  }
}

// La petición de aceptación repite un documento (también lo rechaza el DTO con @ArrayUnique).
export class DuplicateLegalDocumentIdsError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('Cada documento legal debe aparecer una sola vez');
  }
}

// CLI legal:publish: el conjunto a publicar no es un régimen completo o incluye tipos de legado (plan v2 §6.4).
export class InvalidLegalPublicationError extends DomainError {
  readonly kind = 'validation';
  constructor(message: string) {
    super(message);
  }
}

export class LegalDocumentNotCurrentError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('Solo se puede aceptar la versión vigente de cada documento legal');
  }
}


export class IdentityVerificationPendingError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('Ya tienes una verificación de identidad en revisión');
  }
}

export class IdentityAlreadyApprovedError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('Tu identidad ya fue verificada');
  }
}

export class IdentityVerificationNotFoundError extends DomainError {
  readonly kind = 'not_found';
  constructor() {
    super('No se encontró la verificación de identidad');
  }
}

export class IdentityVerificationAlreadyReviewedError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('La verificación de identidad ya fue revisada');
  }
}

// DP-15: los documentos solo se pueden ver mientras el envío está pendiente; después se eliminan.
export class IdentityDocumentUnavailableError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('Los documentos de esta verificación ya no están disponibles');
  }
}

export class InvalidRejectionReasonError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('El motivo del rechazo debe tener entre 10 y 500 caracteres');
  }
}


export class AdminRequiredError extends DomainError {
  readonly kind = 'forbidden';
  constructor() {
    super('La operación requiere el rol de administrador');
  }
}

export class NotAPatientError extends DomainError {
  readonly kind = 'forbidden';
  constructor() {
    super('El estado del registro solo aplica a pacientes');
  }
}

// DP-8: cuenta creada ≠ registro completo ≠ habilitado para agendar.
export class RegistrationIncompleteError extends DomainError {
  readonly kind = 'forbidden';
  constructor(readonly missing: readonly string[]) {
    super('El registro del paciente está incompleto');
  }

  override get details() {
    return { missing: [...this.missing] };
  }
}

export class AdminAlreadyExistsError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('Ya existe un administrador: el bootstrap solo funciona sin administradores');
  }
}

export class BootstrapAccountHasProfileError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('La cuenta indicada ya tiene un perfil');
  }
}
