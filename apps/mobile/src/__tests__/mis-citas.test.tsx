import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react-native";
import MyAppointmentsScreen from "@/app/(app)/(tabs)/mis-citas";
import AppointmentDetailScreen from "@/app/(app)/detallecita";
import { splitAppointments, statusLabel } from "@/lib/appointment-status";

// «Mis citas» y su detalle con el backend SIMULADO (fetch): solo citas reales de GET /me/patient/appointments, sin datos
// de demostración.
const MINUTE_MS = 60_000;
const DOCTOR_ID = "33333333-3333-4333-8333-333333333333";
const NEW_ID = "44444444-4444-4444-8444-444444444444";
const OLD_ID = "55555555-5555-4555-8555-555555555555";
const PAST_ID = "66666666-6666-4666-8666-666666666666";
const HOLD_ID = "77777777-7777-4777-8777-777777777777";
const OPENS_NOTE = /Podrás entrar a la sala de espera desde las/;
const DOCTOR_ROW = /Dra. Ana Real/;

const mockPush = jest.fn();
const mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: { push: (...args: unknown[]) => mockPush(...args) },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useLocalSearchParams: () => mockParams,
  };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaView: View };
});
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    getCookie: () => Promise.resolve("better-auth.session_token=abc"),
  },
}));

function appointment(
  id: string,
  minutes: number,
  over: Record<string, unknown> = {}
) {
  return {
    cancelledAt: null,
    cancelledBy: null,
    doctorProfileId: DOCTOR_ID,
    holdExpiresAt: null,
    id,
    patientProfileId: "pat-1",
    price: "200.00",
    reason: `Motivo ${id.slice(0, 4)}`,
    scheduledAt: new Date(Date.now() + minutes * MINUTE_MS).toISOString(),
    status: "confirmed",
    ...over,
  };
}

let replies: Record<string, { status: number; body: unknown }>;
const calls: string[] = [];

