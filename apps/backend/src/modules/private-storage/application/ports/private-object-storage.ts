import type { Readable } from 'stream';

// Almacenamiento privado de documentos e imágenes (DT-1, DT-3, DT-18; M03 R-11).
// Puerto compartido: los módulos consumidores (identity, doctors) solo conocen esta interfaz, nunca el SDK de R2.
// Sin métodos que devuelvan URLs: el contenido solo sale transmitido por el backend.
export interface StoredObject {
  stream: Readable;
  contentLength: number | null;
}

export interface PrivateObjectStorage {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  // Lanza StoredFileNotFoundError si el objeto no existe.
  openForRead(key: string): Promise<StoredObject>;
  // Idempotente: eliminar un objeto inexistente no es un error.
  delete(key: string): Promise<void>;
}

export const PRIVATE_OBJECT_STORAGE = Symbol('PRIVATE_OBJECT_STORAGE');
