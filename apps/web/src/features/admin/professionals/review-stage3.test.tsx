import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminDoctorDetail,
  AdminIdentityReviewDetail,
  AdminLicenseReviewDetail,
  AdminReviewResult,
} from "@/lib/api";
import { DoctorRecord } from "./doctor-record";

const replace = vi.fn();
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// fetch simulado que admite respuestas JSON y binarias (los documentos llegan como Blob con su Content-Type).
type Handler = (init?: RequestInit) => Response | Promise<Response>;
const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const ok = (body: unknown) => json(200, body);
const file = (type: string) => () =>
  new Response(new Blob(["x"], { type }), {
    status: 200,
    headers: { "Content-Type": type },
  });
const never = () => new Promise<Response>(() => {});

function stubFetch(routes: Record<string, Handler | Handler[]>) {
  const calls: { key: string; init?: RequestInit }[] = [];
  const queues = new Map(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]),
  );
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${new URL(String(input)).pathname}`;
      calls.push({ key, init });
      const entry = queues.get(key);
      if (!entry) throw new Error(`Petición no simulada: ${key}`);
      const handler = Array.isArray(entry)
        ? entry.length > 1
          ? (entry.shift() as Handler)
          : entry[0]
        : entry;
      return handler(init);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { calls, keys: () => calls.map((c) => c.key) };
}

let urlCount = 0;
const createObjectURL = vi.fn(() => `blob:pei/${++urlCount}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  replace.mockReset();
  urlCount = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL, revokeObjectURL }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const ID = "d-1";
const DETAIL_PATH = `GET /admin/doctors/${ID}`;
const INE_PATH = "/admin/doctor-identity-verifications/ine-1";
const LIC_PATH = "/admin/doctor-license-verifications/lic-1";

const detail = (o: Partial<AdminDoctorDetail> = {}): AdminDoctorDetail => ({
  doctorProfileId: ID,
  firstName: "Marta",
  lastName: "Ruiz",
  curp: "RUMM900101MDFZRR09",
  phone: null,
  licenseNumber: "12345678",
  specialty: {
    id: "s1",
    code: "infectologia",
    name: "Infectología",
    isActive: true,
  },
  identityRevision: 1,
  professionalRevision: 1,
  status: "pending",
  identity: "pending",
  professional: "pending",
  registrationComplete: true,
  legalAccepted: true,
  canOperate: false,
  missing: [],
  history: {
    identity: [
      {
        id: "ine-1",
        attempt: 1,
        revision: 1,
        status: "pending",
        submittedAt: "2026-10-03T10:00:00.000Z",
        reviewedAt: null,
        rejectionReason: null,
      },
    ],
    license: [
      {
        id: "lic-1",
        attempt: 1,
        revision: 1,
        status: "pending",
        submittedAt: "2026-10-04T10:00:00.000Z",
        reviewedAt: null,
        rejectionReason: null,
        reason: "initial",
        licenseNumber: "12345678",
      },
    ],
  },
  ...o,
});
const resolvedDetail = (o: Partial<AdminDoctorDetail> = {}) =>
  detail({ history: { identity: [], license: [] }, ...o });

const ine = (
  o: Partial<AdminIdentityReviewDetail> = {},
): AdminIdentityReviewDetail => ({
  id: "ine-1",
  doctorProfileId: ID,
  attempt: 1,
  revision: 1,
  status: "pending",
  submittedAt: "2026-10-03T10:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
  isCurrent: true,
  documentsAvailable: true,
  doctor: { firstName: "Marta", lastName: "Ruiz", curp: "RUMM900101MDFZRR09" },
  ...o,
});
const lic = (
  o: Partial<AdminLicenseReviewDetail> = {},
): AdminLicenseReviewDetail => ({
  id: "lic-1",
  doctorProfileId: ID,
  attempt: 1,
  revision: 1,
  status: "pending",
  submittedAt: "2026-10-04T10:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
  isCurrent: true,
  reason: "initial",
  licenseNumber: "12345678",
  specialty: { id: "s1", code: "infectologia", name: "Infectología" },
  doctor: { firstName: "Marta", lastName: "Ruiz" },
  ...o,
});
const result = (o: Partial<AdminReviewResult> = {}): AdminReviewResult => ({
  reviewId: "ine-1",
  status: "approved",
  attempt: 1,
  documentsDeleted: true,
  doctorStatus: {
    status: "pending",
    identity: "approved",
    professional: "pending",
    registrationComplete: true,
    legalAccepted: true,
    canOperate: false,
    missing: [],
  },
  ...o,
});

