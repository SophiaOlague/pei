import { describe, expect, it } from "@jest/globals";

import type { PatientAppointment } from "@/lib/api";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  pickNextAppointment,
  waitingRoomAccess,
} from "@/lib/next-appointment";

function appointment(
  id: string,
  status: string,
  scheduledAt: string
): PatientAppointment {
  return {
    doctorProfileId: "doc-1",
    holdExpiresAt: null,
    id,
    price: "200.00",
    reason: "Consulta",
    scheduledAt,
    status,
  };
}

describe("pickNextAppointment", () => {
  it("elige la cita confirmada más temprana, sin importar el orden de la lista", () => {
    const next = pickNextAppointment([
      appointment("b", "confirmed", "2026-11-25T16:00:00.000Z"),
      appointment("a", "confirmed", "2026-11-20T16:00:00.000Z"),
    ]);
    expect(next?.id).toBe("a");
  });

  it("ignora las citas que no están confirmadas", () => {
    const list = [
      "pending_payment",
      "expired",
      "completed",
      "canceled",
      "rescheduled",
      "no_show_patient",
      "no_show_doctor",
      "no_show_both",
    ].map((status, i) =>
      appointment(`x${i}`, status, "2026-11-20T16:00:00.000Z")
    );
    expect(pickNextAppointment(list)).toBeNull();
  });

  it("sin citas, o con una fecha ilegible, no hay próxima cita", () => {
    expect(pickNextAppointment([])).toBeNull();
    expect(
      pickNextAppointment([appointment("a", "confirmed", "no-es-fecha")])
    ).toBeNull();
  });
});

describe("waitingRoomAccess · RF-19", () => {
  const T0 = "2026-11-20T16:00:00.000Z";

  it("la sala está cerrada hasta 15 minutos antes de la hora programada", () => {
    const access = waitingRoomAccess(T0, new Date("2026-11-20T15:44:59.000Z"));
    expect(access?.open).toBe(false);
    expect(access?.opensAt.toISOString()).toBe("2026-11-20T15:45:00.000Z");
  });

  it("abre exactamente en T0 − 15 min", () => {
    expect(
      waitingRoomAccess(T0, new Date("2026-11-20T15:45:00.000Z"))?.open
    ).toBe(true);
  });

  it("sigue abierta después de la hora programada: el retraso no vence la cita", () => {
    expect(
      waitingRoomAccess(T0, new Date("2026-11-20T17:30:00.000Z"))?.open
    ).toBe(true);
  });

  it("con una fecha ilegible no decide nada", () => {
    expect(waitingRoomAccess("no-es-fecha", new Date())).toBeNull();
  });
});

describe("formato de fecha y hora", () => {
  it("usa la zona horaria del dispositivo", () => {
    const local = new Date(2026, 10, 5, 9, 7);
    expect(formatAppointmentDate(local)).toBe("5 de noviembre de 2026");
    expect(formatAppointmentTime(local)).toBe("09:07");
  });
});
