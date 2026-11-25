"use client";

import { Mic, MicOff, User, Video, VideoOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getDoctorCallCredential } from "@/lib/api";
import type {
  CallHandle,
  CallTransport,
  RemoteParticipant,
} from "./call-transport";

// Audio y video de la consulta en curso. Solo se monta después de la admisión, con el médico habilitado: la
// credencial individual se pide al backend y se entrega al SDK sin mostrarla ni guardarla fuera de este componente.

type CallStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "unavailable"
  | "failed";

function Tile({ participant }: { participant: RemoteParticipant }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    return participant.attachVideo(ref.current);
  }, [participant]);
  return (
    <div className="relative w-full h-full">
      {/* biome-ignore lint/a11y/useMediaCaption: videollamada en vivo, sin subtítulos disponibles */}
      <video
        ref={ref}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
        aria-label="Video del paciente"
      />
      {!participant.videoEnabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#2B2B33]">
          <User className="w-20 h-20 text-white/40" />
        </div>
      )}
      <span className="absolute left-4 bottom-4 bg-black/60 text-white px-3 py-1 rounded-lg text-[14px]">
        Paciente{participant.audioEnabled ? "" : " · micrófono apagado"}
      </span>
    </div>
  );
}

export function CallPanel({
  appointmentId,
  transport,
  onHandle,
}: {
  appointmentId: string;
  transport: CallTransport;
  // La sala recibe el control de la llamada para expulsar a todos antes de finalizar.
  onHandle: (handle: CallHandle | null) => void;
}) {
  const [status, setStatus] = useState<CallStatus>("connecting");
  const [handle, setHandle] = useState<CallHandle | null>(null);
  const [, setTick] = useState(0);
  const localRef = useRef<HTMLVideoElement>(null);
  const attempt = useRef(0);

  const connect = useCallback(async () => {
    const mine = ++attempt.current;
    setStatus("connecting");
    try {
      const credential = await getDoctorCallCredential(appointmentId);
      const joined = await transport.join(credential.authToken);
      if (mine !== attempt.current) {
        await joined.leave();
        return;
      }
      setHandle(joined);
      onHandle(joined);
      setStatus("connected");
    } catch (e) {
      if (mine !== attempt.current) return;
      setStatus(
        e instanceof ApiError && e.error === "VideoProviderUnavailableError"
          ? "unavailable"
          : "failed",
      );
    }
  }, [appointmentId, transport, onHandle]);

  useEffect(() => {
    connect();
    return () => {
      attempt.current++;
    };
  }, [connect]);

  useEffect(() => {
    if (!handle) return;
    const offChange = handle.onChange(() => setTick((t) => t + 1));
    const offLost = handle.onDisconnected(() => {
      setHandle(null);
      onHandle(null);
      setStatus("disconnected");
    });
    const offLocal = localRef.current
      ? handle.attachLocalVideo(localRef.current)
      : () => undefined;
    return () => {
      offChange();
      offLost();
      offLocal();
    };
  }, [handle, onHandle]);

  // Al desmontar (consulta finalizada o salida de la página) se abandona la llamada.
  useEffect(
    () => () => {
      handle?.leave();
    },
    [handle],
  );

  const remote = handle?.remoteParticipants() ?? [];
  const button = (
    on: boolean,
    label: string,
    Icon: typeof Mic,
    IconOff: typeof Mic,
    toggle: () => void,
  ) => (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${on ? "Desactivar" : "Activar"} ${label}`}
      aria-pressed={!on}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition ${on ? "bg-white/15 hover:bg-white/25 text-white" : "bg-[#E23A5C] text-white"}`}
    >
      {on ? <Icon /> : <IconOff />}
    </button>
  );

  return (
    <section
      aria-label="Videollamada"
      className="bg-[#1B1B22] rounded-2xl overflow-hidden flex flex-col"
    >
      <div className="relative aspect-video bg-black">
        {status === "connected" && remote[0] ? (
          <Tile participant={remote[0]} />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80 text-[15px] px-6 text-center">
            {status === "connecting" && (
              <output>Conectando la videollamada…</output>
            )}
            {status === "connected" && (
              <output>Esperando el video del paciente…</output>
            )}
            {status === "unavailable" && (
              <p role="alert">
                La videollamada no está disponible en este momento. La consulta
                sigue en curso y puedes finalizarla.
              </p>
            )}
            {(status === "failed" || status === "disconnected") && (
              <>
                <p role="alert">
                  {status === "disconnected"
                    ? "Se perdió la conexión de video. La consulta sigue en curso."
                    : "No se pudo conectar la videollamada."}
                </p>
                <button
                  type="button"
                  onClick={connect}
                  className="px-4 h-[40px] rounded-lg bg-[#664BDB] text-white"
                >
                  Reconectar video
                </button>
              </>
            )}
          </div>
        )}
        <div className="absolute right-4 bottom-4 w-[120px] sm:w-[180px] aspect-video bg-[#2B2B33] rounded-xl border border-white/20 overflow-hidden">
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            aria-label="Tu video"
          />
          <span className="absolute left-2 bottom-1 text-white text-[12px]">
            Tú
          </span>
        </div>
      </div>
      {handle && (
        <div className="flex justify-center gap-4 py-3 bg-[#12121A]">
          {button(handle.audioEnabled(), "micrófono", Mic, MicOff, () =>
            handle
              .setAudio(!handle.audioEnabled())
              .then(() => setTick((t) => t + 1)),
          )}
          {button(handle.videoEnabled(), "cámara", Video, VideoOff, () =>
            handle
              .setVideo(!handle.videoEnabled())
              .then(() => setTick((t) => t + 1)),
          )}
        </div>
      )}
    </section>
  );
}
