import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import LoginScreen from "@/app/(auth)/login";
import RegisterScreen from "@/app/(auth)/register";
import VerifyEmailScreen from "@/app/(auth)/verificar-correo";
import {
  clearPendingVerificationEmail,
  getPendingVerificationEmail,
  setPendingVerificationEmail,
} from "@/lib/pending-verification";

type AuthCall = (...args: unknown[]) => Promise<unknown>;

const RATE_LIMITED = /Demasiados intentos/;
const NETWORK_ERROR = /No pudimos conectar/;
const PASSWORD_LENGTH = /entre 8 y 128 caracteres/;
const RESENT = /te enviamos un nuevo enlace/;

const mockSignIn = jest.fn<AuthCall>();
const mockSignUp = jest.fn<AuthCall>();
const mockSendVerification = jest.fn<AuthCall>();
const mockPush = jest.fn();
const mockReplace = jest.fn();

// Ninguna prueba toca la red: el cliente de Better Auth se sustituye por completo.
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    sendVerificationEmail: (...args: unknown[]) =>
      mockSendVerification(...args),
    signIn: { email: (...args: unknown[]) => mockSignIn(...args) },
    signUp: { email: (...args: unknown[]) => mockSignUp(...args) },
  },
}));

jest.mock("expo-router", () => ({
  router: {
    back: jest.fn(),
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
}));

jest.mock("expo-symbols", () => ({ SymbolView: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  clearPendingVerificationEmail();
});

async function fillLogin(email: string, password: string) {
  await fireEvent.changeText(
    screen.getByPlaceholderText("Introduce tu correo"),
    email
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("Introduce tu contraseña"),
    password
  );
  await fireEvent.press(screen.getByText("Iniciar sesión"));
}

describe("LoginScreen", () => {
  it("envía el correo recortado y deja la navegación al guard de sesión", async () => {
    mockSignIn.mockResolvedValue({ data: {}, error: null });
    await render(<LoginScreen />);
    await fillLogin("  persona@ejemplo.com ", "secreta123");

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "persona@ejemplo.com",
        password: "secreta123",
      })
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("valida campos vacíos sin llamar al backend", async () => {
    await render(<LoginScreen />);
    await fireEvent.press(screen.getByText("Iniciar sesión"));
    expect(
      screen.getByText("Completa todos los campos para continuar.")
    ).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("muestra credenciales incorrectas con 401", async () => {
    mockSignIn.mockResolvedValue({
      data: null,
      error: { code: "INVALID_EMAIL_OR_PASSWORD", status: 401 },
    });
    await render(<LoginScreen />);
    await fillLogin("persona@ejemplo.com", "mala12345");
    expect(
      await screen.findByText("Correo o contraseña incorrectos.")
    ).toBeTruthy();
  });

  it("lleva a verificar el correo con 403 EMAIL_NOT_VERIFIED", async () => {
    mockSignIn.mockResolvedValue({
      data: null,
      error: { code: "EMAIL_NOT_VERIFIED", status: 403 },
    });
    await render(<LoginScreen />);
    await fillLogin("persona@ejemplo.com", "secreta123");
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/verificar-correo")
    );
    expect(getPendingVerificationEmail()).toBe("persona@ejemplo.com");
  });

  it("muestra el límite de intentos con 429", async () => {
    mockSignIn.mockResolvedValue({ data: null, error: { status: 429 } });
    await render(<LoginScreen />);
    await fillLogin("persona@ejemplo.com", "secreta123");
    expect(await screen.findByText(RATE_LIMITED)).toBeTruthy();
  });

  it("muestra un error de conexión si la petición falla", async () => {
    mockSignIn.mockRejectedValue(new TypeError("Network request failed"));
    await render(<LoginScreen />);
    await fillLogin("persona@ejemplo.com", "secreta123");
    expect(await screen.findByText(NETWORK_ERROR)).toBeTruthy();
  });
});

async function fillRegister(password = "secreta123", confirm = password) {
  await fireEvent.changeText(
    screen.getByPlaceholderText("Ingresa tus nombres"),
    "Ana"
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("Ingresa tu email"),
    "ana@ejemplo.com"
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("Crea una contraseña"),
    password
  );
  await fireEvent.changeText(
    screen.getByPlaceholderText("Confirma tu contraseña"),
    confirm
  );
  await fireEvent.press(screen.getByText("Crear cuenta"));
}

describe("RegisterScreen", () => {
  it("registra y va a revisar el correo, nunca a la app", async () => {
    mockSignUp.mockResolvedValue({ data: { token: null }, error: null });
    await render(<RegisterScreen />);
    await fillRegister();

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/verificar-correo")
    );
    expect(mockSignUp).toHaveBeenCalledWith({
      email: "ana@ejemplo.com",
      name: "Ana",
      password: "secreta123",
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(getPendingVerificationEmail()).toBe("ana@ejemplo.com");
  });

  it("valida la longitud y la confirmación sin llamar al backend", async () => {
    await render(<RegisterScreen />);
    await fillRegister("corta");
    expect(screen.getByText(PASSWORD_LENGTH)).toBeTruthy();
    await fillRegister("secreta123", "otra12345");
    expect(screen.getByText("Las contraseñas no coinciden.")).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("muestra el límite de intentos con 429 y no navega", async () => {
    mockSignUp.mockResolvedValue({ data: null, error: { status: 429 } });
    await render(<RegisterScreen />);
    await fillRegister();
    expect(await screen.findByText(RATE_LIMITED)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("muestra un error de conexión si la petición falla", async () => {
    mockSignUp.mockRejectedValue(new TypeError("Network request failed"));
    await render(<RegisterScreen />);
    await fillRegister();
    expect(await screen.findByText(NETWORK_ERROR)).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("VerifyEmailScreen", () => {
  it("reenvía el enlace al correo pendiente sin callbackURL", async () => {
    setPendingVerificationEmail("ana@ejemplo.com");
    mockSendVerification.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    await render(<VerifyEmailScreen />);
    expect(screen.getByText("ana@ejemplo.com")).toBeTruthy();

    await fireEvent.press(screen.getByText("Reenviar enlace"));
    expect(await screen.findByText(RESENT)).toBeTruthy();
    expect(mockSendVerification).toHaveBeenCalledWith({
      email: "ana@ejemplo.com",
    });
  });

  it("muestra el límite de reenvíos con 429", async () => {
    setPendingVerificationEmail("ana@ejemplo.com");
    mockSendVerification.mockResolvedValue({
      data: null,
      error: { status: 429 },
    });
    await render(<VerifyEmailScreen />);
    await fireEvent.press(screen.getByText("Reenviar enlace"));
    expect(await screen.findByText(RATE_LIMITED)).toBeTruthy();
  });

  it("sin correo pendiente no ofrece reenviar", async () => {
    await render(<VerifyEmailScreen />);
    expect(screen.queryByText("Reenviar enlace")).toBeNull();
    await fireEvent.press(screen.getByText("Ir a iniciar sesión"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});
