import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PatientIdentityRequestDetail,
  PatientIdentityReviewResult,
} from "@/lib/api";
import { adminPatientIdentityPath } from "../paths";
import { PAGE_SIZE, PatientIdentityList } from "./patient-identity-list";
import { PatientIdentityRequest } from "./patient-identity-request";

const replace = vi.fn();
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// fetch simulado con respuestas JSON y binarias (los documentos llegan como Blob con su Content-Type). Sin backend.
type Handler = (init?: RequestInit) => Response | Promise<Response>;
const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const ok = (body: unknown) => json(200, body);
const image = (type: string) => () =>
  new Response(new Blob(["x"], { type }), {
    status: 200,
    headers: { "Content-Type": type },
  });

function stubFetch(routes: Record<string, Handler | Handler[]>) {
  const calls: { key: string; url: URL; init?: RequestInit }[] = [];
  const queues = new Map(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const key = `${init?.method ?? "GET"} ${url.pathname}`;
      calls.push({ key, url, init });
      const entry = queues.get(key);
      if (!entry) throw new Error(`Petición no simulada: ${key}`);
      const handler = Array.isArray(entry)
        ? entry.length > 1
          ? (entry.shift() as Handler)
          : entry[0]
        : entry;
      return handler(init);
    }),
  );
  return { calls, keys: () => calls.map((c) => c.key) };
}

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
  // Ni los documentos ni sus URLs se registran en la consola.
  const logged = consoleSpies.flatMap((s) => s.mock.calls.flat().map(String));
  for (const s of consoleSpies) s.mockRestore();
  consoleSpies.length = 0;
  vi.unstubAllGlobals();
  expect(logged.filter((l) => l.includes("blob:"))).toEqual([]);
});

const ID = "11111111-1111-4111-8111-111111111111";
const BASE = "/admin/identity-verifications";
const DETAIL_KEY = `GET ${BASE}/${ID}`;
const FRONT_KEY = `GET ${BASE}/${ID}/documents/front`;
const BACK_KEY = `GET ${BASE}/${ID}/documents/back`;
const APPROVE_KEY = `POST ${BASE}/${ID}/approve`;
const REJECT_KEY = `POST ${BASE}/${ID}/reject`;

const detail = (
  o: Partial<PatientIdentityRequestDetail> = {},
): PatientIdentityRequestDetail => ({
  id: ID,
  status: "pending",
  attempt: 1,
  submittedAt: "2026-11-10T16:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
  patient: {
    firstName: "Lucía",
    lastName: "Ramos",
    birthDate: "1990-01-31",
    curp: "XEXX010101HNEXXXA4",
  },
  ...o,
});
const result = (
  o: Partial<PatientIdentityReviewResult> = {},
): PatientIdentityReviewResult => ({
  submissionId: ID,
  status: "approved",
  attempt: 1,
  documentsDeleted: true,
  ...o,
});

// Nunca se usan los endpoints de verificación de médicos.
const usesDoctorEndpoints = (keys: string[]) =>
  keys.some((k) => k.includes("doctor"));

