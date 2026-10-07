import type { Readable } from 'stream';

// Almacenamiento privado de documentos e imágenes (DT-1, DT-3, DT-18).
// Sin métodos que devuelvan URLs: el contenido solo sale transmitido por el backend.
export interface StoredFile {
  stream: Readable;
  contentLength: number | null;
}

export interface DocumentStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  // Lanza StoredFileNotFoundError si el objeto no existe.
  openForRead(key: string): Promise<StoredFile>;
  // Idempotente: eliminar un objeto inexistente no es un error.
  delete(key: string): Promise<void>;
}

export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');
