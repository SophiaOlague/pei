import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "@/lib/api";
import { mockFetch } from "@/test/http";
import {
  type CallHandle,
  type CallTransport,
  wrapMeeting,
} from "./call-transport";
import { ConsultationRoom } from "./consultation-room";
import {
  DoctorConsultationsPage,
  mergeConsultations,
} from "./doctor-consultations";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

const ID = "33333333-3333-4333-8333-333333333333";
const BASE = `/me/doctor/appointments/${ID}/session`;
// Credencial individual simulada del participante; nunca es el token de la API de Cloudflare.
const PARTICIPANT_TOKEN = "participant-token-simulado";

function state(over: Partial<SessionState> = {}): SessionState {
  return {
    appointmentId: ID,
    appointmentStatus: "confirmed",
    phase: "waiting",
    serverTime: "2026-11-24T16:00:00.000Z",
    scheduledAt: "2026-11-24T16:00:00.000Z",
    opensAt: "2026-11-24T15:45:00.000Z",
    patient: { present: true, joinedAt: "2026-11-24T15:50:00.000Z" },
    doctor: {
      present: false,
      joinedAt: null,
      busyWithAnotherConsultation: false,
    },
    deadlines: {
      patientToleranceEndsAt: "2026-11-24T16:15:00.000Z",
      doctorDeadlineAt: "2026-11-24T16:30:00.000Z",
      reconnectGraceEndsAt: null,
    },
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    pendingResolution: null,
    ...over,
  };
}
const ok = (body: unknown) => ({ status: 200, body });
const doctorIn = {
  present: true,
  joinedAt: "2026-11-24T15:55:00.000Z",
  busyWithAnotherConsultation: false,
};
const active = (over: Partial<SessionState> = {}) =>
  state({
    phase: "active",
    doctor: doctorIn,
    startedAt: "2026-11-24T16:01:00.000Z",
    ...over,
  });
const status = (canOperate: boolean) =>
  ok({ status: canOperate ? "approved" : "pending", canOperate, missing: [] });
const FAST = { heartbeatMs: 30, pollMs: 60_000 };

function fakeCall() {
  const order: string[] = [];
  let lost: (() => void) | null = null;
  const handle: CallHandle = {
    attachLocalVideo: () => () => undefined,
    remoteParticipants: () => [],
    onChange: () => () => undefined,
    onDisconnected: (l) => {
      lost = l;
      return () => undefined;
    },
    audioEnabled: () => true,
    videoEnabled: () => true,
    setAudio: async () => undefined,
    setVideo: async () => undefined,
    kickAllAndVerify: vi.fn(async () => {
      order.push("kickAll");
      return { outcome: "verified" as const };
    }),
    leave: vi.fn(async () => {
      order.push("leave");
    }),
  };
  const transport: CallTransport = { join: vi.fn(async () => handle) };
  return { handle, transport, order, disconnect: () => act(() => lost?.()) };
}

beforeEach(() => replace.mockReset());
afterEach(() => vi.unstubAllGlobals());

