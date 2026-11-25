"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  admitPatient,
  endConsultation,
  enterDoctorSession,
  getDoctorSession,
  leaveDoctorSession,
  type SessionState,
  sendDoctorPresence,
} from "@/lib/api";
import { sessionErrorMessage } from "./session-text";

// Estado de la sala del médico. La presencia lógica es de PEI: latido cada 15 s mientras el médico está en la sala
// (el backend la cierra tras 45 s sin latidos). Es independiente de la llamada de video.
export const HEARTBEAT_MS = 15_000;
export const POLL_MS = 5_000;

const OPEN_PHASES = new Set(["waiting", "active"]);
const PHASE_RANK: Record<SessionState["phase"], number> = {
  not_open: 0,
  waiting: 1,
  active: 2,
  ended: 3,
  closed: 3,
};

export interface DoctorSessionApi {
  session: SessionState | null;
  loadError: unknown;
  actionError: string;
  busy: boolean;
  // El médico está en la sala según PEI (entró y su presencia no se cerró).
  inRoom: boolean;
  // El último latido o la última lectura fallaron por la red; se reintenta solo.
  connectionLost: boolean;
  reload(): Promise<void>;
  enter(): Promise<void>;
  leave(): Promise<void>;
  admit(): Promise<void>;
  end(): Promise<SessionState | null>;
}

export function useDoctorSession(
  appointmentId: string,
  timing: { heartbeatMs?: number; pollMs?: number } = {},
): DoctorSessionApi {
  const heartbeatMs = timing.heartbeatMs ?? HEARTBEAT_MS;
  const pollMs = timing.pollMs ?? POLL_MS;
  const [session, setSession] = useState<SessionState | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  // Intención del médico de estar en la sala: activa el latido. Se apaga al salir o al terminar la consulta.
  const [wantsRoom, setWantsRoom] = useState(false);
  const reentering = useRef(false);

  const apply = useCallback((s: SessionState) => {
    // Un latido o una lectura en vuelo pueden responder después de admitir o de finalizar. La fase de la sala solo
    // avanza (cerrada → espera → en curso → terminada): nunca se aplica un estado más antiguo ni una fase anterior.
    setSession((current) => {
      if (!current) return s;
      if (s.serverTime < current.serverTime) return current;
      if (PHASE_RANK[s.phase] < PHASE_RANK[current.phase]) return current;
      return s;
    });
    setConnectionLost(false);
    // Si la sala ya no está abierta, deja de enviar latidos.
    if (!OPEN_PHASES.has(s.phase)) setWantsRoom(false);
  }, []);

  const onBackgroundError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 0) setConnectionLost(true);
  }, []);

  const reload = useCallback(async () => {
    try {
      const s = await getDoctorSession(appointmentId);
      setLoadError(null);
      apply(s);
      // Al recargar la página con el médico todavía presente, se retoma el latido (reconexión).
      if (s.doctor.present && OPEN_PHASES.has(s.phase)) setWantsRoom(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setConnectionLost(true);
      else setLoadError(e);
    }
  }, [appointmentId, apply]);

  useEffect(() => {
    reload();
    const id = setInterval(reload, pollMs);
    return () => clearInterval(id);
  }, [reload, pollMs]);

  // Latido. Si la presencia se cerró (por ejemplo, el equipo se suspendió más de 45 s), se vuelve a entrar: el latido
  // nunca reabre una presencia cerrada.
  useEffect(() => {
    if (!wantsRoom) return;
    const beat = async () => {
      try {
        const s = await sendDoctorPresence(appointmentId);
        apply(s);
        if (
          !s.doctor.present &&
          OPEN_PHASES.has(s.phase) &&
          !reentering.current
        ) {
          reentering.current = true;
          try {
            apply(await enterDoctorSession(appointmentId));
          } finally {
            reentering.current = false;
          }
        }
      } catch (e) {
        onBackgroundError(e);
      }
    };
    const id = setInterval(beat, heartbeatMs);
    return () => clearInterval(id);
  }, [wantsRoom, appointmentId, heartbeatMs, apply, onBackgroundError]);

  const run = useCallback(
    async (
      action: () => Promise<SessionState>,
      after?: (s: SessionState) => void,
    ) => {
      setActionError("");
      setBusy(true);
      try {
        const s = await action();
        apply(s);
        after?.(s);
        return s;
      } catch (e) {
        setActionError(sessionErrorMessage(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  return {
    session,
    loadError,
    actionError,
    busy,
    inRoom: wantsRoom && !!session?.doctor.present,
    connectionLost,
    reload,
    enter: async () => {
      await run(
        () => enterDoctorSession(appointmentId),
        () => setWantsRoom(true),
      );
    },
    leave: async () => {
      await run(
        () => leaveDoctorSession(appointmentId),
        () => setWantsRoom(false),
      );
    },
    admit: async () => {
      await run(() => admitPatient(appointmentId));
    },
    end: () =>
      run(
        () => endConsultation(appointmentId),
        () => setWantsRoom(false),
      ),
  };
}
