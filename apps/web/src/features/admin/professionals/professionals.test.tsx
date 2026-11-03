import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminDoctorDetail,
  AdminDoctorItem,
  AdminIdentityReviewDetail,
  AdminLicenseReviewDetail,
} from "@/lib/api";
import { mockFetch, ok } from "@/test/http";
import { ADMIN_PROFESSIONALS_PATH, adminDoctorPath } from "../paths";
import { DoctorRecord } from "./doctor-record";
import { PAGE_SIZE, ProfessionalsList } from "./professionals-list";
import { pendingReasons } from "./status";

const replace = vi.fn();
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SPECIALTY = {
  id: "s1",
  code: "infectologia",
  name: "Infectología",
  isActive: true,
};

// Contrato de D-38: status administrativo, legalAccepted y canOperate los informa el backend.
const item = (overrides: Partial<AdminDoctorItem> = {}): AdminDoctorItem => ({
  doctorProfileId: "d-approved",
  firstName: "Ana",
  lastName: "Pérez",
  specialty: SPECIALTY,
  status: "approved",
  identity: "approved",
  professional: "approved",
  registrationComplete: true,
  legalAccepted: true,
  canOperate: true,
  missing: [],
  ...overrides,
});

const APPROVED_ENABLED = item();
const APPROVED_LEGAL_PENDING = item({
  doctorProfileId: "d-legal",
  firstName: "Luis",
  lastName: "Gómez",
  registrationComplete: false,
  legalAccepted: false,
  canOperate: false,
  missing: ["legal"],
});
const PENDING_REVIEW = item({
  doctorProfileId: "d-review",
  firstName: "Marta",
  lastName: "Ruiz",
  status: "pending",
  identity: "pending",
  professional: "approved",
  canOperate: false,
});
const PENDING_SUBMISSION = item({
  doctorProfileId: "d-submission",
  firstName: "Iván",
  lastName: "Soto",
  status: "pending",
  identity: "required",
  professional: "required",
  registrationComplete: false,
  canOperate: false,
  missing: ["identity_submission", "license_submission"],
});
const REJECTED = item({
  doctorProfileId: "d-rejected",
  firstName: "Rosa",
  lastName: "Lara",
  status: "rejected",
  identity: "rejected",
  canOperate: false,
  missing: ["identity_resubmission"],
});

const desktopRow = (name: string) => {
  const table = screen.getByRole("table");
  const link = within(table).getByRole("link", { name });
  return link.closest("tr") as HTMLElement;
};
const searchOf = (
  fetchMock: ReturnType<typeof mockFetch>["fetchMock"],
  n = 0,
) => new URL(String(fetchMock.mock.calls[n][0])).searchParams;

