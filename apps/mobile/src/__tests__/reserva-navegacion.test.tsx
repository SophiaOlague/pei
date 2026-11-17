import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

import SeleccionFecha, { slotRange } from "@/app/(app)/seleccionfecha";

// Reserva real (M08) antes del pago: sin red ni backend real (fetch simulado).
const DOCTOR_ID = "33333333-3333-4333-8333-333333333333";
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const SLOT_A = {
  date: "2026-11-20",
  end: "10:30",
  endsAt: "2026-11-20T16:30:00.000Z",
  start: "10:00",
  startsAt: "2026-11-20T16:00:00.000Z",
};
const SLOT_B = {
  date: "2026-11-20",
  end: "11:00",
  endsAt: "2026-11-20T17:00:00.000Z",
  start: "10:30",
  startsAt: "2026-11-20T16:30:00.000Z",
};
const SLOTS = {
  doctorProfileId: DOCTOR_ID,
  durationMinutes: 30,
  from: "2026-11-20",
  slots: [SLOT_A, SLOT_B],
  timeZone: "America/Mexico_City",
  to: "2026-12-03",
};
const HOLD = {
  holdExpiresAt: "2026-11-11T12:05:00.000Z",
  id: APPOINTMENT_ID,
  price: "650.00",
  scheduledAt: SLOT_A.startsAt,
  status: "pending_payment",
};
const MOTIVO = "Dolor de cabeza";
const RESERVE = "Reservar y continuar al pago";
const NETWORK_ERROR = /No pudimos conectar con el servidor/;

const mockPush = jest.fn();
const mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    getCookie: () => Promise.resolve("better-auth.session_token=abc"),
  },
}));

type Reply =
  | { status: number; body: unknown }
  | Error
  | (() => Promise<Response>);
let replies: Record<string, Reply[]>;
const calls: { key: string; body: unknown }[] = [];
function respond(r: Reply): Promise<Response> {
  if (typeof r === "function") {
    return r();
  }
  if (r instanceof Error) {
    return Promise.reject(r);
  }
  return Promise.resolve({
    json: () => Promise.resolve(r.body),
    ok: r.status < 300,
    status: r.status,
  } as Response);
}
const HOLD_KEY = "POST /me/patient/appointments";
const SLOTS_KEY = `GET /doctors/${DOCTOR_ID}/slots`;

