import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMeCache, type PatientProfile } from "@/lib/api";
import { mockFetch, ok } from "@/test/http";
import { Landing } from "./perfil-usuario";

const replace = vi.fn();
const changePassword = vi.hoisted(() => vi.fn());
// Como el de Next, el router es el mismo objeto en cada render.
const router = { replace, push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/auth-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-client")>()),
  authClient: {
    useSession: () => ({
      data: { user: { id: "u1", email: "paciente@ejemplo.test", name: "x" } },
      isPending: false,
    }),
    signOut: vi.fn(),
    changePassword,
  },
}));

const profile: PatientProfile = {
  firstName: "Ana",
  lastName: "Pérez López",
  birthDate: "2001-01-01",
  curp: "XEXX010101HNEXXXA4",
  phone: "6180000000",
  address: "Calle Uno 1",
  emergencyContactName: null,
  emergencyContactPhone: null,
  hasPhoto: false,
};

beforeEach(() => {
  replace.mockReset();
  clearMeCache();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:foto"),
      revokeObjectURL: vi.fn(),
    }),
  );
});

describe("Perfil del paciente: carga", () => {
  it("muestra los datos reales del backend y deja de solo lectura nombre, CURP y fecha", async () => {
    mockFetch({ "GET /me/profile": ok(profile) });
    render(<Landing />);

    expect(await screen.findByText("XEXX010101HNEXXXA4")).toBeInTheDocument();
    expect(screen.getAllByText("Ana Pérez López").length).toBeGreaterThan(0);
    expect(screen.getByText("1 de enero, 2001")).toBeInTheDocument();
    expect(screen.getByText("6180000000")).toBeInTheDocument();
    expect(screen.getAllByText("paciente@ejemplo.test").length).toBeGreaterThan(
      0,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Editar perfil" }),
    );
    // Solo los cuatro campos que admite PATCH /me/profile son editables.
    expect(
      screen
        .getAllByRole("textbox")
        .map((i) => i.id)
        .sort(),
    ).toEqual(
      [
        "address",
        "emergencyContactName",
        "emergencyContactPhone",
        "phone",
      ].sort(),
    );
  });

  it("muestra el error de carga y permite reintentar", async () => {
    mockFetch({
      "GET /me/profile": [
        { status: 500, body: { statusCode: 500 } },
        ok(profile),
      ],
    });
    render(<Landing />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El servidor no pudo completar la operación",
    );
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("XEXX010101HNEXXXA4")).toBeInTheDocument();
  });

  it("sin sesión en el backend (401) envía a /login", async () => {
    mockFetch({
      "GET /me/profile": { status: 401, body: { statusCode: 401 } },
    });
    render(<Landing />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("descarga la foto privada solo si el perfil la tiene", async () => {
    const { calls } = mockFetch({
      "GET /me/profile": ok({ ...profile, hasPhoto: true }),
      "GET /me/profile/photo": ok({}),
    });
    render(<Landing />);

    expect(await screen.findByAltText("Foto de perfil")).toHaveAttribute(
      "src",
      "blob:foto",
    );
    expect(calls.map((c) => c.key)).toContain("GET /me/profile/photo");
  });
});

describe("Perfil del paciente: edición", () => {
  it("envía solo los campos modificados, vacío como null, y confirma tras el éxito", async () => {
    const saved = { ...profile, phone: "6181111111", address: null };
    const { calls } = mockFetch({
      "GET /me/profile": [ok(profile), ok(saved)],
      "PATCH /me/profile": ok({ updated: ["phone", "address"] }),
    });
    render(<Landing />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Editar perfil" }),
    );
    const phone = screen.getByLabelText("Número:");
    await userEvent.clear(phone);
    await userEvent.type(phone, "6181111111");
    await userEvent.clear(screen.getByLabelText("Dirección:"));
    expect(screen.queryByText("Cambios guardados")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar cambios" }),
    );

    expect(await screen.findByText("Cambios guardados")).toBeInTheDocument();
    expect(calls.find((c) => c.key === "PATCH /me/profile")?.body).toEqual({
      phone: "6181111111",
      address: null,
    });
    expect(screen.getByText("6181111111")).toBeInTheDocument();
  });

  it("si el backend rechaza el cambio, muestra el error y no confirma", async () => {
    mockFetch({
      "GET /me/profile": ok(profile),
      "PATCH /me/profile": {
        status: 400,
        body: {
          statusCode: 400,
          message: ["phone must be shorter than or equal to 30 characters"],
          error: "Bad Request",
        },
      },
    });
    render(<Landing />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Editar perfil" }),
    );
    await userEvent.type(screen.getByLabelText("Número:"), "9".repeat(31));
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar cambios" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "phone must be shorter than or equal to 30 characters",
    );
    expect(screen.queryByText("Cambios guardados")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Número:")).toBeInTheDocument();
  });

  it("sin cambios no llama al backend", async () => {
    const { calls } = mockFetch({ "GET /me/profile": ok(profile) });
    render(<Landing />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Editar perfil" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar cambios" }),
    );

    expect(calls.some((c) => c.key === "PATCH /me/profile")).toBe(false);
    expect(
      screen.getByRole("button", { name: "Editar perfil" }),
    ).toBeInTheDocument();
  });
});

