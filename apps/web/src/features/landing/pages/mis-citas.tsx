"use client";

import { CalendarX, Clock, Video } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { PatientNav } from "@/features/components/patient-nav";

type Cita = {
  id: number;
  doctor: string;
  fecha: string;
  hora: string;
  tipo: string;
  estado?: string;
};

const INICIAL: { proximas: Cita[]; pasadas: Cita[] } = {
  proximas: [
    {
      id: 1,
      doctor: "Dr Jose Mart",
      fecha: "12 de octubre 2026",
      hora: "10:00 AM",
      tipo: "Consulta de seguimiento",
    },
    {
      id: 2,
      doctor: "Dr Laura Martinez",
      fecha: "3 de noviembre 2026",
      hora: "4:30 PM",
      tipo: "Consulta de emergencia",
    },
  ],
  pasadas: [
    {
      id: 3,
      doctor: "Dr David Mercado",
      fecha: "20 de agosto 2026",
      hora: "9:00 AM",
      tipo: "Primera consulta",
      estado: "Completada",
    },
    {
      id: 4,
      doctor: "Dr Sofia Marquez",
      fecha: "5 de julio 2026",
      hora: "1:00 PM",
      tipo: "Consulta de emergencia",
      estado: "Cancelada",
    },
  ],
};

export function Landing() {
  const [tab, setTab] = useState<"proximas" | "pasadas">("proximas");
  const [citas, setCitas] = useState(INICIAL);
  const [aCancelar, setACancelar] = useState<Cita | null>(null);

  const cancelar = () => {
    if (!aCancelar) return;
    setCitas((c) => ({
      proximas: c.proximas.filter((x) => x.id !== aCancelar.id),
      pasadas: [{ ...aCancelar, estado: "Cancelada" }, ...c.pasadas],
    }));
    setACancelar(null);
  };

  const lista = citas[tab];

  return (
    <div className="min-h-screen bg-white">
      <PatientNav />
      <main className="px-4 sm:px-8 max-w-[1100px] mx-auto mt-6 sm:mt-10 pb-16">
        <h1 className="text-black text-[32px] sm:text-[44px] lg:text-[60px] font-medium leading-tight">
          Mis citas
        </h1>
        <p className="text-[#717171] text-[16px] sm:text-[20px] lg:text-[24px] mt-2">
          Revisa, reprograma o cancela tus consultas
        </p>

        <div role="tablist" className="flex gap-3 mt-8">
          {(["proximas", "pasadas"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-5 h-[44px] rounded-lg text-[16px] sm:text-[18px] transition ${tab === t ? "bg-[#7355F7] text-white" : "bg-[#E3DDFD] text-[#7355F7] hover:bg-[#d5ccfb]"}`}
            >
              {t === "proximas"
                ? `Próximas (${citas.proximas.length})`
                : "Pasadas"}
            </button>
          ))}
        </div>

        {lista.length === 0 ? (
          <div className="mt-12 bg-[#F5F5F5] rounded-2xl p-10 flex flex-col items-center text-center">
            <CalendarX className="w-14 h-14 text-[#7355F7]" />
            <p className="text-[#535353] text-[18px] sm:text-[20px] mt-4">
              No tienes citas {tab === "proximas" ? "próximas" : "pasadas"}.
            </p>
            {tab === "proximas" && (
              <Link
                href="/agendar-cita"
                className="mt-6 px-6 h-[46px] inline-flex items-center bg-[#7355F7] rounded-lg text-white text-[18px] hover:bg-[#6244d9] transition"
              >
                Agendar cita
              </Link>
            )}
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-5">
            {lista.map((c) => (
              <li
                key={c.id}
                className="bg-[#E3DDFD] rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center gap-5"
              >
                <Image
                  src="/doctor.jpg"
                  alt={c.doctor}
                  width={72}
                  height={72}
                  className="w-[72px] h-[72px] rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1">
                  <h3 className="text-[#7355F7] text-[20px] sm:text-[24px] font-medium">
                    {c.doctor}
                  </h3>
                  <p className="text-black text-[16px] sm:text-[18px]">
                    {c.tipo}
                  </p>
                  <p className="text-[#535353] text-[15px] sm:text-[17px] flex items-center gap-2 mt-1">
                    <Clock className="w-4 h-4" /> {c.fecha} · {c.hora}
                  </p>
                </div>
                {c.estado ? (
                  <span
                    className={`self-start md:self-center px-4 py-1 rounded-full text-[14px] ${c.estado === "Cancelada" ? "bg-[#fde3e8] text-[#E23A5C]" : "bg-white text-[#7355F7]"}`}
                  >
                    {c.estado}
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/sala-consulta"
                      className="h-[44px] px-4 inline-flex items-center gap-2 bg-[#7355F7] rounded-lg text-white text-[16px] hover:bg-[#6244d9] transition"
                    >
                      <Video className="w-4 h-4" /> Unirse
                    </Link>
                    <Link
                      href="/agendar-cita"
                      className="h-[44px] px-4 inline-flex items-center border-2 border-[#7355F7] rounded-lg text-[#7355F7] text-[16px] hover:bg-[#7355F7] hover:text-white transition"
                    >
                      Reprogramar
                    </Link>
                    <button
                      onClick={() => setACancelar(c)}
                      className="h-[44px] px-4 text-[#E23A5C] text-[16px] hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>

      {aCancelar && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
        >
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-[440px] w-full">
            <h2 className="text-black text-[22px] sm:text-[26px] font-medium">
              ¿Cancelar esta cita?
            </h2>
            <p className="text-[#535353] text-[16px] mt-3">
              {aCancelar.doctor} · {aCancelar.fecha}, {aCancelar.hora}
            </p>
            <div className="flex gap-3 mt-8 justify-end">
              <button
                onClick={() => setACancelar(null)}
                className="h-[44px] px-5 border-2 border-[#7355F7] rounded-lg text-[#7355F7] hover:bg-[#F5F2FF] transition"
              >
                Volver
              </button>
              <button
                onClick={cancelar}
                className="h-[44px] px-5 bg-[#E23A5C] rounded-lg text-white hover:opacity-90 transition"
              >
                Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
