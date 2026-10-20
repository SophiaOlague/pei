import { EXPECTED_REVIEW_AUDIT, EXPECTED_STATES, exposesObjectKeys, stateFailures, type ReviewStage } from './review-checks';

describe('M03 revisión del admin: estados esperados por paso (review-checks)', () => {
  const stages = Object.keys(EXPECTED_STATES) as ReviewStage[];

  it.each(stages)('[TC-M03-198][Z-1] acepta exactamente el estado esperado en %s', (stage) => {
    expect(stateFailures(stage, { ...EXPECTED_STATES[stage], missing: [] })).toEqual([]);
  });

  it('[TC-M03-199][D-13][D-30] solo el estado final puede operar; los rechazos cuentan como entregados', () => {
    expect(stages.filter((s) => EXPECTED_STATES[s].canOperate)).toEqual(['aprobado']);
    expect(stages.every((s) => EXPECTED_STATES[s].registrationComplete === true)).toBe(true);
    expect(EXPECTED_STATES.cedula_rechazada.status).toBe('rejected');
  });

  it.each([
    ['canOperate true antes de aprobar', 'ine_aprobada', { canOperate: true }],
    ['canOperate ausente', 'aprobado', { canOperate: undefined }],
    ['canOperate texto', 'aprobado', { canOperate: 'true' }],
    ['estado global distinto', 'cedula_rechazada', { status: 'pending' }],
    ['línea profesional distinta', 'cedula_reenviada', { professional: 'rejected' }],
    ['registro incompleto', 'aprobado', { registrationComplete: false }],
    ['algo pendiente', 'aprobado', { missing: ['license_resubmission'] }],
  ] as const)('[TC-M03-200][Z-1] falla si %s', (_name, stage, change) => {
    expect(stateFailures(stage, { ...EXPECTED_STATES[stage], ...change }).length).toBeGreaterThan(0);
  });

  it('[TC-M03-201][R-8] los eventos esperados son exactamente cinco (con la vuelta a pending) y ninguno es de lectura de documentos', () => {
    expect(EXPECTED_REVIEW_AUDIT).toHaveLength(5);
    expect(EXPECTED_REVIEW_AUDIT).toContain('doctor.status.returned_to_pending');
    expect(EXPECTED_REVIEW_AUDIT.some((a) => a.endsWith('_document.viewed'))).toBe(false);
  });

  it('[TC-M03-202][R-7] detecta claves de objetos y URLs firmadas en una respuesta', () => {
    expect(exposesObjectKeys({ status: 'approved', attempt: 1 })).toBe(false);
    expect(exposesObjectKeys({ key: 'doctor-identity/abc/front.jpg' })).toBe(true);
    expect(exposesObjectKeys({ url: 'https://x.r2.cloudflarestorage.com/b?X-Amz-Signature=1' })).toBe(true);
  });
});
