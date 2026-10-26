import { registeredPendingFailures, type DoctorStatusBody, type MeBody } from './flow-checks';

describe('M03 flujo de registro: comprobación del estado tras registrarse (flow-checks)', () => {
  const status = (): DoctorStatusBody => ({ status: 'pending', identity: 'pending', professional: 'pending', registrationComplete: true, missing: [] });
  const me = (canOperate?: unknown): MeBody => ({ role: 'doctor', registrationStatus: { status: 'pending', ...(canOperate === undefined ? {} : { canOperate }) } });

  it('[TC-M03-193][D-13] acepta canOperate=false leído de GET /me (registrationStatus.canOperate)', () => {
    expect(registeredPendingFailures(status(), me(false))).toEqual([]);
  });

  it.each([
    ['true', true],
    ['ausente', undefined],
    ['null', null],
    ['texto "false"', 'false'],
  ])('[TC-M03-194][D-13] falla si canOperate en GET /me es %s', (_name, value) => {
    expect(registeredPendingFailures(status(), me(value))).toContain('registrationStatus.canOperate de /me no es false');
  });

  it('[TC-M03-195][D-13] falla si /me no trae registrationStatus, aunque /me/doctor/status trajera canOperate', () => {
    const withLegacy = { ...status(), canOperate: false } as DoctorStatusBody;
    expect(registeredPendingFailures(withLegacy, { role: 'doctor', registrationStatus: null })).toContain('registrationStatus.canOperate de /me no es false');
  });

  it.each([
    ['aprobado', { status: 'approved' }],
    ['identidad requerida', { identity: 'required' }],
    ['registro incompleto', { registrationComplete: false }],
    ['falta legal', { missing: ['legal'] }],
  ])('[TC-M03-196][Z-1] falla si el estado derivado no es el esperado (%s)', (_name, change) => {
    expect(registeredPendingFailures({ ...status(), ...change }, me(false)).length).toBeGreaterThan(0);
  });

  it('[TC-M03-197][D-31] falla si el rol de /me no es doctor', () => {
    expect(registeredPendingFailures(status(), { ...me(false), role: 'patient' })).toContain('el rol de /me no es doctor');
  });
});
