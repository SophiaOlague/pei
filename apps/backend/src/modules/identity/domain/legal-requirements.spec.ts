import {
  evaluateLegalAcceptance,
  resolveLegalRegime,
  type CurrentLegalDocument,
  type LegalDocumentType,
} from './legal-requirements';

const doc = (type: LegalDocumentType, accepted: boolean, version = 'v1'): CurrentLegalDocument => ({
  type,
  documentId: `00000000-0000-4000-8000-${String(type.length).padStart(12, '0')}`,
  version,
  accepted,
});

describe('Régimen legal por rol (M03 D-32, N1; plan v2 §6)', () => {
  it.each<[string, LegalDocumentType[], readonly LegalDocumentType[] | null, readonly LegalDocumentType[] | null]>([
    ['solo legado', ['privacy_notice', 'terms_and_conditions'], ['privacy_notice', 'terms_and_conditions'], null],
    ['legado + solo privacy_policy (parcial)', ['privacy_notice', 'terms_and_conditions', 'privacy_policy'], ['privacy_notice', 'terms_and_conditions'], null],
    ['legado + régimen del paciente', ['privacy_notice', 'terms_and_conditions', 'privacy_policy', 'patient_terms'], ['privacy_policy', 'patient_terms'], null],
    ['legado + régimen del médico', ['privacy_notice', 'terms_and_conditions', 'privacy_policy', 'doctor_terms'], ['privacy_notice', 'terms_and_conditions'], ['privacy_policy', 'doctor_terms']],
    ['los cinco tipos', ['privacy_notice', 'terms_and_conditions', 'privacy_policy', 'patient_terms', 'doctor_terms'], ['privacy_policy', 'patient_terms'], ['privacy_policy', 'doctor_terms']],
    ['nada publicado', [], null, null],
    ['doctor_terms sin privacy_policy', ['doctor_terms', 'patient_terms'], null, null],
  ])('[TC-M03-002][D-32] %s', (_case, effective, patient, doctor) => {
    expect(resolveLegalRegime('patient', effective)).toEqual(patient);
    expect(resolveLegalRegime('doctor', effective)).toEqual(doctor);
  });

  it('[TC-M03-003][N1] antes de publicar el régimen nuevo, el paciente con v1 aceptado sigue completo', () => {
    const current = [doc('privacy_notice', true), doc('terms_and_conditions', true)];
    expect(evaluateLegalAcceptance('patient', current)).toEqual({ accepted: true, pending: [] });
  });

  it('[TC-M03-004][N1] una publicación parcial no cambia nada: privacy_policy sin patient_terms no se exige', () => {
    const current = [doc('privacy_notice', true), doc('terms_and_conditions', true), doc('privacy_policy', false)];
    expect(evaluateLegalAcceptance('patient', current)).toEqual({ accepted: true, pending: [] });
  });

  it('[TC-M03-005][N1][RF-04] con el régimen nuevo publicado, el paciente debe aceptarlo; el legado ya no cuenta', () => {
    const current = [
      doc('privacy_notice', true),
      doc('terms_and_conditions', true),
      doc('privacy_policy', false, '2026-10'),
      doc('patient_terms', true, '2026-10'),
    ];
    const status = evaluateLegalAcceptance('patient', current);
    expect(status.accepted).toBe(false);
    expect(status.pending.map((p) => p.type)).toEqual(['privacy_policy']);
  });

  it('[TC-M03-006][D-32] el médico sin régimen publicado no cumple (falla cerrado) y no tiene pendientes que aceptar', () => {
    const current = [doc('privacy_notice', true), doc('terms_and_conditions', true)];
    expect(evaluateLegalAcceptance('doctor', current)).toEqual({ accepted: false, pending: [] });
  });

  it('[TC-M03-007][D-32] el médico solo cuenta privacy_policy + doctor_terms; patient_terms no le afecta', () => {
    const current = [doc('privacy_policy', true), doc('doctor_terms', false), doc('patient_terms', false)];
    const status = evaluateLegalAcceptance('doctor', current);
    expect(status.accepted).toBe(false);
    expect(status.pending.map((p) => p.type)).toEqual(['doctor_terms']);
    expect(evaluateLegalAcceptance('doctor', [doc('privacy_policy', true), doc('doctor_terms', true), doc('patient_terms', false)]).accepted).toBe(true);
  });
});
