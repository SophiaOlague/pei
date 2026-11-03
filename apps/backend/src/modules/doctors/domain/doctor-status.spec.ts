import { deriveDoctorStatus, deriveLineStatus, isOperational, type DoctorStatusSnapshot, type LineStatus, type ReviewSnapshot } from './doctor-status';

// M03 B4 (diseño v3 §D): estado derivado. Sin BD.

const complete = (): DoctorStatusSnapshot => ({
  hasDoctorProfile: true,
  legalNameComplete: true,
  curpValid: true,
  specialtyAssigned: true,
  identityRevision: 1,
  professionalRevision: 1,
  identityReviews: [],
  licenseReviews: [],
  legalAccepted: true,
});

// Una línea con una revisión vigente en el estado pedido (o ninguna para `required`).
const line = (status: LineStatus, revision = 1): ReviewSnapshot[] => (status === 'required' ? [] : [{ attempt: 1, revision, status }]);
const snap = (identity: LineStatus, professional: LineStatus, extra: Partial<DoctorStatusSnapshot> = {}): DoctorStatusSnapshot => ({
  ...complete(),
  identityReviews: line(identity),
  licenseReviews: line(professional),
  ...extra,
});

describe('Revisión vigente de una línea (diseño v3 §D.1)', () => {
  it('[TC-M03-104][R-7] sin revisiones → required; la vigente es la de mayor intento que no está superseded', () => {
    expect(deriveLineStatus([], 1)).toBe('required');
    const reviews: ReviewSnapshot[] = [
      { attempt: 1, revision: 1, status: 'rejected' },
      { attempt: 2, revision: 1, status: 'pending' },
    ];
    expect(deriveLineStatus(reviews, 1)).toBe('pending');
    expect(deriveLineStatus([...reviews, { attempt: 3, revision: 1, status: 'superseded' }], 1)).toBe('pending');
  });

  it('[TC-M03-105][R-2][E.5] una revisión de una versión anterior no cuenta; una superseded tampoco', () => {
    expect(deriveLineStatus([{ attempt: 1, revision: 4, status: 'approved' }], 5)).toBe('required');
    expect(deriveLineStatus([{ attempt: 1, revision: 1, status: 'superseded' }], 1)).toBe('required');
  });
});

describe('Escenarios del diseño v3 §D.5', () => {
  // [#, snapshot, identidad, profesional, registrationComplete, estado administrativo] (Z-1 enmendada por D-38)
  const cases: [number, string, DoctorStatusSnapshot, LineStatus, LineStatus, boolean, string][] = [
    [1, 'perfil creado; nada enviado', snap('required', 'required'), 'required', 'required', false, 'pending'],
    [2, 'todo enviado', snap('pending', 'pending'), 'pending', 'pending', true, 'pending'],
    [3, 'solo la INE aprobada', snap('approved', 'pending'), 'approved', 'pending', true, 'pending'],
    [4, 'ambas aprobadas', snap('approved', 'approved'), 'approved', 'approved', true, 'approved'],
    [5, 'INE rechazada y cédula aprobada', snap('rejected', 'approved'), 'rejected', 'approved', true, 'rejected'],
    [6, 'INE rechazada y cédula pendiente', snap('rejected', 'pending'), 'rejected', 'pending', true, 'pending'],
    [7, 'INE reenviada tras un rechazo', snap('approved', 'approved', { identityReviews: [{ attempt: 1, revision: 1, status: 'rejected' }, { attempt: 2, revision: 1, status: 'pending' }] }), 'pending', 'approved', true, 'pending'],
    [8, 'aprobado que cambia la CURP', snap('approved', 'approved', { identityRevision: 2 }), 'required', 'approved', false, 'pending'],
    [9, 'aprobado que cambia el nombre legal', snap('approved', 'approved', {
      identityRevision: 2, professionalRevision: 2,
      licenseReviews: [{ attempt: 1, revision: 1, status: 'approved' }, { attempt: 2, revision: 2, status: 'pending' }],
    }), 'required', 'pending', false, 'pending'],
    [10, 'aprobado que cambia la especialidad', snap('approved', 'approved', {
      professionalRevision: 2,
      licenseReviews: [{ attempt: 1, revision: 1, status: 'approved' }, { attempt: 2, revision: 2, status: 'pending' }],
    }), 'approved', 'pending', true, 'pending'],
    [11, 'aprobado con doctor_terms v2 publicada', snap('approved', 'approved', { legalAccepted: false }), 'approved', 'approved', false, 'approved'],
    [12, 'especialidad desactivada por el admin (sigue asignada)', snap('approved', 'approved', { specialtyAssigned: true }), 'approved', 'approved', true, 'approved'],
    [13, 'legales sin aceptar; todo enviado', snap('pending', 'pending', { legalAccepted: false }), 'pending', 'pending', false, 'pending'],
    [14, 'ambas rechazadas', snap('rejected', 'rejected'), 'rejected', 'rejected', true, 'rejected'],
    [15, 'aprobación de la versión 4 que pierde contra la 5', snap('approved', 'approved', {
      professionalRevision: 5,
      licenseReviews: [{ attempt: 4, revision: 4, status: 'approved' }, { attempt: 5, revision: 5, status: 'pending' }],
    }), 'approved', 'pending', true, 'pending'],
    [16, 'INE rechazada; cédula sin enviar', snap('rejected', 'required'), 'rejected', 'required', false, 'rejected'],
    [17, 'ambas aprobadas; legales sin aceptar', snap('approved', 'approved', { legalAccepted: false }), 'approved', 'approved', false, 'approved'],
    [18, 'aprobado que cambia la CURP con la cédula rechazada', snap('approved', 'rejected', { identityRevision: 2 }), 'required', 'rejected', false, 'rejected'],
  ];

  it.each(cases)('[TC-M03-106][R-7][Z-1] escenario %i: %s', (_n, _label, s, identity, professional, registrationComplete, status) => {
    expect(deriveDoctorStatus(s)).toMatchObject({ identity, professional, registrationComplete, status });
  });

  it('[TC-M03-107][R-2][E.5] escenario 15 sin la revisión 5: la aprobación de la 4 no vigente deja la línea required y el estado pending', () => {
    const s = snap('approved', 'approved', { professionalRevision: 5, licenseReviews: [{ attempt: 4, revision: 4, status: 'approved' }] });
    expect(deriveDoctorStatus(s)).toMatchObject({ professional: 'required', registrationComplete: false, status: 'pending' });
  });
});

