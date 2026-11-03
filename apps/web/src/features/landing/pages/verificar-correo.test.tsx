import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfessionalAccess } from "@/features/professionals/professional-access";
import { Landing as VerificarCorreo } from "./verificar-correo";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const auth = vi.hoisted(() => ({
  professional: false,
  email: "ana@ejemplo.test" as string | null,
  sendVerificationEmail: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    sendVerificationEmail: auth.sendVerificationEmail,
    signUp: { email: vi.fn() },
    signIn: { email: vi.fn() },
  },
  appUrl: (path: string) => `http://web.test${path}`,
  authErrorMessage: () => "Error",
  pendingEmail: () => auth.email,
  hasProfessionalIntent: () => auth.professional,
  rememberPendingEmail: vi.fn(),
  rememberProfessionalIntent: vi.fn(),
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
}));

beforeEach(() => {
  auth.email = "ana@ejemplo.test";
  auth.sendVerificationEmail.mockResolvedValue({ error: null });
  window.location.hash = "";
});

// El contador de 30 s se adelanta con temporizadores falsos (activos desde antes del render) para poder reenviar.
async function resendNow() {
  // Cada segundo programa el siguiente tras volver a renderizar.
  for (let i = 0; i < 31; i++)
    await act(() => vi.advanceTimersByTimeAsync(1000));
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(screen.getByRole("button", { name: "Reenviar correo" }));
  vi.useRealTimers();
}

describe("/verificar-correo de pacientes (sin cambios)", () => {
  beforeEach(() => {
    auth.professional = false;
  });

  it("conserva textos, destinos y panel de pacientes", async () => {
    render(<VerificarCorreo />);
    expect(
      screen.getByText(/Ábrelo para activar tu cuenta; si no lo ves/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ya verifiqué, iniciar sesión" }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.getByRole("link", { name: "Cambiar correo" }),
    ).toHaveAttribute("href", "/signup");
    expect(screen.getByText(/comprar PrEP/)).toBeInTheDocument();
    expect(
      screen.queryByText("Profesionales de la salud"),
    ).not.toBeInTheDocument();
  });

  it("el reenvío vuelve a /completar-registro", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<VerificarCorreo />);
    await resendNow();
    expect(auth.sendVerificationEmail).toHaveBeenCalledWith({
      email: "ana@ejemplo.test",
      callbackURL: "http://web.test/completar-registro",
    });
  });
});

describe("/verificar-correo con intención profesional", () => {
  beforeEach(() => {
    auth.professional = true;
  });

  it("muestra el portal profesional y sus textos", async () => {
    render(<VerificarCorreo />);
    expect(
      await screen.findByText(/continuar con tu registro profesional/),
    ).toBeInTheDocument();
    expect(screen.getByText("Profesionales de la salud")).toBeInTheDocument();
    expect(screen.getByText(/Portal para/)).toBeInTheDocument();
  });

  it("«Ya verifiqué» y «Cambiar correo» vuelven a /profesionales, nunca al registro de pacientes", async () => {
    render(<VerificarCorreo />);
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: "Ya verifiqué, iniciar sesión" }),
      ).toHaveAttribute("href", "/profesionales#ingresar"),
    );
    expect(
      screen.getByRole("link", { name: "Cambiar correo" }),
    ).toHaveAttribute("href", "/profesionales#crear");
  });

  it("el reenvío vuelve al portal profesional", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<VerificarCorreo />);
    await screen.findByText(/continuar con tu registro profesional/);
    await resendNow();
    expect(auth.sendVerificationEmail).toHaveBeenCalledWith({
      email: "ana@ejemplo.test",
      callbackURL: "http://web.test/profesionales/registro",
    });
  });
});

describe("/profesionales al volver de la verificación", () => {
  it("#ingresar abre el inicio de sesión con el correo pendiente", async () => {
    window.location.hash = "#ingresar";
    render(<ProfessionalAccess />);
    expect(
      await screen.findByRole("tab", { name: "Ya tengo cuenta" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Correo electrónico")).toHaveValue(
      "ana@ejemplo.test",
    );
  });

  it("sin #ingresar (otro dispositivo o acceso directo) abre el alta", () => {
    render(<ProfessionalAccess />);
    expect(screen.getByRole("tab", { name: "Crear cuenta" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
