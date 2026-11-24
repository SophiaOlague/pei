import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Text } from "react-native";

import { RegistrationGate } from "@/components/registration/registration-gate";
import type { LegalDocument, RegistrationStatus } from "@/lib/api";

type AnyCall = (...args: unknown[]) => Promise<unknown>;

const mockGetStatus = jest.fn<AnyCall>();
const mockGetDocuments = jest.fn<AnyCall>();
const mockCreateProfile = jest.fn<AnyCall>();
const mockAccept = jest.fn<AnyCall>();
const mockSignOut = jest.fn<AnyCall>();

// Ninguna prueba toca la red: la API y Better Auth se sustituyen por completo.
jest.mock("@/lib/api", () => {
  const actual = jest.requireActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    acceptLegalDocuments: (...args: unknown[]) => mockAccept(...args),
    createPatientProfile: (...args: unknown[]) => mockCreateProfile(...args),
    getCurrentLegalDocuments: (...args: unknown[]) => mockGetDocuments(...args),
    getRegistrationStatus: (...args: unknown[]) => mockGetStatus(...args),
  };
});

jest.mock("@/lib/auth-client", () => ({
  authClient: { signOut: (...args: unknown[]) => mockSignOut(...args) },
}));

const { ApiError } =
  jest.requireActual<typeof import("@/lib/api")>("@/lib/api");

const NETWORK_ERROR = /No pudimos conectar/;
const PATIENTS_ONLY = /es para pacientes/;
const CONFLICT = /No fue posible completar/;
const NO_DOCUMENTS = /no hay documentos legales publicados/;
const RELOAD_PROMPT = /documentos vigentes cambiaron/;
const SESSION_EXPIRED = /Tu sesión expiró/;
const AMBIGUOUS = /No sabemos si se guardó/;
const SIGN_OUT_FAILED = /No pudimos cerrar la sesión/;

const status = (
  overrides: Partial<RegistrationStatus>
): RegistrationStatus => ({
  canBookAppointments: false,
  identity: { rejectionReason: null, status: "not_submitted" },
  legal: { accepted: false, pending: [] },
  missing: [],
  profileCompleted: false,
  registrationComplete: false,
  ...overrides,
});

const PRIVACY = {
  documentId: "11111111-1111-4111-8111-111111111111",
  type: "privacy_notice" as const,
  version: "1",
};
const TERMS = {
  documentId: "22222222-2222-4222-8222-222222222222",
  type: "terms_and_conditions" as const,
  version: "1",
};
const needsLegal = status({
  legal: { accepted: false, pending: [PRIVACY, TERMS] },
  profileCompleted: true,
});
const complete = status({
  legal: { accepted: true, pending: [] },
  profileCompleted: true,
});

const docs: LegalDocument[] = [PRIVACY, TERMS].map((doc) => ({
  content: `Texto de ${doc.type}`,
  id: doc.documentId,
  publishedAt: "2026-01-01T00:00:00Z",
  type: doc.type,
  version: doc.version,
}));

const App = () => (
  <RegistrationGate>
    <Text>Contenido de la app</Text>
  </RegistrationGate>
);

async function fillProfile(curp = "LOAA900131MDFPNN09") {
  await fireEvent.changeText(
    screen.getByPlaceholderText("Ingresa tus nombres"),
    " Ana "
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("Ingresa tus apellidos"),
    "López"
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("18 caracteres"),
    curp
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("AAAA-MM-DD"),
    "1990-01-31"
  );
  await fireEvent.press(screen.getByText("Continuar"));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDocuments.mockResolvedValue(docs);
});