describe('Regla global Z-1: las 32 combinaciones (diseño v3 §D.3)', () => {
  const lines: LineStatus[] = ['required', 'pending', 'approved', 'rejected'];
  // D-38: el estado administrativo solo depende de las líneas; la aceptación legal no interviene.
  const expected = (i: LineStatus, p: LineStatus) => {
    if (i === 'pending' || p === 'pending') return 'pending';
    if (i === 'rejected' || p === 'rejected') return 'rejected';
    if (i === 'approved' && p === 'approved') return 'approved';
    return 'pending';
  };
  const combos = lines.flatMap((i) => lines.flatMap((p) => [true, false].map((legal) => [i, p, legal] as const)));

  it('[TC-M03-108][Z-1] hay exactamente 32 combinaciones', () => expect(combos).toHaveLength(32));

  it.each(combos)('[TC-M03-108][Z-1] identidad %s, profesional %s, legales aceptados %s', (i, p, legal) => {
    const result = deriveDoctorStatus(snap(i, p, { legalAccepted: legal }));
    const complete = i !== 'required' && p !== 'required' && legal;
    expect(result.registrationComplete).toBe(complete);
    expect(result.status).toBe(expected(i, p));
    expect(result.legalAccepted).toBe(legal);
    // D-38: habilitación = aprobación administrativa y registro completo (aceptación legal vigente incluida).
    expect(result.canOperate).toBe(expected(i, p) === 'approved' && complete);
    expect(isOperational(result)).toBe(result.canOperate);
  });

  it('[TC-M03-108][D-38] el estado administrativo es el mismo con y sin aceptación legal', () => {
    for (const [i, p] of lines.flatMap((a) => lines.map((b) => [a, b] as const))) {
      expect(deriveDoctorStatus(snap(i, p, { legalAccepted: false })).status).toBe(deriveDoctorStatus(snap(i, p)).status);
    }
  });
});