describe("Videoconsulta web del médico · lista", () => {
  it("[TC-WEB-VID-001] combina citas confirmadas y salas abiertas; las salas abiertas van primero", () => {
    const rows = mergeConsultations(
      [
        {
          id: "a",
          status: "confirmed",
          scheduledAt: "2026-11-24T18:00:00.000Z",
          reason: "Control",
        },
        {
          id: "b",
          status: "cancelled",
          scheduledAt: "2026-11-24T17:00:00.000Z",
          reason: "x",
        },
        {
          id: "c",
          status: "confirmed",
          scheduledAt: "2026-11-24T16:00:00.000Z",
          reason: "Dolor",
        },
      ],
      [
        {
          appointmentId: "a",
          scheduledAt: "2026-11-24T18:00:00.000Z",
          phase: "waiting",
          patientPresent: true,
          startedAt: null,
        },
      ],
    );
    expect(rows.map((r) => r.appointmentId)).toEqual(["a", "c"]);
    expect(rows[0]).toMatchObject({
      reason: "Control",
      session: { patientPresent: true },
    });
  });

  it("[TC-WEB-VID-002] muestra las consultas y el aviso sin habilitación; leer no exige canOperate", async () => {
    mockFetch({
      "GET /me/doctor/appointments": ok({
        appointments: [
          {
            id: ID,
            status: "confirmed",
            scheduledAt: "2026-11-24T16:00:00.000Z",
            reason: "Control",
          },
        ],
      }),
      "GET /me/doctor/sessions": ok({
        sessions: [
          {
            appointmentId: ID,
            scheduledAt: "2026-11-24T16:00:00.000Z",
            phase: "active",
            patientPresent: true,
            startedAt: "2026-11-24T16:01:00.000Z",
          },
        ],
      }),
      "GET /me/doctor/status": status(false),
    });
    render(<DoctorConsultationsPage />);
    expect(await screen.findByText("Consulta en curso")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ir a la consulta" }),
    ).toHaveAttribute("href", `/profesionales/consultas/${ID}`);
    expect(await screen.findByRole("note")).toHaveTextContent(
      /no está habilitado/,
    );
  });

  it("[TC-WEB-VID-003] sin sesión vuelve al acceso profesional", async () => {
    mockFetch({
      "GET /me/doctor/appointments": { status: 401, body: {} },
      "GET /me/doctor/sessions": { status: 401, body: {} },
      "GET /me/doctor/status": { status: 401, body: {} },
    });
    render(<DoctorConsultationsPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/profesionales"));
  });
});

describe("Videoconsulta web del médico · sala", () => {
  it("[TC-WEB-VID-010] sala cerrada: muestra la hora de apertura y no ofrece entrar", async () => {
    mockFetch({
      [`GET ${BASE}`]: ok(
        state({
          phase: "not_open",
          patient: { present: false, joinedAt: null },
        }),
      ),
      "GET /me/doctor/status": status(true),
    });
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={fakeCall().transport}
        timing={FAST}
      />,
    );
    expect(
      await screen.findByText(/La sala de espera abre a las/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Entrar a la sala" }),
    ).not.toBeInTheDocument();
  });

  it("[TC-WEB-VID-011] entrar, latidos cada intervalo, admitir y salir", async () => {
    const { calls } = mockFetch({
      [`GET ${BASE}`]: ok(state()),
      "GET /me/doctor/status": status(true),
      [`POST ${BASE}/enter`]: ok(state({ doctor: doctorIn })),
      [`POST ${BASE}/presence`]: ok(state({ doctor: doctorIn })),
      [`POST ${BASE}/admit`]: ok(active()),
      [`POST ${BASE}/token`]: ok({
        provider: "realtimekit",
        authToken: PARTICIPANT_TOKEN,
      }),
    });
    const { transport } = fakeCall();
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={transport}
        timing={FAST}
      />,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Entrar a la sala" }),
    );
    await waitFor(() =>
      expect(
        calls.filter((c) => c.key === `POST ${BASE}/presence`).length,
      ).toBeGreaterThanOrEqual(2),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Admitir al paciente" }),
    );
    expect(
      await screen.findByRole("button", { name: "Finalizar consulta" }),
    ).toBeInTheDocument();
    // La credencial individual llega al SDK y no se muestra.
    await waitFor(() =>
      expect(transport.join).toHaveBeenCalledWith(PARTICIPANT_TOKEN),
    );
    expect(document.body.textContent).not.toContain(PARTICIPANT_TOKEN);
  });

  it("[TC-WEB-VID-012] admitir está deshabilitado mientras el paciente no está en la sala", async () => {
    mockFetch({
      [`GET ${BASE}`]: ok(
        state({
          patient: { present: false, joinedAt: null },
          doctor: doctorIn,
        }),
      ),
      "GET /me/doctor/status": status(true),
      [`POST ${BASE}/presence`]: ok(
        state({
          patient: { present: false, joinedAt: null },
          doctor: doctorIn,
        }),
      ),
    });
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={fakeCall().transport}
        timing={FAST}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Admitir al paciente" }),
    ).toBeDisabled();
    expect(
      screen.getByText("El paciente todavía no está en la sala de espera."),
    ).toBeInTheDocument();
  });

  it("[TC-WEB-VID-013] reconexión: si la presencia se cerró, vuelve a entrar; si falla la red, lo avisa", async () => {
    const { calls } = mockFetch({
      [`GET ${BASE}`]: ok(state({ doctor: doctorIn })),
      "GET /me/doctor/status": status(true),
      [`POST ${BASE}/presence`]: [
        ok(state({ doctor: { ...doctorIn, present: false } })),
        ok(state({ doctor: doctorIn })),
      ],
      [`POST ${BASE}/enter`]: ok(state({ doctor: doctorIn })),
    });
    // Un fallo de red real: fetch rechaza en el segundo latido.
    const real = globalThis.fetch;
    let beats = 0;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/presence") && ++beats === 2)
        return Promise.reject(new TypeError("offline"));
      return real(input, init);
    });
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={fakeCall().transport}
        timing={FAST}
      />,
    );
    await waitFor(() =>
      expect(calls.some((c) => c.key === `POST ${BASE}/enter`)).toBe(true),
    );
    await waitFor(() => expect(beats).toBeGreaterThanOrEqual(2));
    expect(
      await screen.findByText(/Se perdió la conexión con el servidor/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByText(/Se perdió la conexión con el servidor/),
      ).not.toBeInTheDocument(),
    );
  });

  it("[TC-WEB-VID-014] finalizar: expulsa a todos y lo verifica antes de finalizar, y después sale de la llamada", async () => {
    const order: string[] = [];
    mockFetch({
      [`GET ${BASE}`]: ok(active()),
      "GET /me/doctor/status": status(true),
      [`POST ${BASE}/presence`]: ok(active()),
      [`POST ${BASE}/token`]: ok({
        provider: "realtimekit",
        authToken: PARTICIPANT_TOKEN,
      }),
      [`POST ${BASE}/end`]: () => {
        order.push("end");
        return ok(
          active({
            phase: "ended",
            appointmentStatus: "completed",
            endedAt: "2026-11-24T16:31:00.000Z",
            durationSeconds: 1800,
          }),
        );
      },
    });
    const call = fakeCall();
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={call.transport}
        timing={FAST}
      />,
    );
    await waitFor(() => expect(call.transport.join).toHaveBeenCalled());
    await userEvent.click(
      await screen.findByRole("button", { name: "Finalizar consulta" }),
    );
    expect(
      await screen.findByText(
        "Se desconectó a todos los participantes de la videollamada.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("30 min 0 s")).toBeInTheDocument();
    expect([
      ...call.order.slice(0, 1),
      ...order,
      ...call.order.slice(1, 2),
    ]).toEqual(["kickAll", "end", "leave"]);
    expect(
      screen.queryByRole("button", { name: "Finalizar consulta" }),
    ).not.toBeInTheDocument();
    // Consulta finalizada: el médico ya no puede volver a entrar ni a la llamada.
    expect(
      screen.queryByRole("button", { name: "Entrar a la sala" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Volver a la consulta" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Videollamada" }),
    ).not.toBeInTheDocument();
  });

  it("[TC-WEB-VID-015] si la expulsión no se confirma, se finaliza igual y se informa", async () => {
    mockFetch({
      [`GET ${BASE}`]: ok(active()),
      "GET /me/doctor/status": status(true),
      [`POST ${BASE}/presence`]: ok(active()),
      [`POST ${BASE}/token`]: ok({
        provider: "realtimekit",
        authToken: PARTICIPANT_TOKEN,
      }),
      [`POST ${BASE}/end`]: ok(
        active({
          phase: "ended",
          appointmentStatus: "completed",
          durationSeconds: 60,
        }),
      ),
    });
    const call = fakeCall();
    vi.mocked(call.handle.kickAllAndVerify).mockResolvedValue({
      outcome: "not_verified",
      remaining: 1,
    });
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={call.transport}
        timing={FAST}
      />,
    );
    await waitFor(() => expect(call.transport.join).toHaveBeenCalled());
    await userEvent.click(
      await screen.findByRole("button", { name: "Finalizar consulta" }),
    );
    expect(await screen.findByText(/no se pudo confirmar/)).toBeInTheDocument();
    expect(await screen.findByText("Consulta finalizada")).toBeInTheDocument();
  });

  it("[TC-WEB-VID-016][C-33] sin canOperate: no pide credencial ni se une, pero puede finalizar la consulta en curso", async () => {
    const { calls } = mockFetch({
      [`GET ${BASE}`]: ok(active()),
      "GET /me/doctor/status": status(false),
      [`POST ${BASE}/presence`]: ok(active()),
      [`POST ${BASE}/end`]: ok(
        active({
          phase: "ended",
          appointmentStatus: "completed",
          durationSeconds: 120,
        }),
      ),
    });
    const call = fakeCall();
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={call.transport}
        timing={FAST}
      />,
    );
    expect(
      await screen.findByText(/sí puedes finalizarla/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Videollamada" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Volver a la consulta" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Finalizar consulta" }),
    );
    expect(await screen.findByText("Consulta finalizada")).toBeInTheDocument();
    expect(calls.some((c) => c.key === `POST ${BASE}/token`)).toBe(false);
    expect(call.transport.join).not.toHaveBeenCalled();
  });

  it("[TC-WEB-VID-017][RN-140] sin canOperate en la sala de espera no ofrece entrar; el rechazo del backend se explica", async () => {
    mockFetch({
      [`GET ${BASE}`]: ok(state({ doctor: doctorIn })),
      "GET /me/doctor/status": status(false),
      [`POST ${BASE}/presence`]: {
        status: 422,
        body: {
          statusCode: 422,
          message: "El médico no está aprobado para operar",
          error: "DoctorNotOperationalError",
        },
      },
    });
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={fakeCall().transport}
        timing={FAST}
      />,
    );
    expect(
      await screen.findByRole("button", { name: "Admitir al paciente" }),
    ).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Entrar a la sala" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      /no puedes entrar a la sala/,
    );
  });

  it("[TC-WEB-VID-018] proveedor no disponible: lo informa y la consulta se puede finalizar", async () => {
    mockFetch({
      [`GET ${BASE}`]: ok(active()),
      "GET /me/doctor/status": status(true),
      [`POST ${BASE}/presence`]: ok(active()),
      [`POST ${BASE}/token`]: {
        status: 422,
        body: {
          statusCode: 422,
          message: "La videollamada no está disponible en este momento",
          error: "VideoProviderUnavailableError",
        },
      },
    });
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={fakeCall().transport}
        timing={FAST}
      />,
    );
    expect(
      await screen.findByText(
        /La consulta sigue en curso y puedes finalizarla/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Finalizar consulta" }),
    ).toBeEnabled();
  });

  it("[TC-WEB-VID-019] corte del video: ofrece reconectar con una credencial nueva", async () => {
    const { calls } = mockFetch({
      [`GET ${BASE}`]: ok(active()),
      "GET /me/doctor/status": status(true),
      [`POST ${BASE}/presence`]: ok(active()),
      [`POST ${BASE}/token`]: ok({
        provider: "realtimekit",
        authToken: PARTICIPANT_TOKEN,
      }),
    });
    const call = fakeCall();
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={call.transport}
        timing={FAST}
      />,
    );
    await waitFor(() => expect(call.transport.join).toHaveBeenCalledTimes(1));
    call.disconnect();
    await userEvent.click(
      await screen.findByRole("button", { name: "Reconectar video" }),
    );
    await waitFor(() => expect(call.transport.join).toHaveBeenCalledTimes(2));
    expect(calls.filter((c) => c.key === `POST ${BASE}/token`)).toHaveLength(2);
  });

  it("[TC-WEB-VID-020] casos pendientes, médico ocupado y plazos se muestran tal como los informa el backend", async () => {
    mockFetch({
      [`GET ${BASE}`]: ok(
        state({
          pendingResolution: "late_patient_not_admitted",
          doctor: {
            present: false,
            joinedAt: null,
            busyWithAnotherConsultation: true,
          },
          deadlines: {
            patientToleranceEndsAt: "2026-11-24T16:15:00.000Z",
            doctorDeadlineAt: "2026-11-24T16:30:00.000Z",
            reconnectGraceEndsAt: "2026-11-24T16:05:00.000Z",
          },
        }),
      ),
      "GET /me/doctor/status": status(true),
    });
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={fakeCall().transport}
        timing={FAST}
      />,
    );
    expect(
      await screen.findByText(/Todavía puedes admitirlo/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tienes otra consulta en curso/),
    ).toBeInTheDocument();
    expect(screen.getByText("Tu plazo para atender")).toBeInTheDocument();
    expect(
      screen.getByText("El paciente puede reconectarse hasta"),
    ).toBeInTheDocument();
  });

  it("[TC-WEB-VID-021] ninguna petición lleva credenciales de la API: solo la cookie de sesión", async () => {
    const { fetchMock } = mockFetch({
      [`GET ${BASE}`]: ok(active()),
      "GET /me/doctor/status": status(true),
      [`POST ${BASE}/presence`]: ok(active()),
      [`POST ${BASE}/token`]: ok({
        provider: "realtimekit",
        authToken: PARTICIPANT_TOKEN,
      }),
    });
    const call = fakeCall();
    render(
      <ConsultationRoom
        appointmentId={ID}
        transport={call.transport}
        timing={FAST}
      />,
    );
    await waitFor(() => expect(call.transport.join).toHaveBeenCalled());
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toMatch(/cloudflare/);
      expect(JSON.stringify(init?.headers ?? {})).not.toMatch(/authorization/i);
      expect(init?.credentials).toBe("include");
    }
  });
});

