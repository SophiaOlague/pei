import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import JoinCall from "@/app/(app)/joincall";

// Videoconsulta del paciente: cita real y sala de espera del backend (fetch simulado), vista previa local (WebRTC
// simulado) y la interfaz de llamada sustituida por un doble que solo registra la credencial recibida. Sin red.
const APPOINTMENT_ID = "11111111-1111-4111-8111-111111111111";
const MINUTE_MS = 60_000;
const BASE = `http://backend.test/me/patient/appointments/${APPOINTMENT_ID}`;
const MEDIA_ERROR_NOTICE = /No se pudo acceder a la cámara o al micrófono/;
const OPENS_AT_NOTICE = /Podrás entrar a la sala desde las/;
const PENDING_NOTICE =
  /Tu cita sigue confirmada. La plataforma no puede determinar automáticamente/;
const NO_SHOW_DOCTOR_NOTICE =
  /El médico no se presentó a la consulta. Corresponde el reembolso total/;
const TOKEN_422_NOTICE =
  /El médico te admitió, pero la videollamada no se pudo iniciar: La videollamada no está disponible en este momento/;
const TEXT_0 = /El médico está terminando otra consulta/;
const TEXT_1 = /El médico todavía puede admitirte/;
const ENDED_NOTICE = /La consulta terminó/;

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  router: {
    back: () => mockBack(),
    push: (...args: unknown[]) => mockPush(...args),
  },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
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
const mockCallTokens: string[] = [];
// Último onLeft recibido por la llamada simulada: permite reproducir un corte de la llamada (expulsión, salida).
const mockCall: { onLeft: ((reason: string) => void) | null } = {
  onLeft: null,
};
jest.mock("@/components/video/realtimekit-call", () => {
  const { Text } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    RealtimeKitCall: ({
      authToken,
      onLeft,
    }: {
      authToken: string;
      onLeft: (reason: string) => void;
    }) => {
      mockCallTokens.push(authToken);
      mockCall.onLeft = onLeft;
      return <Text>llamada con credencial {authToken}</Text>;
    },
  };
});

type Track = { enabled: boolean };
const audioTrack: Track = { enabled: true };
const videoTrack: Track = { enabled: true };
const mockRelease = jest.fn();
const mockGetUserMedia = jest.fn<() => Promise<unknown>>();
jest.mock("@cloudflare/react-native-webrtc", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    mediaDevices: { getUserMedia: () => mockGetUserMedia() },
    RTCView: (props: { streamURL?: string }) => (
      <View accessibilityLabel={`vista previa ${props.streamURL}`} />
    ),
  };
});

type Reply = { status: number; body: unknown } | { network: true };
let routes: Record<string, Reply[]>;
const calls: string[] = [];

