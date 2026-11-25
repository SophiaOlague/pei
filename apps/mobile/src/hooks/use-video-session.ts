import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  enterVideoSession,
  getVideoCallToken,
  getVideoSession,
  leaveVideoSession,
  sendVideoPresence,
  VIDEO_HEARTBEAT_MS,
  type VideoCallToken,
  type VideoSessionState,
} from "@/lib/api";

// Sala de espera de una cita (backend modules/video). Todo el estado de la sala lo decide el backend: este hook solo
// entra, envía latidos, sale y pide la credencial. No simula ninguna conexión.
// - Latido cada 15 s mientras la sala está en espera o en consulta.
// - Si un latido no llega (sin red), la sala se marca como «conexión perdida» y se sigue intentando.
// - Si el backend ya cerró la presencia (pasaron más de 45 s sin latido), se vuelve a entrar (reconexión): la
//   desconexión involuntaria no es abandono mientras dure la gracia de reconexión.
// - La salida voluntaria detiene los latidos; volver a entrar es una acción del paciente.
// - La fuente de verdad de si la consulta sigue o terminó es la fase que informa el backend (meeting.status), nunca la
//   llamada de video: si la llamada se corta, se consulta la sala (refresh).

export type RoomState =
  | { kind: "outside" }
  | { kind: "entering" }
  | { kind: "inside"; session: VideoSessionState; connection: "ok" | "lost" }
  | { kind: "left"; session: VideoSessionState }
  | { kind: "error"; message: string };

export type CallTokenState =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "ready"; token: VideoCallToken }
  // El backend no puede emitir la credencial (p. ej., 422: proveedor de video sin configurar). Se muestra tal cual.
  | { kind: "unavailable"; status: number; message: string };

const messageOf = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;
const isLive = (s: VideoSessionState) =>
  s.phase === "waiting" || s.phase === "active";

// Un latido: renueva la presencia o, si el backend ya la cerró, vuelve a entrar. Sin red, marca la conexión como
// perdida (el siguiente latido reintenta). Ante otro error (p. ej., la cita ya tiene resultado) lee el estado real.
async function heartbeat(
  appointmentId: string,
  apply: (next: RoomState | ((current: RoomState) => RoomState)) => void
): Promise<void> {
  try {
    let session = await sendVideoPresence(appointmentId);
    if (!session.patient.present && isLive(session)) {
      session = await enterVideoSession(appointmentId);
    }
    apply({ connection: "ok", kind: "inside", session });
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      apply((current) =>
        current.kind === "inside" ? { ...current, connection: "lost" } : current
      );
      return;
    }
    try {
      apply({
        connection: "ok",
        kind: "inside",
        session: await getVideoSession(appointmentId),
      });
    } catch (refreshError) {
      apply({
        kind: "error",
        message: messageOf(refreshError, "No se pudo consultar la sala."),
      });
    }
  }
}

export function useVideoSession(appointmentId: string | undefined) {
  const [room, setRoom] = useState<RoomState>({ kind: "outside" });
  const [token, setToken] = useState<CallTokenState>({ kind: "none" });
  const busy = useRef(false);

  const enter = useCallback(async () => {
    if (!appointmentId || busy.current) {
      return;
    }
    busy.current = true;
    setRoom({ kind: "entering" });
    try {
      const session = await enterVideoSession(appointmentId);
      setRoom({ connection: "ok", kind: "inside", session });
    } catch (error) {
      setRoom({
        kind: "error",
        message: messageOf(error, "No se pudo entrar a la sala."),
      });
    } finally {
      busy.current = false;
    }
  }, [appointmentId]);

  // Lee el estado real de la sala (p. ej., cuando se corta la llamada: el médico pudo haber finalizado la consulta).
  // Conserva si el paciente está dentro o salió; solo cambia lo que informa el backend.
  const refresh = useCallback(async () => {
    if (!appointmentId) {
      return;
    }
    try {
      const session = await getVideoSession(appointmentId);
      setRoom((current) =>
        current.kind === "left"
          ? { kind: "left", session }
          : { connection: "ok", kind: "inside", session }
      );
      if (!isLive(session)) {
        setToken({ kind: "none" });
      }
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 0)) {
        setRoom({
          kind: "error",
          message: messageOf(error, "No se pudo consultar la sala."),
        });
      }
    }
  }, [appointmentId]);

  // Salida voluntaria: solo con la sala abierta. Una consulta ya finalizada no se «abandona» (no genera eventos).
  const leave = useCallback(async () => {
    if (!appointmentId || room.kind !== "inside" || !isLive(room.session)) {
      return;
    }
    try {
      const session = await leaveVideoSession(appointmentId);
      setRoom({ kind: "left", session });
      setToken({ kind: "none" });
    } catch (error) {
      setRoom({
        kind: "error",
        message: messageOf(error, "No se pudo salir de la sala."),
      });
    }
  }, [appointmentId, room]);

  const inside = room.kind === "inside" && isLive(room.session);

  // Latidos y reconexión.
  useEffect(() => {
    if (!(appointmentId && inside)) {
      return;
    }
    let cancelled = false;
    const apply = (next: RoomState | ((current: RoomState) => RoomState)) => {
      if (!cancelled) {
        setRoom(next);
      }
    };
    const beat = () => heartbeat(appointmentId, apply);
    const timer = setInterval(beat, VIDEO_HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [appointmentId, inside]);

  const phase = room.kind === "inside" ? room.session.phase : null;

  const requestToken = useCallback(async () => {
    if (!appointmentId) {
      return;
    }
    setToken({ kind: "loading" });
    try {
      setToken({
        kind: "ready",
        token: await getVideoCallToken(appointmentId),
      });
    } catch (error) {
      setToken({
        kind: "unavailable",
        message: messageOf(error, "No se pudo preparar la videollamada."),
        status: error instanceof ApiError ? error.status : 0,
      });
    }
  }, [appointmentId]);

  // Con la consulta iniciada (admisión del médico), se pide la credencial una vez.
  useEffect(() => {
    if (phase === "active" && token.kind === "none") {
      requestToken();
    }
  }, [phase, token.kind, requestToken]);

  return { enter, leave, refresh, requestToken, room, token };
}
