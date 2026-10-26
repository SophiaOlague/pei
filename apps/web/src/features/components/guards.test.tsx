import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompletarRegistroPage from "@/app/completar-registro/page";
import { meAs, mockFetch, ok, status } from "@/test/http";
import {
  ADMIN_HOME_PATH,
  COMPLETE_REGISTRATION_PATH,
  RequireRegistration,
} from "./require-registration";
import { RequireSession } from "./require-session";

const replace = vi.fn();
// Como el de Next, el router es el mismo objeto en cada render.
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const session = vi.hoisted(() => ({
  value: { data: null as unknown, isPending: false },
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => session.value },
}));

describe("RequireSession", () => {
  beforeEach(() => replace.mockReset());

  it("sin sesión no muestra la página y envía a /login", async () => {
    session.value = { data: null, isPending: false };
    render(<RequireSession>contenido privado</RequireSession>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("contenido privado")).not.toBeInTheDocument();
  });

  it("mientras se comprueba la sesión no muestra nada ni redirige", () => {
    session.value = { data: null, isPending: true };
    render(<RequireSession>contenido privado</RequireSession>);

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByText("contenido privado")).not.toBeInTheDocument();
  });

  it("con sesión muestra la página", () => {
    session.value = { data: { user: {} }, isPending: false };
    render(<RequireSession>contenido privado</RequireSession>);

    expect(screen.getByText("contenido privado")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("RequireRegistration", () => {
  beforeEach(() => replace.mockReset());

  it.each([
    [
      "falta el perfil",
      status({ profileCompleted: false, missing: ["profile"] }),
    ],
    [
      "falta la aceptación legal",
      status({ legal: { accepted: false, pending: [] }, missing: ["legal"] }),
    ],
  ])("si %s, envía a completar el registro", async (_, current) => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(current),
    });
    render(<RequireRegistration>panel</RequireRegistration>);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(COMPLETE_REGISTRATION_PATH),
    );
    expect(screen.queryByText("panel")).not.toBeInTheDocument();
  });

  it("con perfil y aceptación legal muestra el panel aunque falte la INE", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(status()),
    });
    render(<RequireRegistration>panel</RequireRegistration>);

    expect(await screen.findByText("panel")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("si la consulta falla, muestra el error en vez de redirigir (sin bucles)", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": { status: 500, body: { statusCode: 500 } },
    });
    render(<RequireRegistration>panel</RequireRegistration>);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("si el backend responde 401, envía a /login", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": { status: 401, body: { statusCode: 401 } },
    });
    render(<RequireRegistration>panel</RequireRegistration>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("un administrador va a /admin sin consultar el registro de pacientes ni ver la página", async () => {
    const { calls } = mockFetch({ "GET /me": ok(meAs("admin")) });
    render(<RequireRegistration>panel</RequireRegistration>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(ADMIN_HOME_PATH));
    expect(calls.map((c) => c.key)).toEqual(["GET /me"]);
    expect(screen.queryByText("panel")).not.toBeInTheDocument();
  });

  it("otro rol (médico) no se envía a /admin: conserva el comportamiento actual (error del backend)", async () => {
    mockFetch({
      "GET /me": ok(meAs("doctor")),
      "GET /me/registration-status": {
        status: 403,
        body: {
          statusCode: 403,
          message: "El estado del registro solo aplica a pacientes",
        },
      },
    });
    render(<RequireRegistration>panel</RequireRegistration>);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El estado del registro solo aplica a pacientes",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("si GET /me responde 401, envía a /login sin consultar el registro", async () => {
    const { calls } = mockFetch({
      "GET /me": { status: 401, body: { statusCode: 401 } },
    });
    render(<RequireRegistration>panel</RequireRegistration>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(calls.map((c) => c.key)).toEqual(["GET /me"]);
  });
});

describe("/completar-registro", () => {
  beforeEach(() => replace.mockReset());

  it("con el registro incompleto se queda en la página: no redirige a sí misma", async () => {
    session.value = { data: { user: {} }, isPending: false };
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(
        status({ profileCompleted: false, missing: ["profile"] }),
      ),
    });
    render(<CompletarRegistroPage />);

    expect(await screen.findByLabelText("CURP")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sin sesión envía a /login", async () => {
    session.value = { data: null, isPending: false };
    render(<CompletarRegistroPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("destino del enlace de verificación del administrador: va a /admin sin mostrar el registro", async () => {
    session.value = { data: { user: {} }, isPending: false };
    const { calls } = mockFetch({ "GET /me": ok(meAs("admin")) });
    render(<CompletarRegistroPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(ADMIN_HOME_PATH));
    expect(calls.map((c) => c.key)).toEqual(["GET /me"]);
    expect(screen.queryByLabelText("CURP")).not.toBeInTheDocument();
  });
});
