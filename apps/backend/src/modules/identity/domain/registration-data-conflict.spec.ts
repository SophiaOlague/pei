import { RegistrationDataConflictError } from './identity.errors';

describe('RegistrationDataConflictError (M03 A3, D-17)', () => {
  it('[TC-M03-051][D-17] la causa es interna: no es enumerable, no está en details ni en la serialización', () => {
    const error = new RegistrationDataConflictError('curp');
    expect(error.conflictField).toBe('curp');
    expect(error.kind).toBe('conflict');
    expect(error.details).toBeUndefined();
    expect(Object.keys(error)).not.toContain('conflictField');
    expect(JSON.stringify(error)).not.toMatch(/curp/i);
    expect(error.message).toBe('No fue posible completar el registro con los datos proporcionados');
    expect(new RegistrationDataConflictError('license_number').message).toBe(error.message);
  });
});
