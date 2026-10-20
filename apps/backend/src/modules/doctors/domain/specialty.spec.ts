import { assertActivationChange, parseSpecialtyCode, parseSpecialtyName } from './specialty';
import { InvalidSpecialtyCodeError, InvalidSpecialtyNameError, SpecialtyAlreadyInStateError } from './doctor.errors';

describe('Especialidad: reglas de dominio (M03 B1)', () => {
  it.each(['infectologia', 'medicina_general', 'ab', 'a'.repeat(50), 'cardio2'])(
    '[TC-M03-085][D-5] code válido: %s',
    (code) => expect(parseSpecialtyCode(code)).toBe(code),
  );

  it.each(['a', 'a'.repeat(51), 'Cardio', '2cardio', '_cardio', 'cardio-logia', 'cardio logia', 'cardiología'])(
    '[TC-M03-085][D-5] code inválido: %p',
    (code) => expect(() => parseSpecialtyCode(code)).toThrow(InvalidSpecialtyCodeError),
  );

  it('[TC-M03-086][R-4] el nombre se recorta y debe tener de 1 a 100 caracteres', () => {
    expect(parseSpecialtyName('  Cardiología  ')).toBe('Cardiología');
    expect(parseSpecialtyName('x'.repeat(100))).toHaveLength(100);
    expect(() => parseSpecialtyName('   ')).toThrow(InvalidSpecialtyNameError);
    expect(() => parseSpecialtyName('x'.repeat(101))).toThrow(InvalidSpecialtyNameError);
  });

  it('[TC-M03-087][Z-2] cambiar al mismo estado es un conflicto', () => {
    expect(() => assertActivationChange(true, false)).not.toThrow();
    expect(() => assertActivationChange(false, true)).not.toThrow();
    expect(() => assertActivationChange(true, true)).toThrow(SpecialtyAlreadyInStateError);
    expect(() => assertActivationChange(false, false)).toThrow(SpecialtyAlreadyInStateError);
  });
});
