import { InvalidCurpError } from './identity.errors';

// CURP (decisión cerrada de M02 y DT-22, opción A): obligatoria, en mayúsculas, con formato RENAPO
// validado aquí y en PostgreSQL (CHECK de 0004_m02_identity) y con dígito verificador validado aquí.
//
// Estructura: 4 letras (la 2.ª, vocal o X), fecha AAMMDD, sexo (H, M o X), entidad federativa (o NE),
// 3 consonantes internas, diferenciador (letra o dígito) y dígito verificador.
// Debe coincidir con CURP_PATTERN de src/db/schema/patient.ts (lo comprueba curp.spec.ts).
export const CURP_PATTERN =
  '^[A-Z][AEIOUX][A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HMX]' +
  '(AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)' +
  '[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$';

const FORMAT = new RegExp(CURP_PATTERN);
const CHECK_DIGIT_DICTIONARY = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

// Algoritmo de RENAPO: suma ponderada (18 - posición) de los primeros 17 caracteres, módulo 10.
export function curpCheckDigit(first17: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += CHECK_DIGIT_DICTIONARY.indexOf(first17[i]) * (18 - i);
  }
  return String((10 - (sum % 10)) % 10);
}

export function normalizeCurp(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCurp(value: string): boolean {
  return FORMAT.test(value) && curpCheckDigit(value.slice(0, 17)) === value[17];
}

export class Curp {
  private constructor(readonly value: string) {
    Object.freeze(this);
  }

  // Normaliza a mayúsculas y valida formato y dígito verificador. El error nunca incluye el valor.
  static parse(raw: unknown): Curp {
    if (typeof raw !== 'string') throw new InvalidCurpError();
    const value = normalizeCurp(raw);
    if (!isValidCurp(value)) throw new InvalidCurpError();
    return new Curp(value);
  }

  // Evita que la CURP aparezca completa por accidente en logs o mensajes.
  toString(): string {
    return '[CURP]';
  }

  toJSON(): string {
    return '[CURP]';
  }
}