describe('Secuencias del diseño v3 §D.4', () => {
  it('[TC-M03-109][D-27][R-7] rechazo, reenvío y aprobación', () => {
    const ine1 = { attempt: 1, revision: 1 };
    const lic1 = { attempt: 1, revision: 1 };
    const steps: [ReviewSnapshot[], ReviewSnapshot[], string][] = [
      [[{ ...ine1, status: 'pending' }], [{ ...lic1, status: 'pending' }], 'pending'],
      [[{ ...ine1, status: 'pending' }], [{ ...lic1, status: 'approved' }], 'pending'],
      [[{ ...ine1, status: 'rejected' }], [{ ...lic1, status: 'approved' }], 'rejected'],
      [[{ ...ine1, status: 'rejected' }, { attempt: 2, revision: 1, status: 'pending' }], [{ ...lic1, status: 'approved' }], 'pending'],
      [[{ ...ine1, status: 'rejected' }, { attempt: 2, revision: 1, status: 'approved' }], [{ ...lic1, status: 'approved' }], 'approved'],
    ];
    expect(steps.map(([identityReviews, licenseReviews]) => deriveDoctorStatus({ ...complete(), identityReviews, licenseReviews }).status)).toEqual(steps.map(([, , s]) => s));
  });

  it('[TC-M03-110][Z-1] revisiones mixtas: rechazo de INE con cambio de especialidad', () => {
    const ineRejected: ReviewSnapshot[] = [{ attempt: 1, revision: 1, status: 'rejected' }];
    const lic = (status: 'pending' | 'approved'): ReviewSnapshot[] => [{ attempt: 1, revision: 1, status: 'approved' }, { attempt: 2, revision: 2, status }];
    const at = (identityReviews: ReviewSnapshot[], licenseReviews: ReviewSnapshot[], professionalRevision: number) =>
      deriveDoctorStatus({ ...complete(), identityReviews, licenseReviews, professionalRevision }).status;
    expect(at(ineRejected, [{ attempt: 1, revision: 1, status: 'approved' }], 1)).toBe('rejected');
    expect(at(ineRejected, lic('pending'), 2)).toBe('pending');
    expect(at(ineRejected, lic('approved'), 2)).toBe('rejected');
    expect(at([...ineRejected, { attempt: 2, revision: 1, status: 'pending' }], lic('approved'), 2)).toBe('pending');
    expect(at([...ineRejected, { attempt: 2, revision: 1, status: 'approved' }], lic('approved'), 2)).toBe('approved');
  });

  it('[TC-M03-111][R-13][D-38] una versión legal nueva conserva la aprobación y quita la habilitación; al aceptarla la recupera sin nueva revisión', () => {
    expect(deriveDoctorStatus(snap('approved', 'approved', { legalAccepted: false }))).toMatchObject({
      status: 'approved', registrationComplete: false, legalAccepted: false, canOperate: false, missing: ['legal'],
    });
    // Mismas revisiones (ninguna nueva): solo cambia la aceptación.
    expect(deriveDoctorStatus(snap('approved', 'approved'))).toMatchObject({
      status: 'approved', registrationComplete: true, legalAccepted: true, canOperate: true, missing: [],
    });
  });

  it('[TC-M03-273][D-38] aceptar los legales no aprueba: pendiente o rechazado no operan', () => {
    for (const [i, p] of [['pending', 'approved'], ['rejected', 'approved'], ['approved', 'required']] as const) {
      expect(deriveDoctorStatus(snap(i, p))).toMatchObject({ legalAccepted: true, canOperate: false });
    }
  });
});

describe('registrationComplete y missing (diseño v3 §D.2; plan v2 §7bis.2)', () => {
  it('[TC-M03-112][D-24][D-30] una revisión rechazada cuenta como entregada; la falta de perfil completo se reporta como profile', () => {
    expect(deriveDoctorStatus(snap('rejected', 'rejected')).registrationComplete).toBe(true);
    for (const field of ['legalNameComplete', 'curpValid', 'specialtyAssigned'] as const) {
      // D-38: el perfil incompleto no cambia el estado administrativo, pero impide operar.
      expect(deriveDoctorStatus(snap('approved', 'approved', { [field]: false }))).toMatchObject({ registrationComplete: false, missing: ['profile'], status: 'approved', canOperate: false });
    }
  });

  it('[TC-M03-113][D-31] missing distingue primer envío de reenvío por línea', () => {
    expect(deriveDoctorStatus(snap('required', 'required')).missing).toEqual(['identity_submission', 'license_submission']);
    // Tras cambiar la CURP y el nombre (versiones nuevas con historial previo): reenvío.
    const changed = snap('approved', 'approved', { identityRevision: 2, professionalRevision: 2 });
    expect(deriveDoctorStatus(changed).missing).toEqual(['identity_resubmission', 'license_resubmission']);
  });

  it('[TC-M03-114][D-31] sin perfil de médico: solo profile y legal; las líneas no se evalúan', () => {
    const none = { ...complete(), hasDoctorProfile: false, legalNameComplete: false, curpValid: false, specialtyAssigned: false, legalAccepted: false };
    expect(deriveDoctorStatus(none)).toEqual({ status: 'pending', identity: 'required', professional: 'required', registrationComplete: false, legalAccepted: false, canOperate: false, missing: ['profile', 'legal'] });
  });
});
