import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Alert, type AlertButton } from "react-native";

import IdentityVerificationScreen from "@/app/(app)/verificacionidentidad";

// Verificación de identidad del paciente: sin backend ni red (fetch simulado) y sin cámara (selector simulado).
const FRONT_URI = "file:///cache/ImagePicker/frente.jpg";
const BACK_URI = "file:///cache/ImagePicker/reverso.png";
const SENSITIVE_LOG = /file:\/\/|ImagePicker|INE/;
const AMBIGUOUS = /No pudimos confirmar si recibimos tus documentos/;
const GET_KEY = "GET /me/identity-verification";
const POST_KEY = "POST /me/identity-verification";
const STATUS_KEY = "GET /me/registration-status";
const SUBMIT = "Enviar documentación";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    getCookie: () => Promise.resolve("better-auth.session_token=abc"),
  },
}));

type Asset = { uri: string; mimeType?: string; fileSize?: number };
const mockCamera = jest.fn<() => Promise<unknown>>();
const mockLibrary = jest.fn<() => Promise<unknown>>();
const mockCameraPermission = jest.fn<() => Promise<unknown>>();
jest.mock("expo-image-picker", () => ({
  launchCameraAsync: () => mockCamera(),
  launchImageLibraryAsync: () => mockLibrary(),
  requestCameraPermissionsAsync: () => mockCameraPermission(),
}));
// La pantalla no debe persistir nada en el dispositivo.
const mockSecureSet = jest.fn();
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: (...args: unknown[]) => mockSecureSet(...args),
}));

// FormData que registra las partes (el de Node no acepta { uri, name, type }).
class RecordingFormData {
  readonly parts: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
}

type Reply = { status: number; body: unknown } | Error;
let replies: Record<string, Reply[]>;
const calls: { key: string; init?: RequestInit }[] = [];

function respond(r: Reply): Promise<Response> {
  if (r instanceof Error) {
    return Promise.reject(r);
  }
  return Promise.resolve({
    json: () => Promise.resolve(r.body),
    ok: r.status < 300,
    status: r.status,
  } as Response);
}

const verification = (
  status: string,
  rejectionReason: string | null = null
) => ({
  body: {
    attempt: status === "not_submitted" ? 0 : 1,
    rejectionReason,
    status,
  },
  status: 200,
});

