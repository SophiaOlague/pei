"use client";

import { CalendarX, Clock, UserCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PatientNav } from "@/features/components/patient-nav";
import {
  ApiError,
  getBookableDoctors,
  listPatientAppointments,
  type PatientAppointmentDetail,
} from "@/lib/api";
import { splitAppointments, statusLabel } from "./appointment-status";
import { BOOKING_PATH, paymentPath } from "./paths";
import { formatAppointmentDate } from "./schedule";

// Citas del paciente (GET /me/patient/appointments), con el estado que informa M08. La lista no incluye el nombre
// del médico: se toma del catálogo de médicos reservables cuando está disponible (si el médico ya no es reservable,
// se muestra sin nombre). Una cita pendiente de pago con retención vigente ofrece continuar al pago (F4).
type State =
  | { kind: "loading" }
  | {
      kind: "ready";
      appointments: PatientAppointmentDetail[];
      names: Map<string, string>;
    }
  | { kind: "error"; message: string };

const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-white text-[#7355F7]",
  pending_payment: "bg-[#FFF4E0] text-[#8A5A00]",
  canceled: "bg-[#fde3e8] text-[#E23A5C]",
  expired: "bg-[#F1F1F4] text-[#535353]",
};

function holdActive(a: PatientAppointmentDetail, now: Date) {
  return (
    a.status === "pending_payment" &&
    !!a.holdExpiresAt &&
    new Date(a.holdExpiresAt).getTime() > now.getTime()
  );
}

export function MyAppointments() {
  const router = useRouter();
  const [tab, setTab] = useState<"proximas" | "pasadas">("proximas");
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const [appointments, doctors] = await Promise.all([
        listPatientAppointments(),
        // Solo para mostrar nombres: si falla, las citas se muestran igual.
        getBookableDoctors().catch(() => []),
      ]);
      setState({
        kind: "ready",
        appointments,
        names: new Map(doctors.map((d) => [d.doctorProfileId, d.displayName])),
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setState({
        kind: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "No se pudieron cargar tus citas.",
      });
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date();
  const groups =
    state.kind === "ready"
      ? splitAppointments(state.appointments, now)
      : { upcoming: [], past: [] };
  const lista = tab === "proximas" ? groups.upcoming : groups.past;

  return (
    <div className="min-h-screen bg-white">
      <PatientNav />
      <main className="px-4 sm:px-8 max-w-[1100px] mx-auto mt-6 sm:mt-10 pb-16">
        <h1 className="text-black text-[32px] sm:text-[44px] lg:text-[60px] font-medium leading-tight">
          Mis citas
        </h1>
        <p className="text-[#717171] text-[16px] sm:text-[20px] lg:text-[24px] mt-2">
          Revisa el estado de tus consultas
        </p>

        <div role="tablist" className="flex gap-3 mt-8">
          {(["proximas", "pasadas"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-5 h-[44px] rounded-lg text-[16px] sm:text-[18px] transition ${tab === t ? "bg-[#7355F7] text-white" : "bg-[#E3DDFD] text-[#7355F7] hover:bg-[#d5ccfb]"}`}
            >
              {t === "proximas"
                ? `Próximas (${groups.upcoming.length})`
                : "Anteriores"}
            </button>
          ))}
        </div>

        {state.kind === "loading" ? (
          <output className="block mt-8 text-[#717171] text-[16px]">
            Cargando tus citas…
          </output>
        ) : state.kind === "error" ? (
          <div className="mt-8 bg-[#F5F5F5] rounded-2xl p-6">
            <p role="alert" className="text-[#E23A5C] text-[16px]">
              {state.message}
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-4 h-[44px] px-5 border-2 border-[#7355F7] rounded-lg text-[#7355F7] hover:bg-[#F5F2FF] transition"
            >
              Reintentar
            </button>
          </div>
        ) : lista.length === 0 ? (
          <div className="mt-12 bg-[#F5F5F5] rounded-2xl p-10 flex flex-col items-center text-center">
            <CalendarX
              className="w-14 h-14 text-[#7355F7]"
              aria-hidden="true"
            />
            <p className="text-[#535353] text-[18px] sm:text-[20px] mt-4">
              No tienes citas {tab === "proximas" ? "próximas" : "anteriores"}.
            </p>
            {tab === "proximas" && (
              <Link
                href={BOOKING_PATH}
                className="mt-6 px-6 h-[46px] inline-flex items-center bg-[#7355F7] rounded-lg text-white text-[18px] hover:bg-[#6244d9] transition"
              >
                Agendar cita
              </Link>
            )}
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-5">
            {lista.map((a) => {
              const { date, time } = formatAppointmentDate(a.scheduledAt);
              const name = state.names.get(a.doctorProfileId);
              const payable = holdActive(a, now);
              return (
                <li
                  key={a.id}
                  className="bg-[#E3DDFD] rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center gap-5"
                >
                  <UserCircle
                    className="w-[72px] h-[72px] text-[#AB99FA] flex-shrink-0"
                    strokeWidth={1.25}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[#7355F7] text-[20px] sm:text-[24px] font-medium">
                      {name ?? "Consulta médica"}
                    </h2>
                    <p className="text-black text-[16px] sm:text-[18px] break-words">
                      {a.reason}
                    </p>
                    <p className="text-[#535353] text-[15px] sm:text-[17px] flex items-center gap-2 mt-1">
                      <Clock className="w-4 h-4" aria-hidden="true" /> {date} ·{" "}
                      {time}
                    </p>
                    {payable && a.holdExpiresAt && (
                      <p className="text-[#8A5A00] text-[14px] mt-1">
                        Horario apartado hasta las{" "}
                        {formatAppointmentDate(a.holdExpiresAt).time}.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-start md:items-end gap-3">
                    <span
                      className={`px-4 py-1 rounded-full text-[14px] ${STATUS_TONE[a.status] ?? "bg-white text-[#535353]"}`}
                    >
                      {statusLabel(a.status)}
                    </span>
                    {payable && (
                      <Link
                        href={paymentPath(a.id)}
                        className="h-[44px] px-4 inline-flex items-center bg-[#7355F7] rounded-lg text-white text-[16px] hover:bg-[#6244d9] transition"
                      >
                        Continuar al pago
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
