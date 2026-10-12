import { CONTENT_TYPE_BY_EXTENSION, type FileExtension } from './file-signature';

// Gramática segura de las claves del bucket privado (DT-3, DT-18; M03 H.1).
//
//   {espacio}/{uuid}(/{uuid})*[/{front|back}].{jpg|png|pdf}
//
// - Solo se aceptan los espacios de nombres registrados aquí. Cada módulo construye sus propias claves con
//   un formato más estricto (por ejemplo, identity/object-keys.ts); este módulo no conoce reglas de negocio.
// - Una clave nunca contiene CURP, nombres, correos ni otros datos personales: solo UUID en minúsculas.
// - M03 agregará sus espacios (doctor-identity, doctor-licenses, doctor-photos) cuando los use.

export const PRIVATE_OBJECT_NAMESPACES = ['identity', 'profile-photos'] as const;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PRIVATE_OBJECT_KEY = new RegExp(
  `^(${PRIVATE_OBJECT_NAMESPACES.join('|')})(/${UUID})+(/(front|back))?\\.(${Object.keys(CONTENT_TYPE_BY_EXTENSION).join('|')})$`,
);

export function isPrivateObjectKey(key: string): boolean {
  return PRIVATE_OBJECT_KEY.test(key);
}

export function contentTypeForObjectKey(key: string): string {
  const extension = key.slice(key.lastIndexOf('.') + 1) as FileExtension;
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
