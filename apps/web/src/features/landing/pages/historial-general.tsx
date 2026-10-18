"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  Pill,
  Calendar as CalendarIcon,
  Footprints,
} from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function Landing() {
  const router = useRouter();

  const tabs = [
    { label: "General", path: null },
    { label: "Información médica", path: "/expediente" },
    { label: "Resultados de laboratorio", path: "/laboratorio" },
    { label: "Documentos", path: "/expediente-medico" },
    { label: "Historial", path: "/historial-medico" },
  ];

  const resumenMedico = [
    { icon: FlaskConical, label: "Estado de PrEP", value: "Activo" },
    { icon: Pill, label: "Medicación", value: "Descovy" },
    { icon: CalendarIcon, label: "Fecha inicial", value: "Mar 15-2026" },
    { icon: Footprints, label: "Refil", value: "Dic 10-2026" },
  ];

  const recordatorios = [
    { titulo: "Siguiente test VIH", fecha: "22 de Julio" },
    { titulo: "Chequeo general", fecha: "02 mayo" },
    { titulo: "Refil de medicación", fecha: "12 agosto" },
  ];

  return (
    <div className="min-h-screen bg-white pb-12 sm:pb-16">

      <nav className="flex items-center justify-between px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 border-b border-gray-200">
        <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex-shrink-0">
          <Image
            src="/logo.svg"
            alt="Logo"
            width={80}
            height={80}
            className="object-contain w-full h-full"
          />
        </div>

       

        <UserMenu />
      </nav>

      <div className="px-4 sm:px-6 md:px-8 max-w-[1350px] mx-auto mt-6 sm:mt-8 md:mt-10">
        <h1 className="text-black text-2xl sm:text-3xl md:text-4xl lg:text-[48px] font-medium leading-tight sm:leading-snug md:leading-[50px] lg:leading-[58px]">
          Mi historial médico
        </h1>
        <p className="text-[#535353] text-sm sm:text-base md:text-lg lg:text-[24px] font-light leading-snug sm:leading-normal md:leading-[30px] lg:leading-[32px] mt-1">
          tu información médica
        </p>

        <div className="mt-6 sm:mt-10 md:mt-[50px] lg:mt-[70px] flex items-center gap-4 sm:gap-6 md:gap-8 lg:gap-10 border-b border-gray-300 overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <span
              key={tab.label}
              onClick={() => {
                if (tab.path) {
                  router.push(tab.path);
                }
              }}
              className={`text-[#535353] text-xs sm:text-sm md:text-base lg:text-[18px] font-normal pb-3 sm:pb-4 cursor-pointer hover:text-[#7355F7] transition whitespace-nowrap ${
                tab.label === "General"
                  ? "border-b-2 border-[#7355F7]"
                  : ""
              }`}
            >
              {tab.label}
            </span>
          ))}
        </div>

        <div className="mt-6 sm:mt-8 md:mt-10 flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-10">

          <div className="w-full lg:flex-1 bg-[#7355F7] rounded-2xl p-5 sm:p-6 md:p-8 flex flex-col min-h-[280px] sm:min-h-[320px] md:min-h-[355px]">
            <div className="flex justify-between items-start gap-3 mb-6">
              <h2 className="text-white text-2xl sm:text-3xl md:text-4xl lg:text-[48px] font-light leading-tight sm:leading-snug md:leading-[48px] lg:leading-[58px]">
                Proxima cita
              </h2>
              <div className="text-right flex-shrink-0">
                <p className="text-white text-xs sm:text-sm md:text-base lg:text-[18px] font-normal">
                  20 de agosto
                </p>
                <p className="text-white text-xs sm:text-sm md:text-base lg:text-[18px] font-normal mt-1">
                  2:30pm
                </p>
              </div>
            </div>

            <p className="text-white text-xl sm:text-2xl md:text-3xl lg:text-[36px] font-normal leading-snug md:leading-[38px] lg:leading-[46px]">
              Dr. Oscar Wismichu
            </p>

            <div className="w-full sm:max-w-[360px] bg-white/20 rounded-xl mt-6 sm:mt-auto flex items-center gap-3 p-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 md:w-[55px] md:h-[55px] rounded-full overflow-hidden flex-shrink-0">
                <Image
                  src="/doctor.jpg"
                  alt="Doctor"
                  width={50}
                  height={50}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs sm:text-sm md:text-[15px] font-normal">
                  Pre-visita
                </p>
                <p className="text-white text-[10px] sm:text-[11px] md:text-[12px] font-light leading-snug">
                  Doctor con una formación completa y especializado en poder atender con paciencia
                </p>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[377px] lg:flex-shrink-0 bg-[#F8F8F8] rounded-2xl p-5 sm:p-6">
            <h3 className="text-black text-lg sm:text-xl md:text-2xl lg:text-[26px] font-medium">
              Resumen médico
            </h3>

            <div className="mt-5 sm:mt-6 flex flex-col gap-4 sm:gap-5">
              {resumenMedico.map((item, index) => {
                const Icono = item.icon;
                return (
                  <div key={index} className="flex items-center gap-3 sm:gap-4">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 md:w-[50px] md:h-[50px] rounded-full bg-[#D0C8F5] flex items-center justify-center flex-shrink-0">
                      <Icono className="w-5 h-5 sm:w-6 sm:h-6 md:w-[25px] md:h-[25px] text-[#7355F7]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-black text-sm sm:text-[15px] font-normal break-words">
                        {item.label}
                      </p>
                      <p className="text-black text-sm sm:text-[15px] font-normal break-words">
                        {item.value}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 sm:mt-8 md:mt-10 flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-10">

          <div className="w-full lg:flex-1 bg-[#F8F8F8] rounded-2xl p-5 sm:p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-black text-lg sm:text-xl md:text-2xl lg:text-[26px] font-medium">
                Resultados de laboratorio
              </h3>
              <Link
                href="/laboratorio"
                className="text-black text-sm sm:text-base font-medium border-b border-black pb-1 hover:text-[#7355F7] hover:border-[#7355F7] transition cursor-pointer whitespace-nowrap"
              >
                Ver más
              </Link>
            </div>

            <div className="hidden sm:block">
              <div className="mt-6 sm:mt-8 grid grid-cols-3 gap-3 md:gap-4 pb-4 border-b border-[#DFDFDF]">
                <span className="text-black text-sm md:text-base lg:text-[20px] font-medium">Documento</span>
                <span className="text-black text-sm md:text-base lg:text-[20px] font-medium">Tipo</span>
                <span className="text-black text-sm md:text-base lg:text-[20px] font-medium">Fecha</span>
              </div>

              <div className="grid grid-cols-3 gap-3 md:gap-4 py-5 md:py-6 border-b border-[#DFDFDF]">
                <span className="text-[#535353] text-sm md:text-base lg:text-[20px] font-normal break-words">Test de VIH</span>
                <span className="text-[#535353] text-sm md:text-base lg:text-[20px] font-normal break-words">Resultado de laboratorio</span>
                <span className="text-[#535353] text-sm md:text-base lg:text-[20px] font-normal break-words">Abril 23 2026</span>
              </div>

              <div className="grid grid-cols-3 gap-3 md:gap-4 py-5 md:py-6">
                <span className="text-[#535353] text-sm md:text-base lg:text-[20px] font-normal break-words">Hepatitis B</span>
                <span className="text-[#535353] text-sm md:text-base lg:text-[20px] font-normal break-words">Resultado de laboratorio</span>
                <span className="text-[#535353] text-sm md:text-base lg:text-[20px] font-normal break-words">Agosto 10 2026</span>
              </div>
            </div>

            <div className="sm:hidden mt-5 flex flex-col gap-4">
              <div className="border-b border-[#DFDFDF] pb-4">
                <p className="text-[#535353] text-sm font-medium">Test de VIH</p>
                <p className="text-[#717171] text-xs font-normal mt-1">Resultado de laboratorio</p>
                <p className="text-[#717171] text-[11px] font-normal mt-1">Abril 23 2026</p>
              </div>
              <div>
                <p className="text-[#535353] text-sm font-medium">Hepatitis B</p>
                <p className="text-[#717171] text-xs font-normal mt-1">Resultado de laboratorio</p>
                <p className="text-[#717171] text-[11px] font-normal mt-1">Agosto 10 2026</p>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-[377px] lg:flex-shrink-0 bg-[#F8F8F8] rounded-2xl p-5 sm:p-6 md:p-8">
            <h3 className="text-black text-lg sm:text-xl md:text-2xl lg:text-[26px] font-medium">
              Recordatorio
            </h3>

            <div className="mt-5 sm:mt-6 md:mt-8 flex flex-col gap-5 sm:gap-6 md:gap-8">
              {recordatorios.map((item, index) => (
                <div key={index}>
                  <p className="text-black text-sm sm:text-base md:text-lg lg:text-[20px] font-normal break-words">
                    {item.titulo}
                  </p>
                  <p className="text-[#535353] text-sm sm:text-base md:text-lg lg:text-[20px] font-normal mt-1">
                    {item.fecha}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}