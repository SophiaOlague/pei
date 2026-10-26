import { InvalidSpecialtyCodeError, InvalidSpecialtyNameError, SpecialtyAlreadyInStateError } from './doctor.errors';

// M03 D-5, D-26, D-33, R-4, Z-2: reglas del catálogo de especialidades.
// `code` es inmutable (solo se valida al crear); `name` es el nombre visible y el admin lo edita.

export const SPECIALTY_CODE_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;
export const SPECIALTY_NAME_MAX = 100;

export function parseSpecialtyCode(value: string): string {
  if (typeof value !== 'string' || !SPECIALTY_CODE_PATTERN.test(value)) throw new InvalidSpecialtyCodeError();
  return value;
}

// Se guarda sin espacios a los lados; la unicidad sin distinguir mayúsculas la garantiza specialty_name_lower_uq.
export function parseSpecialtyName(value: string): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length < 1 || name.length > SPECIALTY_NAME_MAX) throw new InvalidSpecialtyNameError();
  return name;
}

// Z-2: desactivar una inactiva o activar una activa responde 409 y no genera evento.
// Activar o desactivar nunca cambia el estado de los médicos que ya la tienen (D-33).
export function assertActivationChange(isActive: boolean, target: boolean): void {
  if (isActive === target) throw new SpecialtyAlreadyInStateError();
}
