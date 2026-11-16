import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, identityRequirementOf } from "@/lib/api";
import { mockFetch, ok, status } from "@/test/http";
import { IdentityRequirementNotice } from "./identity-requirement-notice";
import { IdentityVerification } from "./identity-verification";
import { BOOKING_PATH, IDENTITY_VERIFICATION_FROM_BOOKING_PATH } from "./paths";

const DOCTOR_ID = "33333333-3333-4333-8333-333333333333";
const replace = vi.fn();
// Como el de Next, el router es el mismo objeto en cada render.
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// El encabezado consulta su propia API; no es parte de esta pantalla.
vi.mock("@/features/components/user-menu", () => ({ UserMenu: () => null }));

const GET_KEY = "GET /me/identity-verification";
const POST_KEY = "POST /me/identity-verification";
const STATUS_KEY = "GET /me/registration-status";
const SUBMIT = "Enviar documentación";
const AMBIGUOUS = /No pudimos confirmar si recibimos tus documentos/;

const verification = (s: string, rejectionReason: string | null = null) =>
  ok({ status: s, attempt: s === "not_submitted" ? 0 : 1, rejectionReason });
const created = (attempt = 1) => ({
  status: 201,
  body: { submissionId: "s-1", status: "pending", attempt },
});
const fail = (code: number, body: unknown) => ({ status: code, body });
const networkError = () => {
  throw new TypeError("Failed to fetch");
};

// El nombre del archivo del dispositivo podría llevar datos personales: no debe enviarse ni registrarse.
const image = (type = "image/jpeg", name = "INE de Lucía Ramos.jpg") =>
  new File(["x"], name, { type });
const big = () => {
  const file = image();
  Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 + 1 });
  return file;
};

let urlCount = 0;
const createObjectURL = vi.fn(() => `blob:pei/${++urlCount}`);
const revokeObjectURL = vi.fn();
const consoleSpies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  replace.mockReset();
  urlCount = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL, revokeObjectURL }),
  );
  for (const method of ["log", "info", "warn", "error"] as const)
    consoleSpies.push(vi.spyOn(console, method));
});

afterEach(() => {
  // Ni las imágenes, ni sus URLs, ni el nombre de los archivos se registran en la consola.
  const logged = consoleSpies.flatMap((s) => s.mock.calls.flat().map(String));
  for (const s of consoleSpies) s.mockRestore();
  consoleSpies.length = 0;
  vi.unstubAllGlobals();
  expect(logged.filter((l) => /blob:|Lucía|\.jpg|\.png/.test(l))).toEqual([]);
});

const input = (
  side: "Frente" | "Reverso",
  how: "elegir archivo" | "tomar foto",
) => screen.getByLabelText(`${side} de la INE: ${how}`) as HTMLInputElement;

async function pickBoth() {
  await userEvent.upload(input("Frente", "elegir archivo"), image());
  await userEvent.upload(
    input("Reverso", "tomar foto"),
    image("image/png", "IMG_0001.png"),
  );
}

