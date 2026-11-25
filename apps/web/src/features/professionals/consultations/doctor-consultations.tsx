"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  type DoctorAppointmentItem,
  type DoctorSessionSummary,
  getDoctorStatus,
  listDoctorAppointments,
  listDoctorSessions,
} from "@/lib/api";
import {
  consultationPath,
  PROFESSIONAL_ACCESS_PATH,
  PROFESSIONAL_PORTAL_PATH,
} from "../paths";
import { formatDateTime, sessionErrorMessage } from "./session-text";

// Consultas del médico: sus citas confirmadas de hoy y mañana, junto con las salas abiertas (en espera o en curso).
// Leer no es una operación protegida (RN-140): el médico sin habilitación también ve la lista.

const DAY_MS = 86_400_000;
export const LIST_POLL_MS = 10_000;

interface Row {
  appointmentId: string;
  scheduledAt: string;
  reason: string | null;
  session: DoctorSessionSummary | null;
}

export function mergeConsultations(
  appointments: DoctorAppointmentItem[],
  sessions: DoctorSessionSummary[],
): Row[] {
  const byId = new Map<string, Row>();
  for (const a of appointments) {
    if (a.status !== "confirmed") continue;
    byId.set(a.id, {
      appointmentId: a.id,
      scheduledAt: a.scheduledAt,
      reason: a.reason,
      session: null,
    });
  }
  // Una sala abierta aparece siempre, aunque su cita quede fuera del rango (por ejemplo, una consulta larga).
  for (const s of sessions) {
    const row = byId.get(s.appointmentId);
    byId.set(s.appointmentId, {
      appointmentId: s.appointmentId,
      scheduledAt: s.scheduledAt,
      reason: row?.reason ?? null,
      session: s,
    });
  }
  return [...byId.values()].sort((a, b) => {
    if (!!a.session !== !!b.session) return a.session ? -1 : 1;
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
}

function stateOf(row: Row): string {
  if (!row.session) return "Sala aún sin abrir";
  if (row.session.phase === "active") return "Consulta en curso";
  return row.session.patientPresent
    ? "Paciente en la sala de espera"
    : "Sala abierta, paciente no conectado";
}

export function DoctorConsultationsPage({
  now = () => new Date(),
  pollMs = LIST_POLL_MS,
}: {
  now?: () => Date;
  pollMs?: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [canOperate, setCanOperate] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const t = now();
      const [appointments, sessions] = await Promise.all([
        listDoctorAppointments(
          new Date(t.getTime() - DAY_MS / 4),
          new Date(t.getTime() + DAY_MS * 2),
        ),
        listDoctorSessions(),
      ]);
      setRows(mergeConsultations(appointments, sessions));
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace(PROFESSIONAL_ACCESS_PATH);
        return;
      }
      setError(
        e instanceof ApiError && e.status === 403
          ? "Las consultas están disponibles solo para cuentas de médico con perfil registrado."
          : sessionErrorMessage(e),
      );
    }
  }, [now, router]);

  useEffect(() => {
    load();
    getDoctorStatus()
      .then((s) => setCanOperate(s.canOperate))
      .catch(() => setCanOperate(null));
    const id = setInterval(load, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs]);

  return (
    <div className="min-h-screen bg-[#F7F7FB]">
      <header className="bg-[#2F2A6B] text-white">
        <div className="max-w-[960px] mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <h1 className="text-[15px] sm:text-[17px] font-medium">
            Mis consultas
          </h1>
          <a
            href={PROFESSIONAL_PORTAL_PATH}
            className="text-[14px] hover:underline"
          >
            Volver al portal
          </a>
        </div>
      </header>
      <main className="max-w-[960px] mx-auto px-4 sm:px-8 py-8 flex flex-col gap-5">
        <p className="text-[#535353] text-[14px]">
          Horarios en la hora del centro de México. La sala de espera abre 15
          minutos antes de cada cita.
        </p>
        {canOperate === false && (
          <p
            role="note"
            className="bg-[#FFF6E5] border border-[#F2C46D] rounded-lg p-4 text-[14px] text-[#6B4E00]"
          >
            Tu registro no está habilitado para atender consultas. Puedes ver
            tus citas y finalizar una consulta tuya que ya esté en curso.
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="text-[#E23A5C] text-[15px] flex gap-3 items-center"
          >
            {error}
            <button
              type="button"
              onClick={load}
              className="text-[#684DDE] hover:underline"
            >
              Reintentar
            </button>
          </div>
        )}
        {rows && rows.length === 0 && (
          <p className="text-[#717171]">
            No tienes consultas confirmadas para hoy ni mañana.
          </p>
        )}
        {rows && rows.length > 0 && (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li
                key={row.appointmentId}
                className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-black text-[16px] font-medium">
                    {formatDateTime(row.scheduledAt)}
                  </span>
                  {row.reason && (
                    <span className="text-[#535353] text-[14px]">
                      Motivo: {row.reason}
                    </span>
                  )}
                  <span className="text-[#684DDE] text-[14px]">
                    {stateOf(row)}
                  </span>
                </div>
                <a
                  href={consultationPath(row.appointmentId)}
                  className="h-[42px] px-5 bg-[#664BDB] rounded-lg text-white text-[15px] hover:bg-[#5a3fc4] transition flex items-center justify-center"
                >
                  {row.session?.phase === "active"
                    ? "Ir a la consulta"
                    : "Abrir sala"}
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