describe("Perfil del paciente: foto", () => {
  it("sube la foto como multipart en el campo photo y confirma tras el éxito", async () => {
    const { fetchMock } = mockFetch({
      "GET /me/profile": ok(profile),
      "PUT /me/profile/photo": ok({ hasPhoto: true }),
      "GET /me/profile/photo": ok({}),
    });
    render(<Landing />);

    const file = new File(["png"], "foto.png", { type: "image/png" });
    await userEvent.upload(await screen.findByTestId("photo-input"), file);

    expect(await screen.findByText("Foto actualizada")).toBeInTheDocument();
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    const body = put?.[1]?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("photo")).toBe(file);
    // El navegador fija el Content-Type multipart; no se fuerza JSON.
    expect(put?.[1]?.headers).toBeUndefined();
  });

  it("un error de foto anterior se limpia al editar y no queda junto a «Cambios guardados»", async () => {
    mockFetch({
      "GET /me/profile": [ok(profile), ok({ ...profile, phone: "6182222222" })],
      "PATCH /me/profile": ok({ updated: ["phone"] }),
    });
    render(<Landing />);

    const gif = new File(["gif"], "foto.gif", { type: "image/gif" });
    await userEvent.upload(await screen.findByTestId("photo-input"), gif, {
      applyAccept: false,
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("JPEG o PNG");

    await userEvent.click(
      screen.getByRole("button", { name: "Editar perfil" }),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    const phone = screen.getByLabelText("Número:");
    await userEvent.clear(phone);
    await userEvent.type(phone, "6182222222");
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar cambios" }),
    );

    expect(await screen.findByText("Cambios guardados")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rechaza en el cliente un archivo que no es JPEG ni PNG, sin subirlo", async () => {
    const { calls } = mockFetch({ "GET /me/profile": ok(profile) });
    render(<Landing />);

    const file = new File(["gif"], "foto.gif", { type: "image/gif" });
    await userEvent.upload(await screen.findByTestId("photo-input"), file, {
      applyAccept: false,
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("JPEG o PNG");
    expect(calls.some((c) => c.key === "PUT /me/profile/photo")).toBe(false);
  });

  it("muestra el error del backend al subir la foto", async () => {
    mockFetch({
      "GET /me/profile": ok(profile),
      "PUT /me/profile/photo": {
        status: 400,
        body: {
          statusCode: 400,
          message: "La imagen debe ser JPEG o PNG",
          error: "InvalidImageError",
        },
      },
    });
    render(<Landing />);

    const file = new File(["x"], "foto.png", { type: "image/png" });
    await userEvent.upload(await screen.findByTestId("photo-input"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La imagen debe ser JPEG o PNG",
    );
    expect(screen.queryByText("Foto actualizada")).not.toBeInTheDocument();
  });
});

describe("Perfil del paciente: contraseña", () => {
  it("«Cambiar» abre el formulario y solo confirma tras la respuesta correcta", async () => {
    changePassword.mockResolvedValueOnce({
      data: null,
      error: { status: 400, code: "INVALID_PASSWORD" },
    });
    changePassword.mockResolvedValueOnce({
      data: { token: null },
      error: null,
    });
    mockFetch({ "GET /me/profile": ok(profile) });
    render(<Landing />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Cambiar" }),
    );
    await userEvent.type(
      screen.getByLabelText("Contraseña actual"),
      "Actual-123456",
    );
    await userEvent.type(
      screen.getByLabelText("Nueva contraseña"),
      "Nueva-1234567",
    );
    await userEvent.type(
      screen.getByLabelText("Confirmar contraseña"),
      "Nueva-1234567",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Guardar cambio" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no es correcta",
    );
    expect(
      screen.queryByText("Contraseña actualizada"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Guardar cambio" }),
    );
    expect(
      await screen.findByText("Contraseña actualizada"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
