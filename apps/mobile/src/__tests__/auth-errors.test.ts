import { describe, expect, it } from "@jest/globals";
import {
  authErrorMessage,
  classifyAuthError,
  isValidEmail,
} from "@/lib/auth-errors";

describe("classifyAuthError", () => {
  it("reconoce credenciales inválidas (401 INVALID_EMAIL_OR_PASSWORD)", () => {
    expect(
      classifyAuthError({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401 })
    ).toBe("invalid_credentials");
  });

  it("reconoce el correo sin verificar (403 EMAIL_NOT_VERIFIED)", () => {
    expect(classifyAuthError({ code: "EMAIL_NOT_VERIFIED", status: 403 })).toBe(
      "email_not_verified"
    );
  });

  it("no confunde otro 403 con el correo sin verificar", () => {
    expect(classifyAuthError({ code: "INVALID_ORIGIN", status: 403 })).toBe(
      "unknown"
    );
  });

  it("reconoce el límite de intentos (429)", () => {
    expect(classifyAuthError({ status: 429 })).toBe("rate_limited");
  });

  it("trata status 0 o ausente como error de red", () => {
    expect(classifyAuthError({ status: 0 })).toBe("network");
    expect(classifyAuthError({})).toBe("network");
  });

  it("no expone el mensaje del servidor", () => {
    const kind = classifyAuthError({
      message: "user@x.com exploded",
      status: 500,
    });
    expect(authErrorMessage(kind)).not.toContain("user@x.com");
  });
});

describe("isValidEmail", () => {
  it("valida el formato básico", () => {
    expect(isValidEmail("persona@ejemplo.com")).toBe(true);
    expect(isValidEmail("persona@ejemplo")).toBe(false);
  });
});
