export class DuplicateCurpError extends Error {
  constructor(curp: string) {
    super(`Ya existe un paciente registrado con el CURP ${curp}`);
    this.name = 'DuplicateCurpError';
  }
}

export class TermsNotAcceptedError extends Error {
  constructor() {
    super('Debes aceptar el aviso de privacidad y los términos y condiciones');
    this.name = 'TermsNotAcceptedError';
  }
}

export class ProfileAlreadyCompletedError extends Error {
  constructor() {
    super('El perfil de este usuario ya fue completado');
    this.name = 'ProfileAlreadyCompletedError';
  }
}

export class MissingIdentityDocumentsError extends Error {
  constructor() {
    super('Debes subir ambos lados de tu INE para validar tu identidad');
    this.name = 'MissingIdentityDocumentsError';
  }
}

export class LegalDocumentsNotPublishedError extends Error {
  constructor() {
    super('No hay aviso de privacidad o términos y condiciones publicados');
    this.name = 'LegalDocumentsNotPublishedError';
  }
}