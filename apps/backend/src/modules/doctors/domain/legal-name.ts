import { InvalidLegalNameError } from './doctor.errors';

// M03 (diseño v3 §C), RN-138 (C-16): nombre legal del médico, que se captura solo al registrarse (first_name y last_name de user_profile), de 1 a 100
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