const baseRoutes = (extra: Record<string, Handler | Handler[]> = {}) => ({
  [DETAIL_PATH]: ok(detail()),
  [`GET ${INE_PATH}`]: ok(ine()),
  [`GET ${LIC_PATH}`]: ok(lic()),
  ...extra,
});

const card = (title: string) =>
  within(
    screen.getByRole("heading", { name: title }).closest("div") as HTMLElement,
  );
const identityCard = () => card("Revisión pendiente de identidad");
const licenseCard = () => card("Revisión pendiente de cédula");
const field = (scope: ReturnType<typeof within>, label: string) =>
  within(scope.getByText(label).nextElementSibling as HTMLElement);

async function renderRecord() {
  render(<DoctorRecord doctorProfileId={ID} />);
  await screen.findByRole("heading", {
    name: "Revisión pendiente de identidad",
  });
}

describe("Visor privado de documentos", () => {
  it("INE: frente y reverso con blob: URL; cambiar de lado y cerrar liberan cada URL", async () => {
    const { calls } = stubFetch(
      baseRoutes({
        [`GET ${INE_PATH}/documents/front`]: file("image/jpeg"),
        [`GET ${INE_PATH}/documents/back`]: file("image/png"),
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Ver documentos" }),
    );
    const viewer = within(await screen.findByRole("dialog", { name: /INE/ }));
    expect(await viewer.findByRole("img", { name: "Frente" })).toHaveAttribute(
      "src",
      "blob:pei/1",
    );
    const doc = calls.find((c) => c.key.endsWith("/documents/front"));
    expect(doc?.init?.credentials).toBe("include");
    expect(doc?.init?.cache).toBe("no-store");

    await userEvent.click(viewer.getByRole("button", { name: "Reverso" }));
    expect(await viewer.findByRole("img", { name: "Reverso" })).toHaveAttribute(
      "src",
      "blob:pei/2",
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pei/1");

    await userEvent.click(viewer.getByRole("button", { name: "Cerrar visor" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pei/2");
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("cédula PDF: no se incrusta; se descarga desde el Blob; Escape cierra y libera la URL", async () => {
    stubFetch(
      baseRoutes({ [`GET ${LIC_PATH}/document`]: file("application/pdf") }),
    );
    await renderRecord();
    await userEvent.click(
      licenseCard().getByRole("button", { name: "Ver documentos" }),
    );
    const viewer = within(
      await screen.findByRole("dialog", { name: /Cédula/ }),
    );
    const link = await viewer.findByRole("link", { name: "Descargar PDF" });
    expect(link).toHaveAttribute("href", "blob:pei/1");
    expect(link).toHaveAttribute("download", "cedula-intento-1.pdf");
    expect(viewer.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector("iframe, embed, object")).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pei/1");
  });

  it("cédula en imagen se muestra; un tipo no admitido no crea URL", async () => {
    stubFetch(
      baseRoutes({
        [`GET ${LIC_PATH}/document`]: [file("image/png"), file("text/html")],
      }),
    );
    await renderRecord();
    const open = () =>
      userEvent.click(
        licenseCard().getByRole("button", { name: "Ver documentos" }),
      );
    await open();
    expect(
      await screen.findByRole("img", { name: "Cédula profesional" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar visor" }));
    await open();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no se puede mostrar",
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it.each([
    [403, "no tiene permiso para ver este documento", false],
    [404, "ya no está disponible", false],
    [409, "ya no está disponible", false],
    [500, "servidor", true],
  ] as const)("documento con HTTP %i: muestra el error sin URL", async (status, text, retry) => {
    stubFetch(
      baseRoutes({
        [`GET ${INE_PATH}/documents/front`]: json(status, {
          statusCode: status,
        }),
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Ver documentos" }),
    );
    const viewer = within(await screen.findByRole("dialog"));
    expect(await viewer.findByRole("alert")).toHaveTextContent(text);
    expect(!!viewer.queryByRole("button", { name: "Reintentar" })).toBe(retry);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("documento: 500 y luego éxito al reintentar", async () => {
    stubFetch(
      baseRoutes({
        [`GET ${INE_PATH}/documents/front`]: [
          json(500, { statusCode: 500 }),
          file("image/jpeg"),
        ],
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Ver documentos" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Reintentar" }),
    );
    expect(
      await screen.findByRole("img", { name: "Frente" }),
    ).toBeInTheDocument();
  });

  it("documento con 401: envía a /login", async () => {
    stubFetch(
      baseRoutes({
        [`GET ${INE_PATH}/documents/front`]: json(401, { statusCode: 401 }),
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Ver documentos" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("cerrar antes de que termine la descarga no crea ninguna URL", async () => {
    let finish: (r: Response) => void = () => {};
    stubFetch(
      baseRoutes({
        [`GET ${INE_PATH}/documents/front`]: () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Ver documentos" }),
    );
    expect(await screen.findByText("Cargando documento…")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerrar visor" }));
    finish(file("image/jpeg")());
    await new Promise((r) => setTimeout(r, 0));
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("INE sin documentos disponibles: no ofrece el visor ni pide documentos", async () => {
    const { keys } = stubFetch(
      baseRoutes({
        [`GET ${INE_PATH}`]: ok(ine({ documentsAvailable: false })),
      }),
    );
    await renderRecord();
    expect(
      field(identityCard(), "Documentos").getByText("No disponibles"),
    ).toBeTruthy();
    expect(
      identityCard().queryByRole("button", { name: "Ver documentos" }),
    ).not.toBeInTheDocument();
    // La cédula no tiene campo de disponibilidad en el backend: estado neutral.
    expect(
      field(licenseCard(), "Documentos").getByText("Se confirma al abrirla"),
    ).toBeTruthy();
    expect(keys().some((k) => k.includes("/document"))).toBe(false);
  });
});

describe("Aprobar y rechazar revisiones", () => {
  it("aprobar identidad: confirma, usa el doctorStatus devuelto y deja la revisión sin acciones", async () => {
    const { calls } = stubFetch(
      baseRoutes({
        [DETAIL_PATH]: [ok(detail()), never],
        [`POST ${INE_PATH}/approve`]: ok(result()),
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Aprobar" }),
    );
    const dialog = within(
      screen.getByRole("dialog", { name: /Aprobar identidad/ }),
    );
    expect(calls.some((c) => c.key.endsWith("/approve"))).toBe(false);
    await userEvent.click(
      dialog.getByRole("button", { name: "Confirmar aprobación" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se aprobó la revisión de identidad.",
    );
    // La recarga queda pendiente: lo mostrado proviene del doctorStatus de la respuesta.
    const admin = within(
      screen.getByRole("region", { name: "Revisión administrativa" }),
    );
    expect(field(admin, "Identidad (INE)").getByText("Aprobada")).toBeTruthy();
    expect(
      identityCard().queryByRole("button", { name: "Aprobar" }),
    ).toBeNull();
    expect(
      identityCard().getByText("Esta revisión ya no admite acciones."),
    ).toBeTruthy();
    expect(calls.filter((c) => c.key === DETAIL_PATH)).toHaveLength(2);
  });

  it("aprobar cédula: doctorStatus con aprobación, legalAccepted y canOperate del backend", async () => {
    stubFetch(
      baseRoutes({
        [DETAIL_PATH]: [ok(detail({ identity: "approved" })), never],
        [`GET ${INE_PATH}`]: ok(ine({ status: "approved" })),
        [`POST ${LIC_PATH}/approve`]: ok(
          result({
            reviewId: "lic-1",
            documentsDeleted: null,
            doctorStatus: {
              status: "approved",
              identity: "approved",
              professional: "approved",
              registrationComplete: false,
              legalAccepted: false,
              canOperate: false,
              missing: ["legal"],
            },
          }),
        ),
      }),
    );
    await renderRecord();
    await userEvent.click(
      licenseCard().getByRole("button", { name: "Aprobar" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar aprobación" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se aprobó la revisión de la cédula.",
    );
    const admin = within(
      screen.getByRole("region", { name: "Revisión administrativa" }),
    );
    expect(
      field(admin, "Estado administrativo").getByText("Aprobado"),
    ).toBeTruthy();
    // D-38: aprobado no equivale a habilitado.
    const legal = within(
      screen.getByRole("region", { name: "Aceptación legal y habilitación" }),
    );
    expect(legal.getByText("Pendiente de aceptar")).toBeInTheDocument();
    expect(legal.getByText("No habilitado")).toBeInTheDocument();
  });

  it.each([
    [
      "identidad",
      identityCard,
      `POST ${INE_PATH}/reject`,
      "Se rechazó la revisión de identidad.",
    ],
    [
      "cédula",
      licenseCard,
      `POST ${LIC_PATH}/reject`,
      "Se rechazó la revisión de la cédula.",
    ],
  ] as const)("rechazar %s: envía el motivo recortado y actualiza el expediente", async (_, cardOf, route, message) => {
    const { calls } = stubFetch(
      baseRoutes({
        [DETAIL_PATH]: [ok(detail()), never],
        [route]: ok(
          result({
            status: "rejected",
            doctorStatus: { ...result().doctorStatus, status: "pending" },
          }),
        ),
      }),
    );
    await renderRecord();
    await userEvent.click(cardOf().getByRole("button", { name: "Rechazar" }));
    await userEvent.type(
      screen.getByLabelText("Motivo del rechazo (obligatorio)"),
      "   La imagen es ilegible   ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar rechazo" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(message);
    const post = calls.find((c) => c.key === route);
    expect(JSON.parse(String(post?.init?.body))).toEqual({
      reason: "La imagen es ilegible",
    });
    expect(cardOf().queryByRole("button", { name: "Rechazar" })).toBeNull();
  });

  it("motivo: menos de 10 o más de 500 caracteres no se envía", async () => {
    const { calls } = stubFetch(baseRoutes());
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Rechazar" }),
    );
    const confirm = screen.getByRole("button", { name: "Confirmar rechazo" });
    const box = screen.getByLabelText("Motivo del rechazo (obligatorio)");
    await userEvent.click(confirm);
    expect(
      screen.getByText("El motivo debe tener al menos 10 caracteres."),
    ).toBeTruthy();
    await userEvent.type(box, "   corto    ");
    await userEvent.click(confirm);
    expect(
      screen.getByText("El motivo debe tener al menos 10 caracteres."),
    ).toBeTruthy();
    await userEvent.clear(box);
    await userEvent.click(box);
    await userEvent.paste("x".repeat(501));
    await userEvent.click(confirm);
    expect(
      screen.getByText("El motivo no puede superar 500 caracteres."),
    ).toBeTruthy();
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(calls.some((c) => c.key.endsWith("/reject"))).toBe(false);
  });

  it("doble clic en confirmar envía una sola petición y bloquea los botones", async () => {
    let finish: (r: Response) => void = () => {};
    const { calls } = stubFetch(
      baseRoutes({
        [`POST ${INE_PATH}/approve`]: () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
        [DETAIL_PATH]: [ok(detail()), never],
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Aprobar" }),
    );
    const confirm = screen.getByRole("button", {
      name: "Confirmar aprobación",
    });
    await userEvent.dblClick(confirm);
    expect(screen.getByRole("button", { name: "Aprobando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(calls.filter((c) => c.key.endsWith("/approve"))).toHaveLength(1);
    finish(ok(result())());
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });

  it("409: sin éxito, avisa de otro administrador, recarga y la revisión obsoleta queda sin acciones", async () => {
    const { calls } = stubFetch(
      baseRoutes({
        [DETAIL_PATH]: [
          ok(detail()),
          ok(
            resolvedDetail({
              status: "rejected",
              identity: "rejected",
              history: {
                identity: [
                  {
                    ...detail().history.identity[0],
                    status: "rejected",
                    rejectionReason: "Resuelta por otro administrador",
                  },
                ],
                license: detail().history.license,
              },
            }),
          ),
        ],
        [`POST ${INE_PATH}/approve`]: json(409, {
          statusCode: 409,
          message: "La revisión ya no está pendiente",
        }),
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Aprobar" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar aprobación" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "pudo resolverla otro administrador",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      await screen.findByText("Resuelta por otro administrador"),
    ).toBeInTheDocument();
    const admin = within(
      screen.getByRole("region", { name: "Revisión administrativa" }),
    );
    expect(
      field(admin, "Estado administrativo").getByText("Rechazado"),
    ).toBeTruthy();
    expect(identityCard().getByText("Sin revisión pendiente.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.filter((c) => c.key === DETAIL_PATH)).toHaveLength(2);
  });

  it("404 al resolver: informa que ya no está disponible y recarga", async () => {
    const { calls } = stubFetch(
      baseRoutes({
        [DETAIL_PATH]: [ok(detail()), ok(resolvedDetail())],
        [`POST ${LIC_PATH}/reject`]: json(404, { statusCode: 404 }),
      }),
    );
    await renderRecord();
    await userEvent.click(
      licenseCard().getByRole("button", { name: "Rechazar" }),
    );
    await userEvent.type(
      screen.getByLabelText("Motivo del rechazo (obligatorio)"),
      "El número no coincide",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar rechazo" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ya no está disponible",
    );
    await waitFor(() =>
      expect(calls.filter((c) => c.key === DETAIL_PATH)).toHaveLength(2),
    );
  });

  it("403 al aprobar: muestra la falta de permiso, sin éxito ni recarga", async () => {
    const { calls } = stubFetch(
      baseRoutes({
        [`POST ${INE_PATH}/approve`]: json(403, { statusCode: 403 }),
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Aprobar" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar aprobación" }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "no tiene permiso",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(calls.filter((c) => c.key === DETAIL_PATH)).toHaveLength(1);
  });

  it("500 al rechazar: conserva el motivo y permite reintentar", async () => {
    stubFetch(
      baseRoutes({
        [DETAIL_PATH]: [ok(detail()), never],
        [`POST ${INE_PATH}/reject`]: [
          json(500, { statusCode: 500 }),
          ok(result({ status: "rejected" })),
        ],
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Rechazar" }),
    );
    const box = screen.getByLabelText("Motivo del rechazo (obligatorio)");
    await userEvent.type(box, "La imagen es ilegible");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar rechazo" }),
    );
    expect(
      await within(screen.getByRole("dialog")).findByRole("alert"),
    ).toHaveTextContent("servidor");
    expect(box).toHaveValue("La imagen es ilegible");
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar rechazo" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Se rechazó");
  });

  it("401 al aprobar: envía a /login", async () => {
    stubFetch(
      baseRoutes({
        [`POST ${INE_PATH}/approve`]: json(401, { statusCode: 401 }),
      }),
    );
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Aprobar" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar aprobación" }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("revisión pendiente que ya no es la vigente: sin acciones", async () => {
    stubFetch(
      baseRoutes({ [`GET ${LIC_PATH}`]: ok(lic({ isCurrent: false })) }),
    );
    await renderRecord();
    expect(licenseCard().queryByRole("button", { name: "Aprobar" })).toBeNull();
    expect(
      licenseCard().queryByRole("button", { name: "Rechazar" }),
    ).toBeNull();
    expect(
      licenseCard().getByText("Esta revisión ya no admite acciones."),
    ).toBeTruthy();
    expect(
      identityCard().getByRole("button", { name: "Aprobar" }),
    ).toBeTruthy();
  });

  it("cancelar cierra el modal sin enviar nada", async () => {
    const { calls } = stubFetch(baseRoutes());
    await renderRecord();
    await userEvent.click(
      identityCard().getByRole("button", { name: "Rechazar" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
  });
});
