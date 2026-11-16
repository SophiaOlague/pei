import { selectBookingLegalAcceptances, type CurrentLegalDocumentAcceptance } from './booking-legal-acceptance';
import type { LegalDocumentType } from './legal-requirements';

// AP-26 (M08-diseno A.17.1): las dos aceptaciones legales que habilitan una reserva. Lógica pura, sin BD.
const doc = (type: LegalDocumentType, acceptanceId: string | null, version = 'v1'): CurrentLegalDocumentAcceptance => ({
  type,
  documentId: `doc-${type}-${version}`,
  version,
  acceptanceId,
});

describe('selectBookingLegalAcceptances (AP-26)', () => {
  it('[TC-M02-249][AP-26] régimen actual completo: devuelve privacy_policy y patient_terms con sus ids de aceptación', () => {
    const docs = [doc('privacy_policy', 'acc-pp'), doc('patient_terms', 'acc-pt'), doc('privacy_notice', null), doc('terms_and_conditions', null)];
    expect(selectBookingLegalAcceptances('patient', docs)).toEqual({
      regime: 'current',
      privacy: { acceptanceId: 'acc-pp', legalDocumentId: 'doc-privacy_policy-v1', type: 'privacy_policy', version: 'v1' },
      terms: { acceptanceId: 'acc-pt', legalDocumentId: 'doc-patient_terms-v1', type: 'patient_terms', version: 'v1' },
    });
  });

  it('[TC-M02-250][AP-26] régimen anterior (sin el actual completo): devuelve privacy_notice y terms_and_conditions', () => {
    const docs = [doc('privacy_notice', 'acc-pn'), doc('terms_and_conditions', 'acc-tc'), doc('privacy_policy', 'acc-pp')];
    expect(selectBookingLegalAcceptances('patient', docs)).toEqual({
      regime: 'legacy',
      privacy: { acceptanceId: 'acc-pn', legalDocumentId: 'doc-privacy_notice-v1', type: 'privacy_notice', version: 'v1' },
      terms: { acceptanceId: 'acc-tc', legalDocumentId: 'doc-terms_and_conditions-v1', type: 'terms_and_conditions', version: 'v1' },
    });
  });

  it.each([
    ['falta la de privacidad', [doc('privacy_policy', null), doc('patient_terms', 'acc-pt')]],
    ['falta la de términos', [doc('privacy_policy', 'acc-pp'), doc('patient_terms', null)]],
    ['faltan las dos', [doc('privacy_policy', null), doc('patient_terms', null)]],
  ])('[TC-M02-251][AP-26] %s: null', (_label, docs) => {
    expect(selectBookingLegalAcceptances('patient', docs)).toBeNull();
  });

  it('[TC-M02-252][AP-26] sin un régimen completo publicado: null, aunque haya aceptaciones sueltas', () => {
    expect(selectBookingLegalAcceptances('patient', [])).toBeNull();
    expect(selectBookingLegalAcceptances('patient', [doc('privacy_policy', 'acc-pp'), doc('terms_and_conditions', 'acc-tc')])).toBeNull();
  });

  it.each([['doctor'], ['admin'], [null]] as const)('[TC-M02-253][AP-26] perfil que no es de paciente (%s): null', (role) => {
    expect(selectBookingLegalAcceptances(role, [doc('privacy_policy', 'acc-pp'), doc('patient_terms', 'acc-pt')])).toBeNull();
  });

  it('[TC-M02-254][AP-26] versión vigente nueva que el paciente no aceptó: null (el documento vigente es el nuevo)', () => {
    // El lector entrega solo el documento vigente de cada tipo: tras publicar patient_terms v2, la aceptación de v1 ya
    // no corresponde a ningún documento vigente y acceptanceId llega vacío.
    expect(selectBookingLegalAcceptances('patient', [doc('privacy_policy', 'acc-pp'), doc('patient_terms', null, 'v2')])).toBeNull();
  });
});
