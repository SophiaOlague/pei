import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompletarRegistroPage from "@/app/completar-registro/page";
import { PROFESSIONAL_PORTAL_PATH } from "@/features/professionals/paths";
import { meAs, mockFetch, ok, status } from "@/test/http";
import {
  ADMIN_HOME_PATH,
  COMPLETE_REGISTRATION_PATH,
  REVIEW_LEGAL_PATH,
  RequireRegistration,
} from "./require-registration";
import { RequireSession } from "./require-session";

const replace = vi.fn();
const push = vi.fn();
// Como el de Next, el router es el mismo objeto en cada render.
const router = { replace, push };
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

  it("un médico va al portal profesional sin consultar el registro de pacientes", async () => {
    const { calls } = mockFetch({ "GET /me": ok(meAs("doctor")) });
    render(<RequireRegistration>panel</RequireRegistration>);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(PROFESSIONAL_PORTAL_PATH),
    );
    expect(calls.map((c) => c.key)).toEqual(["GET /me"]);
    expect(screen.queryByText("panel")).not.toBeInTheDocument();
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

// D-37 / RN-140: la reaceptación de una versión legal nueva no bloquea el panel; el registro inicial, sí.
describe("RequireRegistration · reaceptación legal (D-37, RN-140)", () => {
  beforeEach(() => {
    replace.mockReset();
    push.mockReset();
  });
  const reacceptance = status({
    legal: { accepted: false, pending: [], reacceptanceRequired: true },
    missing: ["legal"],
  });

  it("[TC-WEB-REG-001] registro inicial incompleto: conserva el bloqueo (sin el indicador o con él en falso)", async () => {
    for (const legal of [
      { accepted: false, pending: [] },
      { accepted: false, pending: [], reacceptanceRequired: false },
    ]) {
      replace.mockReset();
      mockFetch({
        "GET /me": ok(meAs("patient")),
        "GET /me/registration-status": ok(
          status({ legal, missing: ["legal"] }),
        ),
      });
      const view = render(<RequireRegistration>panel</RequireRegistration>);
      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith(COMPLETE_REGISTRATION_PATH),
      );
      expect(screen.queryByText("panel")).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it("[TC-WEB-REG-001b] sin perfil, el indicador no abre el panel", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok({
        ...reacceptance,
        profileCompleted: false,
      }),
    });
    render(<RequireRegistration>panel</RequireRegistration>);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(COMPLETE_REGISTRATION_PATH),
    );
  });

  it("[TC-WEB-REG-002][TC-WEB-REG-003] reaceptación pendiente: muestra el panel (sus citas) con el aviso, se puede posponer y revisar", async () => {
    mockFetch({
      "GET /me": ok(meAs("patient")),
      "GET /me/registration-status": ok(reacceptance),
    });
    render(<RequireRegistration>mis citas confirmadas</RequireRegistration>);
    expect(
      await screen.findByText("mis citas confirmadas"),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Hay una nueva versión de los documentos legales",
    );
    screen.getByRole("button", { name: "Revisar y aceptar" }).click();
    expect(push).toHaveBeenCalledWith(REVIEW_LEGAL_PATH);
    expect(REVIEW_LEGAL_PATH).toBe("/completar-registro?revisar=1");
    screen.getByRole("button", { name: "Ahora no" }).click();
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("mis citas confirmadas")).toBeInTheDocument();
  });
});
