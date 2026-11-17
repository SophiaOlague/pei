import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import ProfileScreen from "@/app/(app)/(tabs)/options/profile";
import type { PatientProfile } from "@/lib/api";

const mockGetProfile = jest.fn<() => Promise<PatientProfile>>();

// Sin red: el perfil y la sesión se simulan. legalFullName y ApiError son los reales.
jest.mock("@/lib/api", () => ({
  ...jest.requireActual<typeof import("@/lib/api")>("@/lib/api"),
  getProfile: () => mockGetProfile(),
}));

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: jest.fn(),
    useSession: () => ({
      data: { user: { email: "persona@ejemplo.com", name: "Nombre Cuenta" } },
      isPending: false,
    }),
  },
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));

const { ApiError } =
  jest.requireActual<typeof import("@/lib/api")>("@/lib/api");

const profile = (overrides: Partial<PatientProfile> = {}): PatientProfile => ({
  address: null,
  birthDate: "1990-01-31",
  curp: "LOAA900131MDFPNN09",
  emergencyContactName: null,
  emergencyContactPhone: null,
  firstName: "Ana María",
  hasPhoto: false,
  lastName: "López Pérez",
  phone: null,
  ...overrides,
});

const LOAD_ERROR = "No pudimos cargar tu nombre legal.";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("Mi perfil: nombre", () => {
  it("muestra el nombre legal del perfil en lugar del de la cuenta", async () => {
    mockGetProfile.mockResolvedValue(profile());
    await render(<ProfileScreen />);

    expect(await screen.findByText("Ana María López Pérez")).toBeTruthy();
    expect(screen.queryByText("Nombre Cuenta")).toBeNull();
    expect(screen.getByText("persona@ejemplo.com")).toBeTruthy();
    // La CURP viene en la respuesta pero nunca se muestra.
    expect(screen.queryByText("LOAA900131MDFPNN09")).toBeNull();
  });

  it("mientras carga no muestra ningún nombre", async () => {
    mockGetProfile.mockReturnValue(new Promise(() => undefined));
    await render(<ProfileScreen />);
    expect(screen.getByLabelText("Cargando tu nombre")).toBeTruthy();
    expect(screen.queryByText("Nombre Cuenta")).toBeNull();
  });

  it("usa el nombre de la cuenta si el perfil no tiene un nombre utilizable", async () => {
    mockGetProfile.mockResolvedValue(profile({ firstName: " ", lastName: "" }));
    await render(<ProfileScreen />);
    expect(await screen.findByText("Nombre Cuenta")).toBeTruthy();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
  });

  it("usa el nombre de la cuenta si aún no hay perfil (403), sin mostrar error", async () => {
    mockGetProfile.mockRejectedValue(
      new ApiError(
        403,
        "La operación requiere un perfil de paciente",
        "PatientProfileRequiredError"
      )
    );
    await render(<ProfileScreen />);
    expect(await screen.findByText("Nombre Cuenta")).toBeTruthy();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
  });

  it("con error de red avisa y permite reintentar", async () => {
    mockGetProfile
      .mockRejectedValueOnce(new ApiError(0, "Sin conexión"))
      .mockResolvedValueOnce(profile());
    await render(<ProfileScreen />);

    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
    expect(screen.getByText("Nombre Cuenta")).toBeTruthy();

    await fireEvent.press(screen.getByText("Reintentar"));
    expect(await screen.findByText("Ana María López Pérez")).toBeTruthy();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
    expect(mockGetProfile).toHaveBeenCalledTimes(2);
  });
});
