import { ORIGINAL_BRANCH } from '../../../../test/support/c2-target-guard';
import { InvalidLegalPublicationError } from './identity.errors';
import {
  CONFIRMATION_TTL_SECONDS,
  PRODUCTION_DATABASE,
  assertPublicationAuthorized,
  assertPublicationConfirmation,
  createPublicationConfirmation,
  planLegalPublication,
  verifyDatabaseTarget,
  type LegalPublicationInput,
  type PublishedVersion,
  type VerifiedDatabaseTarget,
} from './legal-publication';

const NOW = new Date('2026-11-01T00:00:00Z');
const LATER = new Date('2026-11-02T00:00:00Z');
const PAST = new Date('2026-10-01T00:00:00Z');
const DEV: VerifiedDatabaseTarget = { kind: 'development', branch: 'br-dev-uno', endpoint: 'ep-dev-uno', project: 'p' };
const PROD: VerifiedDatabaseTarget = { kind: 'production', ...PRODUCTION_DATABASE, project: 'p' };
const HASH = 'a'.repeat(64);

const version = (type: PublishedVersion['type'], v: string, publishedAt = PAST): PublishedVersion => ({ type, version: v, publishedAt });
const LEGACY = [version('privacy_notice', '1'), version('terms_and_conditions', '1')];

function input(overrides: Partial<LegalPublicationInput> = {}): LegalPublicationInput {
  return {
    audience: 'doctor', documents: [{ type: 'doctor_terms', version: '2', contentHash: HASH }], publishedAt: LATER, now: NOW,
    versions: [...LEGACY, version('privacy_policy', '1'), version('doctor_terms', '1')], usersByRole: { patient: 3, doctor: 2 }, target: DEV, ...overrides,
  };
}
const invalid = (run: () => unknown, message: string) => {
  expect(run).toThrow(InvalidLegalPublicationError);
  expect(run).toThrow(message);
};

describe('Destino de la publicación legal', () => {
  const observed = { branch: 'br-dev-uno', endpoint: 'ep-dev-uno', project: 'p', urlEndpoint: 'ep-dev-uno' };
  const declared = { branch: 'br-dev-uno', endpoint: 'ep-dev-uno' };

  it('[TC-M03-227] la rama de producción coincide con la de la salvaguarda de C2', () => {
    expect(PRODUCTION_DATABASE).toEqual({ ...ORIGINAL_BRANCH });
  });

  it('[TC-M03-228] clasifica desarrollo y producción solo si la BD confirma lo declarado', () => {
    expect(verifyDatabaseTarget(observed, declared).kind).toBe('development');
    const production = { ...PRODUCTION_DATABASE, project: 'p', urlEndpoint: PRODUCTION_DATABASE.endpoint };
    expect(verifyDatabaseTarget(production, PRODUCTION_DATABASE).kind).toBe('production');
  });

  it.each([
    ['sin identidad de Neon', { ...observed, branch: null }, declared, 'No se pudo verificar'],
    ['sin endpoint en la URL', { ...observed, urlEndpoint: null }, declared, 'No se pudo verificar'],
    ['URL de otro endpoint', { ...observed, urlEndpoint: 'ep-otro' }, declared, 'DATABASE_URL'],
    ['destino declarado distinto', observed, { ...declared, branch: 'br-otra' }, 'no coincide'],
    ['rama de producción con otro endpoint', { ...observed, branch: PRODUCTION_DATABASE.branch }, { ...declared, branch: PRODUCTION_DATABASE.branch }, 'ambiguo'],
    ['endpoint de producción con otra rama', { ...observed, endpoint: PRODUCTION_DATABASE.endpoint, urlEndpoint: PRODUCTION_DATABASE.endpoint }, { ...declared, endpoint: PRODUCTION_DATABASE.endpoint }, 'ambiguo'],
  ])('[TC-M03-229] rechaza un destino no verificable: %s', (_c, obs, dec, message) => {
    invalid(() => verifyDatabaseTarget(obs, dec), message);
  });
});

