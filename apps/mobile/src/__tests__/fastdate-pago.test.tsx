import { describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import FastDateScreen from "@/app/(app)/fastdate";

// fastdate.tsx usa datos de demostración (sin reserva en M08): no debe llevar al pago.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useLocalSearchParams: () => ({}),
}));
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
jest.mock("@/app/(app)/emergency-demo", () => ({
  ServiceEmergency: {
    getAssignEmergency: () =>
      Promise.resolve({
        doctorId: "doc-101",
        doctorName: "Dra. Demo",
        especialidad: "General",
        fecha: "3 de Agosto del 2026",
        fotoUrl: "",
        horariosLibresDoctor: [],
        slotAsignado: { disponible: true, hora: "3:30 PM", id: "slot-16" },
      }),
    updateEmergencySlot: () => Promise.resolve(true),
  },
}));

describe("fastdate.tsx", () => {
  it("sin reserva real de emergencia no navega al pago", async () => {
    const alert = jest
      .spyOn(Alert, "alert")
      .mockImplementation(() => undefined);
    await render(<FastDateScreen />);
    const confirm = await screen.findByText("Confirmar");
    await act(async () => fireEvent.press(confirm));
    expect(alert).toHaveBeenCalledWith(
      "Reserva de emergencia no disponible",
      expect.any(String)
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
