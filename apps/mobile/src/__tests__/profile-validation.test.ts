import { describe, expect, it } from "@jest/globals";

import { isValidBirthDate, validateProfile } from "@/lib/profile-validation";

// 2026-10-27 a las 03:00 UTC: en México sigue siendo el 26, pero el backend compara en UTC.
const TODAY = new Date("2026-10-27T03:00:00Z");

const valid = {
  birthDate: "1990-01-31",
  curp: "LOAA900131MDFPNN09",
  firstName: "Ana",
  lastName: "López",
};

describe("isValidBirthDate (igual que parseBirthDate del backend)", () => {
  it("rechaza hoy y acepta ayer, en UTC", () => {
    expect(isValidBirthDate("2026-10-27", TODAY)).toBe(false);
    expect(isValidBirthDate("2026-10-26", TODAY)).toBe(true);
  });

  it("rechaza fechas futuras, inexistentes y con otro formato", () => {
    expect(isValidBirthDate("2027-01-01", TODAY)).toBe(false);
    expect(isValidBirthDate("1990-02-30", TODAY)).toBe(false);
    expect(isValidBirthDate("31/01/1990", TODAY)).toBe(false);
  });
});

describe("validateProfile", () => {
  it("normaliza: recorta los textos y pasa la CURP a mayúsculas", () => {
    expect(
      validateProfile(
        { ...valid, curp: " loaa900131mdfpnn09 ", firstName: " Ana " },
        TODAY
      )
    ).toEqual({ ok: true, value: valid });
  });

  it("exige todos los campos", () => {
    expect(validateProfile({ ...valid, lastName: "  " }, TODAY)).toEqual({
      message: "Completa todos los campos para continuar.",
      ok: false,
    });
  });

  it("limita el nombre a 100 caracteres", () => {
    expect(
      validateProfile({ ...valid, firstName: "a".repeat(101) }, TODAY).ok
    ).toBe(false);
  });

  it("valida el formato de la CURP", () => {
    expect(validateProfile({ ...valid, curp: "NO-ES-CURP" }, TODAY)).toEqual({
      message: "La CURP no tiene un formato válido.",
      ok: false,
    });
  });

  it("rechaza una fecha de nacimiento igual a hoy", () => {
    const result = validateProfile(
      { ...valid, birthDate: "2026-10-27" },
      TODAY
    );
    expect(result.ok).toBe(false);
  });
});