describe('Plan de publicación legal', () => {
  it('[TC-M03-230] evalúa a ambos roles: términos del médico no afectan a pacientes', () => {
    const plan = planLegalPublication(input());
    const [patient, doctor] = plan.roles;
    expect(patient).toMatchObject({ role: 'patient', regimeTransition: false, potentiallyAffectedProfiles: 0, pendingDocuments: [] });
    expect(doctor).toMatchObject({ role: 'doctor', regimeTransition: false, potentiallyAffectedProfiles: 2, pendingDocuments: [{ type: 'doctor_terms', version: '2' }] });
    expect(plan.requirements).toEqual([]);
  });

  it('[TC-M03-231][riesgo 21] patient_terms con privacy_policy vigente: detecta la transición de todos los pacientes', () => {
    const plan = planLegalPublication(input({ audience: 'patient', documents: [{ type: 'patient_terms', version: '1', contentHash: HASH }] }));
    expect(plan.notices).toContain('patient_terms_activates_existing_privacy_policy');
    expect(plan.requirements).toContain('regime_transition');
    expect(plan.roles[0]).toMatchObject({
      regimeBefore: [{ type: 'privacy_notice', version: '1' }, { type: 'terms_and_conditions', version: '1' }],
      regimeAfter: [{ type: 'privacy_policy', version: '1' }, { type: 'patient_terms', version: '1' }],
      regimeTransition: true, potentiallyAffectedProfiles: 3,
    });
  });

  it('[TC-M03-232] una política nueva con pacientes en legado no los cambia y lo avisa', () => {
    const plan = planLegalPublication(input({ documents: [{ type: 'privacy_policy', version: '2', contentHash: HASH }] }));
    expect(plan.roles[0]).toMatchObject({ regimeTransition: false, potentiallyAffectedProfiles: 0 });
    expect(plan.roles[1].potentiallyAffectedProfiles).toBe(2);
    expect(plan.notices).toContain('partial_regime_without_effect');
  });

  it('[TC-M03-233] régimen incompleto: rechaza una publicación parcial', () => {
    invalid(() => planLegalPublication(input({ audience: 'patient', documents: [{ type: 'privacy_policy', version: '2', contentHash: HASH }] })), 'Publicación parcial');
  });

  it('[TC-M03-234] la primera publicación del régimen del médico es una transición', () => {
    const plan = planLegalPublication(input({
      versions: LEGACY, documents: [{ type: 'privacy_policy', version: '1', contentHash: HASH }, { type: 'doctor_terms', version: '1', contentHash: HASH }],
    }));
    expect(plan.roles[1]).toMatchObject({ regimeBefore: null, regimeTransition: true });
    expect(plan.requirements).toEqual(['regime_transition']);
  });

  it('[TC-M03-235] fechas inválidas', () => {
    invalid(() => planLegalPublication(input({ publishedAt: new Date('x') })), 'no es válida');
    invalid(() => planLegalPublication(input({ publishedAt: new Date('2026-10-15T00:00:00Z') })), 'pasada');
    invalid(() => planLegalPublication(input({ publishedAt: new Date('2026-09-01T00:00:00Z'), pastDateReason: 'motivo' })), 'posterior a la versión 1');
    const future = version('doctor_terms', '3', new Date('2026-12-01T00:00:00Z'));
    invalid(() => planLegalPublication(input({ versions: [...input().versions, future] })), 'posterior a la versión 3');
  });

  it('[TC-M03-236] una fecha pasada requiere motivo y queda en el plan', () => {
    const plan = planLegalPublication(input({ publishedAt: new Date('2026-10-15T00:00:00Z'), pastDateReason: 'Corrección aprobada' }));
    expect(plan.pastDateReason).toBe('Corrección aprobada');
    expect(plan.requirements).toContain('past_date');
  });

  it('[TC-M03-237] versión duplicada', () => {
    invalid(() => planLegalPublication(input({ documents: [{ type: 'doctor_terms', version: '1', contentHash: HASH }] })), 'ya existe');
  });

  it('[TC-M03-238] dev-* en producción exige autorización; también si el régimen activa uno vigente', () => {
    const direct = planLegalPublication(input({ target: PROD, documents: [{ type: 'doctor_terms', version: 'dev-2', contentHash: HASH }] }));
    expect(direct.requirements).toEqual(['production_target', 'provisional_in_production']);
    const inherited = planLegalPublication(input({
      target: PROD, audience: 'patient', documents: [{ type: 'patient_terms', version: '1', contentHash: HASH }],
      versions: [...LEGACY, version('privacy_policy', 'dev-1'), version('doctor_terms', 'dev-1')],
    }));
    expect(inherited.requirements).toContain('provisional_in_production');
    expect(planLegalPublication(input({ documents: [{ type: 'doctor_terms', version: 'dev-2', contentHash: HASH }] })).requirements).toEqual([]);
  });

  it('[TC-M03-239] autorizaciones: cada requisito exige su bandera', () => {
    const plan = planLegalPublication(input({ target: PROD, documents: [{ type: 'doctor_terms', version: 'dev-2', contentHash: HASH }] }));
    invalid(() => assertPublicationAuthorized(plan, {}), 'production_target, provisional_in_production');
    invalid(() => assertPublicationAuthorized(plan, { allowProduction: true }), 'provisional_in_production');
    expect(() => assertPublicationAuthorized(plan, { allowProduction: true, allowProvisionalInProduction: true })).not.toThrow();
  });
});