beforeEach(() => {
  mockPush.mockReset();
  calls.length = 0;
  for (const k of Object.keys(mockParams)) {
    delete mockParams[k];
  }
  Object.assign(mockParams, {
    doctorAvatar: "",
    doctorName: "Dra. Ana",
    doctorProfileId: DOCTOR_ID,
    doctorSpecialty: "General",
  });
  replies = {
    [SLOTS_KEY]: [{ body: SLOTS, status: 200 }],
    [HOLD_KEY]: [{ body: HOLD, status: 201 }],
  };
  global.fetch = jest.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(input).pathname}`;
    calls.push({
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      key,
    });
    const queue = replies[key];
    if (!queue?.length) {
      return Promise.reject(new Error(`no simulada: ${key}`));
    }
    return respond(queue.length > 1 ? (queue.shift() as Reply) : queue[0]);
  }) as unknown as typeof fetch;
});

async function chooseSlotAndReason(): Promise<void> {
  await render(<SeleccionFecha />);
  await fireEvent.press(await screen.findByLabelText("Horario 10:00"));
  await fireEvent.changeText(
    screen.getByLabelText("Motivo de la consulta"),
    MOTIVO
  );
}
const holdCalls = () => calls.filter((c) => c.key === HOLD_KEY);

describe("seleccionfecha.tsx · reserva real", () => {
  it("pide los horarios reales del médico (14 días) y no muestra horarios fijos", async () => {
    await render(<SeleccionFecha />);
    expect(await screen.findByLabelText("Horario 10:00")).toBeTruthy();
    expect(screen.getByLabelText("Horario 10:30")).toBeTruthy();
    expect(screen.queryByText("11:30")).toBeNull();
    expect(calls[0].key).toBe(SLOTS_KEY);
    const range = slotRange(new Date(2026, 10, 11));
    expect(range).toEqual({ from: "2026-11-11", to: "2026-11-24" });
  });

  it("crea la cita y navega a /pago SOLO con el appointmentId del backend (sin precio ni datos de maqueta)", async () => {
    await chooseSlotAndReason();
    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(holdCalls()).toEqual([
      {
        body: {
          doctorProfileId: DOCTOR_ID,
          reason: MOTIVO,
          startsAt: SLOT_A.startsAt,
        },
        key: HOLD_KEY,
      },
    ]);
    expect(mockPush).toHaveBeenCalledWith({
      params: { appointmentId: APPOINTMENT_ID },
      pathname: "/pago",
    });
  });

  it("sin médico válido no se piden horarios ni se puede reservar", async () => {
    mockParams.doctorProfileId = "6";
    await render(<SeleccionFecha />);
    expect(
      screen.getByText("Selecciona un médico disponible para reservar.")
    ).toBeTruthy();
    expect(calls).toEqual([]);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("sin motivo no se reserva", async () => {
    await render(<SeleccionFecha />);
    await fireEvent.press(await screen.findByLabelText("Horario 10:00"));
    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(screen.getByText("Escribe el motivo de la consulta.")).toBeTruthy();
    expect(holdCalls()).toEqual([]);
  });

  it("un error de red no permite iniciar el pago; el reintento repite la MISMA reserva (RB-2)", async () => {
    replies[HOLD_KEY] = [new TypeError("network"), { body: HOLD, status: 201 }];
    await chooseSlotAndReason();
    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(await screen.findByText(NETWORK_ERROR)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(holdCalls().map((c) => c.body)).toEqual([
      { doctorProfileId: DOCTOR_ID, reason: MOTIVO, startsAt: SLOT_A.startsAt },
      { doctorProfileId: DOCTOR_ID, reason: MOTIVO, startsAt: SLOT_A.startsAt },
    ]);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("errores de M08 (horario ocupado, otra retención vigente) se muestran y no se navega", async () => {
    replies[HOLD_KEY] = [
      {
        body: { message: "Ya tienes una reserva pendiente de pago" },
        status: 409,
      },
    ];
    await chooseSlotAndReason();
    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(
      screen.getByText("Ya tienes una reserva pendiente de pago")
    ).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("una respuesta que no es una cita en pending_payment no inicia el pago", async () => {
    replies[HOLD_KEY] = [{ body: { ...HOLD, status: "expired" }, status: 201 }];
    await chooseSlotAndReason();
    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(
      screen.getByText("No se pudo reservar el horario. Inténtalo de nuevo.")
    ).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("no duplica reservas: dos toques simultáneos hacen una sola petición y una cita creada se reutiliza", async () => {
    let release!: () => void;
    replies[HOLD_KEY] = [
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve({
              json: () => Promise.resolve(HOLD),
              ok: true,
              status: 201,
            } as Response);
        }),
    ];
    await chooseSlotAndReason();
    // Dos toques seguidos mientras la primera reserva sigue en curso (se invoca onPress directamente).
    const button = screen.getByText(RESERVE);
    const firstPress = fireEvent.press(button);
    const secondPress = fireEvent.press(button);
    await waitFor(() => expect(holdCalls()).toHaveLength(1));
    release();
    await firstPress;
    await secondPress;
    expect(mockPush).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.press(await screen.findByText(RESERVE)));
    expect(holdCalls()).toHaveLength(1);
    expect(mockPush).toHaveBeenNthCalledWith(2, {
      params: { appointmentId: APPOINTMENT_ID },
      pathname: "/pago",
    });
  });
});
