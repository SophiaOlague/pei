import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout from "@/app/admin/layout";
import AdminPage from "@/app/admin/page";
import { COMPLETE_REGISTRATION_PATH } from "@/features/components/require-registration";
import {
  getDoctorIdentityDocument,
  listAdminDoctors,
  rejectDoctorLicenseReview,
} from "@/lib/api";
import { meAs, mockFetch, ok } from "@/test/http";
import { ADMIN_PROFESSIONALS_PATH } from "./paths";

const replace = vi.fn();
// Como el de Next, el router es el mismo objeto en cada render.
const router = { replace };
const nav = vi.hoisted(() => ({ pathname: "/admin" }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => nav.pathname,
}));

const auth = vi.hoisted(() => ({
  session: { data: { user: {} } as unknown, isPending: false },
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => auth.session, signOut: auth.signOut },
}));

const TITLE = "Administración de PEI";

const renderAdmin = () =>
  render(
    <AdminLayout>
      <AdminPage />
    </AdminLayout>,
  );

describe("/admin (panel administrativo)", () => {
  beforeEach(() => {
    replace.mockReset();
    auth.signOut.mockReset();
    auth.session = { data: { user: {} }, isPending: false };
    nav.pathname = "/admin";
  });

  it("el administrador ve el panel, su correo y la navegación, sin estadísticas inventadas", async () => {
    mockFetch({ "GET /me": ok(meAs("admin", "pei_admin@example.test")) });
    renderAdmin();

    expect(
      await screen.findByRole("heading", { name: TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText("pei_admin@example.test")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "El panel de administración de PEI está en preparación",
      ),
    ).not.toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Administración" });
    const links = Array.from(nav.querySelectorAll("a")).map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["Inicio", "/admin"],
      ["Revisión de profesionales", ADMIN_PROFESSIONALS_PATH],
    ]);
    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Cerrar sesión",
    ]);
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["paciente", "patient"],
    ["sin perfil", null],
    ["médico", "doctor"],
  ] as const)("%s: no ve el panel y se envía a /completar-registro", async (_, role) => {
    mockFetch({ "GET /me": ok(meAs(role)) });
    renderAdmin();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(COMPLETE_REGISTRATION_PATH),
    );
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("si GET /me responde 403, no muestra el panel y se envía a /completar-registro", async () => {
    mockFetch({ "GET /me": { status: 403, body: { statusCode: 403 } } });
    renderAdmin();

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(COMPLETE_REGISTRATION_PATH),
    );
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("cerrar sesión llama a Better Auth y vuelve a /login", async () => {
    auth.signOut.mockImplementation(
      async (options: { fetchOptions: { onSuccess: () => void } }) =>
        options.fetchOptions.onSuccess(),
    );
    mockFetch({ "GET /me": ok(meAs("admin")) });
    renderAdmin();

    await userEvent.click(
      await screen.findByRole("button", { name: "Cerrar sesión" }),
    );
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("si GET /me responde 401, envía a /login", async () => {
    mockFetch({ "GET /me": { status: 401, body: { statusCode: 401 } } });
    renderAdmin();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("si la consulta falla, muestra el error y permite reintentar", async () => {
    mockFetch({
      "GET /me": [
        { status: 500, body: { statusCode: 500 } },
        ok(meAs("admin")),
      ],
    });
    renderAdmin();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByRole("heading", { name: TITLE }),
    ).toBeInTheDocument();
  });

  it("el layout exige sesión: sin sesión envía a /login sin pedir /me", async () => {
    auth.session = { data: null, isPending: false };
    const { calls } = mockFetch({});
    renderAdmin();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(calls).toEqual([]);
  });

  it("en una sección marca su enlace como activo", async () => {
    nav.pathname = ADMIN_PROFESSIONALS_PATH;
    mockFetch({ "GET /me": ok(meAs("admin")) });
    renderAdmin();

    expect(
      await screen.findByRole("link", { name: "Revisión de profesionales" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});

describe("cliente API administrativo", () => {
  it("lista médicos con filtro y paginación del backend, con la sesión", async () => {
    const { fetchMock } = mockFetch({
      "GET /admin/doctors": ok({ items: [], total: 0 }),
    });
    await expect(
      listAdminDoctors({ status: "pending", page: 2, pageSize: 50 }),
    ).resolves.toEqual({ items: [], total: 0 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).search).toBe(
      "?status=pending&page=2&pageSize=50",
    );
    expect(init?.credentials).toBe("include");
  });

  it("los documentos se piden con la sesión y sin caché del navegador", async () => {
    const { fetchMock } = mockFetch({
      "GET /admin/doctor-identity-verifications/r1/documents/front": ok({}),
    });
    await getDoctorIdentityDocument("r1", "front");
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.credentials).toBe("include");
    expect(init?.cache).toBe("no-store");
  });

  it("el rechazo envía solo el motivo al endpoint autorizado", async () => {
    const { calls } = mockFetch({
      "POST /admin/doctor-license-verifications/r2/reject": ok({}),
    });
    await rejectDoctorLicenseReview("r2", "La cédula no es legible");
    expect(calls).toEqual([
      {
        key: "POST /admin/doctor-license-verifications/r2/reject",
        body: { reason: "La cédula no es legible" },
      },
    ]);
  });
});
