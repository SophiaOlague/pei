import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import EditProfileScreen from "@/app/(app)/editprofile";
import type { EditableProfilePatch, PatientProfile } from "@/lib/api";
import { formatIsoDateForDisplay } from "@/lib/date-format";

const mockGetProfile = jest.fn<() => Promise<PatientProfile>>();
const mockUpdateProfile =
  jest.fn<(fields: EditableProfilePatch) => Promise<{ updated: string[] }>>();
const mockUpdateUser = jest.fn();
const mockPush = jest.fn();

// Sin red: getProfile y updateProfile se simulan. diff, validación, legalFullName y ApiError son los reales.
jest.mock("@/lib/api", () => ({
  ...jest.requireActual<typeof import("@/lib/api")>("@/lib/api"),
  getProfile: () => mockGetProfile(),
  updateProfile: (fields: EditableProfilePatch) => mockUpdateProfile(fields),
}));

jest.mock("@/lib/auth-client", () => ({
  authClient: {
    updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    useSession: () => ({
      data: {
        user: {
          email: "persona@ejemplo.com",
          id: "user-123456789",
          name: "Nombre Cuenta",
        },
      },
      isPending: false,
    }),
  },
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-secure-store", () => ({
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(),
}));

const { ApiError } =
  jest.requireActual<typeof import("@/lib/api")>("@/lib/api");

const READ_ONLY_NOTE = /no se pueden modificar/;
const LOAD_ERROR = /No pudimos cargar tus datos/;
const NO_PROFILE = /Aún no tienes un perfil/;
const SAVED = "Cambios guardados.";
const AMBIGUOUS = /No pudimos confirmar si se guardaron/;
const SESSION_EXPIRED = /Tu sesión expiró/;
const CONFIRMED_NOT_SAVED = /no se guardaron/;
const NOT_SAVED = /No pudimos guardar los cambios/;

const CURP = "LOAA900131MDFPNN09";
const profile = (overrides: Partial<PatientProfile> = {}): PatientProfile => ({
  address: "Calle 1 #23, Durango",
  birthDate: "1990-01-31",
  curp: CURP,
  emergencyContactName: "Luis López",
  emergencyContactPhone: "6181112233",
  firstName: "Ana María",
  hasPhoto: false,
  lastName: "López Pérez",
  phone: "6189998877",
  ...overrides,
});

const fetchSpy = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  // Sin respuestas pendientes de otra prueba (mockResolvedValueOnce sin consumir).
  mockGetProfile.mockReset();
  mockUpdateProfile.mockReset();
  global.fetch = fetchSpy as unknown as typeof fetch;
});

const fieldValue = (label: string) =>
  screen.getByLabelText(label).props.value as string;

async function renderLoaded(data: PatientProfile = profile()) {
  mockGetProfile.mockResolvedValueOnce(data);
  await render(<EditProfileScreen />);
  await screen.findByLabelText("Número:");
}

const type = (label: string, text: string) =>
  fireEvent.changeText(screen.getByLabelText(label), text);

const save = () => fireEvent.press(screen.getByText("Guardar cambios"));

describe("formatIsoDateForDisplay", () => {
  it("convierte AAAA-MM-DD en DD/MM/AAAA y no inventa fechas", () => {
    expect(formatIsoDateForDisplay("1990-01-31")).toBe("31/01/1990");
    expect(formatIsoDateForDisplay(null)).toBeNull();
    expect(formatIsoDateForDisplay("31/01/1990")).toBeNull();
  });
});