describe("Transporte RealtimeKit · expulsión verificada", () => {
  function meeting(
    opts: {
      canKick?: boolean;
      kickFails?: boolean;
      staysConnected?: boolean;
    } = {},
  ) {
    const joined = new Map([
      [
        "p1",
        {
          id: "p1",
          videoEnabled: true,
          audioEnabled: true,
          registerVideoElement: vi.fn(),
          deregisterVideoElement: vi.fn(),
        },
      ],
    ]);
    const emitter = { on: vi.fn(), off: vi.fn() };
    const m = {
      join: vi.fn(),
      leave: vi.fn(async () => undefined),
      self: {
        ...emitter,
        videoEnabled: true,
        audioEnabled: true,
        permissions: { kickParticipant: opts.canKick ?? true },
        registerVideoElement: vi.fn(),
        deregisterVideoElement: vi.fn(),
        enableAudio: vi.fn(),
        disableAudio: vi.fn(),
        enableVideo: vi.fn(),
        disableVideo: vi.fn(),
      },
      participants: {
        ...emitter,
        joined: Object.assign(joined, { on: vi.fn(), off: vi.fn() }),
        kickAll: vi.fn(async () => {
          if (opts.kickFails) throw new Error("x");
          if (!opts.staysConnected) setTimeout(() => joined.clear(), 50);
        }),
      },
    };
    return m;
  }

  it("[TC-WEB-VID-030] verified, not_verified, not_permitted y failed", async () => {
    expect(
      await wrapMeeting(meeting() as never).kickAllAndVerify(1000),
    ).toEqual({ outcome: "verified" });
    expect(
      await wrapMeeting(
        meeting({ staysConnected: true }) as never,
      ).kickAllAndVerify(300),
    ).toEqual({ outcome: "not_verified", remaining: 1 });
    const noPerm = meeting({ canKick: false });
    expect(await wrapMeeting(noPerm as never).kickAllAndVerify()).toEqual({
      outcome: "not_permitted",
    });
    expect(noPerm.participants.kickAll).not.toHaveBeenCalled();
    expect(
      await wrapMeeting(
        meeting({ kickFails: true }) as never,
      ).kickAllAndVerify(),
    ).toEqual({ outcome: "failed" });
  });
});