describe("/admin/identidad-pacientes: listado de pendientes", () => {
  it("muestra las solicitudes pendientes con su enlace al detalle y pagina con el endpoint de pacientes", async () => {
    const { calls, keys } = stubFetch({
      [`GET ${BASE}`]: [
        ok({
          items: [
            { id: ID, attempt: 2, submittedAt: "2026-11-10T16:00:00.000Z" },
          ],
          total: PAGE_SIZE + 1,
        }),
        ok({ items: [], total: PAGE_SIZE + 1 }),
      ],
    });
    render(<PatientIdentityList />);
    const table = await screen.findByRole("table");
    const row = within(table).getAllByRole("row")[1];
    expect(within(row).getByText("2")).toBeInTheDocument();
    expect(within(row).getByText("Pendiente")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: /Revisar/ })).toHaveAttribute(
      "href",
      adminPatientIdentityPath(ID),
    );
    expect(calls[0].url.searchParams.get("page")).toBe("1");
    expect(calls[0].url.searchParams.get("pageSize")).toBe(String(PAGE_SIZE));

    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() =>
      expect(calls[1]?.url.searchParams.get("page")).toBe("2"),
    );
    expect(usesDoctorEndpoints(keys())).toBe(false);
  });

  it("sin solicitudes lo indica", async () => {
    stubFetch({ [`GET ${BASE}`]: ok({ items: [], total: 0 }) });
    render(<PatientIdentityList />);
    expect(
      await screen.findByText("No hay solicitudes pendientes."),
    ).toBeInTheDocument();
  });

  it("403 informa la falta de permiso y permite reintentar; 401 envía a /login", async () => {
    stubFetch({
      [`GET ${BASE}`]: [
        json(403, { message: "Forbidden" }),
        ok({ items: [], total: 0 }),
      ],
    });
    render(<PatientIdentityList />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu cuenta no tiene permiso para consultar esta información.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByText("No hay solicitudes pendientes."),
    ).toBeInTheDocument();

    stubFetch({ [`GET ${BASE}`]: json(401, {}) });
    render(<PatientIdentityList />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});

describe("/admin/identidad-pacientes/:id: detalle", () => {
  it("muestra los datos del paciente y el estado devuelto por el backend, sin descargar documentos", async () => {
    const { keys } = stubFetch({ [DETAIL_KEY]: ok(detail()) });
    render(<PatientIdentityRequest requestId={ID} />);
    expect(
      await screen.findByRole("heading", { name: "Lucía Ramos" }),
    ).toBeInTheDocument();
    const patient = within(
      screen.getByRole("region", { name: "Datos del paciente" }),
    );
    expect(patient.getByText("XEXX010101HNEXXXA4")).toBeInTheDocument();
    expect(patient.getByText("31 de enero de 1990")).toBeInTheDocument();
    const request = within(screen.getByRole("region", { name: "Solicitud" }));
    expect(request.getByText("Pendiente")).toBeInTheDocument();
    expect(
      request.getByRole("button", { name: "Aprobar" }),
    ).toBeInTheDocument();
    expect(keys()).toEqual([DETAIL_KEY]);
  });

  it("el visor descarga frente y reverso con la sesión, sin caché, y libera las URLs al cerrar", async () => {
    const { calls, keys } = stubFetch({
      [DETAIL_KEY]: ok(detail()),
      [FRONT_KEY]: image("image/jpeg"),
      [BACK_KEY]: image("image/png"),
    });
    render(<PatientIdentityRequest requestId={ID} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Ver documentos" }),
    );
    const viewer = await screen.findByRole("dialog", {
      name: "INE del paciente",
    });
    expect(
      await within(viewer).findByRole("img", { name: "INE (frente)" }),
    ).toHaveAttribute("src", "blob:pei/1");
    const front = calls.find((c) => c.key === FRONT_KEY);
    expect(front?.init?.cache).toBe("no-store");
    expect(front?.init?.credentials).toBe("include");

    await userEvent.click(
      within(viewer).getByRole("button", { name: "INE (reverso)" }),
    );
    expect(
      await within(viewer).findByRole("img", { name: "INE (reverso)" }),
    ).toHaveAttribute("src", "blob:pei/2");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pei/1");

    await userEvent.click(
      within(viewer).getByRole("button", { name: "Cerrar visor" }),
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:pei/2");
    expect(keys()).toEqual([DETAIL_KEY, FRONT_KEY, BACK_KEY]);
  });

  it("un documento que ya no está disponible (409) se informa sin reintento", async () => {
    stubFetch({
      [DETAIL_KEY]: ok(detail()),
      [FRONT_KEY]: json(409, {
        error: "IdentityDocumentUnavailableError",
        message: "Los documentos de esta verificación ya no están disponibles",
      }),
    });
    render(<PatientIdentityRequest requestId={ID} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Ver documentos" }),
    );
    const viewer = await screen.findByRole("dialog", {
      name: "INE del paciente",
    });
    expect(await within(viewer).findByRole("alert")).toHaveTextContent(
      "El documento ya no está disponible.",
    );
    expect(
      within(viewer).queryByRole("button", { name: "Reintentar" }),
    ).not.toBeInTheDocument();
  });

  it("aprobar: confirma, usa el endpoint de pacientes y muestra el estado real tras recargar", async () => {
    const { keys } = stubFetch({
      [DETAIL_KEY]: [
        ok(detail()),
        ok(
          detail({
            status: "approved",
            reviewedAt: "2026-11-11T10:00:00.000Z",
          }),
        ),
      ],
      [APPROVE_KEY]: ok(result()),
    });
    render(<PatientIdentityRequest requestId={ID} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Aprobar" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Aprobar la identidad del paciente",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar aprobación" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se aprobó la identidad del paciente. Los documentos se eliminaron.",
    );
    await waitFor(() =>
      expect(keys()).toEqual([DETAIL_KEY, APPROVE_KEY, DETAIL_KEY]),
    );
    const request = within(screen.getByRole("region", { name: "Solicitud" }));
    expect(request.getByText("Aprobada")).toBeInTheDocument();
    expect(
      request.queryByRole("button", { name: "Aprobar" }),
    ).not.toBeInTheDocument();
    expect(
      request.queryByRole("button", { name: "Ver documentos" }),
    ).not.toBeInTheDocument();
    expect(usesDoctorEndpoints(keys())).toBe(false);
  });

  it("rechazar exige un motivo de 10 a 500 caracteres y envía el motivo recortado", async () => {
    const { calls } = stubFetch({
      [DETAIL_KEY]: [
        ok(detail()),
        ok(
          detail({
            status: "rejected",
            reviewedAt: "2026-11-11T10:00:00.000Z",
            rejectionReason: "La foto del frente no es legible",
          }),
        ),
      ],
      [REJECT_KEY]: ok(result({ status: "rejected" })),
    });
    render(<PatientIdentityRequest requestId={ID} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Rechazar" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Rechazar la identidad del paciente",
    });
    const reason = within(dialog).getByLabelText(
      "Motivo del rechazo (obligatorio)",
    );
    await userEvent.type(reason, "corto");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar rechazo" }),
    );
    expect(
      within(dialog).getByText("El motivo debe tener al menos 10 caracteres."),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.key === REJECT_KEY)).toBe(false);

    await userEvent.clear(reason);
    await userEvent.type(reason, "  La foto del frente no es legible  ");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar rechazo" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Se rechazó la identidad del paciente.",
    );
    const reject = calls.find((c) => c.key === REJECT_KEY);
    expect(JSON.parse(String(reject?.init?.body))).toEqual({
      reason: "La foto del frente no es legible",
    });
    expect(
      await screen.findByText("La foto del frente no es legible"),
    ).toBeInTheDocument();
  });

  it("409 al resolver (otro administrador ya la revisó): avisa sin éxito y recarga el estado real", async () => {
    const { keys } = stubFetch({
      [DETAIL_KEY]: [ok(detail()), ok(detail({ status: "approved" }))],
      [APPROVE_KEY]: json(409, {
        error: "IdentityVerificationAlreadyReviewedError",
        message: "La verificación de identidad ya fue revisada",
      }),
    });
    render(<PatientIdentityRequest requestId={ID} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Aprobar" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar aprobación" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La solicitud ya no está pendiente; pudo resolverla otro administrador.",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(keys()).toEqual([DETAIL_KEY, APPROVE_KEY, DETAIL_KEY]),
    );
    expect(await screen.findByText("Aprobada")).toBeInTheDocument();
  });

  it("un error de validación del backend se muestra en el diálogo sin cerrar ni recargar", async () => {
    const { keys } = stubFetch({
      [DETAIL_KEY]: ok(detail()),
      [REJECT_KEY]: json(400, {
        message: ["reason must be longer than or equal to 10 characters"],
      }),
    });
    render(<PatientIdentityRequest requestId={ID} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Rechazar" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Rechazar la identidad del paciente",
    });
    await userEvent.type(
      within(dialog).getByLabelText("Motivo del rechazo (obligatorio)"),
      "Documento incompleto",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Confirmar rechazo" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "reason must be longer than or equal to 10 characters",
    );
    expect(keys()).toEqual([DETAIL_KEY, REJECT_KEY]);
  });

  it("si el backend no pudo eliminar los documentos, se avisa", async () => {
    stubFetch({
      [DETAIL_KEY]: [ok(detail()), ok(detail({ status: "approved" }))],
      [APPROVE_KEY]: ok(result({ documentsDeleted: false })),
    });
    render(<PatientIdentityRequest requestId={ID} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Aprobar" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirmar aprobación" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Los documentos aún no se pudieron eliminar",
    );
  });

  it("una solicitud ya revisada muestra el motivo y no ofrece acciones ni documentos", async () => {
    const { keys } = stubFetch({
      [DETAIL_KEY]: ok(
        detail({
          status: "rejected",
          reviewedAt: "2026-11-11T10:00:00.000Z",
          rejectionReason: "El documento está vencido",
        }),
      ),
    });
    render(<PatientIdentityRequest requestId={ID} />);
    expect(
      await screen.findByText("El documento está vencido"),
    ).toBeInTheDocument();
    expect(screen.getByText("Rechazada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ver documentos" })).toBeNull();
    expect(keys()).toEqual([DETAIL_KEY]);
  });

  it("404 informa que no existe y permite reintentar; 401 envía a /login", async () => {
    stubFetch({
      [DETAIL_KEY]: [json(404, { message: "x" }), ok(detail())],
    });
    render(<PatientIdentityRequest requestId={ID} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se encontró la solicitud.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(
      await screen.findByRole("heading", { name: "Lucía Ramos" }),
    ).toBeInTheDocument();

    stubFetch({ [DETAIL_KEY]: json(401, {}) });
    render(<PatientIdentityRequest requestId={ID} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