function appointmentIn(minutes: number, status = "confirmed") {
  return {
    doctorProfileId: "doc-1",
    holdExpiresAt: null,
    id: APPOINTMENT_ID,
    price: "200.00",
    reason: "Seguimiento de tratamiento",
    scheduledAt: new Date(Date.now() + minutes * MINUTE_MS).toISOString(),
    status,
  };
}
function session(over: Record<string, unknown> = {}) {
  return {
    appointmentId: APPOINTMENT_ID,
    appointmentStatus: "confirmed",
    deadlines: {
      doctorDeadlineAt: "",
      patientToleranceEndsAt: "",
      reconnectGraceEndsAt: null,
    },
    doctor: {
      busyWithAnotherConsultation: false,
      joinedAt: null,
      present: false,
    },
    durationSeconds: null,
    endedAt: null,
    opensAt: new Date().toISOString(),
    patient: { joinedAt: new Date().toISOString(), present: true },
    pendingResolution: null,
    phase: "waiting",
    scheduledAt: new Date().toISOString(),
    serverTime: new Date().toISOString(),
    startedAt: null,
    ...over,
  };
}
// Respuestas en orden por ruta; la última se repite.
const reply = (key: string, ...replies: Reply[]) => {
  routes[key] = replies;
};
const ok = (body: unknown): Reply => ({ body, status: 200 });

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
  mockRelease.mockReset();
  mockGetUserMedia.mockReset();
  mockCallTokens.length = 0;
  mockCall.onLeft = null;
  audioTrack.enabled = true;
  videoTrack.enabled = true;
  mockGetUserMedia.mockResolvedValue({
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [videoTrack],
    release: mockRelease,
    toURL: () => "stream-1",
  });
  calls.length = 0;
  for (const k of Object.keys(mockParams)) {
    delete mockParams[k];
  }
  mockParams.appointmentId = APPOINTMENT_ID;
  routes = {};
  reply(`GET ${BASE}`, ok(appointmentIn(5)));
  global.fetch = jest.fn((input: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${input}`;
    calls.push(key);
    const queue = routes[key];
    if (!queue) {
      return Promise.reject(new Error(`no simulada: ${key}`));
    }
    const r = (queue.length > 1 ? queue.shift() : undefined) ?? queue[0];
    if ("network" in r) {
      return Promise.reject(new TypeError("Network request failed"));
    }
    return Promise.resolve({
      json: () => Promise.resolve(r.body),
      ok: r.status < 300,
      status: r.status,
    } as Response);
  }) as unknown as typeof fetch;
});
afterEach(() => {
  jest.useRealTimers();
});

const enterButton = () =>
  screen.getByRole("button", { name: "Entrar a la sala de espera" });

describe("joincall.tsx · preparación", () => {
  it("[TC-MOB-VID-001] muestra la cita real y la vista previa local; solo consulta el backend de PEI", async () => {
    mockParams.doctorName = "Dra. Ana Real";
    await render(<JoinCall />);
    expect(await screen.findByText("Seguimiento de tratamiento")).toBeTruthy();
    expect(screen.getByText("Dra. Ana Real")).toBeTruthy();
    expect(await screen.findByLabelText("vista previa stream-1")).toBeTruthy();
    expect(calls).toEqual([`GET ${BASE}`]);
  });

  it("[TC-MOB-VID-002] micrófono y cámara se controlan sobre la captura local; sin permiso se explica y se reintenta", async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error("denied"));
    await render(<JoinCall />);
    expect(await screen.findByText(MEDIA_ERROR_NOTICE)).toBeTruthy();
    await fireEvent.press(screen.getByText("Reintentar"));
    await screen.findByLabelText("vista previa stream-1");
    await fireEvent.press(screen.getByLabelText("Apagar micrófono"));
    expect(audioTrack.enabled).toBe(false);
    await fireEvent.press(screen.getByLabelText("Apagar cámara"));
    expect(screen.getByText("Cámara apagada")).toBeTruthy();
  });

  it("[TC-MOB-VID-003][RF-19] antes de T0 − 15 no se puede entrar; una cita no confirmada tampoco", async () => {
    reply(`GET ${BASE}`, ok(appointmentIn(60)));
    await render(<JoinCall />);
    expect(await screen.findByText(OPENS_AT_NOTICE)).toBeTruthy();
    expect(enterButton().props.accessibilityState).toEqual({ disabled: true });
    reply(`GET ${BASE}`, ok(appointmentIn(5, "canceled")));
    await render(<JoinCall />);
    expect(
      await screen.findByText(
        "Esta cita no está disponible para videoconsulta."
      )
    ).toBeTruthy();
    expect(mockGetUserMedia).not.toHaveBeenCalled();
  });
});

describe("joincall.tsx · sala de espera real", () => {
  it("[TC-MOB-VID-010] entrar llama a /session/enter y muestra la sala; el médico ocupado no cancela la cita", async () => {
    reply(
      `POST ${BASE}/session/enter`,
      ok(
        session({
          doctor: {
            busyWithAnotherConsultation: true,
            joinedAt: null,
            present: false,
          },
        })
      )
    );
    await render(<JoinCall />);
    await screen.findByLabelText("vista previa stream-1");
    await fireEvent.press(enterButton());
    expect(await screen.findByText("Sala de espera")).toBeTruthy();
    expect(screen.getByText(TEXT_0)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Salir de la sala" })
    ).toBeTruthy();
    expect(calls).toContain(`POST ${BASE}/session/enter`);
  });

  it("[TC-MOB-VID-011] un error del backend al entrar se muestra tal cual (p. ej., la sala todavía no abre)", async () => {
    reply(`POST ${BASE}/session/enter`, {
      body: {
        error: "SessionNotOpenError",
        message: "La sala de espera todavía no está abierta",
      },
      status: 409,
    });
    await render(<JoinCall />);
    await screen.findByLabelText("vista previa stream-1");
    await fireEvent.press(enterButton());
    expect(
      await screen.findByText("La sala de espera todavía no está abierta")
    ).toBeTruthy();
    expect(enterButton().props.accessibilityState).toEqual({ disabled: false });
  });

  it("[TC-MOB-VID-012][decisión 5] envía un latido cada 15 s; sin red avisa y, al volver, reconecta si el backend cerró la presencia", async () => {
    jest.useFakeTimers();
    reply(`POST ${BASE}/session/enter`, ok(session()));
    reply(
      `POST ${BASE}/session/presence`,
      { network: true },
      ok(session({ patient: { joinedAt: null, present: false } })),
      ok(session())
    );
    await render(<JoinCall />);
    await screen.findByLabelText("vista previa stream-1");
    await fireEvent.press(enterButton());
    await screen.findByText("Sala de espera");
    await act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(
      await screen.findByText("Se perdió la conexión. Reintentando…")
    ).toBeTruthy();
    await act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(
      calls.filter((c) => c === `POST ${BASE}/session/enter`)
    ).toHaveLength(2); // reconexión
    expect(
      screen.queryByText("Se perdió la conexión. Reintentando…")
    ).toBeNull();
    expect(
      calls.filter((c) => c === `POST ${BASE}/session/presence`)
    ).toHaveLength(2);
  });

  it("[TC-MOB-VID-013][RN-026] la salida voluntaria pide confirmación, llama a /session/leave, detiene los latidos y permite volver", async () => {
    jest.useFakeTimers();
    jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Salir")?.onPress?.();
    });
    reply(`POST ${BASE}/session/enter`, ok(session()));
    reply(
      `POST ${BASE}/session/leave`,
      ok(session({ patient: { joinedAt: null, present: false } }))
    );
    reply(`POST ${BASE}/session/presence`, ok(session()));
    await render(<JoinCall />);
    await screen.findByLabelText("vista previa stream-1");
    await fireEvent.press(enterButton());
    await screen.findByText("Sala de espera");
    await fireEvent.press(
      screen.getByRole("button", { name: "Salir de la sala" })
    );
    expect(
      await screen.findByText(
        "Saliste de la sala. Tu cita sigue confirmada; puedes volver a entrar."
      )
    ).toBeTruthy();
    await act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(calls).not.toContain(`POST ${BASE}/session/presence`);
    await fireEvent.press(
      screen.getByRole("button", { name: "Volver a la sala" })
    );
    expect(
      calls.filter((c) => c === `POST ${BASE}/session/enter`)
    ).toHaveLength(2);
  });

  it("[TC-MOB-VID-014][huecos A y B] pendingResolution se explica sin cerrar la cita", async () => {
    reply(
      `POST ${BASE}/session/enter`,
      ok(session({ pendingResolution: "late_patient_not_admitted" }))
    );
    await render(<JoinCall />);
    await screen.findByLabelText("vista previa stream-1");
    await fireEvent.press(enterButton());
    expect(await screen.findByText(PENDING_NOTICE)).toBeTruthy();
    expect(screen.getByText(TEXT_1)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Salir de la sala" })
    ).toBeTruthy();
  });

  it("[TC-MOB-VID-015][RF-21] si el backend registra una inasistencia, la sala lo informa y deja de enviar latidos", async () => {
    jest.useFakeTimers();
    reply(`POST ${BASE}/session/enter`, ok(session()));
    reply(
      `POST ${BASE}/session/presence`,
      ok(session({ appointmentStatus: "no_show_doctor", phase: "closed" }))
    );
    await render(<JoinCall />);
    await screen.findByLabelText("vista previa stream-1");
    await fireEvent.press(enterButton());
    await screen.findByText("Sala de espera");
    await act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(await screen.findByText(NO_SHOW_DOCTOR_NOTICE)).toBeTruthy();
    await act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(
      calls.filter((c) => c === `POST ${BASE}/session/presence`)
    ).toHaveLength(1);
  });
});

describe("joincall.tsx · credencial y llamada", () => {
  async function admitted() {
    jest.useFakeTimers();
    reply(`POST ${BASE}/session/enter`, ok(session()));
    reply(
      `POST ${BASE}/session/presence`,
      ok(
        session({
          doctor: {
            busyWithAnotherConsultation: false,
            joinedAt: "",
            present: true,
          },
          phase: "active",
          startedAt: new Date().toISOString(),
        })
      )
    );
    await render(<JoinCall />);
    await screen.findByLabelText("vista previa stream-1");
    await fireEvent.press(enterButton());
    await screen.findByText("Sala de espera");
    await act(() => {
      jest.advanceTimersByTime(15_000);
    });
  }

  it("[TC-MOB-VID-020] tras la admisión pide la credencial; el 422 del backend se muestra tal cual y no abre ninguna llamada", async () => {
    reply(`POST ${BASE}/session/token`, {
      body: {
        error: "VideoProviderUnavailableError",
        message: "La videollamada no está disponible en este momento",
      },
      status: 422,
    });
    await admitted();
    expect(await screen.findByText(TOKEN_422_NOTICE)).toBeTruthy();
    expect(mockCallTokens).toEqual([]);
    expect(mockRelease).toHaveBeenCalled(); // la vista previa se libera al iniciar la consulta
    reply(`POST ${BASE}/session/token`, {
      body: { message: "La videollamada no está disponible en este momento" },
      status: 422,
    });
    await fireEvent.press(screen.getByText("Reintentar"));
    expect(
      calls.filter((c) => c === `POST ${BASE}/session/token`)
    ).toHaveLength(2);
  });

  it("[TC-MOB-VID-021] con una credencial real de RealtimeKit monta la llamada con ese token", async () => {
    reply(
      `POST ${BASE}/session/token`,
      ok({ authToken: "rtk-token-real", provider: "realtimekit" })
    );
    await admitted();
    expect(
      await screen.findByText("llamada con credencial rtk-token-real")
    ).toBeTruthy();
    expect(mockCallTokens).toContain("rtk-token-real");
  });

  it("[TC-MOB-VID-022] un proveedor que esta versión no conoce no abre ninguna llamada", async () => {
    reply(
      `POST ${BASE}/session/token`,
      ok({ authToken: "x", provider: "otro" })
    );
    await admitted();
    expect(
      await screen.findByText(
        "Esta versión de la app no admite el proveedor de video «otro»."
      )
    ).toBeTruthy();
    expect(mockCallTokens).toEqual([]);
  });
});

describe("joincall.tsx · fin de la consulta (prueba real del 2026-11-25)", () => {
  const activeSession = () =>
    session({
      doctor: {
        busyWithAnotherConsultation: false,
        joinedAt: "",
        present: true,
      },
      phase: "active",
      startedAt: new Date().toISOString(),
    });
  const endedSession = () =>
    session({
      appointmentStatus: "completed",
      doctor: {
        busyWithAnotherConsultation: false,
        joinedAt: "",
        present: false,
      },
      durationSeconds: 120,
      endedAt: new Date().toISOString(),
      patient: { joinedAt: "", present: false },
      phase: "ended",
      startedAt: new Date().toISOString(),
    });

  async function inCall() {
    jest.useFakeTimers();
    reply(`POST ${BASE}/session/enter`, ok(session()));
    reply(`POST ${BASE}/session/presence`, ok(activeSession()));
    reply(
      `POST ${BASE}/session/token`,
      ok({ authToken: "rtk-token-real", provider: "realtimekit" })
    );
    await render(<JoinCall />);
    await screen.findByLabelText("vista previa stream-1");
    await fireEvent.press(enterButton());
    await screen.findByText("Sala de espera");
    await act(() => {
      jest.advanceTimersByTime(15_000);
    });
    await screen.findByText("llamada con credencial rtk-token-real");
  }

  const expectNoReentry = () => {
    expect(
      screen.queryByText("llamada con credencial rtk-token-real")
    ).toBeNull();
    expect(screen.queryByText("Volver a la videollamada")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Volver a la sala" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Salir de la sala" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Entrar a la sala de espera" })
    ).toBeNull();
  };

  it("[TC-MOB-VID-030] el médico finaliza: con el siguiente latido el paciente sale de la llamada y no puede volver", async () => {
    await inCall();
    reply(`POST ${BASE}/session/presence`, ok(endedSession()));
    await act(() => {
      jest.advanceTimersByTime(15_000);
    });
    expect(await screen.findByText(ENDED_NOTICE)).toBeTruthy();
    expectNoReentry();
    // Ya no se envían latidos ni se registra una salida voluntaria.
    const beats = calls.filter(
      (c) => c === `POST ${BASE}/session/presence`
    ).length;
    await act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(
      calls.filter((c) => c === `POST ${BASE}/session/presence`)
    ).toHaveLength(beats);
    expect(calls).not.toContain(`POST ${BASE}/session/leave`);
  });

  it("[TC-MOB-VID-031] la expulsión del médico (kickAll) consulta la sala de inmediato y muestra la consulta terminada", async () => {
    await inCall();
    reply(`GET ${BASE}/session`, ok(endedSession()));
    await act(() => {
      mockCall.onLeft?.("kicked");
    });
    expect(await screen.findByText(ENDED_NOTICE)).toBeTruthy();
    expect(calls).toContain(`GET ${BASE}/session`);
    expectNoReentry();
  });

  it("[TC-MOB-VID-032] salir de la llamada con la consulta en curso no la finaliza: se puede volver a la videollamada", async () => {
    await inCall();
    reply(`GET ${BASE}/session`, ok(activeSession()));
    await act(() => {
      mockCall.onLeft?.("left");
    });
    expect(
      await screen.findByText(
        "Saliste de la videollamada. La consulta sigue en curso."
      )
    ).toBeTruthy();
    expect(calls).not.toContain(`POST ${BASE}/session/leave`);
    await fireEvent.press(screen.getByText("Volver a la videollamada"));
    expect(
      await screen.findByText("llamada con credencial rtk-token-real")
    ).toBeTruthy();
  });
});