describe("/verificacion-identidad · sin documentación enviada", () => {
  it("consulta el estado real y no permite enviar hasta tener frente y reverso", async () => {
    const { calls } = mockFetch({ [GET_KEY]: verification("not_submitted") });
    render(<IdentityVerification />);
    expect(
      await screen.findByRole("heading", { name: "Verifica tu identidad" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();
    // La cámara se ofrece con capture (en el teléfono abre la cámara trasera).
    expect(input("Frente", "tomar foto")).toHaveAttribute(
      "capture",
      "environment",
    );
    expect(input("Frente", "elegir archivo")).toHaveAttribute(
      "accept",
      "image/jpeg,image/png",
    );
    await userEvent.upload(input("Frente", "elegir archivo"), image());
    expect(screen.getByRole("button", { name: SUBMIT })).toBeDisabled();
    expect(calls.map((c) => c.key)).toEqual([GET_KEY]);
  });

  it("previsualiza, envía ambos archivos en multipart con nombres neutros y vuelve a consultar el estado", async () => {
    const { calls } = mockFetch({
      [GET_KEY]: [verification("not_submitted"), verification("pending")],
      [POST_KEY]: created(),
    });
    render(<IdentityVerification />);
    await screen.findByRole("heading", { name: "Verifica tu identidad" });
    await pickBoth();
    expect(
      screen.getByRole("img", { name: "Vista previa del frente" }),
    ).toHaveAttribute("src", "blob:pei/1");
    expect(
      screen.getByRole("img", { name: "Vista previa del reverso" }),
    ).toHaveAttribute("src", "blob:pei/2");

    await userEvent.click(screen.getByRole("button", { name: SUBMIT }));

    expect(
      await screen.findByText("Recibimos tus documentos."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "En revisión" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SUBMIT })).toBeNull();
    expect(calls.map((c) => c.key)).toEqual([GET_KEY, POST_KEY, GET_KEY]);
    const body = calls[1].body as FormData;
    const front = body.get("front") as File;
    const back = body.get("back") as File;
    expect([front.name, front.type]).toEqual(["front.jpg", "image/jpeg"]);
    expect([back.name, back.type]).toEqual(["back.png", "image/png"]);
    // Las vistas previas se liberan después del envío.
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pei/1");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pei/2");
  });

  it("reemplazar una imagen libera la vista previa anterior", async () => {
    mockFetch({ [GET_KEY]: verification("not_submitted") });
    render(<IdentityVerification />);
    await screen.findByRole("heading", { name: "Verifica tu identidad" });
    await userEvent.upload(input("Frente", "elegir archivo"), image());
    await userEvent.upload(input("Frente", "tomar foto"), image());
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pei/1");
    expect(
      screen.getByRole("img", { name: "Vista previa del frente" }),
    ).toHaveAttribute("src", "blob:pei/2");
  });

  it("valida JPEG/PNG y 5 MB antes de enviar, sin llamar al backend", async () => {
    const { calls } = mockFetch({ [GET_KEY]: verification("not_submitted") });
    render(<IdentityVerification />);
    await screen.findByRole("heading", { name: "Verifica tu identidad" });

    await userEvent.upload(
      input("Frente", "elegir archivo"),
      image("image/gif", "a.gif"),
      { applyAccept: false },
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La imagen debe ser JPEG o PNG.",
    );
    await userEvent.upload(input("Frente", "elegir archivo"), big());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Cada imagen debe pesar máximo 5 MB.",
    );
    expect(
      screen.queryByRole("img", { name: "Vista previa del frente" }),
    ).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(calls.map((c) => c.key)).toEqual([GET_KEY]);
  });

  it("dos clics seguidos hacen un solo envío", async () => {
    let release: () => void = () => undefined;
    const { calls } = mockFetch({
      [GET_KEY]: [verification("not_submitted"), verification("pending")],
      [POST_KEY]: created(),
    });
    const fetchMock = vi.mocked(fetch);
    const original = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === "POST")
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return (original as typeof fetch)(input, init);
    });
    render(<IdentityVerification />);
    await screen.findByRole("heading", { name: "Verifica tu identidad" });
    await pickBoth();
    const button = screen.getByRole("button", { name: SUBMIT });
    button.click();
    button.click();
    release();
    await screen.findByRole("heading", { name: "En revisión" });
    expect(calls.filter((c) => c.key === POST_KEY)).toHaveLength(1);
  });

  it("un error de red es ambiguo: no confirma recepción y «Consultar estado» pregunta al backend conservando las imágenes", async () => {
    const { calls } = mockFetch({
      [GET_KEY]: verification("not_submitted"),
      [POST_KEY]: networkError,
    });
    render(<IdentityVerification />);
    await screen.findByRole("heading", { name: "Verifica tu identidad" });
    await pickBoth();
    await userEvent.click(screen.getByRole("button", { name: SUBMIT }));

    expect(await screen.findByRole("alert")).toHaveTextContent(AMBIGUOUS);
    expect(screen.queryByText("Recibimos tus documentos.")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Consultar estado" }),
    );
    expect(calls.map((c) => c.key)).toEqual([GET_KEY, POST_KEY, GET_KEY]);
    // Sigue sin enviarse: se puede volver a enviar con las mismas imágenes.
    expect(
      screen.getByRole("img", { name: "Vista previa del frente" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SUBMIT })).toBeEnabled();
  });

  it("si «Consultar estado» tampoco obtiene respuesta, mantiene el aviso y las imágenes", async () => {
    mockFetch({
      [GET_KEY]: [verification("not_submitted"), fail(503, {})],
      [POST_KEY]: fail(502, {}),
    });
    render(<IdentityVerification />);
    await screen.findByRole("heading", { name: "Verifica tu identidad" });
    await pickBoth();
    await userEvent.click(screen.getByRole("button", { name: SUBMIT }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Consultar estado" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Consultar estado" }),
      ).toBeEnabled(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(AMBIGUOUS);
    expect(
      screen.getByRole("img", { name: "Vista previa del reverso" }),
    ).toBeInTheDocument();
  });

  it.each([
    [
      "límite de envíos (429)",
      fail(429, { message: "Too Many Requests" }),
      "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    ],
    [
      "validación del backend (400)",
      fail(400, {
        error: "InvalidDocumentFileError",
        message: "El archivo debe ser una imagen JPEG o PNG de máximo 5 MB",
      }),
      "El archivo debe ser una imagen JPEG o PNG de máximo 5 MB",
    ],
    [
      "archivo demasiado grande (413)",
      fail(413, { message: "File too large" }),
      "Cada imagen debe pesar máximo 5 MB.",
    ],
  ])("%s: muestra el error, conserva las imágenes y no vuelve a consultar", async (_, reply, text) => {
    const { calls } = mockFetch({
      [GET_KEY]: verification("not_submitted"),
      [POST_KEY]: reply,
    });
    render(<IdentityVerification />);
    await screen.findByRole("heading", { name: "Verifica tu identidad" });
    await pickBoth();
    await userEvent.click(screen.getByRole("button", { name: SUBMIT }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(calls.map((c) => c.key)).toEqual([GET_KEY, POST_KEY]);
    expect(
      screen.getByRole("img", { name: "Vista previa del frente" }),
    ).toBeInTheDocument();
  });

  it("conflicto (409: ya hay un envío en revisión) muestra el estado real del backend", async () => {
    mockFetch({
      [GET_KEY]: [verification("not_submitted"), verification("pending")],
      [POST_KEY]: fail(409, {
        error: "IdentityVerificationPendingError",
        message: "Ya tienes una verificación de identidad en revisión",
      }),
    });
    render(<IdentityVerification />);
    await screen.findByRole("heading", { name: "Verifica tu identidad" });
    await pickBoth();
    await userEvent.click(screen.getByRole("button", { name: SUBMIT }));
    expect(
      await screen.findByRole("heading", { name: "En revisión" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Recibimos tus documentos.")).toBeNull();
  });

  it("sesión expirada al enviar (401) envía a /login", async () => {
    mockFetch({
      [GET_KEY]: verification("not_submitted"),
      [POST_KEY]: fail(401, {}),
    });
    render(<IdentityVerification />);
    await screen.findByRole("heading", { name: "Verifica tu identidad" });
    await pickBoth();
    await userEvent.click(screen.getByRole("button", { name: SUBMIT }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});

describe("/verificacion-identidad · estados de la revisión", () => {
  it("pending: sin formulario; «Actualizar estado» consulta el backend", async () => {
    const { calls } = mockFetch({
      [GET_KEY]: [verification("pending"), verification("approved")],
      [STATUS_KEY]: ok(status({ canBookAppointments: true, missing: [] })),
    });
    render(<IdentityVerification />);
    expect(
      await screen.findByRole("heading", { name: "En revisión" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SUBMIT })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Actualizar estado" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Identidad verificada" }),
    ).toBeInTheDocument();
    expect(calls.map((c) => c.key)).toEqual([GET_KEY, GET_KEY, STATUS_KEY]);
  });

  it("approved: ofrece agendar SOLO si el backend confirma canBookAppointments", async () => {
    mockFetch({
      [GET_KEY]: verification("approved"),
      [STATUS_KEY]: ok(
        status({ canBookAppointments: false, missing: ["legal"] }),
      ),
    });
    render(<IdentityVerification />);
    expect(
      await screen.findByText(/tu registro tiene requisitos pendientes/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Agendar una cita" })).toBeNull();
  });

  it("approved y habilitado: el enlace lleva a agendar", async () => {
    mockFetch({
      [GET_KEY]: verification("approved"),
      [STATUS_KEY]: ok(status({ canBookAppointments: true, missing: [] })),
    });
    render(<IdentityVerification />);
    expect(
      await screen.findByRole("link", { name: "Agendar una cita" }),
    ).toHaveAttribute("href", BOOKING_PATH);
  });

  it("desde la reserva: regresa a agendar y ofrece continuar con la reserva", async () => {
    mockFetch({
      [GET_KEY]: verification("approved"),
      [STATUS_KEY]: ok(status({ canBookAppointments: true, missing: [] })),
    });
    render(<IdentityVerification fromBooking />);
    expect(
      await screen.findByRole("link", { name: "Continuar con la reserva" }),
    ).toHaveAttribute("href", BOOKING_PATH);
    expect(
      screen.getByRole("link", { name: "Volver a agendar" }),
    ).toHaveAttribute("href", BOOKING_PATH);
  });

  it("rejected: muestra el motivo y permite reenviar los documentos", async () => {
    const { calls } = mockFetch({
      [GET_KEY]: [
        verification("rejected", "La foto del reverso no es legible"),
        verification("pending"),
      ],
      [POST_KEY]: created(2),
    });
    render(<IdentityVerification />);
    const rejected = await screen.findByRole("region", {
      name: "Identificación rechazada",
    });
    expect(
      within(rejected).getByText("Motivo: La foto del reverso no es legible"),
    ).toBeInTheDocument();
    await pickBoth();
    await userEvent.click(
      screen.getByRole("button", { name: "Reenviar documentación" }),
    );
    expect(
      await screen.findByRole("heading", { name: "En revisión" }),
    ).toBeInTheDocument();
    expect(calls.map((c) => c.key)).toEqual([GET_KEY, POST_KEY, GET_KEY]);
  });

  it("si no se puede consultar el estado, avisa y permite reintentar; 401 envía a /login", async () => {
    mockFetch({
      [GET_KEY]: [fail(503, {}), verification("not_submitted")],
    });
    render(<IdentityVerification />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos consultar tu verificación.",
    );
    expect(screen.queryByRole("button", { name: SUBMIT })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByRole("heading", { name: "Verifica tu identidad" }),
    ).toBeInTheDocument();

    mockFetch({ [GET_KEY]: fail(401, {}) });
    render(<IdentityVerification />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});

describe("Requisito de identidad para reservar", () => {
  it.each([
    [
      "identity_submission",
      "Para reservar necesitas verificar tu identidad con tu INE.",
      "Verificar mi identidad",
    ],
    [
      "identity_review",
      "Tu INE está en revisión. Podrás reservar cuando tu identidad sea aprobada.",
      "Ver estado de mi verificación",
    ],
    [
      "identity_resubmission",
      "Tu verificación de identidad fue rechazada. Envía de nuevo tu INE para poder reservar.",
      "Reenviar mi INE",
    ],
  ] as const)("%s: explica el requisito y dirige a la verificación", (requirement, text, action) => {
    render(<IdentityRequirementNotice requirement={requirement} />);
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("link", { name: action })).toHaveAttribute(
      "href",
      IDENTITY_VERIFICATION_FROM_BOOKING_PATH,
    );
  });

  it("conserva el médico elegido para regresar al agendamiento (solo un UUID válido)", () => {
    const { unmount } = render(
      <IdentityRequirementNotice
        requirement="identity_submission"
        doctorProfileId={DOCTOR_ID}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Verificar mi identidad" }),
    ).toHaveAttribute(
      "href",
      `/verificacion-identidad?origen=reserva&medico=${DOCTOR_ID}`,
    );
    unmount();
    render(
      <IdentityRequirementNotice
        requirement="identity_submission"
        doctorProfileId="../../admin"
      />,
    );
    expect(
      screen.getByRole("link", { name: "Verificar mi identidad" }),
    ).toHaveAttribute("href", IDENTITY_VERIFICATION_FROM_BOOKING_PATH);
  });

  it("desde la reserva con médico elegido, los enlaces regresan a ese médico", async () => {
    mockFetch({
      [GET_KEY]: verification("approved"),
      [STATUS_KEY]: ok(status({ canBookAppointments: true, missing: [] })),
    });
    render(<IdentityVerification fromBooking bookingDoctorId={DOCTOR_ID} />);
    expect(
      await screen.findByRole("link", { name: "Continuar con la reserva" }),
    ).toHaveAttribute("href", `${BOOKING_PATH}?medico=${DOCTOR_ID}`);
    expect(
      screen.getByRole("link", { name: "Volver a agendar" }),
    ).toHaveAttribute("href", `${BOOKING_PATH}?medico=${DOCTOR_ID}`);
  });

  it("identityRequirementOf lee details.missing de RegistrationIncompleteError", () => {
    const incomplete = new ApiError(
      403,
      "El registro del paciente está incompleto",
      "RegistrationIncompleteError",
      ["legal", "identity_submission"],
    );
    expect(identityRequirementOf(incomplete)).toBe("identity_submission");
    expect(
      identityRequirementOf(
        new ApiError(403, "x", "RegistrationIncompleteError", ["legal"]),
      ),
    ).toBeNull();
    expect(
      identityRequirementOf(
        new ApiError(409, "x", "OtherError", ["identity_submission"]),
      ),
    ).toBeNull();
  });
});
