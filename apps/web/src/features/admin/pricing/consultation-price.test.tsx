import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsultationPriceVersion } from "@/lib/api";
import { mockFetch } from "@/test/http";
import { ConsultationPrice } from "./consultation-price";

const replace = vi.fn();
const router = { replace };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const V1: ConsultationPriceVersion = {
  id: "v1",
  price: "200.00",
  currency: "MXN",
  effectiveFrom: "2026-11-10T15:00:00.000Z",
  effectiveUntil: null,
  createdBy: "admin-1",
};
const V2: ConsultationPriceVersion = {
  ...V1,
  id: "v2",
  price: "250.00",
  effectiveFrom: "2026-11-11T15:00:00.000Z",
};
const closedV1 = { ...V1, effectiveUntil: V2.effectiveFrom };

describe("M08 panel: precio de consulta (AP-2, AP-10)", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it("[TC-M08-W01] muestra el precio vigente y el historial", async () => {
    mockFetch({
      "GET /admin/consultation-price/versions": { status: 200, body: { versions: [V1] } },
      "GET /admin/consultation-price": { status: 200, body: V1 },
    });
    render(<ConsultationPrice />);
    expect(await screen.findByLabelText("Precio vigente")).toHaveTextContent("$200.00 MXN");
    expect(screen.getByLabelText("Historial de precios")).toHaveTextContent("Vigente");
  });

  it("[TC-M08-W02] sin precio configurado lo indica", async () => {
    mockFetch({
      "GET /admin/consultation-price/versions": { status: 200, body: { versions: [] } },
      "GET /admin/consultation-price": { status: 404, body: { message: "No hay un precio de consulta vigente" } },
    });
    render(<ConsultationPrice />);
    expect(await screen.findByText(/Aún no hay un precio configurado/)).toBeInTheDocument();
  });

  it("[TC-M08-W03] valida el formato antes de enviar y no llama al backend", async () => {
    const { calls } = mockFetch({
      "GET /admin/consultation-price/versions": { status: 200, body: { versions: [V1] } },
      "GET /admin/consultation-price": { status: 200, body: V1 },
    });
    render(<ConsultationPrice />);
    await screen.findByLabelText("Precio vigente");
    await userEvent.type(screen.getByLabelText("Nuevo precio (MXN)"), "10.123");
    await userEvent.click(screen.getByRole("button", { name: "Actualizar precio" }));
    expect(screen.getByRole("alert")).toHaveTextContent("mayor que cero");
    expect(calls.some((c) => c.key.startsWith("POST"))).toBe(false);
  });

  it("[TC-M08-W04] pide confirmación, advierte que no cambia citas existentes y publica", async () => {
    const { calls } = mockFetch({
      "GET /admin/consultation-price/versions": [
        { status: 200, body: { versions: [V1] } },
        { status: 200, body: { versions: [V2, closedV1] } },
      ],
      "GET /admin/consultation-price": [
        { status: 200, body: V1 },
        { status: 200, body: V2 },
      ],
      "POST /admin/consultation-price/versions": { status: 201, body: V2 },
    });
    render(<ConsultationPrice />);
    await screen.findByLabelText("Precio vigente");
    await userEvent.type(screen.getByLabelText("Nuevo precio (MXN)"), "250");
    await userEvent.click(screen.getByRole("button", { name: "Actualizar precio" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Las citas y los pagos existentes no cambian");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByLabelText("Precio vigente")).toHaveTextContent("$250.00 MXN"));
    expect(calls.find((c) => c.key === "POST /admin/consultation-price/versions")?.body).toEqual({ price: "250" });
    expect(screen.getByRole("status")).toHaveTextContent("Precio actualizado");
  });

  it("[TC-M08-W05] un precio igual al vigente (422) muestra el aviso", async () => {
    mockFetch({
      "GET /admin/consultation-price/versions": { status: 200, body: { versions: [V1] } },
      "GET /admin/consultation-price": { status: 200, body: V1 },
      "POST /admin/consultation-price/versions": { status: 422, body: { message: "igual" } },
    });
    render(<ConsultationPrice />);
    await screen.findByLabelText("Precio vigente");
    await userEvent.type(screen.getByLabelText("Nuevo precio (MXN)"), "200");
    await userEvent.click(screen.getByRole("button", { name: "Actualizar precio" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("igual al vigente");
  });

  it("[TC-M08-W06] sin sesión (401) envía a /login", async () => {
    mockFetch({
      "GET /admin/consultation-price/versions": { status: 401, body: {} },
      "GET /admin/consultation-price": { status: 401, body: {} },
    });
    render(<ConsultationPrice />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
