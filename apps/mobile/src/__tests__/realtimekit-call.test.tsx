import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { NativeModules } from "react-native";

import { RealtimeKitCall } from "@/components/video/realtimekit-call";

// Salida de la llamada con el SDK de RealtimeKit simulado. Reproduce el error de la prueba real del 2026-11-25
// («Uncaught (in promise, id 1) TypeError: undefined» al salir): ninguna salida debe dejar promesas rechazadas sin
// manejar, aunque la sala ya esté cerrada o el SDK falle.

type Listener = (payload?: { state?: string }) => void;
const listeners = new Map<string, Listener>();
const mockMeeting = {
  join: jest.fn<() => Promise<void>>(),
  leave: jest.fn<() => Promise<void>>(),
  self: {
    addListener: (event: string, fn: Listener) => listeners.set(event, fn),
    disableAudio: jest.fn(),
    disableVideo: jest.fn(),
    enableAudio: jest.fn(),
    enableVideo: jest.fn(),
    removeListener: (event: string) => listeners.delete(event),
  },
};
const mockInit = jest.fn<() => Promise<unknown>>();

jest.mock("@cloudflare/realtimekit-react-native", () => ({
  RealtimeKitProvider: ({ children }: { children: unknown }) => children,
  useRealtimeKitClient: () => [mockMeeting, mockInit],
}));
jest.mock("@cloudflare/realtimekit-react-native-ui", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const RtkUIContext = React.createContext({
    setStates: (_: unknown) => undefined,
    storeStates: { meeting: "joined" },
  });
  return {
    RtkDialogManager: () => null,
    RtkGrid: () => null,
    RtkParticipantTile: () => null,
    RtkUIContext,
    RtkUIProvider: ({ children }: { children: unknown }) => children,
  };
});
jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("@/components/themed-text", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { ThemedText: Text };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaView: View };
});

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => unhandled.push(reason);
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  listeners.clear();
  unhandled.length = 0;
  mockMeeting.join.mockReset().mockResolvedValue(undefined);
  mockMeeting.leave.mockReset().mockResolvedValue(undefined);
  mockInit.mockReset().mockResolvedValue(mockMeeting);
  process.on("unhandledRejection", onUnhandled);
});
afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
});

describe("RealtimeKitCall · salida segura", () => {
  it("[TC-MOB-VID-040] roomLeft (expulsión) avisa con el motivo y no usa el módulo nativo CoreUiKit obsoleto", async () => {
    // Si el código volviera a llamar a CoreUiKit.startService/stopService (que la UI 2.0 ya no tiene), fallaría aquí.
    const coreUiKit = NativeModules.CoreUiKit;
    NativeModules.CoreUiKit = {};
    const onLeft = jest.fn();
    await render(<RealtimeKitCall authToken="t" onLeft={onLeft} />);
    await act(() => listeners.get("roomJoined")?.());
    await act(() => listeners.get("roomLeft")?.({ state: "kicked" }));
    await flush();
    expect(onLeft).toHaveBeenCalledWith("kicked");
    expect(unhandled).toEqual([]);
    NativeModules.CoreUiKit = coreUiKit;
  });

  it("[TC-MOB-VID-041] salir con el botón cuando el SDK rechaza leave() no deja una promesa sin manejar", async () => {
    mockMeeting.leave.mockRejectedValue(
      new TypeError("la sala del SDK ya se liberó")
    );
    await render(<RealtimeKitCall authToken="t" onLeft={jest.fn()} />);
    await act(() => listeners.get("roomJoined")?.());
    await fireEvent.press(screen.getByLabelText("Salir de la llamada"));
    await flush();
    expect(mockMeeting.leave).toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  });

  it("[TC-MOB-VID-042] desmontar durante la llamada (navegación o fin de la consulta) abandona una vez y sin rechazos", async () => {
    mockMeeting.leave.mockRejectedValue(
      new TypeError("la sala del SDK ya se liberó")
    );
    const view = await render(
      <RealtimeKitCall authToken="t" onLeft={jest.fn()} />
    );
    await act(() => listeners.get("roomJoined")?.());
    await view.unmount();
    await flush();
    expect(mockMeeting.leave).toHaveBeenCalledTimes(1);
    expect(unhandled).toEqual([]);
  });

  it("[TC-MOB-VID-043] tras roomLeft, desmontar no vuelve a llamar a leave(); un fallo al unirse se informa", async () => {
    const onLeft = jest.fn();
    const view = await render(
      <RealtimeKitCall authToken="t" onLeft={onLeft} />
    );
    await act(() => listeners.get("roomJoined")?.());
    await act(() => listeners.get("roomLeft")?.({ state: "ended" }));
    await view.unmount();
    await flush();
    expect(mockMeeting.leave).not.toHaveBeenCalled();

    mockMeeting.join.mockRejectedValue(
      new TypeError("la sala del SDK ya se liberó")
    );
    const failed = jest.fn();
    await render(<RealtimeKitCall authToken="t2" onLeft={failed} />);
    await flush();
    expect(failed).toHaveBeenCalledWith("failed");
    expect(unhandled).toEqual([]);
  });
});
