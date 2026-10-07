import { InvalidDocumentFileError } from './identity.errors';

// Archivos de imagen que acepta Identity: INE (frente y reverso) y foto de perfil (DT-4, DT-7).
// - El tipo se decide por la firma binaria (magic bytes); el tipo MIME y el nombre que envía el cliente se ignoran.
// - Máximo 5 MB por archivo.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ImageExtension = 'jpg' | 'png';

export const CONTENT_TYPE_BY_EXTENSION: Readonly<Record<ImageExtension, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
};

export interface ValidatedImage {
  bytes: Buffer;
  extension: ImageExtension;
  contentType: string;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, i) => bytes[i] === byte);
}

export function detectImageExtension(bytes: Uint8Array): ImageExtension | null {
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'jpg';
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png';
  return null;
}

export function validateImage(bytes: Buffer | undefined | null): ValidatedImage {
  if (!bytes || bytes.length === 0) throw new InvalidDocumentFileError('Falta el archivo o está vacío');
  if (bytes.length > MAX_IMAGE_BYTES) throw new InvalidDocumentFileError();
  const extension = detectImageExtension(bytes);
  if (!extension) throw new InvalidDocumentFileError();
  return { bytes, extension, contentType: CONTENT_TYPE_BY_EXTENSION[extension] };
}
