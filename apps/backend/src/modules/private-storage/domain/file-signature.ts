import { InvalidDocumentFileError } from './private-storage.errors';

// Archivos que acepta el almacenamiento privado (DT-4, DT-7; M03 D-3).
// - El tipo se decide por la firma binaria (magic bytes); el tipo MIME y el nombre que envía el cliente se ignoran.
// - Cada uso fija sus formatos y su tamaño máximo con una FileRule: imágenes de Identity (INE y foto, 5 MB);
//   la cédula de M03 agregará su propia regla (PDF, PNG o JPEG).

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export type ImageExtension = 'jpg' | 'png';
export type FileExtension = ImageExtension | 'pdf';

export const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<FileExtension, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
};

export interface FileRule<E extends FileExtension = FileExtension> {
  allowed: readonly E[];
  maxBytes: number;
  // Mensaje para un archivo de otro tipo o demasiado grande.
  invalidMessage: string;
}

export interface ValidatedFile<E extends FileExtension = FileExtension> {
  bytes: Buffer;
  extension: E;
  contentType: string;
}

export type ValidatedImage = ValidatedFile<ImageExtension>;

export const IMAGE_FILE_RULE: FileRule<ImageExtension> = {
  allowed: ['jpg', 'png'],
  maxBytes: MAX_IMAGE_BYTES,
  invalidMessage: 'El archivo debe ser una imagen JPEG o PNG de máximo 5 MB',
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);
}

export function detectFileExtension(bytes: Uint8Array): FileExtension | null {
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'jpg';
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png';
  if (startsWith(bytes, PDF_SIGNATURE)) return 'pdf';
  return null;
}

export function detectImageExtension(bytes: Uint8Array): ImageExtension | null {
  const extension = detectFileExtension(bytes);
  return extension === 'jpg' || extension === 'png' ? extension : null;
}

export function validateFile<E extends FileExtension>(bytes: Buffer | undefined | null, rule: FileRule<E>): ValidatedFile<E> {
  if (!bytes || bytes.length === 0) throw new InvalidDocumentFileError('Falta el archivo o está vacío');
  if (bytes.length > rule.maxBytes) throw new InvalidDocumentFileError(rule.invalidMessage);
  const extension = detectFileExtension(bytes);
  if (!extension || !(rule.allowed as readonly FileExtension[]).includes(extension)) {
    throw new InvalidDocumentFileError(rule.invalidMessage);
  }
  return { bytes, extension: extension as E, contentType: CONTENT_TYPE_BY_EXTENSION[extension] };
}

// Imágenes de Identity (INE y foto de perfil): JPEG o PNG de máximo 5 MB.
export function validateImage(bytes: Buffer | undefined | null): ValidatedImage {
  return validateFile(bytes, IMAGE_FILE_RULE);
}
