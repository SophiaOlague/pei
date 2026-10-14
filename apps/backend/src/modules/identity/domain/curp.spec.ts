import { Curp, CURP_PATTERN, curpCheckDigit, isValidCurp, normalizeCurp } from './curp';
import { CURP_PATTERN as DB_CURP_PATTERN } from '../../../db/schema/identity';
import { InvalidCurpError } from './identity.errors';

// CURP sintéticas (ficticias, con la forma genérica XEXX/XXX), nunca de personas reales.
const VALID = ['XEXX010101HNEXXXA4', 'XAXX990101MASXXX03', 'XIXX850515XDFXXXB8', 'XOXX000229HJCXXX15'];

describe('CURP (M02, DT-22)', () => {
  it.each(VALID)('[TC-M02-001][DT-22] %s sintética con formato y dígito verificador válidos', (value) => {
    expect(isValidCurp(value)).toBe(true);
    expect(Curp.parse(value).value).toBe(value);
  });

  it('[TC-M02-002][DT-22] se normaliza a mayúsculas y sin espacios', () => {
    expect(normalizeCurp('  xexx010101hnexxxa4 ')).toBe('XEXX010101HNEXXXA4');
    expect(Curp.parse(' xexx010101hnexxxa4').value).toBe('XEXX010101HNEXXXA4');
  });

  it.each([
    ['segundo carácter que no es vocal ni X', 'XBXX010101HNEXXXA4'],
    ['mes 13', 'XEXX011301HNEXXXA4'],
    ['día 32', 'XEXX010132HNEXXXA4'],
    ['sexo inválido', 'XEXX010101ZNEXXXA4'],
    ['entidad inexistente', 'XEXX010101HZZXXXA4'],
    ['vocal en las consonantes internas', 'XEXX010101HNEAXXA4'],
    ['dígito verificador no numérico', 'XEXX010101HNEXXXAA'],
    ['17 caracteres', 'XEXX010101HNEXXXA'],
    ['19 caracteres', 'XEXX010101HNEXXXA44'],
    ['caracteres especiales', 'XEXX010101HNEXXX-4'],
  ])('[TC-M02-003][DT-22] formato inválido: %s', (_case, value) => {
    expect(isValidCurp(value)).toBe(false);
    expect(() => Curp.parse(value)).toThrow(InvalidCurpError);
  });

  it('[TC-M02-004][DT-22] dígito verificador incorrecto → inválida aunque el formato sea correcto', () => {
    const wrongDigit = 'XEXX010101HNEXXXA5';
    expect(new RegExp(CURP_PATTERN).test(wrongDigit)).toBe(true);
    expect(isValidCurp(wrongDigit)).toBe(false);
    expect(curpCheckDigit('XEXX010101HNEXXXA')).toBe('4');
  });

  it.each([[undefined], [null], [''], ['   '], [123]])('[TC-M02-005][DT-22] obligatoria: %p → InvalidCurpError', (value) => {
    expect(() => Curp.parse(value)).toThrow(InvalidCurpError);
  });

  it('[TC-M02-006][DT-22] el patrón de la aplicación es idéntico al CHECK de la BD', () => {
    expect(CURP_PATTERN).toBe(DB_CURP_PATTERN);
  });

  it('[TC-M02-007][RNF-10] el error y la serialización no revelan la CURP', () => {
    const curp = Curp.parse(VALID[0]);
    expect(String(curp)).toBe('[CURP]');
    expect(JSON.stringify({ curp })).toBe('{"curp":"[CURP]"}');
    try {
      Curp.parse('XBXX010101HNEXXXA4');
    } catch (error) {
      expect((error as Error).message).not.toContain('XBXX');
    }
  });
});
