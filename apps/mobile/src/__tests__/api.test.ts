import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  ApiError,
  acceptLegalDocuments,
  createPatientProfile,
  diffEditableProfile,
  getRegistrationStatus,
  legalFullName,
  pendingRegistrationStep,
  type RegistrationStatus,
  updateProfile,
  validateEditableProfile,
} from "@/lib/api";

const mockGetCookie = jest.fn<() => Promise<string>>();

jest.mock("@/lib/auth-client", () => ({
  authClient: { getCookie: () => mockGetCookie() },
}));

type FetchMock = jest.Mock<
  (input: string, init?: RequestInit) => Promise<Response>
>;
const fetchMock: FetchMock = jest.fn();

function jsonResponse(status: number, body: unknown): Response {
  return {
    json: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCookie.mockResolvedValue("better-auth.session_token=abc");
  global.fetch = fetchMock as unknown as typeof fetch;
});

const baseStatus: RegistrationStatus = {
  canBookAppointments: false,
  identity: { rejectionReason: null, status: "not_submitted" },
  legal: { accepted: false, pending: [] },
  missing: [],
  profileCompleted: false,
  registrationComplete: false,
};

describe("request", () => {
  it("envía la cookie de SecureStore y no usa cookies del sistema", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, baseStatus));
    await getRegistrationStatus();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.test/me/registration-status");
    expect(init?.credentials).toBe("omit");
    expect(init?.headers).toMatchObject({
      Cookie: "better-auth.session_token=abc",
    });
  });

  it("envía el perfil y la aceptación con el cuerpo exacto del contrato", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, {}));
    const profile = {
      birthDate: "1990-01-31",
      curp: "AAAA900131HDFBBB01",
      firstName: "Ana",
      lastName: "López",
    };
    await createPatientProfile(profile);
    await acceptLegalDocuments(["id-1", "id-2"]);

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      body: JSON.stringify(profile),
      method: "POST",
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://backend.test/me/legal-acceptances"
    );
    expect(fetchMock.mock.calls[1][1]?.body).toBe(
      JSON.stringify({ documentIds: ["id-1", "id-2"] })
    );
  });

  it("convierte un fallo de red en ApiError con status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(getRegistrationStatus()).rejects.toMatchObject({
      status: 0,
    });
  });

  it("conserva el nombre del error de dominio y su mensaje", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: "ProfileAlreadyExistsError",
        message: "La cuenta ya tiene un perfil",
        statusCode: 409,
      })
    );
    const error = (await createPatientProfile({
      birthDate: "1990-01-31",
      curp: "X",
      firstName: "A",
      lastName: "B",
    }).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.error).toBe("ProfileAlreadyExistsError");
    expect(error.message).toBe("La cuenta ya tiene un perfil");
  });

  it("no muestra los mensajes de class-validator ni los de 401", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { message: ["curp no tiene un formato válido"] })
    );
    await expect(getRegistrationStatus()).rejects.toMatchObject({
      message: "Revisa los datos e intenta de nuevo.",
      status: 400,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    await expect(getRegistrationStatus()).rejects.toMatchObject({
      message: "Tu sesión expiró. Inicia sesión de nuevo.",
      status: 401,
    });
  });
});

describe("pendingRegistrationStep", () => {
  it("exige el perfil antes que los legales e ignora la INE", () => {
    expect(pendingRegistrationStep(baseStatus)).toBe("profile");
    expect(
      pendingRegistrationStep({ ...baseStatus, profileCompleted: true })
    ).toBe("legal");
    expect(
      pendingRegistrationStep({
        ...baseStatus,
        legal: { accepted: true, pending: [] },
        profileCompleted: true,
      })
    ).toBeNull();
  });
});

describe("legalFullName", () => {
  it("une nombre(s) y apellidos recortados", () => {
    expect(legalFullName({ firstName: " Ana ", lastName: "López " })).toBe(
      "Ana López"
    );
  });

  it("devuelve null si no hay nada utilizable", () => {
    expect(legalFullName({ firstName: " ", lastName: "" })).toBeNull();
  });
});

describe("PATCH /me/profile", () => {
  const original = {
    address: "Calle 1",
    emergencyContactName: null,
    emergencyContactPhone: "6181112233",
    phone: "6189998877",
  };
  const draft = {
    address: "Calle 1",
    emergencyContactName: "",
    emergencyContactPhone: "6181112233",
    phone: "6189998877",
  };

  it("diffEditableProfile: solo lo que cambió, recortado; vacío → null", () => {
    expect(diffEditableProfile(original, draft)).toEqual({});
    expect(
      diffEditableProfile(original, {
        ...draft,
        address: "  ",
        emergencyContactName: " Luis ",
        phone: " 6189998877 ",
      })
    ).toEqual({ address: null, emergencyContactName: "Luis" });
  });

  it("validateEditableProfile aplica los límites del DTO sobre el texto recortado", () => {
    expect(
      validateEditableProfile({ ...draft, phone: ` ${"1".repeat(30)} ` })
    ).toBeNull();
    expect(validateEditableProfile({ ...draft, phone: "1".repeat(31) })).toBe(
      "El número admite hasta 30 caracteres."
    );
    expect(
      validateEditableProfile({ ...draft, address: "a".repeat(301) })
    ).toBe("La dirección admite hasta 300 caracteres.");
  });

  it("updateProfile envía PATCH con el mismo cliente autenticado y solo los campos dados", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { updated: ["address"] }));
    await updateProfile({ address: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.test/me/profile");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ address: null }));
    expect(init?.headers).toMatchObject({
      Cookie: "better-auth.session_token=abc",
    });
  });
});