describe("Editar información: visualización", () => {
  it("muestra el nombre legal en el encabezado y la inicial, no el de la cuenta", async () => {
    await renderLoaded();
    expect(screen.getAllByText("Ana María López Pérez").length).toBeGreaterThan(
      0
    );
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.queryByText("Nombre Cuenta")).toBeNull();
    expect(screen.queryByText(CURP)).toBeNull();
  });

  it("precarga los cuatro campos editables; nombre y fecha son de solo lectura", async () => {
    await renderLoaded();
    expect(fieldValue("Número:")).toBe("6189998877");
    expect(fieldValue("Dirección:")).toBe("Calle 1 #23, Durango");
    expect(fieldValue("Nombre del contacto:")).toBe("Luis López");
    expect(fieldValue("Número de teléfono:")).toBe("6181112233");
    expect(fieldValue("Fecha de nacimiento:")).toBe("31/01/1990");
    expect(fieldValue("Nombre:")).toBe("Ana María López Pérez");
    expect(screen.getByLabelText("Nombre:").props.editable).toBe(false);
    expect(screen.getByLabelText("Fecha de nacimiento:").props.editable).toBe(
      false
    );
    expect(screen.getByLabelText("Número:").props.editable).not.toBe(false);
    expect(screen.getByText(READ_ONLY_NOTE)).toBeTruthy();
  });

  it("respeta los valores nulos sin inventar datos", async () => {
    await renderLoaded(
      profile({
        address: null,
        birthDate: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        phone: null,
      })
    );
    for (const label of [
      "Número:",
      "Dirección:",
      "Nombre del contacto:",
      "Número de teléfono:",
      "Fecha de nacimiento:",
    ]) {
      expect(fieldValue(label)).toBe("");
    }
  });

  it("mientras carga no muestra ningún nombre", async () => {
    mockGetProfile.mockReturnValue(new Promise(() => undefined));
    await render(<EditProfileScreen />);
    expect(screen.getByLabelText("Cargando tus datos")).toBeTruthy();
    expect(screen.queryByText("Nombre Cuenta")).toBeNull();
    expect(screen.queryByLabelText("Número:")).toBeNull();
  });

  it("con error de carga usa el nombre de la cuenta, lo indica y permite reintentar", async () => {
    mockGetProfile
      .mockRejectedValueOnce(new ApiError(0, "Revisa tu conexión."))
      .mockResolvedValueOnce(profile());
    await render(<EditProfileScreen />);

    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
    expect(screen.getByText("Nombre Cuenta")).toBeTruthy();
    expect(screen.queryByLabelText("Número:")).toBeNull();

    await fireEvent.press(screen.getByText("Reintentar"));
    expect(await screen.findByLabelText("Número:")).toBeTruthy();
    expect(mockGetProfile).toHaveBeenCalledTimes(2);
  });

  it("sin perfil (403) usa el nombre de la cuenta e informa", async () => {
    mockGetProfile.mockRejectedValue(
      new ApiError(403, "Requiere perfil", "PatientProfileRequiredError")
    );
    await render(<EditProfileScreen />);
    expect(await screen.findByText("Nombre Cuenta")).toBeTruthy();
    expect(screen.getByText(NO_PROFILE)).toBeTruthy();
  });
});

