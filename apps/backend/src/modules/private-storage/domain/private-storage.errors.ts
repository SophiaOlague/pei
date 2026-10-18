import { DomainError } from '../../../common/domain/domain-error';

// Errores del almacenamiento privado. Conservan los nombres y mensajes que tenían en Identity (M02):
// el nombre llega al cliente en el campo `error` de la respuesta. Nunca incluyen claves de objetos ni URLs.

export class InvalidDocumentFileError extends DomainError {
  readonly kind = 'validation';
  constructor(message = 'El archivo debe ser una imagen JPEG o PNG de máximo 5 MB') {
    super(message);
  }
}

export class StoredFileNotFoundError extends DomainError {
  readonly kind = 'not_found';
  constructor() {
    super('El archivo no existe');
  }
}
