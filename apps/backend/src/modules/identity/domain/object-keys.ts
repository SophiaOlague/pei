import { CONTENT_TYPE_BY_EXTENSION, type ImageExtension } from '../../private-storage/domain/file-signature';
import type { DocumentSide } from './identity-verification';

// Claves de objetos del bucket privado (DT-3, DT-18). Las genera el servidor y SOLO se forman con
// identificadores UUID, el lado del documento y la extensión detectada: nunca CURP, nombres, correos u otros
// datos personales. El cliente nunca envía claves ni URLs, y la BD guarda la clave, no una URL.
//
//   identity/{patientProfileId}/{submissionId}/{front|back}.{jpg|png}
//   profile-photos/{patientProfileId}/{uuid}.{jpg|png}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_ONLY = new RegExp(`^${UUID}$`);
const MANAGED_KEY = new RegExp(`^(identity/${UUID}/${UUID}/(front|back)|profile-photos/${UUID}/${UUID})\\.(jpg|png)$`);

function assertUuid(value: string): void {
  if (!UUID_ONLY.test(value)) throw new Error('Las claves de objetos solo se forman con UUID en minúsculas');
}

export function identityDocumentKey(patientProfileId: string, submissionId: string, side: DocumentSide, extension: ImageExtension): string {
  assertUuid(patientProfileId);
  assertUuid(submissionId);
  return `identity/${patientProfileId}/${submissionId}/${side}.${extension}`;
}

export function profilePhotoKey(patientProfileId: string, photoId: string, extension: ImageExtension): string {
  assertUuid(patientProfileId);
  assertUuid(photoId);
  return `profile-photos/${patientProfileId}/${photoId}.${extension}`;
}

// Una clave con el formato que genera PEI. Las filas anteriores a M02 pueden conservar URLs en estas
// columnas (DT-3); esos valores no son objetos del bucket privado.
export function isManagedObjectKey(key: string): boolean {
  return MANAGED_KEY.test(key);
}

export function contentTypeForKey(key: string): string {
  const extension = key.slice(key.lastIndexOf('.') + 1) as ImageExtension;
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
