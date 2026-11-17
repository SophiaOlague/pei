import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import SeleccionCita from "@/app/(app)/seleccioncita";
import SeleccionFecha from "@/app/(app)/seleccionfecha";

// Flujo seleccioncita → seleccionfecha → /pago con el catálogo real (fetch simulado; sin backend ni red).
const DOCTOR_ID = "33333333-3333-4333-8333-333333333333";
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const DOCTORS = {
  doctors: [
    {
      displayName: "Dra. Ana Real",
      doctorProfileId: DOCTOR_ID,
      specialty: { id: "sp-1", name: "Medicina general" },
    },
  ],
  timeZone: "America/Mexico_City",
};
const SLOT = {
  date: "2026-11-20",
  end: "10:30",
  endsAt: "2026-11-20T16:30:00.000Z",
  start: "10:00",
  startsAt: "2026-11-20T16:00:00.000Z",
};

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
let replies: Record<string, Reply>;
const calls: { key: string; body: unknown }[] = [];

beforeEach(() => {
  mockPush.mockReset();
  calls.length = 0;
  for (const k of Object.keys(mockParams)) {
    delete mockParams[k];
  }
  replies = {
    "GET /doctors/bookable": { body: DOCTORS, status: 200 },
    [`GET /doctors/${DOCTOR_ID}/slots`]: {
      body: {
        doctorProfileId: DOCTOR_ID,
        durationMinutes: 30,
        from: SLOT.date,
        slots: [SLOT],
        timeZone: "America/Mexico_City",
        to: SLOT.date,
      },
      status: 200,
    },
    "POST /me/patient/appointments": {
      body: {
        holdExpiresAt: null,
        id: APPOINTMENT_ID,
        price: "650.00",
        scheduledAt: SLOT.startsAt,
        status: "pending_payment",
      },
      status: 201,
    },
  };
  global.fetch = jest.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${new URL(input).pathname}`;
    calls.push({
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      key,
    });
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

describe("seleccioncita.tsx · catálogo real", () => {
  it("muestra los médicos reservables del backend, sin médicos de maqueta", async () => {
    await render(<SeleccionCita />);
    expect(await screen.findByText("Dra. Ana Real")).toBeTruthy();
    expect(screen.getByText("Medicina general")).toBeTruthy();
    expect(screen.queryByText("Dra. Laura Josefa")).toBeNull();
    expect(calls[0].key).toBe("GET /doctors/bookable");
  });

  it("sin médicos o con error, no se puede continuar", async () => {
    replies["GET /doctors/bookable"] = {
      body: { doctors: [], timeZone: "x" },
      status: 200,
    };
    await render(<SeleccionCita />);
    expect(
      await screen.findByText(
        "No hay médicos con horarios disponibles por ahora."
      )
    ).toBeTruthy();
    replies["GET /doctors/bookable"] = { body: {}, status: 503 };
    await render(<SeleccionCita />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("el doctorProfileId real llega a los horarios, a la reserva de M08 y el appointmentId al pago", async () => {
    await render(<SeleccionCita />);
    await act(async () =>
      fireEvent.press(await screen.findByLabelText("Médico Dra. Ana Real"))
    );
    const [first] = mockPush.mock.calls[0] as [
      { pathname: string; params: Record<string, string> },
    ];
    expect(first).toEqual({
      params: {
        doctorAvatar: "",
        doctorName: "Dra. Ana Real",
        doctorProfileId: DOCTOR_ID,
        doctorSpecialty: "Medicina general",
      },
      pathname: "/seleccionfecha",
    });

    // seleccionfecha recibe exactamente esos parámetros.
    Object.assign(mockParams, first.params);
    await render(<SeleccionFecha />);
    await fireEvent.press(await screen.findByLabelText("Horario 10:00"));
    await fireEvent.changeText(
      screen.getByLabelText("Motivo de la consulta"),
      "Revisión"
    );
    await act(async () =>
      fireEvent.press(screen.getByText("Reservar y continuar al pago"))
    );

    expect(calls.map((c) => c.key)).toEqual([
      "GET /doctors/bookable",
      `GET /doctors/${DOCTOR_ID}/slots`,
      "POST /me/patient/appointments",
    ]);
    expect(calls[2].body).toEqual({
      doctorProfileId: DOCTOR_ID,
      reason: "Revisión",
      startsAt: SLOT.startsAt,
    });
    expect(mockPush).toHaveBeenLastCalledWith({
      params: { appointmentId: APPOINTMENT_ID },
      pathname: "/pago",
    });
  });
});
