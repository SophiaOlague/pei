import type { ReviewStatus } from './review';

// M03 R-7, N3, Z-1, D-24, D-30, D-31 (diseño v3 §D; plan v2 §7bis.2): estado derivado del médico. Función pura: no se
// persiste ningún estado global. El lector (B5) arma el snapshot con una sola consulta.

export type LineStatus = 'required' | 'pending' | 'approved' | 'rejected';
export type DoctorGlobalStatus = 'pending' | 'approved' | 'rejected';

export type DoctorMissingItem =
  | 'profile'
  | 'legal'
  | 'identity_submission'
  | 'identity_resubmission'
  | 'license_submission'
  | 'license_resubmission';

export interface ReviewSnapshot {
  attempt: number;
  revision: number; // identity_revision o professional_revision de la fila
  status: ReviewStatus;
}

export interface DoctorStatusSnapshot {
  // Perfil de dominio (D-24): rol doctor, nombre legal, CURP válida y especialidad asignada (puede estar inactiva, D-33).
  hasDoctorProfile: boolean;
  legalNameComplete: boolean;
  curpValid: boolean;
  specialtyAssigned: boolean;
  identityRevision: number;
  professionalRevision: number;
  identityReviews: readonly ReviewSnapshot[];
  licenseReviews: readonly ReviewSnapshot[];
  // Versiones vigentes de privacy_policy y doctor_terms aceptadas (D-32, R-13).
  legalAccepted: boolean;
}

// D-38: tres conceptos independientes. `status` es el estado ADMINISTRATIVO (solo las revisiones de INE y cédula);
// `legalAccepted`, la aceptación de las versiones vigentes; `canOperate`, la habilitación operativa. Ninguna
// autorización operativa compara `status`: usa `canOperate` (isOperational o DoctorOperationalPolicy).
export interface DoctorStatus {
  status: DoctorGlobalStatus;
  identity: LineStatus;
  professional: LineStatus;
  registrationComplete: boolean;
  legalAccepted: boolean;
  canOperate: boolean;
  missing: DoctorMissingItem[];
}

// D.1: la revisión vigente es la de mayor intento que no está superseded, y solo cuenta si verificó la versión actual
// de la línea. Una aprobación de la versión 4 no cuenta si la vigente es la 5 (E.5).
export function currentReview<T extends ReviewSnapshot>(reviews: readonly T[], currentRevision: number): T | null {
  const live = reviews.filter((r) => r.status !== 'superseded');
  if (live.length === 0) return null;
  const latest = live.reduce((a, b) => (b.attempt > a.attempt ? b : a));
  return latest.revision === currentRevision ? latest : null;
}

export function deriveLineStatus(reviews: readonly ReviewSnapshot[], currentRevision: number): LineStatus {
  const review = currentReview(reviews, currentRevision);
  return review ? (review.status as Exclude<ReviewStatus, 'superseded'>) : 'required';
}

// Una línea `required` con historial (por ejemplo, tras cambiar la CURP o el nombre) pide un reenvío; sin historial,
// el primer envío.
function lineMissing(line: LineStatus, reviews: readonly ReviewSnapshot[], first: DoctorMissingItem, again: DoctorMissingItem): DoctorMissingItem[] {
  if (line !== 'required') return [];
  return [reviews.length === 0 ? first : again];
}

export function deriveDoctorStatus(s: DoctorStatusSnapshot): DoctorStatus {
  const identity = s.hasDoctorProfile ? deriveLineStatus(s.identityReviews, s.identityRevision) : 'required';
  const professional = s.hasDoctorProfile ? deriveLineStatus(s.licenseReviews, s.professionalRevision) : 'required';

  const profileComplete = s.hasDoctorProfile && s.legalNameComplete && s.curpValid && s.specialtyAssigned;
  // D-30: «entregó todo», no «aprobado»: una revisión rechazada cuenta como entregada. 7bis.2: no se comprueba
  // license_number; se comprueba que la línea profesional no esté en required.
  const registrationComplete = profileComplete && identity !== 'required' && professional !== 'required' && s.legalAccepted;

  const missing: DoctorMissingItem[] = [
    ...(profileComplete ? [] : (['profile'] as const)),
    ...(s.legalAccepted ? [] : (['legal'] as const)),
    ...(s.hasDoctorProfile ? lineMissing(identity, s.identityReviews, 'identity_submission', 'identity_resubmission') : []),
    ...(s.hasDoctorProfile ? lineMissing(professional, s.licenseReviews, 'license_submission', 'license_resubmission') : []),
  ];

  // Z-1 (enmendada por D-38), en este orden. Solo las líneas administrativas: ni registrationComplete ni la
  // aceptación legal cambian el estado administrativo. Una versión legal nueva no devuelve al médico a revisión.
  let status: DoctorGlobalStatus;
  if (identity === 'pending' || professional === 'pending') status = 'pending';
  else if (identity === 'rejected' || professional === 'rejected') status = 'rejected';
  else if (identity === 'approved' && professional === 'approved') status = 'approved';
  else status = 'pending';

  // D-38, D-13, D-23: habilitación operativa = aprobación administrativa y registro completo (perfil y aceptación
  // legal vigente incluidos).
  const canOperate = status === 'approved' && registrationComplete;

  return { status, identity, professional, registrationComplete, legalAccepted: s.legalAccepted, canOperate, missing };
}

// D-13, D-23, D-38, RN-004: solo opera un médico habilitado (la política de M07/M08 se construye sobre esto en B7).
export const isOperational = (status: DoctorStatus): boolean => status.canOperate;