describe("RegistrationGate", () => {
  it("muestra la app solo cuando el perfil y los legales están completos", async () => {
    mockGetStatus.mockResolvedValue(complete);
    await render(<App />);
    expect(await screen.findByText("Contenido de la app")).toBeTruthy();
  });

  it("no muestra la app mientras consulta ni si la consulta falla", async () => {
    mockGetStatus.mockRejectedValue(
      new ApiError(0, "No pudimos conectar con el servidor.")
    );
    await render(<App />);
    expect(await screen.findByText(NETWORK_ERROR)).toBeTruthy();
    expect(screen.queryByText("Contenido de la app")).toBeNull();

    mockGetStatus.mockResolvedValue(complete);
    await fireEvent.press(screen.getByText("Reintentar"));
    expect(await screen.findByText("Contenido de la app")).toBeTruthy();
  });

  it("con 401 ofrece cerrar sesión en lugar de reintentar", async () => {
    mockGetStatus.mockRejectedValue(
      new ApiError(401, "Tu sesión expiró. Inicia sesión de nuevo.")
    );
    mockSignOut.mockResolvedValue({});
    await render(<App />);
    await fireEvent.press(await screen.findByText("Cerrar sesión"));
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("rechaza cuentas que no son de paciente", async () => {
    mockGetStatus.mockRejectedValue(
      new ApiError(
        403,
        "El estado del registro solo aplica a pacientes",
        "NotAPatientError"
      )
    );
    await render(<App />);
    expect(await screen.findByText(PATIENTS_ONLY)).toBeTruthy();
    expect(screen.queryByText("Contenido de la app")).toBeNull();
  });
});

describe("Paso 1: perfil", () => {
  it("valida antes de enviar y no llama al backend", async () => {
    mockGetStatus.mockResolvedValue(status({}));
    await render(<App />);
    await fireEvent.press(await screen.findByText("Continuar"));
    expect(
      screen.getByText("Completa todos los campos para continuar.")
    ).toBeTruthy();

    await fillProfile("NO-ES-CURP");
    expect(
      screen.getByText("La CURP no tiene un formato válido.")
    ).toBeTruthy();
    expect(mockCreateProfile).not.toHaveBeenCalled();
  });

  it("crea el perfil con los datos normalizados y pasa a los legales", async () => {
    mockGetStatus
      .mockResolvedValueOnce(status({}))
      .mockResolvedValueOnce(needsLegal);
    mockCreateProfile.mockResolvedValue({});
    await render(<App />);
    await screen.findByText("Continuar");
    await fillProfile("loaa900131mdfpnn09");

    await waitFor(() =>
      expect(mockCreateProfile).toHaveBeenCalledWith({
        birthDate: "1990-01-31",
        curp: "LOAA900131MDFPNN09",
        firstName: "Ana",
        lastName: "López",
      })
    );
    expect(await screen.findByText("Aceptar y continuar")).toBeTruthy();
    expect(mockGetStatus).toHaveBeenCalledTimes(2);
  });

  it("si el perfil ya existe, solo vuelve a leer el estado", async () => {
    mockGetStatus
      .mockResolvedValueOnce(status({}))
      .mockResolvedValueOnce(complete);
    mockCreateProfile.mockRejectedValue(
      new ApiError(
        409,
        "La cuenta ya tiene un perfil",
        "ProfileAlreadyExistsError"
      )
    );
    await render(<App />);
    await screen.findByText("Continuar");
    await fillProfile();
    expect(await screen.findByText("Contenido de la app")).toBeTruthy();
  });

  it("muestra el error del backend sin avanzar", async () => {
    mockGetStatus.mockResolvedValue(status({}));
    mockCreateProfile.mockRejectedValue(
      new ApiError(
        409,
        "No fue posible completar el registro con los datos proporcionados",
        "RegistrationDataConflictError"
      )
    );
    await render(<App />);
    await screen.findByText("Continuar");
    await fillProfile();
    expect(await screen.findByText(CONFLICT)).toBeTruthy();
    expect(mockGetStatus).toHaveBeenCalledTimes(1);
  });
});

describe("Paso 2: documentos legales", () => {
  it("acepta exactamente los ids pendientes solo con todas las casillas", async () => {
    mockGetStatus
      .mockResolvedValueOnce(needsLegal)
      .mockResolvedValueOnce(complete);
    mockAccept.mockResolvedValue({ accepted: [] });
    await render(<App />);

    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(
      screen.getByText("He leído y acepto el Aviso de Privacidad")
    ).toBeTruthy();
    expect(
      screen.getByText("He leído y acepto los Términos y Condiciones")
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Aceptar y continuar"));
    expect(mockAccept).not.toHaveBeenCalled();

    await fireEvent.press(screen.getAllByText("Leer documento")[0]);
    expect(screen.getByText("Texto de privacy_notice")).toBeTruthy();

    await fireEvent.press(boxes[0]);
    await fireEvent.press(boxes[1]);
    await fireEvent.press(screen.getByText("Aceptar y continuar"));
    await waitFor(() =>
      expect(mockAccept).toHaveBeenCalledWith([
        PRIVACY.documentId,
        TERMS.documentId,
      ])
    );
    expect(await screen.findByText("Contenido de la app")).toBeTruthy();
  });

  it("si un documento dejó de estar vigente, relee el estado", async () => {
    mockGetStatus
      .mockResolvedValueOnce(needsLegal)
      .mockResolvedValueOnce(needsLegal);
    mockAccept.mockRejectedValue(
      new ApiError(
        409,
        "Solo se puede aceptar la versión vigente",
        "LegalDocumentNotCurrentError"
      )
    );
    await render(<App />);
    const [first, second] = await screen.findAllByRole("checkbox");
    await fireEvent.press(first);
    await fireEvent.press(second);
    await fireEvent.press(screen.getByText("Aceptar y continuar"));
    await waitFor(() => expect(mockGetStatus).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Contenido de la app")).toBeNull();
  });

  it("sin documentos publicados informa que no se puede completar", async () => {
    mockGetStatus.mockResolvedValue(status({ profileCompleted: true }));
    await render(<App />);
    expect(await screen.findByText(NO_DOCUMENTS)).toBeTruthy();
    expect(mockGetDocuments).not.toHaveBeenCalled();
    expect(screen.queryByText("Contenido de la app")).toBeNull();
  });
});

describe("Recuperación (M-1, M-2)", () => {
  const expired = () =>
    new ApiError(401, "Tu sesión expiró. Inicia sesión de nuevo.");

  it("documentos que cambiaron: «Volver a cargar» relee estado y documentos sin aceptar nada", async () => {
    // El estado pide TERMS, pero /current ya trae solo PRIVACY (se publicó otra versión).
    mockGetStatus.mockResolvedValueOnce(needsLegal).mockResolvedValueOnce(
      status({
        legal: { accepted: false, pending: [PRIVACY] },
        profileCompleted: true,
      })
    );
    mockGetDocuments
      .mockResolvedValueOnce([docs[0]])
      .mockResolvedValueOnce([docs[0]]);
    await render(<App />);

    expect(await screen.findByText(RELOAD_PROMPT)).toBeTruthy();
    expect(screen.queryByText("Aceptar y continuar")).toBeNull();
    await fireEvent.press(screen.getByText("Volver a cargar"));

    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    expect(boxes[0].props.accessibilityState).toMatchObject({ checked: false });
    expect(mockGetStatus).toHaveBeenCalledTimes(2);
    expect(mockGetDocuments).toHaveBeenCalledTimes(2);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("si la recarga falla por red, ofrece reintentar sin mostrar la app", async () => {
    mockGetStatus
      .mockResolvedValueOnce(needsLegal)
      .mockRejectedValueOnce(
        new ApiError(0, "No pudimos conectar con el servidor.")
      );
    mockGetDocuments.mockResolvedValueOnce([docs[0]]);
    await render(<App />);
    await fireEvent.press(await screen.findByText("Volver a cargar"));
    expect(await screen.findByText("Reintentar")).toBeTruthy();
    expect(screen.queryByText("Contenido de la app")).toBeNull();
  });

  it("401 al guardar el perfil: relee el estado y ofrece cerrar sesión", async () => {
    mockGetStatus
      .mockResolvedValueOnce(status({}))
      .mockRejectedValueOnce(expired());
    mockCreateProfile.mockRejectedValue(expired());
    await render(<App />);
    await screen.findByText("Continuar");
    await fillProfile();

    expect(await screen.findByText(SESSION_EXPIRED)).toBeTruthy();
    expect(screen.getByText("Cerrar sesión")).toBeTruthy();
    expect(mockCreateProfile).toHaveBeenCalledTimes(1);
  });

  it("401 al aceptar los documentos: relee el estado y ofrece cerrar sesión", async () => {
    mockGetStatus
      .mockResolvedValueOnce(needsLegal)
      .mockRejectedValueOnce(expired());
    mockAccept.mockRejectedValue(expired());
    await render(<App />);
    const [first, second] = await screen.findAllByRole("checkbox");
    await fireEvent.press(first);
    await fireEvent.press(second);
    await fireEvent.press(screen.getByText("Aceptar y continuar"));

    expect(await screen.findByText("Cerrar sesión")).toBeTruthy();
    expect(mockAccept).toHaveBeenCalledTimes(1);
  });

  it("respuesta ambigua al guardar: no reenvía, solo comprueba el estado", async () => {
    mockGetStatus
      .mockResolvedValueOnce(status({}))
      .mockResolvedValueOnce(needsLegal);
    mockCreateProfile.mockRejectedValue(
      new ApiError(0, "No pudimos conectar con el servidor.")
    );
    await render(<App />);
    await screen.findByText("Continuar");
    await fillProfile();

    expect(await screen.findByText(AMBIGUOUS)).toBeTruthy();
    expect(screen.queryByText("Continuar")).toBeNull();
    await fireEvent.press(screen.getByText("Comprobar estado"));
    expect(await screen.findByText("Aceptar y continuar")).toBeTruthy();
    expect(mockCreateProfile).toHaveBeenCalledTimes(1);
  });

  it("si cerrar sesión falla, lo informa y permite reintentar", async () => {
    mockGetStatus.mockRejectedValue(expired());
    mockSignOut
      .mockResolvedValueOnce({ data: null, error: { status: 500 } })
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce({ data: { success: true }, error: null });
    await render(<App />);

    await fireEvent.press(await screen.findByText("Cerrar sesión"));
    expect(await screen.findByText(SIGN_OUT_FAILED)).toBeTruthy();
    await fireEvent.press(screen.getByText("Reintentar cerrar sesión"));
    expect(await screen.findByText(SIGN_OUT_FAILED)).toBeTruthy();
    await fireEvent.press(screen.getByText("Reintentar cerrar sesión"));
    await waitFor(() => expect(screen.queryByText(SIGN_OUT_FAILED)).toBeNull());
    expect(mockSignOut).toHaveBeenCalledTimes(3);
  });
});

// D-37 / RN-140: la reaceptación de una versión nueva no bloquea la app; el primer registro sí.
const BANNER = /Hay una nueva versión de los documentos legales/;
const reacceptance = status({
  legal: { accepted: false, pending: [PRIVACY], reacceptanceRequired: true },
  missing: ["legal"],
  profileCompleted: true,
});

describe("Reaceptación legal pendiente (D-37, RN-140)", () => {
  it("[TC-MOB-REG-001] con registro ya completado y una versión nueva pendiente, muestra la app con el aviso", async () => {
    mockGetStatus.mockResolvedValue(reacceptance);
    await render(<App />);
    expect(await screen.findByText("Contenido de la app")).toBeTruthy();
    expect(screen.getByText(BANNER)).toBeTruthy();
    expect(screen.queryByText("Completa tu registro")).toBeNull();
  });

  it.each([
    [
      "sin el indicador (backend anterior)",
      { legal: { accepted: false, pending: [PRIVACY, TERMS] } },
    ],
    [
      "indicador falso (primer registro)",
      {
        legal: {
          accepted: false,
          pending: [PRIVACY, TERMS],
          reacceptanceRequired: false,
        },
      },
    ],
  ])(
    "[TC-MOB-REG-002] %s: conserva el bloqueo del registro inicial",
    async (_label, over) => {
      mockGetStatus.mockResolvedValue(
        status({ ...over, profileCompleted: true })
      );
      await render(<App />);
      expect(await screen.findByText("Completa tu registro")).toBeTruthy();
      expect(screen.queryByText("Contenido de la app")).toBeNull();
    }
  );

  it("[TC-MOB-REG-003] sin perfil, el indicador no abre la app (el perfil se completa primero)", async () => {
    mockGetStatus.mockResolvedValue(
      status({
        legal: {
          accepted: false,
          pending: [PRIVACY],
          reacceptanceRequired: true,
        },
      })
    );
    await render(<App />);
    expect(
      await screen.findByPlaceholderText("Ingresa tus nombres")
    ).toBeTruthy();
    expect(screen.queryByText("Contenido de la app")).toBeNull();
  });

  it("[TC-MOB-REG-004] «Revisar y aceptar» abre los documentos con el mecanismo existente; «Ahora no» vuelve a la app; al aceptar desaparece el aviso", async () => {
    mockGetStatus
      .mockResolvedValueOnce(reacceptance)
      .mockResolvedValueOnce(complete);
    mockGetDocuments.mockResolvedValue(docs.slice(0, 1));
    mockAccept.mockResolvedValue({ accepted: [] });
    await render(<App />);
    await screen.findByText(BANNER);
    await fireEvent.press(screen.getByText("Revisar y aceptar"));
    expect(await screen.findByText("Aceptar y continuar")).toBeTruthy();
    await fireEvent.press(screen.getByText("Ahora no"));
    expect(await screen.findByText("Contenido de la app")).toBeTruthy();

    await fireEvent.press(screen.getByText("Revisar y aceptar"));
    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    await fireEvent.press(boxes[0]);
    await fireEvent.press(screen.getByText("Aceptar y continuar"));
    await waitFor(() =>
      expect(mockAccept).toHaveBeenCalledWith([PRIVACY.documentId])
    );
    expect(await screen.findByText("Contenido de la app")).toBeTruthy();
    expect(screen.queryByText(BANNER)).toBeNull();
  });
});
