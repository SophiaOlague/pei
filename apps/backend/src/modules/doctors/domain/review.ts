import { InvalidRejectionReasonError, ReviewNotCurrentError, ReviewNotPendingError } from './doctor.errors';

// M03 R-2, D-25, D-27 (diseño v3 §E.4): ciclo de vida de una revisión de INE o de cédula.
//   pending ──approve (vigente)──► approved      (terminal)
//   pending ──reject(motivo) (vigente)──► rejected (terminal)
//   pending ──cambio sensible / envío nuevo──► superseded (terminal; nunca revisable)
// La BD impone lo mismo con los triggers de 0012; esta función permite responder antes y con errores de dominio.

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'superseded'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REJECTION_REASON_MIN = 10;
export const REJECTION_REASON_MAX = 500;

export type ReviewDecision = { decision: 'approve' } | { decision: 'reject'; reason: string };

export interface ResolvedReview {
  status: 'approved' | 'rejected';
  rejectionReason: string | null;
}

// D-25: el motivo es obligatorio y de 10 a 500 caracteres (sin contar los espacios de los extremos).
export function parseRejectionReason(value: string): string {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < REJECTION_REASON_MIN || reason.length > REJECTION_REASON_MAX) throw new InvalidRejectionReasonError();
  return reason;
}

// Valida la decisión contra el estado actual. `isCurrent`: la revisión es la vigente de su línea (versión del perfil y
// último intento, diseño v3 §E.5); una revisión que dejó de ser vigente no se aprueba ni se rechaza.
export function resolveReview(status: ReviewStatus, isCurrent: boolean, decision: ReviewDecision): ResolvedReview {
  const resolved: ResolvedReview =
    decision.decision === 'approve'
      ? { status: 'approved', rejectionReason: null }
      : { status: 'rejected', rejectionReason: parseRejectionReason(decision.reason) };
  if (status !== 'pending') throw new ReviewNotPendingError();
  if (!isCurrent) throw new ReviewNotCurrentError();
  return resolved;
}

// Solo una revisión pendiente puede pasar a superseded (R-2).
export function canSupersede(status: ReviewStatus): boolean {
  return status === 'pending';
}

export const isTerminal = (status: ReviewStatus): boolean => status !== 'pending';