describe('Evaluación temporal de la publicación legal', () => {
  const T2 = new Date('2026-11-10T00:00:00Z');
  const onlyLegacyPlusTerms = [...LEGACY, version('patient_terms', '1', T2)];
  const doctorRegime = [{ type: 'privacy_policy' as const, version: '1', contentHash: HASH }, { type: 'doctor_terms' as const, version: '1', contentHash: HASH }];

  it('[TC-M03-256] H1: una publicación que completa una transición futura de otro rol la identifica y exige autorización', () => {
    const plan = planLegalPublication(input({ versions: onlyLegacyPlusTerms, documents: doctorRegime }));
    expect(plan.roles[0]).toMatchObject({ role: 'patient', regimeTransition: false, potentiallyAffectedProfiles: 0 });
    expect(plan.scheduledChanges).toEqual([expect.objectContaining({
      at: T2, role: 'patient', regimeTransition: true, alteredByPublication: true, potentiallyAffectedProfiles: 3,
      regimeAfter: [{ type: 'privacy_policy', version: '1' }, { type: 'patient_terms', version: '1' }],
    })]);
    expect(plan.requirements).toContain('regime_transition');
    expect(plan.notices).not.toContain('patient_terms_activates_existing_privacy_policy');
  });

  it('[TC-M03-257] variante: una transición programada que esta publicación no altera se informa sin exigir autorización', () => {
    const versions = [...input().versions, version('patient_terms', '1', T2)];
    const plan = planLegalPublication(input({ versions }));
    expect(plan.scheduledChanges).toEqual([expect.objectContaining({ role: 'patient', regimeTransition: true, alteredByPublication: false })]);
    expect(plan.requirements).toEqual([]);
  });

  it('[TC-M03-258] variante: cambiar la política incluida en una transición programada la altera', () => {
    const versions = [...input().versions, version('patient_terms', '1', T2)];
    const plan = planLegalPublication(input({ versions, documents: [{ type: 'privacy_policy', version: '2', contentHash: HASH }] }));
    expect(plan.scheduledChanges).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'patient', alteredByPublication: true })]));
    expect(plan.requirements).toContain('regime_transition');
  });

  it('[TC-M03-259] varias fechas futuras se evalúan en orden', () => {
    const T3 = new Date('2026-11-20T00:00:00Z');
    const versions = [...input().versions, version('patient_terms', '1', T2), version('doctor_terms', '3', T3)];
    const plan = planLegalPublication(input({ versions, documents: [{ type: 'privacy_policy', version: '2', contentHash: HASH }] }));
    expect(plan.scheduledChanges.map((change) => [change.at, change.role])).toEqual([[T2, 'patient'], [T3, 'doctor']]);
  });

  it('[TC-M03-260] fecha pasada: considera versiones de otros tipos vigentes desde entonces', () => {
    const middle = new Date('2026-10-20T00:00:00Z');
    const plan = planLegalPublication(input({
      publishedAt: new Date('2026-10-15T00:00:00Z'), pastDateReason: 'Corrección aprobada', audience: 'patient',
      versions: [...LEGACY, version('privacy_policy', '1', middle), version('doctor_terms', '1', middle)],
      documents: [{ type: 'patient_terms', version: '1', contentHash: HASH }],
    }));
    expect(plan.roles[0]).toMatchObject({ regimeTransition: true, regimeAfter: [{ type: 'privacy_policy', version: '1' }, { type: 'patient_terms', version: '1' }] });
    expect(plan.roles[1]).toMatchObject({ regimeTransition: false, potentiallyAffectedProfiles: 0 });
  });

  it('[TC-M03-261] O5: el aviso de riesgo 21 aparece con una transición futura', () => {
    const versions = [...input().versions, version('patient_terms', '1', T2)];
    expect(planLegalPublication(input({ versions })).notices).toContain('patient_terms_activates_existing_privacy_policy');
  });

  it('[TC-M03-262] el motivo solo aplica a fechas pasadas y no admite correos ni URLs', () => {
    invalid(() => planLegalPublication(input({ pastDateReason: 'motivo' })), 'solo aplica');
    const past = new Date('2026-10-15T00:00:00Z');
    invalid(() => planLegalPublication(input({ publishedAt: past, pastDateReason: 'a@b.mx' })), 'sin correos');
    invalid(() => planLegalPublication(input({ publishedAt: past, pastDateReason: 'https://x' })), 'sin correos');
    invalid(() => planLegalPublication(input({ publishedAt: past, pastDateReason: 'x'.repeat(201) })), 'sin correos');
  });

  it('[TC-M03-263] O1 y O2: versiones provisionales en cualquier capitalización, ya vigentes o programadas', () => {
    const provisional = (changes: Partial<LegalPublicationInput>) => planLegalPublication(input({ target: PROD, ...changes })).requirements.includes('provisional_in_production');
    expect(provisional({ documents: [{ type: 'doctor_terms', version: 'DEV-2', contentHash: HASH }] })).toBe(true);
    expect(provisional({ versions: [...LEGACY, version('privacy_policy', 'dev-1'), version('doctor_terms', '1')] })).toBe(true);
    expect(provisional({ documents: [{ type: 'privacy_policy', version: '2', contentHash: HASH }], versions: [...input().versions, version('doctor_terms', 'Dev-9', T2)] })).toBe(true);
    expect(provisional({})).toBe(false);
  });
});

