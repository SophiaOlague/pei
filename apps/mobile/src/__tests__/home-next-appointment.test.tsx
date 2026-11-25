import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { NextAppointment } from "@/components/appointments/next-appointment";

// Tarjeta «Próxima cita» de Inicio con GET /me/patient/appointments real (fetch simulado; sin backend ni red).
const DOCTOR_ID = "33333333-3333-4333-8333-333333333333";
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const MINUTE_MS = 60_000;
const OPENS_AT_NOTICE = /Podrás entrar a la sala desde las/;

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: {
      navigate: (...args: unknown[]) => mockNavigate(...args),
      push: (...args: unknown[]) => mockPush(...args),
    },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    getCookie: () => Promise.resolve("better-auth.session_token=abc"),
  },
}));

type Reply = { status: number; body: unknown };
let replies: Record<string, Reply>;
const calls: string[] = [];

function appointmentIn(
  minutes: number,
  status = "confirmed",
  id = APPOINTMENT_ID
) {
  return {
    cancelledAt: null,
    cancelledBy: null,
    doctorProfileId: DOCTOR_ID,
    holdExpiresAt: null,
    id,
    patientProfileId: "pat-1",
    price: "200.00",
    reason: "Seguimiento",
    scheduledAt: new Date(Date.now() + minutes * MINUTE_MS).toISOString(),
    status,
  };
}

function setAppointments(appointments: unknown[]) {
  replies["GET /me/patient/appointments"] = {
    body: { appointments },
    status: 200,
  };
}

beforeEach(() => {
  mockPush.mockReset();
  mockNavigate.mockReset();
  calls.length = 0;
  replies = {
    "GET /doctors/bookable": {
      body: {
        doctors: [
          {
            displayName: "Dra. Ana Real",
            doctorProfileId: DOCTOR_ID,
            specialty: { id: "sp-1", name: "Medicina general" },
          },
        ],
        timeZone: "America/Mexico_City",
      },
      status: 200,
    },
  };
  setAppointments([]);
  global.fetch = jest.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(input).pathname}`;
    calls.push(key);
    const r = replies[key];
    if (!r) {
      return Promise.reject(new Error(`no simulada: ${key}`));
    }
    return Promise.resolve({
      json: () => Promise.resolve(r.body),
      ok: r.status < 300,
      status: r.status,
    } as Response);
  }) as unknown as typeof fetch;
});

describe("Inicio · próxima cita real", () => {
  it("[TC-MOB-CIT-030] «Ver todas mis citas» abre la pestaña Mis citas (la lista real)", async () => {
    setAppointments([appointmentIn(60)]);
    await render(<NextAppointment />);
    await fireEvent.press(
      await screen.findByRole("link", { name: "Ver todas mis citas" })
    );
    expect(mockNavigate).toHaveBeenCalledWith("/mis-citas");
  });

  it("muestra la carga y después la cita confirmada del backend, sin datos de maqueta", async () => {
    setAppointments([appointmentIn(120)]);
    // El backend tarda: la respuesta queda retenida hasta soltarla.
    const respond = global.fetch;
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    global.fetch = ((input: string, init?: RequestInit) =>
      held.then(() => respond(input, init))) as unknown as typeof fetch;

    await render(<NextAppointment />);
    expect(screen.getByLabelText("Cargando tu próxima cita")).toBeTruthy();
    expect(screen.queryByText("Entrar a la sala")).toBeNull();
    release();
    expect(await screen.findByText("Dra. Ana Real")).toBeTruthy();
    expect(screen.queryByText("Dra Andrea Castro")).toBeNull();
    expect(calls).toContain("GET /me/patient/appointments");
  });

  it("sin citas confirmadas lo dice y ofrece agendar", async () => {
    setAppointments([
      appointmentIn(120, "pending_payment"),
      appointmentIn(-600, "completed"),
    ]);
    await render(<NextAppointment />);
    expect(
      await screen.findByText("No tienes citas confirmadas.")
    ).toBeTruthy();
    fireEvent.press(screen.getByText("Agendar una cita"));
    expect(mockPush).toHaveBeenCalledWith("/seleccioncita");
  });

  it("si el backend falla muestra el error y permite reintentar", async () => {
    replies["GET /me/patient/appointments"] = { body: {}, status: 503 };
    await render(<NextAppointment />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Entrar a la sala")).toBeNull();

    setAppointments([appointmentIn(120)]);
    fireEvent.press(screen.getByText("Reintentar"));
    expect(await screen.findByText("Dra. Ana Real")).toBeTruthy();
  });

  it("[RF-19] antes de T0 − 15 min la entrada a la sala está deshabilitada y dice cuándo abre", async () => {
    setAppointments([appointmentIn(60)]);
    await render(<NextAppointment />);
    const button = await screen.findByRole("button", {
      name: "Entrar a la sala",
    });
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect(screen.getByText(OPENS_AT_NOTICE)).toBeTruthy();
    fireEvent.press(button);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("[RF-19] desde T0 − 15 min se entra a la preparación con el appointmentId real", async () => {
    setAppointments([appointmentIn(10)]);
    await render(<NextAppointment />);
    const button = await screen.findByRole("button", {
      name: "Entrar a la sala",
    });
    expect(screen.queryByText(OPENS_AT_NOTICE)).toBeNull();
    fireEvent.press(button);
    expect(mockPush).toHaveBeenCalledWith({
      params: { appointmentId: APPOINTMENT_ID, doctorName: "Dra. Ana Real" },
      pathname: "/joincall",
    });
  });

  it("[RF-19] una cita confirmada cuya hora ya pasó sigue permitiendo entrar", async () => {
    setAppointments([appointmentIn(-20)]);
    await render(<NextAppointment />);
    const button = await screen.findByRole("button", {
      name: "Entrar a la sala",
    });
    expect(button.props.accessibilityState).toEqual({ disabled: false });
  });

  it("si el médico no está en el catálogo, no inventa un nombre", async () => {
    replies["GET /doctors/bookable"] = { body: {}, status: 403 };
    setAppointments([appointmentIn(10)]);
    await render(<NextAppointment />);
    await screen.findByRole("button", { name: "Entrar a la sala" });
    expect(screen.queryByText("Dra. Ana Real")).toBeNull();
    fireEvent.press(screen.getByText("Entrar a la sala"));
    expect(mockPush).toHaveBeenCalledWith({
      params: { appointmentId: APPOINTMENT_ID },
      pathname: "/joincall",
    });
  });
});
