import {
  composeRegistrationStatus,
  composesRegistrationStatus,
  computeRegistrationStatus,
  type CurrentLegalDocument,
  type RegistrationSnapshot,
} from './registration-status';

const legal = (privacyAccepted: boolean, termsAccepted: boolean): CurrentLegalDocument[] => [
  { type: 'privacy_notice', documentId: '00000000-0000-4000-8000-000000000001', version: 'v2', accepted: privacyAccepted },
  { type: 'terms_and_conditions', documentId: '00000000-0000-4000-8000-000000000002', version: 'v3', accepted: termsAccepted },
];

const snapshot = (overrides: Partial<RegistrationSnapshot> = {}): RegistrationSnapshot => ({
  role: 'patient',
  hasPatientProfile: true,
  currentLegalDocuments: legal(true, true),
  latestIdentityVerification: { status: 'approved', rejectionReason: null },
  ...overrides,
});

describe('Estado del registro del paciente (DP-8, DT-17, DT-21)', () => {
  it('[TC-M02-010][DP-8] perfil + legales vigentes + identidad aprobada → registro completo y puede agendar', () => {
    const status = computeRegistrationStatus(snapshot());
    expect(status).toEqual({
      profileCompleted: true,
      legal: { accepted: true, pending: [] },
      identity: { status: 'approved', rejectionReason: null },
      registrationComplete: true,
      canBookAppointments: true,
      missing: [],
    });
  });

  it.each([
    ['cuenta sin perfil', { role: null, hasPatientProfile: false, currentLegalDocuments: legal(false, false), latestIdentityVerification: null }, ['profile', 'legal', 'identity_submission']],
    ['perfil sin legales', { currentLegalDocuments: legal(false, false), latestIdentityVerification: null }, ['legal', 'identity_submission']],
    ['legales sin INE', { latestIdentityVerification: null }, ['identity_submission']],
    ['INE pendiente', { latestIdentityVerification: { status: 'pending' as const, rejectionReason: null } }, ['identity_review']],
    ['INE rechazada', { latestIdentityVerification: { status: 'rejected' as const, rejectionReason: 'Imagen ilegible' } }, ['identity_resubmission']],
    ['nueva versión legal sin aceptar', { currentLegalDocuments: legal(true, false) }, ['legal']],
  ])('[TC-M02-011][DP-8] %s → incompleto, missing correcto', (_case, overrides, missing) => {
    const status = computeRegistrationStatus(snapshot(overrides as Partial<RegistrationSnapshot>));
    expect(status.registrationComplete).toBe(false);
    expect(status.canBookAppointments).toBe(false);
    expect(status.missing).toEqual(missing);
  });

  it('[TC-M02-012][DP-8] el motivo del rechazo solo se expone cuando el último envío está rechazado', () => {
    expect(computeRegistrationStatus(snapshot({ latestIdentityVerification: { status: 'rejected', rejectionReason: 'Imagen ilegible' } })).identity)
      .toEqual({ status: 'rejected', rejectionReason: 'Imagen ilegible' });
    expect(computeRegistrationStatus(snapshot({ latestIdentityVerification: { status: 'approved', rejectionReason: 'x' } })).identity.rejectionReason)
      .toBeNull();
  });

  it('[TC-M02-013][DP-8] la versión pendiente de aceptar aparece en legal.pending', () => {
    const status = computeRegistrationStatus(snapshot({ currentLegalDocuments: legal(true, false) }));
    expect(status.legal.pending).toEqual([
      { type: 'terms_and_conditions', documentId: '00000000-0000-4000-8000-000000000002', version: 'v3' },
    ]);
  });

  it('[TC-M02-014][DP-8] falla cerrado: sin un tipo legal publicado, los legales no cuentan como aceptados', () => {
    const status = computeRegistrationStatus(snapshot({ currentLegalDocuments: [legal(true, true)[0]] }));
    expect(status.legal.accepted).toBe(false);
    expect(status.registrationComplete).toBe(false);
  });

  it('[TC-M03-008][N1][RF-04] al publicarse el régimen nuevo, el paciente con v1 aceptado queda con missing legal', () => {
    const transition = [
      ...legal(true, true),
      { type: 'privacy_policy', documentId: '00000000-0000-4000-8000-000000000003', version: '2026-10', accepted: false },
      { type: 'patient_terms', documentId: '00000000-0000-4000-8000-000000000004', version: '2026-10', accepted: false },
    ] as const;
    const status = computeRegistrationStatus(snapshot({ currentLegalDocuments: [...transition] }));
    expect(status.legal.accepted).toBe(false);
    expect(status.legal.pending.map((p) => p.type)).toEqual(['privacy_policy', 'patient_terms']);
    expect(status.missing).toContain('legal');
    expect(status.registrationComplete).toBe(false);
  });

  it('[TC-M03-009][N1] doctor_terms publicado no afecta al paciente', () => {
    const withDoctorTerms = [
      ...legal(true, true),
      { type: 'doctor_terms', documentId: '00000000-0000-4000-8000-000000000005', version: '2026-10', accepted: false },
    ] as const;
    expect(computeRegistrationStatus(snapshot({ currentLegalDocuments: [...withDoctorTerms] })).legal).toEqual({ accepted: true, pending: [] });
  });

  it.each(['doctor', 'admin', 'organization'] as const)('[TC-M02-015][DT-21] rol %s → no puede agendar ni tiene registro de paciente completo', (role) => {
    const status = computeRegistrationStatus(snapshot({ role }));
    expect(status.profileCompleted).toBe(false);
    expect(status.canBookAppointments).toBe(false);
  });
});

describe('Estado del registro compuesto por rol (M03 A4)', () => {
  it.each([
    ['completo', {}],
    ['cuenta sin perfil', { role: null, hasPatientProfile: false, currentLegalDocuments: legal(false, false), latestIdentityVerification: null }],
    ['INE rechazada', { latestIdentityVerification: { status: 'rejected' as const, rejectionReason: 'Imagen ilegible' } }],
  ])('[TC-M03-060][M02-6][D-31] paciente (%s): el estado compuesto es idéntico al del paciente', (_case, overrides) => {
    const s = snapshot(overrides as Partial<RegistrationSnapshot>);
    expect(composeRegistrationStatus(s)).toEqual(computeRegistrationStatus(s));
  });

  it('[TC-M03-061][M02-6][D-A4-2] médico → null hasta la fase B, aunque tenga legales aceptados', () => {
    expect(composeRegistrationStatus(snapshot({ role: 'doctor', hasPatientProfile: false }))).toBeNull();
  });

  it.each(['admin', 'organization'] as const)('[TC-M03-062][M02-6][D-A4-2] %s → null: no tiene registro', (role) => {
    expect(composeRegistrationStatus(snapshot({ role, hasPatientProfile: false }))).toBeNull();
  });

  it('[TC-M03-063][M02-6] solo el paciente y la cuenta sin perfil componen estado', () => {
    expect([null, 'patient', 'doctor', 'admin', 'organization'].filter((r) => composesRegistrationStatus(r as never))).toEqual([
      null,
      'patient',
    ]);
  });
});
