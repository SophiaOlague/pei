import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasProfessionalIntent,
  rememberProfessionalIntent,
} from "@/lib/auth-client";
import { Landing as Login } from "./login";
import { Landing as Signup } from "./signup";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// Solo se simula Better Auth: la intención usa el sessionStorage real.
const auth = vi.hoisted(() => ({ signUp: vi.fn(), signIn: vi.fn() }));
vi.mock("@/lib/auth-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-client")>()),
  authClient: {
    signUp: { email: auth.signUp },
    signIn: { email: auth.signIn },
  },
}));

beforeEach(() => {
  vi.stubGlobal("alert", vi.fn());
  auth.signUp.mockResolvedValue({ error: null });
  auth.signIn.mockResolvedValue({ error: null });
  rememberProfessionalIntent();
});

describe("La intención profesional no contamina el flujo de pacientes", () => {
  it("crear una cuenta en /signup la borra y vuelve a /completar-registro", async () => {
    render(<Signup />);
    await userEvent.type(
      screen.getByPlaceholderText("Ingresa tus nombres"),
      "Ana",
    );
    await userEvent.type(
      screen.getByPlaceholderText("Ingresa tus apellidos"),
      "Pérez",
    );
    await userEvent.type(
      screen.getByPlaceholderText("Ingresa tu email"),
      "ana@ejemplo.test",
    );
    await userEvent.type(
      screen.getByPlaceholderText("Crea una contraseña"),
      "contrasena1",
    );
    await userEvent.type(
      screen.getByPlaceholderText("Confirma tu contraseña"),
      "contrasena1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(hasProfessionalIntent()).toBe(false);
    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackURL: expect.stringMatching(/\/completar-registro$/),
      }),
    );
  });

  it("iniciar sesión en /login la borra", async () => {
    render(<Login />);
    await userEvent.type(
      screen.getByPlaceholderText("Introduce tu correo"),
      "ana@ejemplo.test",
    );
    await userEvent.type(
      screen.getByPlaceholderText("Introduce tu contraseña"),
      "contrasena1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Iniciar sesión" }),
    );

    expect(hasProfessionalIntent()).toBe(false);
    expect(router.push).toHaveBeenCalledWith("/completar-registro");
  });

  it("una validación fallida en /signup no la borra (no se inició el flujo de pacientes)", async () => {
    render(<Signup />);
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(hasProfessionalIntent()).toBe(true);
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});
