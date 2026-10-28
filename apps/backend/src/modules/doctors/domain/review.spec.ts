import { canSupersede, isTerminal, parseRejectionReason, resolveReview, REVIEW_STATUSES } from './review';
import { InvalidRejectionReasonError, ReviewNotCurrentError, ReviewNotPendingError } from './doctor.errors';
import { parseLicenseNumber } from './license-number';
import { parseLegalName } from './legal-name';
import { InvalidLegalNameError, InvalidLicenseNumberError } from './doctor.errors';

describe('Ciclo de vida de una revisión (M03 B4; diseño v3 §E.4)', () => {
  it('[TC-M03-115][R-2] desde pending vigente: aprobar sin motivo o rechazar con motivo recortado', () => {
    expect(resolveReview('pending', true, { decision: 'approve' })).toEqual({ status: 'approved', rejectionReason: null });
    expect(resolveReview('pending', true, { decision: 'reject', reason: '  Documento ilegible  ' })).toEqual({ status: 'rejected', rejectionReason: 'Documento ilegible' });
  });

  it.each(['approved', 'rejected', 'superseded'] as const)('[TC-M03-116][R-2] %s es terminal: no se revisa ni pasa a superseded', (status) => {
    expect(() => resolveReview(status, true, { decision: 'approve' })).toThrow(ReviewNotPendingError);
    expect(isTerminal(status)).toBe(true);
    expect(canSupersede(status)).toBe(false);
  });

  it('[TC-M03-117][E.5] una revisión pendiente que ya no es la vigente no se aprueba ni se rechaza', () => {
    expect(() => resolveReview('pending', false, { decision: 'approve' })).toThrow(ReviewNotCurrentError);
    expect(() => resolveReview('pending', false, { decision: 'reject', reason: 'Documento ilegible' })).toThrow(ReviewNotCurrentError);
    expect(canSupersede('pending')).toBe(true);
    expect(REVIEW_STATUSES).toEqual(['pending', 'approved', 'rejected', 'superseded']);
  });

  it.each(['', '   ', 'corto', 'x'.repeat(501)])('[TC-M03-118][D-25] motivo inválido %p → 400, antes de mirar el estado', (reason) => {
    expect(() => parseRejectionReason(reason)).toThrow(InvalidRejectionReasonError);
    expect(() => resolveReview('approved', false, { decision: 'reject', reason })).toThrow(InvalidRejectionReasonError);
  });
});

describe('Value objects del médico (M03 B4)', () => {
  it('[TC-M03-119][R-6] número de cédula: 1 a 20 caracteres [0-9A-Za-z-], recortado', () => {
    expect(parseLicenseNumber(' 1234567 ')).toBe('1234567');
    expect(parseLicenseNumber('AB-12')).toBe('AB-12');
    for (const bad of ['', '12 34', '12_34', 'ñ1', 'x'.repeat(21)]) expect(() => parseLicenseNumber(bad)).toThrow(InvalidLicenseNumberError);
  });

  it('[TC-M03-120][C-16] nombre legal del registro: cada parte de 1 a 100, sin espacios en los extremos', () => {
    expect(parseLegalName({ firstName: ' Ana ', lastName: 'Pérez' })).toEqual({ firstName: 'Ana', lastName: 'Pérez' });
    expect(() => parseLegalName({ firstName: '', lastName: 'Pérez' })).toThrow(InvalidLegalNameError);
    expect(() => parseLegalName({ firstName: 'Ana', lastName: 'x'.repeat(101) })).toThrow(InvalidLegalNameError);
  });
});
