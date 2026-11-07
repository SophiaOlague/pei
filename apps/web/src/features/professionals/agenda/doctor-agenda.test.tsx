import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DoctorAgenda } from "@/lib/api";
import { mockFetch } from "@/test/http";
import { formatLocalDay, mexicoCityDate, mexicoCityToIso } from "./agenda-time";
import { DoctorAgendaPage, toApiWindow } from "./doctor-agenda";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const AGENDA: DoctorAgenda = {
  timeZone: "America/Mexico_City",
  canOperate: true,
  durationMinutes: 30,
  availability: [{ weekday: 1, start: "09:00", end: "11:00" }],
  timeOff: [
    {
      id: "t1",
      startsAt: "2026-11-20T06:00:00.000Z",
      endsAt: "2026-11-21T06:00:00.000Z",
      reason: "Congreso",
    },
  ],
};
const SLOTS = {
  timeZone: "America/Mexico_City",
  durationMinutes: 30,
  from: "2026-11-08",
  to: "2026-11-21",
  slots: [
    {
      startsAt: "2026-11-09T15:00:00.000Z",
      endsAt: "2026-11-09T15:30:00.000Z",
      date: "2026-11-09",
      start: "09:00",
      end: "09:30",
    },
  ],
};

beforeEach(() => {
  replace.mockReset();
});

describe("M07 agenda del médico (web)", () => {
  it("[TC-M07-060][D-1] conversiones con la hora del centro de México", () => {
    expect(mexicoCityToIso("2026-11-20T00:00")).toBe(
      "2026-11-20T06:00:00.000Z",
    );
    expect(mexicoCityToIso("no")).toBeNull();
    expect(mexicoCityDate(new Date("2026-11-09T05:00:00Z"))).toBe("2026-11-08");
    expect(mexicoCityDate(new Date("2026-11-09T05:00:00Z"), 13)).toBe(
      "2026-11-21",
    );
    expect(formatLocalDay("2026-11-09")).toMatch(/lunes/);
    expect(toApiWindow({ weekday: 1, start: "22:00", end: "00:00" }).end).toBe(
      "24:00",
    );
  });

  it("[TC-M07-061][RF-10][RF-11] muestra horario, duración, periodos, vista previa y la etiqueta de zona", async () => {
    mockFetch({
      "GET /me/doctor/agenda": { status: 200, body: AGENDA },
      "GET /me/doctor/agenda/slots": { status: 200, body: SLOTS },
    });
    render(<DoctorAgendaPage />);
    expect(await screen.findByLabelText("Lunes: inicio")).toHaveValue("09:00");
    expect(screen.getByText(/hora del centro de México/)).toBeInTheDocument();
    expect(screen.getByLabelText("Minutos por consulta")).toHaveValue("30");
    expect(screen.getByText(/Congreso/)).toBeInTheDocument();
    expect(await screen.findByText("09:00")).toBeInTheDocument();
  });

  it("[TC-M07-062][RF-10] guarda el horario y la duración", async () => {
    const http = mockFetch({
      "GET /me/doctor/agenda": { status: 200, body: AGENDA },
      "GET /me/doctor/agenda/slots": { status: 200, body: SLOTS },
      "PUT /me/doctor/agenda/availability": {
        status: 200,
        body: { availability: [] },
      },
      "PUT /me/doctor/agenda/duration": {
        status: 200,
        body: { durationMinutes: 45 },
      },
    });
    const user = userEvent.setup();
    render(<DoctorAgendaPage />);
    await screen.findByLabelText("Lunes: inicio");
    await user.click(
      screen.getByRole("button", { name: "Agregar franja (martes)" }),
    );
    await user.click(screen.getByRole("button", { name: "Guardar horario" }));
    await screen.findByText("Horario guardado.");
    const put = http.calls.find(
      (c) => c.key === "PUT /me/doctor/agenda/availability",
    );
    expect(put?.body).toEqual({
      windows: [
        { weekday: 1, start: "09:00", end: "11:00" },
        { weekday: 2, start: "09:00", end: "13:00" },
      ],
    });
    await user.selectOptions(
      screen.getByLabelText("Minutos por consulta"),
      "45",
    );
    await user.click(screen.getByRole("button", { name: "Guardar duración" }));
    await screen.findByText("Duración guardada.");
    expect(
      http.calls.find((c) => c.key === "PUT /me/doctor/agenda/duration")?.body,
    ).toEqual({ minutes: 45 });
  });

  it("[TC-M07-063][RF-11] elimina un periodo y muestra el error del backend", async () => {
    const http = mockFetch({
      "GET /me/doctor/agenda": { status: 200, body: AGENDA },
      "GET /me/doctor/agenda/slots": { status: 200, body: SLOTS },
      "DELETE /me/doctor/agenda/time-off/t1": {
        status: 422,
        body: {
          message:
            "No se puede eliminar un periodo no disponible que ya terminó",
        },
      },
    });
    const user = userEvent.setup();
    render(<DoctorAgendaPage />);
    await user.click(await screen.findByRole("button", { name: "Eliminar" }));
    expect(await screen.findByText(/ya terminó/)).toBeInTheDocument();
    expect(
      http.calls.some((c) => c.key === "DELETE /me/doctor/agenda/time-off/t1"),
    ).toBe(true);
  });

  it("[TC-M07-064][D-2] sin canOperate la agenda es de solo lectura", async () => {
    mockFetch({
      "GET /me/doctor/agenda": {
        status: 200,
        body: { ...AGENDA, canOperate: false },
      },
      "GET /me/doctor/agenda/slots": { status: 200, body: SLOTS },
    });
    render(<DoctorAgendaPage />);
    expect(await screen.findByRole("note")).toHaveTextContent(
      /aún no está habilitado/,
    );
    expect(screen.getByLabelText("Lunes: inicio")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Guardar horario" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Agregar periodo" }),
    ).toBeNull();
  });

  it("[TC-M07-065] sin sesión vuelve al acceso profesional", async () => {
    mockFetch({
      "GET /me/doctor/agenda": { status: 401, body: {} },
      "GET /me/doctor/agenda/slots": { status: 401, body: {} },
    });
    render(<DoctorAgendaPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/profesionales"));
  });
});
