import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { NextAppointment } from "@/components/appointments/next-appointment";
import { RegistrationGate } from "@/components/registration/registration-gate";

// D-37 / RN-140 de punta a punta en la app (fetch simulado, sin red): con una reaceptación legal pendiente el gate
// deja pasar, la próxima cita confirmada se muestra y se puede entrar a su sala. Agendar lo sigue rechazando el backend
// (lo cubre reserva-identidad.test.tsx).
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const DOCTOR_ID = "33333333-3333-4333-8333-333333333333";
const BANNER = /Hay una nueva versión de los documentos legales/;

const mockPush = jest.fn();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: { push: (...args: unknown[]) => mockPush(...args) },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    getCookie: () => Promise.resolve("better-auth.session_token=abc"),
    signOut: jest.fn(),
  },
}));

let registration: unknown;
beforeEach(() => {
  mockPush.mockReset();
  const routes: Record<string, unknown> = {
    "/doctors/bookable": { doctors: [], timeZone: "America/Mexico_City" },
    "/me/patient/appointments": {
      appointments: [
        {
          doctorProfileId: DOCTOR_ID,
          holdExpiresAt: null,
          id: APPOINTMENT_ID,
          price: "200.00",
          reason: "Seguimiento",
          scheduledAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          status: "confirmed",
        },
      ],
    },
  };
  global.fetch = jest.fn((input: string) => {
    const path = new URL(input).pathname;
    const body =
      path === "/me/registration-status" ? registration : routes[path];
    if (body === undefined) {
      return Promise.reject(new Error(`no simulada: ${path}`));
    }
    return Promise.resolve({
      json: () => Promise.resolve(body),
      ok: true,
      status: 200,
    } as Response);
  }) as unknown as typeof fetch;
});

const statusWith = (legal: unknown) => ({
  canBookAppointments: false,
  identity: { rejectionReason: null, status: "approved" },
  legal,
  missing: ["legal"],
  profileCompleted: true,
  registrationComplete: false,
});

describe("Reaceptación pendiente: acceso a una cita confirmada", () => {
  it("[TC-MOB-REG-010] la próxima cita confirmada se muestra y se puede entrar a su sala", async () => {
    registration = statusWith({
      accepted: false,
      pending: [{ documentId: "d1", type: "patient_terms", version: "2" }],
      reacceptanceRequired: true,
    });
    await render(
      <RegistrationGate>
        <NextAppointment />
      </RegistrationGate>
    );
    expect(await screen.findByText(BANNER)).toBeTruthy();
    const enter = await screen.findByRole("button", {
      name: "Entrar a la sala",
    });
    expect(enter.props.accessibilityState).toEqual({ disabled: false });
    await fireEvent.press(enter);
    expect(mockPush).toHaveBeenCalledWith({
      params: { appointmentId: APPOINTMENT_ID },
      pathname: "/joincall",
    });
  });

  it("[TC-MOB-REG-011] en el primer registro (sin reaceptación) la cita no es accesible: sigue el paso legal", async () => {
    registration = statusWith({
      accepted: false,
      pending: [{ documentId: "d1", type: "patient_terms", version: "1" }],
      reacceptanceRequired: false,
    });
    await render(
      <RegistrationGate>
        <NextAppointment />
      </RegistrationGate>
    );
    expect(await screen.findByText("Completa tu registro")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Entrar a la sala" })
    ).toBeNull();
  });
});