const realFormData = global.FormData;
const consoleSpies: jest.SpiedFunction<typeof console.log>[] = [];

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
  mockSecureSet.mockReset();
  mockCamera.mockReset();
  mockLibrary.mockReset();
  mockCameraPermission.mockReset();
  mockCameraPermission.mockResolvedValue({ granted: true });
  calls.length = 0;
  for (const k of Object.keys(mockParams)) {
    delete mockParams[k];
  }
  replies = {};
  global.FormData = RecordingFormData as unknown as typeof FormData;
  global.fetch = jest.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(input).pathname}`;
    calls.push({ init, key });
    const queue = replies[key];
    const r = queue && queue.length > 1 ? queue.shift() : queue?.[0];
    return r ? respond(r) : Promise.reject(new Error(`no simulada: ${key}`));
  }) as unknown as typeof fetch;
  // El diálogo Cámara/Galería: se elige la opción indicada por el texto.
  jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  for (const method of ["log", "info", "warn", "error"] as const) {
    consoleSpies.push(jest.spyOn(console, method));
  }
});

afterEach(() => {
  global.FormData = realFormData;
  // Ningún documento ni URI se registra en logs (los avisos de act() de React no llevan datos de la pantalla).
  const logged = consoleSpies.flatMap((spy) =>
    spy.mock.calls.flat().map((arg) => String(arg))
  );
  for (const spy of consoleSpies) {
    spy.mockRestore();
  }
  expect(logged.filter((line) => SENSITIVE_LOG.test(line))).toEqual([]);
  consoleSpies.length = 0;
  jest.restoreAllMocks();
});

async function choose(side: "Frente" | "Reverso", option: string) {
  const alert = Alert.alert as jest.MockedFunction<typeof Alert.alert>;
  alert.mockClear();
  await fireEvent.press(screen.getByLabelText(`${side} de la INE`));
  const buttons = (alert.mock.calls[0]?.[2] ?? []) as AlertButton[];
  const button = buttons.find((b) => b.text === option);
  await act(async () => {
    await button?.onPress?.();
  });
}

async function pickBoth() {
  mockCamera.mockResolvedValueOnce({
    assets: [{ mimeType: "image/jpeg", uri: FRONT_URI } satisfies Asset],
    canceled: false,
  });
  await choose("Frente", "Cámara");
  mockLibrary.mockResolvedValueOnce({
    assets: [{ mimeType: "image/png", uri: BACK_URI } satisfies Asset],
    canceled: false,
  });
  await choose("Reverso", "Galería");
}

describe("verificacionidentidad.tsx · sin documentación enviada", () => {
  it("consulta el estado real y muestra el formulario con el envío deshabilitado hasta tener ambos lados", async () => {
    replies[GET_KEY] = [verification("not_submitted")];
    await render(<IdentityVerificationScreen />);
    expect(await screen.findByText("Verifica tu identidad")).toBeTruthy();
    expect(calls.map((c) => c.key)).toEqual([GET_KEY]);
    expect(
      screen.getByRole("button", { name: SUBMIT }).props.accessibilityState
    ).toMatchObject({ disabled: true });
  });

  it("previsualiza frente y reverso, envía ambos archivos en multipart y vuelve a consultar el estado", async () => {
    replies[GET_KEY] = [verification("not_submitted"), verification("pending")];
    replies[POST_KEY] = [
      {
        body: { attempt: 1, status: "pending", submissionId: "s-1" },
        status: 201,
      },
    ];
    await render(<IdentityVerificationScreen />);
    await screen.findByText("Verifica tu identidad");
    await pickBoth();

    expect(
      screen.getByLabelText("Vista previa del frente").props.source
    ).toEqual({ uri: FRONT_URI });
    expect(
      screen.getByLabelText("Vista previa del reverso").props.source
    ).toEqual({ uri: BACK_URI });

    await act(async () => fireEvent.press(screen.getByText(SUBMIT)));

    expect(calls.map((c) => c.key)).toEqual([GET_KEY, POST_KEY, GET_KEY]);
    const post = calls[1].init as RequestInit;
    // El Content-Type lo define fetch (boundary del multipart): no se fuerza JSON.
    expect(post.headers).not.toHaveProperty("Content-Type");
    expect((post.body as unknown as RecordingFormData).parts).toEqual([
      ["front", { name: "front.jpg", type: "image/jpeg", uri: FRONT_URI }],
      ["back", { name: "back.png", type: "image/png", uri: BACK_URI }],
    ]);
    expect(await screen.findByText("Recibimos tus documentos.")).toBeTruthy();
    expect(screen.getByText("En revisión")).toBeTruthy();
    expect(screen.queryByText(SUBMIT)).toBeNull();
    expect(mockSecureSet).not.toHaveBeenCalled();
  });

  it("dos toques simultáneos hacen un solo envío", async () => {
    replies[GET_KEY] = [verification("not_submitted"), verification("pending")];
    let release: (r: Response) => void = () => undefined;
    replies[POST_KEY] = [];
    await render(<IdentityVerificationScreen />);
    await screen.findByText("Verifica tu identidad");
    await pickBoth();
    (global.fetch as jest.Mock).mockImplementationOnce(
      (input: unknown, init?: unknown) => {
        calls.push({
          init: init as RequestInit,
          key: `POST ${new URL(String(input)).pathname}`,
        });
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
    );
    const button = screen.getByText(SUBMIT);
    await act(() => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    await act(async () =>
      release({
        json: () =>
          Promise.resolve({ attempt: 1, status: "pending", submissionId: "s" }),
        ok: true,
        status: 201,
      } as Response)
    );
    await screen.findByText("En revisión");
    expect(calls.filter((c) => c.key === POST_KEY)).toHaveLength(1);
  });

  it("un error de red es ambiguo: no confirma recepción y «Consultar estado» pregunta al backend conservando las imágenes", async () => {
    replies[GET_KEY] = [verification("not_submitted")];
    replies[POST_KEY] = [new TypeError("Network request failed")];
    await render(<IdentityVerificationScreen />);
    await screen.findByText("Verifica tu identidad");
    await pickBoth();
    await act(async () => fireEvent.press(screen.getByText(SUBMIT)));

    expect(screen.getByText(AMBIGUOUS)).toBeTruthy();
    expect(screen.queryByText("Recibimos tus documentos.")).toBeNull();

    await act(async () =>
      fireEvent.press(screen.getByText("Consultar estado"))
    );
    expect(calls.map((c) => c.key)).toEqual([GET_KEY, POST_KEY, GET_KEY]);
    // Sigue sin enviarse: se puede enviar de nuevo con las mismas imágenes.
    expect(screen.getByLabelText("Vista previa del frente")).toBeTruthy();
    expect(screen.getByText(SUBMIT)).toBeTruthy();
  });

  it("un archivo de más de 5 MB o en otro formato no se acepta; un 413 del backend se explica", async () => {
    replies[GET_KEY] = [verification("not_submitted")];
    replies[POST_KEY] = [{ body: { message: "File too large" }, status: 413 }];
    await render(<IdentityVerificationScreen />);
    await screen.findByText("Verifica tu identidad");

    mockLibrary.mockResolvedValueOnce({
      assets: [
        { fileSize: 6 * 1024 * 1024, mimeType: "image/jpeg", uri: FRONT_URI },
      ],
      canceled: false,
    });
    await choose("Frente", "Galería");
    expect(
      screen.getByText("Cada imagen debe pesar máximo 5 MB.")
    ).toBeTruthy();
    expect(screen.queryByLabelText("Vista previa del frente")).toBeNull();

    mockLibrary.mockResolvedValueOnce({
      assets: [{ mimeType: "image/heic", uri: "file:///x.heic" }],
      canceled: false,
    });
    await choose("Frente", "Galería");
    expect(screen.getByText("La imagen debe ser JPEG o PNG.")).toBeTruthy();

    await pickBoth();
    await act(async () => fireEvent.press(screen.getByText(SUBMIT)));
    expect(
      screen.getByText("Cada imagen debe pesar máximo 5 MB.")
    ).toBeTruthy();
    expect(calls.map((c) => c.key)).toEqual([GET_KEY, POST_KEY]);
  });

  it("sin permiso de cámara no se toma la foto", async () => {
    replies[GET_KEY] = [verification("not_submitted")];
    mockCameraPermission.mockResolvedValueOnce({ granted: false });
    await render(<IdentityVerificationScreen />);
    await screen.findByText("Verifica tu identidad");
    await choose("Frente", "Cámara");
    expect(mockCamera).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "Permiso denegado",
      "Necesitamos acceso a la cámara para fotografiar tu INE."
    );
  });
});

describe("verificacionidentidad.tsx · estados de la revisión", () => {
  it("pending: muestra la revisión sin formulario y «Actualizar estado» consulta el backend", async () => {
    replies[GET_KEY] = [verification("pending"), verification("approved")];
    replies[STATUS_KEY] = [
      { body: { canBookAppointments: true }, status: 200 },
    ];
    await render(<IdentityVerificationScreen />);
    expect(await screen.findByText("En revisión")).toBeTruthy();
    expect(screen.queryByText(SUBMIT)).toBeNull();
    await act(async () =>
      fireEvent.press(screen.getByText("Actualizar estado"))
    );
    expect(await screen.findByText("Identidad verificada")).toBeTruthy();
  });

  it("approved: ofrece agendar SOLO si el backend confirma canBookAppointments", async () => {
    replies[GET_KEY] = [verification("approved")];
    replies[STATUS_KEY] = [
      { body: { canBookAppointments: false }, status: 200 },
    ];
    await render(<IdentityVerificationScreen />);
    expect(await screen.findByText("Tu identidad fue aprobada.")).toBeTruthy();
    await waitFor(() => expect(calls.map((c) => c.key)).toContain(STATUS_KEY));
    expect(screen.queryByText("Agendar una cita")).toBeNull();

    replies[STATUS_KEY] = [
      { body: { canBookAppointments: true }, status: 200 },
    ];
    await render(<IdentityVerificationScreen />);
    await act(async () =>
      fireEvent.press(await screen.findByText("Agendar una cita"))
    );
    expect(mockPush).toHaveBeenCalledWith("/(app)/seleccioncita");
  });

  it("approved desde la reserva: vuelve a la reserva en lugar de abrir otra", async () => {
    mockParams.origen = "reserva";
    replies[GET_KEY] = [verification("approved")];
    replies[STATUS_KEY] = [
      { body: { canBookAppointments: true }, status: 200 },
    ];
    await render(<IdentityVerificationScreen />);
    await act(async () =>
      fireEvent.press(await screen.findByText("Continuar con la reserva"))
    );
    expect(mockBack).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("rejected: muestra el motivo y permite reenviar la documentación", async () => {
    replies[GET_KEY] = [
      verification("rejected", "La foto del reverso no es legible"),
      verification("pending"),
    ];
    replies[POST_KEY] = [
      {
        body: { attempt: 2, status: "pending", submissionId: "s-2" },
        status: 201,
      },
    ];
    await render(<IdentityVerificationScreen />);
    expect(
      await screen.findByText("Tu identificación fue rechazada")
    ).toBeTruthy();
    expect(
      screen.getByText("Motivo: La foto del reverso no es legible")
    ).toBeTruthy();
    await pickBoth();
    await act(async () =>
      fireEvent.press(screen.getByText("Reenviar documentación"))
    );
    expect(calls.map((c) => c.key)).toEqual([GET_KEY, POST_KEY, GET_KEY]);
    expect(await screen.findByText("En revisión")).toBeTruthy();
  });

  it("un 409 (ya hay un envío en revisión) muestra el estado real del backend", async () => {
    replies[GET_KEY] = [verification("not_submitted"), verification("pending")];
    replies[POST_KEY] = [
      {
        body: {
          error: "IdentityVerificationPendingError",
          message: "Ya tienes una verificación de identidad en revisión",
        },
        status: 409,
      },
    ];
    await render(<IdentityVerificationScreen />);
    await screen.findByText("Verifica tu identidad");
    await pickBoth();
    await act(async () => fireEvent.press(screen.getByText(SUBMIT)));
    expect(await screen.findByText("En revisión")).toBeTruthy();
    expect(screen.queryByText("Recibimos tus documentos.")).toBeNull();
  });

  it("si no se puede consultar el estado, se avisa y se puede reintentar", async () => {
    replies[GET_KEY] = [
      { body: {}, status: 503 },
      verification("not_submitted"),
    ];
    await render(<IdentityVerificationScreen />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText(SUBMIT)).toBeNull();
    await act(async () => fireEvent.press(screen.getByText("Reintentar")));
    expect(await screen.findByText("Verifica tu identidad")).toBeTruthy();
  });
});
