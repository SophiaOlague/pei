"use client";

import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ApiError, getDoctorStatus, type SessionState } from "@/lib/api";
import {
  PROFESSIONAL_ACCESS_PATH,
  PROFESSIONAL_CONSULTATIONS_PATH,
} from "../paths";
import { CallPanel } from "./call-panel";
import {
  type CallHandle,
  type CallTransport,
  type KickResult,
  realtimeKitTransport,
} from "./call-transport";
import {
  APPOINTMENT_STATUS_LABEL,
  formatDateTime,
  formatDuration,
  formatTime,
  PENDING_LABEL,
  PHASE_LABEL,
  sessionErrorMessage,
} from "./session-text";
import { useDoctorSession } from "./use-doctor-session";

// Sala de la videoconsulta del médico (RF-18 a RF-22). PEI decide la presencia, la admisión, la finalización y las
// inasistencias; RealtimeKit solo transporta audio y video desde la admisión.
// RN-140 y C-33: sin habilitación (canOperate) el médico no entra, no admite ni obtiene la credencial de la llamada;
// solo puede finalizar una consulta suya que ya está en curso. El backend lo vuelve a comprobar en cada operación.

const primaryCls =
  "h-[44px] px-5 bg-[#664BDB] rounded-lg text-white text-[15px] hover:bg-[#5a3fc4] transition disabled:opacity-50";
const secondaryCls =
  "h-[44px] px-5 border border-[#664BDB] rounded-lg text-[#664BDB] text-[15px] hover:bg-[#F1EEFF] transition disabled:opacity-50";
const dangerCls =
  "h-[44px] px-5 bg-[#E23A5C] rounded-lg text-white text-[15px] hover:opacity-90 transition disabled:opacity-50";

const KICK_TEXT: Record<KickResult["outcome"], string> = {
  verified: "Se desconectó a todos los participantes de la videollamada.",
  not_verified:
    "Se pidió desconectar al paciente, pero no se pudo confirmar. Su acceso a la llamada quedó revocado al finalizar.",
  not_permitted:
    "Tu perfil de la videollamada no permite desconectar participantes. Su acceso quedó revocado al finalizar.",
  failed:
    "No se pudo desconectar al paciente de la videollamada. Su acceso quedó revocado al finalizar.",
};

