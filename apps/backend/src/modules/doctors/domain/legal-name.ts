import { InvalidLegalNameError } from './doctor.errors';

// M03 D-9, D-28 (diseño v3 §C): nombre legal del médico (first_name y last_name de user_profile), de 1 a 100
// caracteres cada parte, sin espacios en los extremos.
export const LEGAL_NAME_PART_MAX = 100;

export interface LegalName {
  firstName: string;
  lastName: string;
}

function part(value: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 1 || text.length > LEGAL_NAME_PART_MAX) throw new InvalidLegalNameError();
  return text;
}

export function parseLegalName(input: LegalName): LegalName {
  return { firstName: part(input.firstName), lastName: part(input.lastName) };
}

// Hay cambio del nombre legal si alguna parte difiere después de normalizar.
export function legalNameChanged(current: LegalName, next: Partial<LegalName>): boolean {
  return (next.firstName !== undefined && part(next.firstName) !== current.firstName) || (next.lastName !== undefined && part(next.lastName) !== current.lastName);
}
