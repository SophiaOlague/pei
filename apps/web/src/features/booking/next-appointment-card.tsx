"use client";

import { Calendar } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  listPatientAppointments,
  type PatientAppointmentDetail,
} from "@/lib/api";
import { nextConfirmed } from "./appointment-status";
import { BOOKING_PATH, MY_APPOINTMENTS_PATH } from "./paths";
import { formatAppointmentDate } from "./schedule";

// «Mi próxima cita» del inicio del paciente: la próxima consulta CONFIRMADA por M08 (GET /me/patient/appointments).
// Sin citas confirmadas, ofrece agendar. Si no se puede consultar, lo dice en lugar de mostrar una fecha.
type State =
  | { kind: "loading" }
  | { kind: "ready"; next: PatientAppointmentDetail | null }
  | { kind: "error" };

const buttonClass =
  "w-full h-[55px] inline-flex items-center justify-center bg-white rounded-[10px] text-[#7355F7] text-[20px] font-regular hover:opacity-90 transition-opacity cursor-pointer";

export function NextAppointmentCard() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    listPatientAppointments()
      .then((appointments) => {
        if (active)
          setState({ kind: "ready", next: nextConfirmed(appointments) });
      })
      .catch(() => {
        if (active) setState({ kind: "error" });
      });
    return () => {
      active = false;
    };
  }, []);

  const when =
    state.kind === "ready" && state.next
      ? formatAppointmentDate(state.next.scheduledAt)
      : null;

  return (
    <section
      aria-label="Mi próxima cita"
      className="w-full p-6 rounded-[12px] flex-1 bg-[#7355F7]"
    >
      <div className="flex items-center gap-3 mb-3">
        <Calendar
          className="w-6 h-6 text-white"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h3 className="text-white text-[20px] font-regular">Mi próxima cita</h3>
      </div>

      <div className="flex items-center gap-2 mb-4 min-h-[24px]">
        {state.kind === "loading" && (
          <span className="text-white/70 text-[16px]">Cargando…</span>
        )}
        {state.kind === "error" && (
          <span className="text-white/70 text-[16px]">
            No pudimos consultar tus citas.
          </span>
        )}
        {state.kind === "ready" && !when && (
          <span className="text-white/70 text-[16px]">
            No tienes citas confirmadas.
          </span>
        )}
        {when && (
          <>
            <span className="text-white/70 text-[16px]">{when.date}</span>
            <span className="w-1 h-1 bg-white/70 rounded-full" />
            <span className="text-white/70 text-[16px]">{when.time}</span>
          </>
        )}
      </div>

      {state.kind === "ready" && !state.next ? (
        <Link href={BOOKING_PATH} className={buttonClass}>
          Agendar cita
        </Link>
      ) : (
        <Link href={MY_APPOINTMENTS_PATH} className={buttonClass}>
          Ver mis citas
        </Link>
      )}
    </section>
  );
}
