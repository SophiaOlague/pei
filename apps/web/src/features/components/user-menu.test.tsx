import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMeCache, profilePhotoChanged } from "@/lib/api";
import { mockFetch, ok, status } from "@/test/http";
import { UserMenu } from "./user-menu";

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const auth = vi.hoisted(() => ({
  session: {
    data: null as null | { user: { id: string; name: string; email: string } },
    isPending: false,
  },
  signOut: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => auth.session, signOut: auth.signOut },
}));

const me = (profile: { firstName: string; lastName: string } | null) => ({
  user: { id: "u1", email: "x@ejemplo.test" },
  role: profile ? "patient" : null,
  profile: profile && {
    ...profile,
    birthDate: null,
    curp: "XEXX010101HNEXXXA4",
    phone: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    hasPhoto: false,
  },
  registrationStatus: status(),
});

describe("Nombre en el encabezado", () => {
  beforeEach(() => {
    clearMeCache();
    auth.session = {
      data: {
        user: { id: "u1", name: "Nombre de registro", email: "x@ejemplo.test" },
      },
      isPending: false,
    };
  });

  it("muestra el nombre del perfil (GET /me) y nunca «Usuario 1»", async () => {
    mockFetch({ "GET /me": ok(me({ firstName: "Ana", lastName: "Pérez" })) });
    render(<UserMenu />);

    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.queryByText("Usuario 1")).not.toBeInTheDocument();
  });

  it("sin perfil todavía, usa el nombre que la persona dio al registrarse", async () => {
    mockFetch({ "GET /me": ok(me(null)) });
    render(<UserMenu />);

    expect(await screen.findByText("Nombre de registro")).toBeInTheDocument();
  });

  it("si GET /me falla, no muestra ningún nombre", async () => {
    const { calls } = mockFetch({ "GET /me": { status: 500, body: {} } });
    render(<UserMenu />);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(
      screen.queryByText(/Usuario 1|Ana|Nombre de registro/),
    ).not.toBeInTheDocument();
  });

  it("sin sesión no pide /me ni muestra nombre", () => {
    auth.session = { data: null, isPending: false };
    const { calls } = mockFetch({});
    render(<UserMenu />);

    expect(calls).toHaveLength(0);
    expect(screen.queryByText("Usuario 1")).not.toBeInTheDocument();
  });

  it("varios encabezados del mismo usuario hacen una sola petición a /me", async () => {
    const { calls } = mockFetch({
      "GET /me": ok(me({ firstName: "Ana", lastName: "Pérez" })),
    });
    render(
      <>
        <UserMenu />
        <UserMenu />
      </>,
    );

    expect(await screen.findAllByText("Ana Pérez")).toHaveLength(2);
    expect(calls.filter((c) => c.key === "GET /me")).toHaveLength(1);
  });

  it("al cerrar sesión se descarta el nombre guardado", async () => {
    const { calls } = mockFetch({
      "GET /me": [
        ok(me({ firstName: "Ana", lastName: "Pérez" })),
        ok(me({ firstName: "Otra", lastName: "Persona" })),
      ],
    });
    const { unmount } = render(<UserMenu />);
    await screen.findByText("Ana Pérez");

    await userEvent.click(screen.getByText("Ana Pérez"));
    await userEvent.click(
      screen.getByRole("button", { name: "Cerrar sesión" }),
    );
    unmount();
    render(<UserMenu />);

    expect(await screen.findByText("Otra Persona")).toBeInTheDocument();
    expect(calls.filter((c) => c.key === "GET /me")).toHaveLength(2);
  });
});

