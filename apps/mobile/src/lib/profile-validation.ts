import type { PatientProfileInput } from "@/lib/api";

// Validación previa al envío de POST /me/patient-profile. Replica las reglas del backend para avisar antes;
// la fuente de verdad sigue siendo el backend (RegisterPatientProfileDto, domain/curp.ts y
// domain/patient-identity-data.ts).

// Mismo formato que CURP_PATTERN del backend (domain/curp.ts). El dígito verificador lo valida el backend.
const CURP_FORMAT =
  /^[A-Z][AEIOUX][A-Z]{2}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z0-9][0-9]$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAME_MAX_LENGTH = 100;

// Igual que parseBirthDate del backend: fecha real y anterior al inicio del día de hoy, ambos en UTC.
export function isValidBirthDate(raw: string, today: Date): boolean {
  const match = ISO_DATE.exec(raw);
  if (!match) {
    return false;
  }
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isRealDate =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  const startOfToday = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  return isRealDate && date.getTime() < startOfToday;
}

export type ProfileValidation =
  | { ok: true; value: PatientProfileInput }
  | { ok: false; message: string };

// Normaliza (recorta los textos, CURP en mayúsculas) y valida. No llama al backend.
export function validateProfile(
  raw: PatientProfileInput,
  today: Date = new Date()
): ProfileValidation {
  const value: PatientProfileInput = {
    birthDate: raw.birthDate.trim(),
    curp: raw.curp.trim().toUpperCase(),
    firstName: raw.firstName.trim(),
    lastName: raw.lastName.trim(),
  };
  if (!(value.firstName && value.lastName && value.curp && value.birthDate)) {
    return { message: "Completa todos los campos para continuar.", ok: false };
  }
  if (
    value.firstName.length > NAME_MAX_LENGTH ||
    value.lastName.length > NAME_MAX_LENGTH
  ) {
    return {
      message: "El nombre y los apellidos admiten hasta 100 caracteres.",
      ok: false,
    };
  }
  if (!CURP_FORMAT.test(value.curp)) {
    return { message: "La CURP no tiene un formato válido.", ok: false };
  }
  if (!isValidBirthDate(value.birthDate, today)) {
    return {
      message:
        "Escribe una fecha de nacimiento válida, anterior a hoy, en el formato AAAA-MM-DD.",
      ok: false,
    };
  }
  return { ok: true, value };
}
