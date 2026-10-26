import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "@/app/admin/page";
import { COMPLETE_REGISTRATION_PATH } from "@/features/components/require-registration";
import { meAs, mockFetch, ok } from "@/test/http";
import { AdminHome } from "./admin-home";

const replace = vi.fn();
// Como el de Next, el router es el mismo objeto en cada render.
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const auth = vi.hoisted(() => ({
  session: { data: { user: {} } as unknown, isPending: false },
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => auth.session, signOut: auth.signOut },
}));

const MESSAGE = "El panel de administración de PEI está en preparación";

describe("/admin (pantalla provisional)", () => {
  beforeEach(() => {
    replace.mockReset();
    auth.signOut.mockReset();
    auth.session = { data: { user: {} }, isPending: false };
  });

  it("el administrador ve el mensaje provisional y su correo, sin funciones de administración", async () => {
    mockFetch({ "GET /me": ok(meAs("admin", "pei_admin@example.test")) });
    render(<AdminHome />);

    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("pei_admin@example.test")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Cerrar sesión",
    ]);
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["paciente", "patient"],
    ["sin perfil", null],
    ["médico", "doctor"],
  ] as const)("%s: no se queda en /admin y se envía a /completar-registro", async (_, role) => {
    mockFetch({ "GET /me": ok(meAs(role)) });
    render(<AdminHome />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(COMPLETE_REGISTRATION_PATH),
    );
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it("cerrar sesión llama a Better Auth y vuelve a /login", async () => {
    auth.signOut.mockImplementation(
      async (options: { fetchOptions: { onSuccess: () => void } }) =>
        options.fetchOptions.onSuccess(),
    );
    mockFetch({ "GET /me": ok(meAs("admin")) });
    render(<AdminHome />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Cerrar sesión" }),
    );
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("si GET /me responde 401, envía a /login", async () => {
    mockFetch({ "GET /me": { status: 401, body: { statusCode: 401 } } });
    render(<AdminHome />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("si la consulta falla, muestra el error y permite reintentar", async () => {
    mockFetch({
      "GET /me": [
        { status: 500, body: { statusCode: 500 } },
        ok(meAs("admin")),
      ],
    });
    render(<AdminHome />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument();
  });

  it("la página exige sesión: sin sesión envía a /login sin pedir /me", async () => {
    auth.session = { data: null, isPending: false };
    const { calls } = mockFetch({});
    render(<AdminPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(calls).toEqual([]);
  });
});
