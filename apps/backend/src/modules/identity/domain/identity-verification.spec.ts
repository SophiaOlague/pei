import { assertDocumentsViewable, nextSubmissionAttempt, resolveReview } from './identity-verification';
import {
  IdentityAlreadyApprovedError,
  IdentityDocumentUnavailableError,
  IdentityVerificationAlreadyReviewedError,
  IdentityVerificationPendingError,
  InvalidRejectionReasonError,
} from './identity.errors';

describe('Envío del INE: transiciones (DP-11, DT-2, DT-16)', () => {
  it('[TC-M02-020][DT-2] primer envío → intento 1', () => {
    expect(nextSubmissionAttempt(null)).toBe(1);
  });

  it.each([1, 2, 7])('[TC-M02-021][DT-16] tras un rechazo en el intento %i se permite el siguiente, sin máximo', (attempt) => {
    expect(nextSubmissionAttempt({ status: 'rejected', attempt })).toBe(attempt + 1);
  });

  it('[TC-M02-022][DP-11] con un envío pendiente no se puede enviar otro (409)', () => {
    expect(() => nextSubmissionAttempt({ status: 'pending', attempt: 1 })).toThrow(IdentityVerificationPendingError);
    expect(new IdentityVerificationPendingError().kind).toBe('conflict');
  });

  it('[TC-M02-023][DP-11] una identidad aprobada no se reenvía (409)', () => {
    expect(() => nextSubmissionAttempt({ status: 'approved', attempt: 3 })).toThrow(IdentityAlreadyApprovedError);
  });

  it('[TC-M02-024][RF-07] aprobar un envío pendiente', () => {
    expect(resolveReview('pending', { decision: 'approve' })).toEqual({ status: 'approved', rejectionReason: null });
  });

  it('[TC-M02-025][RF-07] rechazar exige un motivo de 10 a 500 caracteres (se recorta)', () => {
    expect(resolveReview('pending', { decision: 'reject', reason: '  Imagen ilegible  ' })).toEqual({
      status: 'rejected',
      rejectionReason: 'Imagen ilegible',
    });
    expect(resolveReview('pending', { decision: 'reject', reason: 'x'.repeat(500) }).rejectionReason).toHaveLength(500);
    expect(() => resolveReview('pending', { decision: 'reject', reason: 'corto' })).toThrow(InvalidRejectionReasonError);
    expect(() => resolveReview('pending', { decision: 'reject', reason: 'x'.repeat(501) })).toThrow(InvalidRejectionReasonError);
  });

  it.each(['approved', 'rejected'] as const)('[TC-M02-026][RF-07] un envío %s no se vuelve a revisar (409)', (status) => {
    expect(() => resolveReview(status, { decision: 'approve' })).toThrow(IdentityVerificationAlreadyReviewedError);
  });

  it('[TC-M02-027][DP-15] los documentos solo se ven con el envío pendiente', () => {
    expect(() => assertDocumentsViewable('pending')).not.toThrow();
    expect(() => assertDocumentsViewable('approved')).toThrow(IdentityDocumentUnavailableError);
    expect(() => assertDocumentsViewable('rejected')).toThrow(IdentityDocumentUnavailableError);
  });
});
