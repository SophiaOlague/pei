import { MAX_IMAGE_BYTES, type FileExtension, type FileRule, type ImageExtension } from '../../private-storage/domain/file-signature';

// M03 H.2: claves del bucket privado para el médico. Solo UUID (nunca CURP, nombres ni número de cédula); las genera
// el servidor y la BD guarda la clave, nunca una URL.
//   doctor-identity/{doctorProfileId}/{submissionId}/{front|back}.{jpg|png}
//   doctor-licenses/{doctorProfileId}/{submissionId}.{pdf|jpg|png}
//   doctor-photos/{doctorProfileId}/{uuid}.{jpg|png}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function assertUuid(value: string): void {
  if (!UUID.test(value)) throw new Error('Las claves de objetos solo se forman con UUID en minúsculas');
}

export type DocumentSide = 'front' | 'back';

export function doctorIdentityKey(doctorProfileId: string, submissionId: string, side: DocumentSide, extension: ImageExtension): string {
  assertUuid(doctorProfileId);
  assertUuid(submissionId);
  return `doctor-identity/${doctorProfileId}/${submissionId}/${side}.${extension}`;
}

export function doctorLicenseKey(doctorProfileId: string, submissionId: string, extension: FileExtension): string {
  assertUuid(doctorProfileId);
  assertUuid(submissionId);
  return `doctor-licenses/${doctorProfileId}/${submissionId}.${extension}`;
}

export function doctorPhotoKey(doctorProfileId: string, photoId: string, extension: ImageExtension): string {
  assertUuid(doctorProfileId);
  assertUuid(photoId);
  return `doctor-photos/${doctorProfileId}/${photoId}.${extension}`;
}

// R-5 y D-3: la cédula es PDF, PNG o JPEG de hasta 10 MB.
export const MAX_LICENSE_BYTES = 10 * 1024 * 1024;
export const LICENSE_FILE_RULE: FileRule = {
  allowed: ['pdf', 'jpg', 'png'],
  maxBytes: MAX_LICENSE_BYTES,
  invalidMessage: 'La cédula debe ser un PDF, PNG o JPEG de máximo 10 MB',
};

// R-14: la INE del médico es JPEG o PNG, frente y reverso, de hasta 5 MB cada uno (la regla de imágenes de M02).
export const MAX_DOCTOR_IMAGE_BYTES = MAX_IMAGE_BYTES;
