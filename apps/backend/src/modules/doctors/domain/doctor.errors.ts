import { DomainError } from '../../../common/domain/domain-error';

// Errores de M03 (médicos y catálogo de especialidades). Sus mensajes se muestran al cliente: nunca incluyen
// CURP, nombres, números de cédula, claves de objetos ni URLs.

// Las rutas ya exigen @Roles('admin'); los casos de uso también fallan cerrado.
export class AdminRequiredError extends DomainError {
  readonly kind = 'forbidden';
  constructor() {
    super('La operación requiere el rol de administrador');
  }
}

export class InvalidSpecialtyCodeError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('El código de la especialidad debe tener de 2 a 50 caracteres: minúsculas, dígitos o guion bajo, empezando por letra');
  }
}

export class InvalidSpecialtyNameError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('El nombre de la especialidad debe tener de 1 a 100 caracteres');
  }
}

export class SpecialtyNotFoundError extends DomainError {
  readonly kind = 'not_found';
  constructor() {
    super('No se encontró la especialidad');
  }
}

// El catálogo es administrativo: no hay riesgo de enumeración y se indica qué campo choca.
export class SpecialtyAlreadyExistsError extends DomainError {
  readonly kind = 'conflict';
  constructor(readonly field: 'code' | 'name') {
    super(field === 'code' ? 'Ya existe una especialidad con ese código' : 'Ya existe una especialidad con ese nombre');
  }

  override get details() {
    return { field: this.field };
  }
}

export class InvalidLicenseNumberError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('El número de cédula debe tener de 1 a 20 caracteres: dígitos, letras o guion');
  }
}

export class InvalidLegalNameError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('El nombre y los apellidos deben tener de 1 a 100 caracteres');
  }
}

// D-25
export class InvalidRejectionReasonError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('El motivo del rechazo es obligatorio y debe tener de 10 a 500 caracteres');
  }
}

// R-2: solo una revisión pendiente se aprueba o se rechaza.
export class ReviewNotPendingError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('La revisión ya no está pendiente');
  }
}

// E.5: la revisión dejó de ser la vigente de su línea (cambió la versión o hay un intento posterior).
export class ReviewNotCurrentError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('La revisión ya no es la vigente');
  }
}

// Las rutas del médico ya exigen @Roles('doctor'); los casos de uso también fallan cerrado.
export class DoctorProfileRequiredError extends DomainError {
  readonly kind = 'forbidden';
  constructor() {
    super('La operación requiere un perfil de médico');
  }
}

// D-33 (diseño v3 §F): una especialidad inactiva no se asigna.
export class SpecialtyInactiveError extends DomainError {
  readonly kind = 'business_rule';
  constructor() {
    super('La especialidad no está disponible');
  }
}

export class NoChangesError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('La solicitud no cambia ningún dato');
  }
}

export class LicenseDocumentUnavailableError extends DomainError {
  readonly kind = 'not_found';
  constructor() {
    super('No hay un documento de cédula disponible');
  }
}

export class DoctorPhotoNotFoundError extends DomainError {
  readonly kind = 'not_found';
  constructor() {
    super('El médico no tiene foto');
  }
}

// B6: un id ajeno o inexistente responde 404 (diseño v3 §J).
export class DoctorNotFoundError extends DomainError {
  readonly kind = 'not_found';
  constructor() {
    super('No se encontró el médico');
  }
}

export class DoctorReviewNotFoundError extends DomainError {
  readonly kind = 'not_found';
  constructor() {
    super('No se encontró la revisión');
  }
}

// D-19 (diseño v3 §E.1): el admin ve la INE solo si la revisión está pendiente y es la vigente.
export class DoctorIdentityDocumentUnavailableError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('Los documentos de esta revisión de INE ya no están disponibles');
  }
}

// D-13, D-23, RN-004: un médico que no está approved no opera en M07 ni M08. Sin datos del médico en el mensaje.
export class DoctorNotOperationalError extends DomainError {
  readonly kind = 'business_rule';
  constructor() {
    super('El médico no está aprobado para operar');
  }
}

// Z-2 (diseño v3 §F): activar una activa o desactivar una inactiva.
export class SpecialtyAlreadyInStateError extends DomainError {
  readonly kind = 'conflict';
  constructor() {
    super('La especialidad ya está en ese estado');
  }
}
