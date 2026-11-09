import { C2_RUN_ID_PATTERN, TEST_PREFIX, testTag } from './test-tag';
import { assertReusableDoctorRegime, type CurrentDoctorRegime } from './doctor-regime';

// Identificadores sintéticos por ejecución (C2_RUN_ID) y régimen legal reutilizable de la rama C2. Sin BD.

describe('testTag (identificadores sintéticos)', () => {
  it('[TC-M03-291] sin C2_RUN_ID conserva el formato anterior; con él lo incluye tras el prefijo y nunca se repite', () => {
    expect(testTag({})).toMatch(new RegExp(`^${TEST_PREFIX}-[0-9a-f-]{36}$`));
    const runId = 'c2-20261103212005-a1b2';
    const [a, b] = [testTag({ C2_RUN_ID: runId }), testTag({ C2_RUN_ID: runId })];
    expect(a).toMatch(new RegExp(`^${TEST_PREFIX}-${runId}-[0-9a-f-]{36}$`));
    expect(a.startsWith(`${TEST_PREFIX}-`)).toBe(true);
    expect(a).not.toBe(b);
    // Los filtros existentes por prefijo (por ejemplo, audit-trail.int-spec) siguen funcionando.
    expect(a.replace(/-/g, '_').replace(/^gst_m00_test_/, 'r')).toMatch(/^rc2_20261103212005_a1b2_/);
  });

  it('[TC-M03-291] un C2_RUN_ID con formato inválido se rechaza (no se usa un identificador ajeno)', () => {
    expect(C2_RUN_ID_PATTERN.test('c2-20261103212005-a1b2')).toBe(true);
    for (const bad of ['otra-ejecucion', 'c2-2026-a1b2', "c2-20261103212005-a1b2'; drop"]) {
      expect(() => testTag({ C2_RUN_ID: bad })).toThrow();
    }
  });
});

describe('Régimen legal del médico reutilizable en la rama C2', () => {
  const now = new Date('2026-11-03T21:20:00Z');
  const regime = (overrides: Partial<CurrentDoctorRegime> = {}): CurrentDoctorRegime => ({
    documents: [
      { type: 'doctor_terms', id: 'd1', version: 'dev-1', publishedAt: '2026-10-27 23:32:24+00' },
      { type: 'privacy_policy', id: 'p1', version: 'dev-1', publishedAt: '2026-10-27 23:32:24+00' },
    ],
    nextScheduledAt: '2027-11-03 00:04:48+00',
    totalLegalDocuments: 8,
    ...overrides,
  });

  it('[TC-M03-292] se reutiliza si existen privacy_policy y doctor_terms vigentes y nada entra en vigor durante la ejecución', () => {
    expect(() => assertReusableDoctorRegime(regime(), now)).not.toThrow();
    expect(() => assertReusableDoctorRegime(regime({ nextScheduledAt: null }), now)).not.toThrow();
  });

  it.each([
    ['sin privacy_policy vigente', { documents: [{ type: 'doctor_terms' as const, id: 'd1', version: 'dev-1', publishedAt: 'x' }] }],
    ['sin documentos vigentes', { documents: [] }],
    ['una publicación programada entra en vigor en menos de 24 h', { nextScheduledAt: '2026-11-04 08:00:00+00' }],
  ])('[TC-M03-292] se detiene con un error claro (sin publicar): %s', (_label, overrides) => {
    expect(() => assertReusableDoctorRegime(regime(overrides), now)).toThrow(/no publica documentos|no sería estable/);
  });
});