describe('Confirmación de la publicación legal', () => {
  const plan = planLegalPublication(input());
  const token = createPublicationConfirmation(plan, NOW);

  it('[TC-M03-240] acepta el plan simulado dentro de su vigencia', () => {
    expect(() => assertPublicationConfirmation(plan, token, new Date(NOW.getTime() + 60_000))).not.toThrow();
  });

  it('[TC-M03-241] caduca, y rechaza formatos inválidos', () => {
    invalid(() => assertPublicationConfirmation(plan, token, new Date(NOW.getTime() + (CONFIRMATION_TTL_SECONDS + 1) * 1000)), 'caducó');
    invalid(() => assertPublicationConfirmation(plan, 'abc', NOW), 'formato');
    invalid(() => assertPublicationConfirmation(plan, `${Math.floor(NOW.getTime() / 1000)}.${'0'.repeat(64)}`, NOW), 'cambió');
  });

  it.each<[string, Partial<LegalPublicationInput>]>([
    ['contenido', { documents: [{ type: 'doctor_terms', version: '2', contentHash: 'b'.repeat(64) }] }],
    ['versión', { documents: [{ type: 'doctor_terms', version: '3', contentHash: HASH }] }],
    ['fecha', { publishedAt: new Date(LATER.getTime() + 1000) }],
    ['destino', { target: { ...DEV, endpoint: 'ep-otro' } }],
    ['entorno', { target: PROD }],
    ['vigentes', { versions: [...input().versions.filter((v) => v.type !== 'privacy_policy'), version('privacy_policy', '2')] }],
    ['futuras', { versions: [...input().versions, version('patient_terms', '1', new Date('2026-11-01T12:00:00Z'))] }],
  ])('[TC-M03-242] rechaza si cambió: %s', (_c, change) => {
    invalid(() => assertPublicationConfirmation(planLegalPublication(input(change)), token, NOW), 'cambió');
  });

  it('[TC-M03-264] rechaza si cambian audiencia, motivo, proyecto o cambios programados; no depende del orden de las filas', () => {
    const scheduled = [...input().versions, version('patient_terms', '1', new Date('2026-11-10T00:00:00Z'))];
    const versions = [...input().versions, version('patient_terms', '1')];
    const documents = [{ type: 'privacy_policy' as const, version: '2', contentHash: HASH }];
    const past = { publishedAt: new Date('2026-10-15T00:00:00Z'), documents };
    const stale = (original: Partial<LegalPublicationInput>, changed: Partial<LegalPublicationInput>) =>
      invalid(() => assertPublicationConfirmation(planLegalPublication(input({ ...original, ...changed })), createPublicationConfirmation(planLegalPublication(input(original)), NOW), NOW), 'cambió');
    stale({ versions, documents }, { audience: 'patient' });
    stale({ ...past, pastDateReason: 'Motivo uno' }, { pastDateReason: 'Motivo dos' });
    stale({}, { target: { ...DEV, project: 'otro' } });
    stale({ versions: input().versions, documents }, { versions: scheduled });
    const shuffled = planLegalPublication(input({ versions: [...input().versions].reverse() }));
    expect(() => assertPublicationConfirmation(shuffled, token, NOW)).not.toThrow();
  });

  it('[TC-M03-243] el conteo de usuarios es informativo y no invalida la confirmación', () => {
    expect(() => assertPublicationConfirmation(planLegalPublication(input({ usersByRole: { patient: 9, doctor: 9 } })), token, NOW)).not.toThrow();
  });
});