describe("/admin/profesionales: listado", () => {
  beforeEach(() => replace.mockReset());

  it("muestra las columnas de D-38 y enlaza al expediente", async () => {
    mockFetch({
      "GET /admin/doctors": ok({
        items: [APPROVED_ENABLED, APPROVED_LEGAL_PENDING],
        total: 2,
      }),
    });
    render(<ProfessionalsList />);
    await screen.findByRole("table");
    const headers = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual([
      "Profesional",
      "Especialidad",
      "Identidad",
      "Cédula",
      "Estado administrativo",
      "Aceptación legal",
      "Habilitación",
    ]);
    const enabled = within(desktopRow("Ana Pérez"));
    expect(enabled.getByText("Infectología")).toBeInTheDocument();
    expect(enabled.getByText("Aprobado")).toBeInTheDocument();
    expect(enabled.getByText("Vigente")).toBeInTheDocument();
    expect(enabled.getByText("Habilitado")).toBeInTheDocument();
    expect(enabled.getByRole("link", { name: "Ana Pérez" })).toHaveAttribute(
      "href",
      adminDoctorPath("d-approved"),
    );
  });

  it("D-38: aprobado con aceptación legal pendiente sigue aprobado y no habilitado, sin acciones", async () => {
    mockFetch({
      "GET /admin/doctors": ok({ items: [APPROVED_LEGAL_PENDING], total: 1 }),
    });
    render(<ProfessionalsList />);
    await screen.findByRole("table");
    const row = within(desktopRow("Luis Gómez"));
    expect(row.getByText("Aprobado")).toBeInTheDocument();
    expect(row.getByText("Pendiente de aceptar")).toBeInTheDocument();
    expect(row.getByText("No habilitado")).toBeInTheDocument();
    expect(row.queryByText(/Esperando/)).not.toBeInTheDocument();
    expect(row.queryByRole("button")).not.toBeInTheDocument();
  });

  it("pendientes: distingue esperando revisión de esperando envío; rechazado sin motivo de espera", async () => {
    mockFetch({
      "GET /admin/doctors": ok({
        items: [PENDING_REVIEW, PENDING_SUBMISSION, REJECTED],
        total: 3,
      }),
    });
    render(<ProfessionalsList />);
    await screen.findByRole("table");
    expect(
      within(desktopRow("Marta Ruiz")).getByText("Esperando revisión"),
    ).toBeInTheDocument();
    expect(
      within(desktopRow("Iván Soto")).getByText(
        "Esperando envío de documentación",
      ),
    ).toBeInTheDocument();
    const rejected = within(desktopRow("Rosa Lara"));
    expect(rejected.getByText("Rechazado")).toBeInTheDocument();
    expect(rejected.queryByText(/Esperando/)).not.toBeInTheDocument();
  });

  it("los filtros consultan ?status= al backend y vuelven a la página 1", async () => {
    const { fetchMock } = mockFetch({
      "GET /admin/doctors": ok({ items: [APPROVED_ENABLED], total: 45 }),
    });
    render(<ProfessionalsList />);
    await screen.findByRole("table");
    expect(searchOf(fetchMock).get("status")).toBeNull();
    expect(searchOf(fetchMock).get("pageSize")).toBe(String(PAGE_SIZE));

    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(searchOf(fetchMock, 1).get("page")).toBe("2");

    for (const [label, status] of [
      ["Pendientes", "pending"],
      ["Aprobados", "approved"],
      ["Rechazados", "rejected"],
    ] as const) {
      const before = fetchMock.mock.calls.length;
      await userEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() =>
        expect(fetchMock.mock.calls.length).toBeGreaterThan(before),
      );
      const params = searchOf(fetchMock, fetchMock.mock.calls.length - 1);
      expect(params.get("status")).toBe(status);
      expect(params.get("page")).toBe("1");
      expect(screen.getByRole("button", { name: label })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    }
  });

  it("paginación: muestra el total y desactiva los extremos", async () => {
    mockFetch({
      "GET /admin/doctors": ok({ items: [APPROVED_ENABLED], total: 21 }),
    });
    render(<ProfessionalsList />);
    expect(
      await screen.findByText("Página 1 de 2 · 21 profesionales"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(
      await screen.findByText("Página 2 de 2 · 21 profesionales"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("respuesta vacía: mensaje según el filtro, sin tabla ni paginación", async () => {
    mockFetch({ "GET /admin/doctors": ok({ items: [], total: 0 }) });
    render(<ProfessionalsList />);
    expect(
      await screen.findByText("Todavía no hay profesionales registrados."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Aprobados" }));
    expect(
      await screen.findByText("No hay profesionales aprobados."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Paginación" }),
    ).not.toBeInTheDocument();
  });

  it("error del backend: muestra el mensaje y permite reintentar", async () => {
    mockFetch({
      "GET /admin/doctors": [
        { status: 500, body: { statusCode: 500 } },
        ok({ items: [APPROVED_ENABLED], total: 1 }),
      ],
    });
    render(<ProfessionalsList />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("403: informa la falta de permiso; 401: envía a /login", async () => {
    mockFetch({
      "GET /admin/doctors": { status: 403, body: { statusCode: 403 } },
    });
    const { unmount } = render(<ProfessionalsList />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no tiene permiso",
    );
    unmount();
    mockFetch({
      "GET /admin/doctors": { status: 401, body: { statusCode: 401 } },
    });
    render(<ProfessionalsList />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("pendingReasons solo lee las líneas del backend y no aplica a otros estados", () => {
    expect(pendingReasons(PENDING_REVIEW)).toEqual(["Esperando revisión"]);
    expect(
      pendingReasons({
        status: "pending",
        identity: "pending",
        professional: "required",
      }),
    ).toEqual(["Esperando revisión", "Esperando envío de documentación"]);
    expect(pendingReasons(APPROVED_LEGAL_PENDING)).toEqual([]);
    expect(pendingReasons(REJECTED)).toEqual([]);
  });
});

const detail = (
  overrides: Partial<AdminDoctorDetail> = {},
): AdminDoctorDetail => ({
  doctorProfileId: "d-review",
  firstName: "Marta",
  lastName: "Ruiz",
  curp: "RUMM900101MDFZRR09",
  phone: "6181234567",
  licenseNumber: "12345678",
  specialty: SPECIALTY,
  identityRevision: 1,
  professionalRevision: 2,
  status: "pending",
  identity: "pending",
  professional: "pending",
  registrationComplete: true,
  legalAccepted: false,
  canOperate: false,
  missing: ["legal"],
  history: {
    identity: [
      {
        id: "ine-1",
        attempt: 1,
        revision: 1,
        status: "rejected",
        submittedAt: "2026-10-01T10:00:00.000Z",
        reviewedAt: "2026-10-02T10:00:00.000Z",
        rejectionReason: "La imagen es ilegible",
      },
      {
        id: "ine-2",
        attempt: 2,
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
        status: "approved",
        submittedAt: "2026-10-01T10:00:00.000Z",
        reviewedAt: "2026-10-02T10:00:00.000Z",
        rejectionReason: null,
        reason: "initial",
        licenseNumber: "12345678",
      },
      {
        id: "lic-2",
        attempt: 2,
        revision: 2,
        status: "pending",
        submittedAt: "2026-10-04T10:00:00.000Z",
        reviewedAt: null,
        rejectionReason: null,
        reason: "specialty_changed",
        licenseNumber: "12345678",
      },
    ],
  },
  ...overrides,
});

const INE_REVIEW: AdminIdentityReviewDetail = {
  id: "ine-2",
  doctorProfileId: "d-review",
  attempt: 2,
  revision: 1,
  status: "pending",
  submittedAt: "2026-10-03T10:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
  isCurrent: true,
  documentsAvailable: true,
  doctor: { firstName: "Marta", lastName: "Ruiz", curp: "RUMM900101MDFZRR09" },
};
const LICENSE_REVIEW: AdminLicenseReviewDetail = {
  id: "lic-2",
  doctorProfileId: "d-review",
  attempt: 2,
  revision: 2,
  status: "pending",
  submittedAt: "2026-10-04T10:00:00.000Z",
  reviewedAt: null,
  rejectionReason: null,
  isCurrent: true,
  reason: "specialty_changed",
  licenseNumber: "12345678",
  specialty: { id: "s1", code: "infectologia", name: "Infectología" },
  doctor: { firstName: "Marta", lastName: "Ruiz" },
};

describe("/admin/profesionales/[id]: expediente", () => {
  beforeEach(() => replace.mockReset());

  it("muestra datos, estados en secciones independientes, revisiones pendientes vigentes e historial", async () => {
    const { calls } = mockFetch({
      "GET /admin/doctors/d-review": ok(detail()),
      "GET /admin/doctor-identity-verifications/ine-2": ok(INE_REVIEW),
      "GET /admin/doctor-license-verifications/lic-2": ok(LICENSE_REVIEW),
    });
    render(<DoctorRecord doctorProfileId="d-review" />);

    const data = within(
      await screen.findByRole("region", { name: "Datos del profesional" }),
    );
    expect(data.getByText("RUMM900101MDFZRR09")).toBeInTheDocument();
    expect(data.getByText("6181234567")).toBeInTheDocument();
    expect(data.getByText("Infectología")).toBeInTheDocument();
    expect(data.getByText("12345678")).toBeInTheDocument();

    const admin = within(
      screen.getByRole("region", { name: "Revisión administrativa" }),
    );
    const adminStatus = admin.getByText("Estado administrativo")
      .nextElementSibling as HTMLElement;
    expect(within(adminStatus).getByText("Pendiente")).toBeInTheDocument();
    expect(admin.getByText("Esperando revisión")).toBeInTheDocument();
    // La aceptación legal no aparece en la sección administrativa.
    expect(admin.queryByText("Pendiente de aceptar")).not.toBeInTheDocument();

    const ine = within(
      admin
        .getByRole("heading", { name: "Revisión pendiente de identidad" })
        .closest("div") as HTMLElement,
    );
    expect(ine.getByText("Disponibles para revisión")).toBeInTheDocument();
    expect(ine.getByText("Sí")).toBeInTheDocument();
    const lic = within(
      admin
        .getByRole("heading", { name: "Revisión pendiente de cédula" })
        .closest("div") as HTMLElement,
    );
    expect(lic.getByText("Cambio de especialidad")).toBeInTheDocument();

    const legal = within(
      screen.getByRole("region", { name: "Aceptación legal y habilitación" }),
    );
    expect(legal.getByText("Pendiente de aceptar")).toBeInTheDocument();
    expect(legal.getByText("No habilitado")).toBeInTheDocument();

    const history = within(
      screen.getByRole("region", { name: "Historial de revisiones" }),
    );
    expect(history.getByText("La imagen es ilegible")).toBeInTheDocument();
    expect(history.getAllByRole("table")).toHaveLength(2);

    // Las acciones solo aparecen en revisiones pendientes y vigentes; abrir el expediente no descarga documentos.
    expect(screen.getAllByRole("button", { name: "Aprobar" })).toHaveLength(2);
    expect(calls.map((c) => c.key)).toEqual([
      "GET /admin/doctors/d-review",
      "GET /admin/doctor-identity-verifications/ine-2",
      "GET /admin/doctor-license-verifications/lic-2",
    ]);
    expect(
      screen.getByRole("link", { name: "Volver al listado" }),
    ).toHaveAttribute("href", ADMIN_PROFESSIONALS_PATH);
  });

  it("aprobado y habilitado: sin revisiones pendientes ni consultas de revisión", async () => {
    const approved = detail({
      status: "approved",
      identity: "approved",
      professional: "approved",
      legalAccepted: true,
      canOperate: true,
      missing: [],
      history: {
        identity: [
          {
            ...detail().history.identity[0],
            status: "approved",
            rejectionReason: null,
          },
        ],
        license: [detail().history.license[0]],
      },
    });
    const { calls } = mockFetch({
      "GET /admin/doctors/d-review": ok(approved),
    });
    render(<DoctorRecord doctorProfileId="d-review" />);
    const legal = within(
      await screen.findByRole("region", {
        name: "Aceptación legal y habilitación",
      }),
    );
    expect(legal.getByText("Vigente")).toBeInTheDocument();
    expect(legal.getByText("Habilitado")).toBeInTheDocument();
    expect(screen.getAllByText("Sin revisión pendiente.")).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it("rechazado: muestra el motivo en el historial", async () => {
    mockFetch({
      "GET /admin/doctors/d-review": ok(
        detail({
          status: "rejected",
          identity: "rejected",
          professional: "approved",
          history: {
            identity: [detail().history.identity[0]],
            license: [detail().history.license[0]],
          },
        }),
      ),
    });
    render(<DoctorRecord doctorProfileId="d-review" />);
    const admin = within(
      await screen.findByRole("region", { name: "Revisión administrativa" }),
    );
    expect(admin.getByText("Rechazado")).toBeInTheDocument();
    expect(admin.queryByText(/Esperando/)).not.toBeInTheDocument();
    expect(screen.getByText("La imagen es ilegible")).toBeInTheDocument();
  });

  it("404: informa que no existe y permite volver al listado", async () => {
    mockFetch({
      "GET /admin/doctors/nada": { status: 404, body: { statusCode: 404 } },
    });
    render(<DoctorRecord doctorProfileId="nada" />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se encontró el profesional.",
    );
    expect(
      screen.getByRole("link", { name: "Volver al listado" }),
    ).toHaveAttribute("href", ADMIN_PROFESSIONALS_PATH);
  });

  it("401: envía a /login", async () => {
    mockFetch({
      "GET /admin/doctors/d-review": { status: 401, body: { statusCode: 401 } },
    });
    render(<DoctorRecord doctorProfileId="d-review" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
