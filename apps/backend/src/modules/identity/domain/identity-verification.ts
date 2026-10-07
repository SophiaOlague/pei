import {
  IdentityAlreadyApprovedError,
  IdentityDocumentUnavailableError,
  IdentityVerificationAlreadyReviewedError,
  IdentityVerificationPendingError,
  InvalidRejectionReasonError,
} from './identity.errors';

// Envío del INE (DP-11, DT-2, DT-16): un registro por envío, con historial de intentos.
//
//   (sin envío) ──submit──► pending ──approve──► approved
//                             └──reject(reason)──► rejected ──submit──► nuevo envío (attempt + 1)
//
// - A lo más un envío 'pending' por paciente (también lo garantiza un índice único parcial).
// - Tras 'rejected' se permite un nuevo envío; 'approved' no se reenvía. Sin límite funcional de intentos:
//   el abuso lo controla el rate limit.
// - Los documentos solo existen mientras el envío está 'pending'; al resolverse se eliminan (DT-5).

export type IdentityVerificationStatus = 'pending' | 'approved' | 'rejected';
export type DocumentSide = 'front' | 'back';
export const DOCUMENT_SIDES: readonly DocumentSide[] = ['front', 'back'];

export const REJECTION_REASON_MIN = 10;
export const REJECTION_REASON_MAX = 500;

export interface LatestSubmission {
  status: IdentityVerificationStatus;
  attempt: number;
}

// Número de intento del nuevo envío, o el error que impide enviarlo.
export function nextSubmissionAttempt(latest: LatestSubmission | null): number {
  if (!latest) return 1;
  if (latest.status === 'pending') throw new IdentityVerificationPendingError();
  if (latest.status === 'approved') throw new IdentityAlreadyApprovedError();
  return latest.attempt + 1;
}

export type ReviewDecision = { decision: 'approve' } | { decision: 'reject'; reason: string };

// Valida la decisión del administrador y devuelve el estado y el motivo que se guardan.
export function resolveReview(
  currentStatus: IdentityVerificationStatus,
  review: ReviewDecision,
): { status: 'approved' | 'rejected'; rejectionReason: string | null } {
  if (currentStatus !== 'pending') throw new IdentityVerificationAlreadyReviewedError();
  if (review.decision === 'approve') return { status: 'approved', rejectionReason: null };

  const reason = typeof review.reason === 'string' ? review.reason.trim() : '';
  if (reason.length < REJECTION_REASON_MIN || reason.length > REJECTION_REASON_MAX) {
    throw new InvalidRejectionReasonError();
  }
  return { status: 'rejected', rejectionReason: reason };
}

// DP-15: el administrador solo ve los documentos de un envío pendiente.
export function assertDocumentsViewable(status: IdentityVerificationStatus): void {
  if (status !== 'pending') throw new IdentityDocumentUnavailableError();
}
