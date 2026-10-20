import { InvalidLicenseNumberError } from './doctor.errors';

// M03 R-6: número de cédula, string de 1 a 20 caracteres [0-9A-Za-z-]; validación solo sintáctica (RN-005: la
// verificación es manual). El mismo patrón está en la BD (doctor_profile_license_number_format_chk).
export const LICENSE_NUMBER_REGEX = /^[0-9A-Za-z-]{1,20}$/;

export function parseLicenseNumber(value: string): string {
  const number = typeof value === 'string' ? value.trim() : '';
  if (!LICENSE_NUMBER_REGEX.test(number)) throw new InvalidLicenseNumberError();
  return number;
}