describe("Editar información: guardado (PATCH /me/profile)", () => {
  it("envía solo los campos modificados, recortados, y nunca los de solo lectura", async () => {
    mockUpdateProfile.mockResolvedValue({ updated: ["phone", "address"] });
    await renderLoaded();
    await type("Número:", " 6180000000 ");
    await type("Dirección:", "Calle 2 #45");
    await save();

    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        address: "Calle 2 #45",
        phone: "6180000000",
      })
    );
    const sent = mockUpdateProfile.mock.calls[0][0] as Record<string, unknown>;
    for (const key of ["name", "firstName", "lastName", "birthDate", "curp"]) {
      expect(sent).not.toHaveProperty(key);
    }
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("vaciar un campo con valor envía null para borrarlo", async () => {
    mockUpdateProfile.mockResolvedValue({ updated: ["emergencyContactName"] });
    await renderLoaded();
    await type("Nombre del contacto:", "   ");
    await save();
    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        emergencyContactName: null,
      })
    );
  });

  it("sin cambios no hace ninguna petición", async () => {
    await renderLoaded();
    await type("Número:", " 6189998877 ");
    await save();
    expect(screen.getByText("No hay cambios para guardar.")).toBeTruthy();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("valida las longitudes antes de enviar", async () => {
    await renderLoaded();
    await type("Nombre del contacto:", "a".repeat(101));
    await save();
    expect(
      screen.getByText("El nombre del contacto admite hasta 100 caracteres.")
    ).toBeTruthy();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });

  it("bloquea envíos duplicados mientras guarda y solo confirma tras la respuesta", async () => {
    let resolve: (value: { updated: string[] }) => void = () => undefined;
    mockUpdateProfile.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    await renderLoaded();
    await type("Número:", "6180000000");
    // Sin await: el manejador espera la respuesta, que se resuelve más abajo.
    const firstPress = save();

    expect(await screen.findByLabelText("Guardando")).toBeTruthy();
    expect(screen.queryByText(SAVED)).toBeNull();
    // El botón está deshabilitado: un segundo toque no envía nada.
    await fireEvent.press(screen.getByLabelText("Guardando"));
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ updated: ["phone"] });
      await firstPress;
    });
    expect(await screen.findByText(SAVED)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("tras guardar, lo guardado es la nueva base: volver a guardar no reenvía", async () => {
    mockUpdateProfile.mockResolvedValue({ updated: ["phone"] });
    await renderLoaded();
    await type("Número:", "6180000000");
    await save();
    await screen.findByText(SAVED);
    await save();
    expect(screen.getByText("No hay cambios para guardar.")).toBeTruthy();
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
  });

  it("con un 4xx muestra el error y conserva lo escrito", async () => {
    mockUpdateProfile.mockRejectedValue(
      new ApiError(400, "Revisa los datos e intenta de nuevo.")
    );
    await renderLoaded();
    await type("Dirección:", "Calle 2 #45");
    await save();

    expect(await screen.findByText(NOT_SAVED)).toBeTruthy();
    expect(screen.queryByText(SAVED)).toBeNull();
    expect(fieldValue("Dirección:")).toBe("Calle 2 #45");
  });

  it("con un 401 pide iniciar sesión de nuevo", async () => {
    mockUpdateProfile.mockRejectedValue(
      new ApiError(401, "Tu sesión expiró. Inicia sesión de nuevo.")
    );
    await renderLoaded();
    await type("Dirección:", "Calle 2 #45");
    await save();
    expect(await screen.findByText(SESSION_EXPIRED)).toBeTruthy();
  });

  it("resultado ambiguo: no reintenta; «Comprobar estado» confirma con GET /me/profile", async () => {
    mockUpdateProfile.mockRejectedValue(new ApiError(0, "Sin conexión"));
    await renderLoaded();
    await type("Dirección:", "Calle 2 #45");
    await save();

    expect(await screen.findByText(AMBIGUOUS)).toBeTruthy();
    expect(screen.queryByText("Guardar cambios")).toBeNull();
    expect(screen.queryByText(SAVED)).toBeNull();
    expect(fieldValue("Dirección:")).toBe("Calle 2 #45");

    // El backend sí lo guardó.
    mockGetProfile.mockResolvedValueOnce(profile({ address: "Calle 2 #45" }));
    await fireEvent.press(screen.getByText("Comprobar estado"));
    expect(
      await screen.findByText("Se confirmó que los cambios están guardados.")
    ).toBeTruthy();
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
  });

  it("resultado ambiguo que no se guardó: lo informa y permite volver a intentar", async () => {
    mockUpdateProfile
      .mockRejectedValueOnce(new ApiError(503, "El servidor no pudo…"))
      .mockResolvedValueOnce({ updated: ["address"] });
    await renderLoaded();
    await type("Dirección:", "Calle 2 #45");
    await save();
    await screen.findByText(AMBIGUOUS);

    mockGetProfile.mockResolvedValueOnce(profile());
    await fireEvent.press(screen.getByText("Comprobar estado"));
    expect(await screen.findByText(CONFIRMED_NOT_SAVED)).toBeTruthy();
    expect(fieldValue("Dirección:")).toBe("Calle 2 #45");

    await save();
    expect(await screen.findByText(SAVED)).toBeTruthy();
    expect(mockUpdateProfile).toHaveBeenCalledTimes(2);
  });
});

// La concurrencia real (dos llamadas en el mismo tick, guardar contra comprobar) se prueba en
// use-exclusive-operation.test.ts: RNTL 14 no puede disparar dos eventos en el mismo frame sin superponer act().
describe("Editar información: guardia de operaciones (M-1)", () => {
  it("tras un error de guardado la guardia se libera y se puede guardar de nuevo", async () => {
    mockUpdateProfile
      .mockRejectedValueOnce(
        new ApiError(400, "Revisa los datos e intenta de nuevo.")
      )
      .mockResolvedValueOnce({ updated: ["address"] });
    await renderLoaded();
    await type("Dirección:", "Calle 2 #45");
    await save();
    await screen.findByText(NOT_SAVED);

    await save();
    expect(await screen.findByText(SAVED)).toBeTruthy();
    expect(mockUpdateProfile).toHaveBeenCalledTimes(2);
  });
});

describe("Editar información: la guardia se libera tras comprobar (M-1)", () => {
  it("tras «Comprobar estado» fallido se puede comprobar de nuevo", async () => {
    mockUpdateProfile.mockRejectedValue(new ApiError(0, "Sin conexión"));
    await renderLoaded();
    await type("Dirección:", "Calle 2 #45");
    await save();
    await screen.findByText(AMBIGUOUS);

    mockGetProfile
      .mockRejectedValueOnce(new ApiError(0, "Sin conexión"))
      .mockResolvedValueOnce(profile({ address: "Calle 2 #45" }));
    await fireEvent.press(screen.getByText("Comprobar estado"));
    expect(await screen.findByText(AMBIGUOUS)).toBeTruthy();

    await fireEvent.press(screen.getByText("Comprobar estado"));
    expect(
      await screen.findByText("Se confirmó que los cambios están guardados.")
    ).toBeTruthy();
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
  });
});