beforeEach(() => {
  mockPush.mockReset();
  for (const k of Object.keys(mockParams)) {
    delete mockParams[k];
  }
  calls.length = 0;
  replies = {
    "GET /doctors/bookable": {
      body: {
        doctors: [
          {
            displayName: "Dra. Ana Real",
            doctorProfileId: DOCTOR_ID,
            specialty: { id: "s", name: "Medicina general" },
          },
        ],
        timeZone: "America/Mexico_City",
      },
      status: 200,
    },
    "GET /me/patient/appointments": {
      body: {
        appointments: [
          // La cita recién pagada NO es la más próxima: debe encontrarse igual.
          appointment(NEW_ID, 60 * 24 * 5),
          appointment(OLD_ID, 60 * 24),
          appointment(PAST_ID, -60 * 24 * 3, { status: "completed" }),
        ],
      },
      status: 200,
    },
  };
  global.fetch = jest.fn((input: string) => {
    const key = `GET ${new URL(input).pathname}`;
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

describe("appointment-status", () => {
  it("[TC-MOB-CIT-001] separa próximas (confirmadas o por pagar, futuras) y pasadas; nombra el estado de M08", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const at = (iso: string, status: string, id: string) =>
      ({ ...appointment(id, 0), scheduledAt: iso, status }) as never;
    const { upcoming, past } = splitAppointments(
      [
        at("2026-12-02T16:00:00Z", "confirmed", "b"),
        at("2026-12-01T16:00:00Z", "pending_payment", "a"),
        at("2026-12-03T16:00:00Z", "canceled", "c"),
        at("2026-11-20T16:00:00Z", "completed", "d"),
      ],
      now
    );
    expect(upcoming.map((x) => x.id)).toEqual(["a", "b"]);
    expect(past.map((x) => x.id)).toEqual(["c", "d"]);
    expect(statusLabel("no_show_doctor")).toBe("El médico no asistió");
  });
});

describe("mis-citas.tsx", () => {
  it("[TC-MOB-CIT-010] muestra las próximas reales con el médico, y las pasadas en su pestaña", async () => {
    await render(<MyAppointmentsScreen />);
    expect(await screen.findByText("Próximas (2)")).toBeTruthy();
    expect(screen.getAllByText("Dra. Ana Real")).toHaveLength(2);
    expect(screen.getByText(`Motivo ${OLD_ID.slice(0, 4)}`)).toBeTruthy();
    expect(screen.queryByText("Completada")).toBeNull();
    await fireEvent.press(screen.getByRole("tab", { name: "Pasadas (1)" }));
    expect(screen.getByText("Completada")).toBeTruthy();
    // Solo datos del backend: ninguna cita de demostración.
    expect(calls).toContain("GET /me/patient/appointments");
    expect(screen.queryByText("Dr. Diego Torres")).toBeNull();
  });

  it("[TC-MOB-CIT-011] ?cita= resalta la cita recién pagada aunque no sea la más próxima", async () => {
    mockParams.cita = NEW_ID;
    await render(<MyAppointmentsScreen />);
    expect(await screen.findByText("Recién agendada")).toBeTruthy();
    const rows = screen.getAllByRole("button", { name: DOCTOR_ROW });
    expect(rows).toHaveLength(2);
    // Orden ascendente: la nueva (en 5 días) va después de la de mañana, y es la única resaltada.
    expect(rows[1].props.accessibilityState).toMatchObject({ selected: true });
    expect(rows[0].props.accessibilityState).toMatchObject({ selected: false });
    expect(within(rows[1]).getByText("Recién agendada")).toBeTruthy();
  });

  it("[TC-MOB-CIT-012] tocar una cita abre su detalle", async () => {
    await render(<MyAppointmentsScreen />);
    const rows = await screen.findAllByRole("button", {
      name: DOCTOR_ROW,
    });
    await fireEvent.press(rows[0]);
    expect(mockPush).toHaveBeenCalledWith({
      params: { appointmentId: OLD_ID },
      pathname: "/detallecita",
    });
  });

  it("[TC-MOB-CIT-013] sin citas ofrece agendar; un error del backend se muestra y se puede reintentar", async () => {
    replies["GET /me/patient/appointments"] = {
      body: { message: "El servidor no pudo completar la operación." },
      status: 500,
    };
    await render(<MyAppointmentsScreen />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    replies["GET /me/patient/appointments"] = {
      body: { appointments: [] },
      status: 200,
    };
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No tienes citas próximas.")).toBeTruthy();
    await fireEvent.press(
      screen.getByRole("button", { name: "Agendar una cita" })
    );
    expect(mockPush).toHaveBeenCalledWith("/seleccioncita");
  });
});

describe("detallecita.tsx", () => {
  function detail(over: Record<string, unknown>, id = NEW_ID) {
    mockParams.appointmentId = id;
    replies[`GET /me/patient/appointments/${id}`] = {
      body: { ...appointment(id, 60), ...over },
      status: 200,
    };
  }

  it("[TC-MOB-CIT-020] muestra médico, fecha, hora, motivo, estado y precio de la cita real", async () => {
    detail({});
    await render(<AppointmentDetailScreen />);
    expect(await screen.findByText("Dra. Ana Real")).toBeTruthy();
    expect(screen.getByText("Confirmada")).toBeTruthy();
    expect(screen.getByText(`Motivo ${NEW_ID.slice(0, 4)}`)).toBeTruthy();
    expect(screen.getByText("$200.00 MXN")).toBeTruthy();
    // Faltan 60 min: la sala todavía no abre (abre 15 min antes).
    expect(screen.getByText(OPENS_NOTE)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Entrar a la sala" })
    ).toBeNull();
  });

  it("[TC-MOB-CIT-021] confirmada dentro de los 15 min previos: permite entrar a la sala", async () => {
    detail({
      scheduledAt: new Date(Date.now() + 10 * MINUTE_MS).toISOString(),
    });
    await render(<AppointmentDetailScreen />);
    await fireEvent.press(
      await screen.findByRole("button", { name: "Entrar a la sala" })
    );
    expect(mockPush).toHaveBeenCalledWith({
      params: { appointmentId: NEW_ID, doctorName: "Dra. Ana Real" },
      pathname: "/joincall",
    });
  });

  it("[TC-MOB-CIT-022] pendiente de pago con retención vigente: permite continuar al pago", async () => {
    detail(
      {
        holdExpiresAt: new Date(Date.now() + 5 * MINUTE_MS).toISOString(),
        status: "pending_payment",
      },
      HOLD_ID
    );
    await render(<AppointmentDetailScreen />);
    await fireEvent.press(
      await screen.findByRole("button", { name: "Continuar al pago" })
    );
    expect(mockPush).toHaveBeenCalledWith({
      params: { appointmentId: HOLD_ID },
      pathname: "/pago",
    });
  });

  it("[TC-MOB-CIT-023] una cita pasada no ofrece acciones", async () => {
    detail(
      {
        scheduledAt: new Date(Date.now() - 60 * MINUTE_MS).toISOString(),
        status: "completed",
      },
      PAST_ID
    );
    await render(<AppointmentDetailScreen />);
    expect(await screen.findByText("Completada")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
