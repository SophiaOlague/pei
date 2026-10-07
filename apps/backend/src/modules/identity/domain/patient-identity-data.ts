import { Curp } from './curp';
import { InvalidBirthDateError } from './identity.errors';

// Datos de identidad del paciente (DP-12): nombre legal, fecha de nacimiento y CURP.
// Se fijan al crear el perfil y M02 no ofrece forma de modificarlos (DT-15): este objeto no tiene
// métodos de modificación y está congelado.
export interface PatientIdentityData {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: string; // AAAA-MM-DD
  readonly curp: Curp;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseBirthDate(raw: string, today: Date): string {
  const match = ISO_DATE.exec(raw ?? '');
  if (!match) throw new InvalidBirthDateError();
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isRealDate = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (!isRealDate || date.getTime() >= startOfToday) throw new InvalidBirthDateError();
  return raw;
}

export function createPatientIdentityData(
  input: { firstName: string; lastName: string; birthDate: string; curp: string },
  today: Date,
): PatientIdentityData {
  return Object.freeze({
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    birthDate: parseBirthDate(input.birthDate, today),
    curp: Curp.parse(input.curp),
  });
}
