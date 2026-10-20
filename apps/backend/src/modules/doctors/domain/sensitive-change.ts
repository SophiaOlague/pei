import type { LineStatus } from './doctor-status';

// M03 D-9, D-21, D-28, D-29, N4 (diseño v3 §E.3; plan v2 §7bis.1 y §7ter): efectos de cada cambio del médico.
// Los cambios se aplican de inmediato (D-29); este módulo solo decide qué versiones suben, qué pendientes pasan a
// superseded y si el sistema crea una revisión automática de la cédula. Lo ejecuta el caso de uso (B5) en una UoW.

export type LicenseReviewReason =
  | 'initial'
  | 'resubmission'
  | 'license_number_changed'
  | 'license_document_changed'
  | 'specialty_changed'
  | 'legal_name_changed';

export interface ChangeEffects {
  identityRevisionBump: 0 | 1;
  professionalRevisionBump: 0 | 1;
  supersedeIdentityPending: boolean;
  supersedeLicensePending: boolean;
  // Revisión de cédula que crea el sistema reutilizando el documento vigente (null si no corresponde).
  automaticLicenseReview: 'specialty_changed' | 'legal_name_changed' | null;
}

const NONE: ChangeEffects = {
  identityRevisionBump: 0,
  professionalRevisionBump: 0,
  supersedeIdentityPending: false,
  supersedeLicensePending: false,
  automaticLicenseReview: null,
};

// Regla de reutilización (7bis.1): la revisión automática solo existe si la línea profesional, ANTES del cambio, estaba
// approved o pending. Si estaba rejected (documento rechazado) o required (sin documento), solo sube la versión y la
// línea queda required hasta que el médico envíe un documento.
const canReuseLicenseDocument = (professionalBefore: LineStatus): boolean => professionalBefore === 'approved' || professionalBefore === 'pending';

// Cambio de identidad legal (PUT /me/doctor-profile/identity). CURP y nombre juntos: la identidad sube una sola vez.
// Opción A (7ter.4): nunca se crea una revisión de INE; la línea de identidad queda required.
export function identityChangeEffects(change: { curp: boolean; legalName: boolean }, professionalBefore: LineStatus): ChangeEffects {
  if (!change.curp && !change.legalName) return NONE;
  if (!change.legalName) return { ...NONE, identityRevisionBump: 1, supersedeIdentityPending: true };
  return {
    identityRevisionBump: 1,
    professionalRevisionBump: 1,
    supersedeIdentityPending: true,
    supersedeLicensePending: true,
    automaticLicenseReview: canReuseLicenseDocument(professionalBefore) ? 'legal_name_changed' : null,
  };
}

// Cambio de especialidad (debe estar activa; lo valida el caso de uso). Sin ningún envío previo de cédula (registro
// incompleto) solo cambia el perfil: la revisión inicial llevará la especialidad nueva (7bis.1).
export function specialtyChangeEffects(professionalBefore: LineStatus, hasLicenseHistory: boolean): ChangeEffects {
  if (!hasLicenseHistory) return { ...NONE, professionalRevisionBump: 1 };
  return {
    ...NONE,
    professionalRevisionBump: 1,
    supersedeLicensePending: true,
    automaticLicenseReview: canReuseLicenseDocument(professionalBefore) ? 'specialty_changed' : null,
  };
}

// INE nueva (POST /me/doctor/identity-verifications): no sube versiones; el pendiente pasa a superseded (E.1).
export function identitySubmissionEffects(): ChangeEffects {
  return { ...NONE, supersedeIdentityPending: true };
}

// Bio, foto y teléfono: sin efectos (D-9).
export function freeFieldEffects(): ChangeEffects {
  return NONE;
}

// Envío de cédula del médico (POST /me/doctor/license-verifications). El cliente no elige el motivo: se deduce bajo el
// candado del perfil (7bis.1). El documento es SIEMPRE obligatorio en este camino.
// - Sin envíos previos → initial.
// - Línea rejected, o required con historial (la versión subió por otro cambio) → resubmission.
// - Línea pending o approved → license_number_changed si el número cambia; si no, license_document_changed.
// La versión profesional sube cuando el número del perfil cambia (incluido el primero, de NULL a un valor: el trigger
// de 0012 lo exige) o cuando se reemplaza el documento de una línea pending/approved (D-21, E.3).
export function licenseSubmission(input: {
  professionalBefore: LineStatus;
  hasLicenseHistory: boolean;
  profileLicenseNumber: string | null;
  submittedLicenseNumber: string;
}): { reason: LicenseReviewReason; effects: ChangeEffects } {
  const numberChanges = input.profileLicenseNumber !== input.submittedLicenseNumber;
  let reason: LicenseReviewReason;
  if (!input.hasLicenseHistory) reason = 'initial';
  else if (input.professionalBefore === 'rejected' || input.professionalBefore === 'required') reason = 'resubmission';
  else reason = numberChanges ? 'license_number_changed' : 'license_document_changed';

  const bump = numberChanges || reason === 'license_document_changed';
  return {
    reason,
    effects: { ...NONE, professionalRevisionBump: bump ? 1 : 0, supersedeLicensePending: input.professionalBefore === 'pending' },
  };
}