describe("Avatar en el encabezado", () => {
  let urls = 0;
  const revoke = vi.fn();
  beforeEach(() => {
    clearMeCache();
    urls = 0;
    revoke.mockReset();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => `blob:foto-${++urls}`),
        revokeObjectURL: revoke,
      }),
    );
    auth.session = {
      data: { user: { id: "u1", name: "N", email: "x@ejemplo.test" } },
      isPending: false,
    };
  });

  const conFoto = (hasPhoto: boolean) => {
    const m = me({ firstName: "Ana", lastName: "Pérez" });
    return { ...m, profile: m.profile && { ...m.profile, hasPhoto } };
  };
  const avatar = () => screen.getByAltText("Perfil");

  it("con foto, muestra la foto privada del usuario", async () => {
    const { calls } = mockFetch({
      "GET /me": ok(conFoto(true)),
      "GET /me/profile/photo": ok({}),
    });
    render(<UserMenu />);

    await waitFor(() => expect(avatar()).toHaveAttribute("src", "blob:foto-1"));
    expect(calls.filter((c) => c.key === "GET /me/profile/photo")).toHaveLength(
      1,
    );
  });

  it("sin foto, conserva el avatar de la entrega y no pide la foto", async () => {
    const { calls } = mockFetch({ "GET /me": ok(conFoto(false)) });
    render(<UserMenu />);

    await screen.findByText("Ana Pérez");
    expect(avatar().getAttribute("src")).toContain("perfil-usuario.png");
    expect(calls.some((c) => c.key === "GET /me/profile/photo")).toBe(false);
  });

  it("si la descarga de la foto falla, conserva el avatar de la entrega", async () => {
    const { calls } = mockFetch({
      "GET /me": ok(conFoto(true)),
      "GET /me/profile/photo": { status: 500, body: {} },
    });
    render(<UserMenu />);

    await waitFor(() =>
      expect(calls.some((c) => c.key === "GET /me/profile/photo")).toBe(true),
    );
    await screen.findByText("Ana Pérez");
    expect(avatar().getAttribute("src")).toContain("perfil-usuario.png");
  });

  it("sin sesión conserva el avatar de la entrega sin peticiones", () => {
    auth.session = { data: null, isPending: false };
    const { calls } = mockFetch({});
    render(<UserMenu />);

    expect(avatar().getAttribute("src")).toContain("perfil-usuario.png");
    expect(calls).toHaveLength(0);
  });

  it("varios encabezados comparten una sola descarga de la foto", async () => {
    const { calls } = mockFetch({
      "GET /me": ok(conFoto(true)),
      "GET /me/profile/photo": ok({}),
    });
    render(
      <>
        <UserMenu />
        <UserMenu />
      </>,
    );

    await waitFor(() =>
      expect(
        screen.getAllByAltText("Perfil").map((i) => i.getAttribute("src")),
      ).toEqual(["blob:foto-1", "blob:foto-1"]),
    );
    expect(calls.filter((c) => c.key === "GET /me/profile/photo")).toHaveLength(
      1,
    );
  });

  it("tras subir una foto nueva, la vuelve a pedir y libera la anterior", async () => {
    const { calls } = mockFetch({
      "GET /me": ok(conFoto(false)),
      "GET /me/profile/photo": ok({}),
    });
    render(<UserMenu />);
    await screen.findByText("Ana Pérez");
    expect(avatar().getAttribute("src")).toContain("perfil-usuario.png");

    act(() => profilePhotoChanged("u1"));
    await waitFor(() => expect(avatar()).toHaveAttribute("src", "blob:foto-1"));

    act(() => profilePhotoChanged("u1"));
    await waitFor(() => expect(avatar()).toHaveAttribute("src", "blob:foto-2"));
    expect(revoke).toHaveBeenCalledWith("blob:foto-1");
    expect(calls.filter((c) => c.key === "GET /me/profile/photo")).toHaveLength(
      2,
    );
  });

  it("al cerrar sesión libera la foto descargada", async () => {
    mockFetch({
      "GET /me": ok(conFoto(true)),
      "GET /me/profile/photo": ok({}),
    });
    render(<UserMenu />);
    await waitFor(() => expect(avatar()).toHaveAttribute("src", "blob:foto-1"));

    clearMeCache();
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:foto-1"));
  });
});
