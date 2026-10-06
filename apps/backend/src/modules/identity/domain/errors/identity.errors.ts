import { DomainError } from '../../../../common/domain/domain-error';

// Los "kind" conservan los códigos HTTP que estos errores ya tenían (400 y 409).

export class DuplicateCurpError extends DomainError {
  readonly kind = 'validation';
  constructor(curp: string) {
    super(`Ya existe un paciente registrado con el CURP ${curp}`);
    this.name = 'DuplicateCurpError';
  }
}

export class TermsNotAcceptedError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('Debes aceptar el aviso de privacidad y los términos y condiciones');
    this.name = 'TermsNotAcceptedError';
  }
}

export class ProfileAlreadyCompletedError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('El perfil de este usuario ya fue completado');
    this.name = 'ProfileAlreadyCompletedError';
  }
}

export class MissingIdentityDocumentsError extends DomainError {
  readonly kind = 'validation';
  constructor() {
    super('Debes subir ambos lados de tu INE para validar tu identidad');
    this.name = 'MissingIdentityDocumentsError';
  }
}

export class LegalDocumentsNotPublishedError extends DomainError {
  readonly kind = 'conflict'; // 409: el sistema no está listo, no es culpa del cliente
  constructor() {
    super('No hay aviso de privacidad o términos y condiciones publicados');
    this.name = 'LegalDocumentsNotPublishedError';
  }
}
