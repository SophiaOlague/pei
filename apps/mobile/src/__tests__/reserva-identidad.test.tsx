import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import SeleccionFecha from "@/app/(app)/seleccionfecha";

// Reserva rechazada por identidad (RegistrationIncompleteError con details.missing): sin red ni backend real.
const DOCTOR_ID = "33333333-3333-4333-8333-333333333333";
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const SLOT = {
  date: "2026-11-20",
  end: "10:30",
  endsAt: "2026-11-20T16:30:00.000Z",
  start: "10:00",
  startsAt: "2026-11-20T16:00:00.000Z",
};
const SLOTS = {
  doctorProfileId: DOCTOR_ID,
  durationMinutes: 30,
  from: "2026-11-20",
  slots: [SLOT],
  timeZone: "America/Mexico_City",
  to: "2026-12-03",
};
const HOLD = {
  holdExpiresAt: "2026-11-11T12:05:00.000Z",
  id: APPOINTMENT_ID,
  price: "650.00",
  scheduledAt: SLOT.startsAt,
  status: "pending_payment",
};
const MOTIVO = "Dolor de cabeza";
const RESERVE = "Reservar y continuar al pago";
const HOLD_KEY = "POST /me/patient/appointments";
const SLOTS_KEY = `GET /doctors/${DOCTOR_ID}/slots`;

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

type Reply = { status: number; body: unknown };
let replies: Record<string, Reply[]>;
const calls: string[] = [];

beforeEach(() => {
  mockPush.mockReset();
  calls.length = 0;
  Object.assign(mockParams, {
    doctorAvatar: "",
    doctorName: "Dra. Ana",
    doctorProfileId: DOCTOR_ID,
    doctorSpecialty: "General",
  });
  replies = {
    [HOLD_KEY]: [{ body: HOLD, status: 201 }],
    [SLOTS_KEY]: [{ body: SLOTS, status: 200 }],
  };
  global.fetch = jest.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(input).pathname}`;
    calls.push(key);
    const queue = replies[key];
    if (!queue?.length) {
      return Promise.reject(new Error(`no simulada: ${key}`));
    }
    const r = queue.length > 1 ? (queue.shift() as Reply) : queue[0];
    return Promise.resolve({
      json: () => Promise.resolve(r.body),
      ok: r.status < 300,
      status: r.status,
    } as Response);
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

const LEGAL_REQUIRED =
  /Para agendar necesitas aceptar la versión vigente de los documentos legales/;

describe("seleccionfecha.tsx · identidad pendiente (RegistrationIncompleteError)", () => {
  const incomplete = (missing: string[]) => ({
    body: {
      details: { missing },
      error: "RegistrationIncompleteError",
      message: "El registro del paciente está incompleto",
      statusCode: 403,
    },
    status: 403,
  });

  it("sin INE enviada: explica el requisito, ofrece ir a la verificación y no inicia el pago", async () => {
    replies[HOLD_KEY] = [incomplete(["identity_submission"])];
    await chooseSlotAndReason();
    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(
      screen.getByText(
        "Para reservar necesitas verificar tu identidad con tu INE."
      )
    ).toBeTruthy();
    await fireEvent.press(screen.getByText("Verificar mi identidad"));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      params: { origen: "reserva" },
      pathname: "/verificacionidentidad",
    });
  });

  it("en revisión o rechazada: mensaje y acción propios; un nuevo intento limpia el aviso", async () => {
    replies[HOLD_KEY] = [
      incomplete(["identity_review"]),
      incomplete(["identity_resubmission"]),
      { body: HOLD, status: 201 },
    ];
    await chooseSlotAndReason();
    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(screen.getByText("Ver estado de mi verificación")).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(
      screen.getByText(
        "Tu verificación de identidad fue rechazada. Envía de nuevo tu INE para poder reservar."
      )
    ).toBeTruthy();
    expect(screen.getByText("Reenviar mi INE")).toBeTruthy();

    // Solo cuando el backend acepta la reserva se navega al pago.
    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(screen.queryByText("Reenviar mi INE")).toBeNull();
    expect(mockPush).toHaveBeenCalledWith({
      params: { appointmentId: APPOINTMENT_ID },
      pathname: "/pago",
    });
  });

  it("[RN-140] con la aceptación legal pendiente, explica que hay que aceptarla y no ofrece la verificación", async () => {
    replies[HOLD_KEY] = [incomplete(["legal"])];
    await chooseSlotAndReason();
    await act(async () => fireEvent.press(screen.getByText(RESERVE)));
    expect(screen.getByText(LEGAL_REQUIRED)).toBeTruthy();
    expect(screen.queryByText("Verificar mi identidad")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