function Note({
  tone,
  children,
}: {
  tone: "info" | "warn";
  children: ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "bg-[#FFF6E5] border-[#F2C46D] text-[#6B4E00]"
      : "bg-[#F1EEFF] border-[#C9BEF5] text-[#2F2A6B]";
  return (
    <p role="note" className={`border rounded-lg p-4 text-[14px] ${cls}`}>
      {children}
    </p>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-[14px]">
      <dt className="text-[#717171]">{label}</dt>
      <dd className="text-black text-right">{value}</dd>
    </div>
  );
}

function Details({ s }: { s: SessionState }) {
  return (
    <dl className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-2">
      <Row label="Hora de la cita" value={formatDateTime(s.scheduledAt)} />
      <Row label="Estado de la sala" value={PHASE_LABEL[s.phase]} />
      <Row
        label="Estado de la cita"
        value={
          APPOINTMENT_STATUS_LABEL[s.appointmentStatus] ?? s.appointmentStatus
        }
      />
      <Row
        label="Paciente"
        value={s.patient.present ? "Conectado" : "No conectado"}
      />
      {s.phase !== "ended" && s.phase !== "closed" && (
        <>
          <Row
            label="Tolerancia del paciente hasta"
            value={formatTime(s.deadlines.patientToleranceEndsAt)}
          />
          <Row
            label="Tu plazo para atender"
            value={formatTime(s.deadlines.doctorDeadlineAt)}
          />
          {s.deadlines.reconnectGraceEndsAt && (
            <Row
              label="El paciente puede reconectarse hasta"
              value={formatTime(s.deadlines.reconnectGraceEndsAt)}
            />
          )}
        </>
      )}
      {s.startedAt && (
        <Row label="Inicio de la consulta" value={formatTime(s.startedAt)} />
      )}
      {s.endedAt && (
        <Row label="Fin de la consulta" value={formatTime(s.endedAt)} />
      )}
      {s.durationSeconds !== null && (
        <Row label="Duración" value={formatDuration(s.durationSeconds)} />
      )}
    </dl>
  );
}

export function ConsultationRoom({
  appointmentId,
  transport = realtimeKitTransport,
  timing,
}: {
  appointmentId: string;
  transport?: CallTransport;
  timing?: { heartbeatMs?: number; pollMs?: number };
}) {
  const router = useRouter();
  const room = useDoctorSession(appointmentId, timing);
  const [canOperate, setCanOperate] = useState<boolean | null>(null);
  const [kick, setKick] = useState<KickResult | null>(null);
  const [ending, setEnding] = useState(false);
  const call = useRef<CallHandle | null>(null);
  const onHandle = useCallback((h: CallHandle | null) => {
    call.current = h;
  }, []);

  useEffect(() => {
    getDoctorStatus()
      .then((s) => setCanOperate(s.canOperate))
      .catch(() => setCanOperate(false));
  }, []);

  useEffect(() => {
    if (room.loadError instanceof ApiError && room.loadError.status === 401)
      router.replace(PROFESSIONAL_ACCESS_PATH);
  }, [room.loadError, router]);

  // Finalizar: primero se expulsa a todos de la llamada y se comprueba; después PEI finaliza la consulta (que también
  // revoca el acceso de los participantes en el proveedor) y por último el médico sale de la llamada.
  const finish = async () => {
    setEnding(true);
    setKick(null);
    try {
      const handle = call.current;
      if (handle) setKick(await handle.kickAllAndVerify());
      const ended = await room.end();
      if (ended && handle) {
        await handle.leave();
        call.current = null;
      }
    } finally {
      setEnding(false);
    }
  };

  const s = room.session;
  const header = (
    <header className="bg-[#2F2A6B] text-white">
      <div className="max-w-[960px] mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
        <h1 className="text-[15px] sm:text-[17px] font-medium">
          Videoconsulta
        </h1>
        <a
          href={PROFESSIONAL_CONSULTATIONS_PATH}
          className="text-[14px] hover:underline"
        >
          Volver a mis consultas
        </a>
      </div>
    </header>
  );

  if (!s)
    return (
      <div className="min-h-screen bg-[#F7F7FB]">
        {header}
        <main className="max-w-[960px] mx-auto px-4 sm:px-8 py-8">
          {room.loadError ? (
            <div
              role="alert"
              className="text-[#E23A5C] text-[15px] flex gap-3 items-center"
            >
              {room.loadError instanceof ApiError &&
              room.loadError.status === 404
                ? "No encontramos esta consulta entre tus citas."
                : sessionErrorMessage(room.loadError)}
              <button
                type="button"
                onClick={room.reload}
                className="text-[#684DDE] hover:underline"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <output className="block text-[#717171]">Cargando la sala…</output>
          )}
        </main>
      </div>
    );

  const operational = canOperate === true;
  const busy = room.busy || ending;

  return (
    <div className="min-h-screen bg-[#F7F7FB]">
      {header}
      <main className="max-w-[960px] mx-auto px-4 sm:px-8 py-8 flex flex-col gap-5">
        {canOperate === false &&
          s.phase !== "ended" &&
          s.phase !== "closed" && (
            <Note tone="warn">
              Tu registro no está habilitado para atender consultas: no puedes
              entrar a la sala, admitir pacientes ni unirte a la videollamada.{" "}
              {s.phase === "active" &&
                "Como esta consulta ya está en curso, sí puedes finalizarla."}
            </Note>
          )}
        {room.connectionLost && (
          <Note tone="warn">
            Se perdió la conexión con el servidor. Reintentando…
          </Note>
        )}
        {s.doctor.busyWithAnotherConsultation && s.phase === "waiting" && (
          <Note tone="warn">
            Tienes otra consulta en curso: finalízala antes de admitir a este
            paciente.
          </Note>
        )}
        {s.pendingResolution && (
          <Note tone="info">{PENDING_LABEL[s.pendingResolution]}</Note>
        )}
        {room.actionError && (
          <p role="alert" className="text-[#E23A5C] text-[15px]">
            {room.actionError}
          </p>
        )}
        {kick && (
          <output
            className={`block text-[14px] ${kick.outcome === "verified" ? "text-[#1E8E5A]" : "text-[#6B4E00]"}`}
          >
            {KICK_TEXT[kick.outcome]}
          </output>
        )}

        {s.phase === "active" && operational && room.inRoom && (
          <CallPanel
            appointmentId={appointmentId}
            transport={transport}
            onHandle={onHandle}
          />
        )}

        <Details s={s} />

        <div className="flex flex-wrap gap-3">
          {s.phase === "not_open" && (
            <Note tone="info">
              La sala de espera abre a las {formatTime(s.opensAt)}.
            </Note>
          )}
          {(s.phase === "waiting" || s.phase === "active") &&
            !room.inRoom &&
            operational && (
              <button
                type="button"
                className={primaryCls}
                disabled={busy}
                onClick={room.enter}
              >
                {s.phase === "active"
                  ? "Volver a la consulta"
                  : "Entrar a la sala"}
              </button>
            )}
          {s.phase === "waiting" && room.inRoom && (
            <>
              <button
                type="button"
                className={primaryCls}
                disabled={busy || !s.patient.present || !operational}
                onClick={room.admit}
              >
                Admitir al paciente
              </button>
              <button
                type="button"
                className={secondaryCls}
                disabled={busy}
                onClick={room.leave}
              >
                Salir de la sala
              </button>
            </>
          )}
          {s.phase === "waiting" && room.inRoom && !s.patient.present && (
            <p className="text-[#717171] text-[14px] self-center">
              El paciente todavía no está en la sala de espera.
            </p>
          )}
          {s.phase === "active" && (
            <button
              type="button"
              className={dangerCls}
              disabled={busy}
              onClick={finish}
            >
              {ending ? "Finalizando…" : "Finalizar consulta"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
