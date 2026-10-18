"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Shield,
  Droplet,
  Sun,
  Heart,
  Cigarette,
  Wine,
  Activity,
  User,
  Send,
} from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function Expediente() {
  const router = useRouter();

  const tabs = [
    { label: "General", path: "/historial-general" },
    { label: "Información médica", path: null },
    { label: "Resultados de laboratorio", path: "/laboratorio" },
    { label: "Documentos", path: "/expediente-medico" },
    { label: "Historial", path: "/historial-medico" },
  ];

  const resumenSalud = [
    {
      icon: Droplet,
      label: "Grupo sanguíneo",
      value: "O+",
      color: "#4A32B6",
    },
    {
      icon: Sun,
      label: "Alergias",
      value: "Sin alergias",
      color: "#4A32B6",
    },
    {
      icon: Heart,
      label: "Condiciones médicas",
      value: "Ninguna",
      color: "#4A32B6",
    },
    {
      icon: Cigarette,
      label: "Tabaquismo",
      value: "No fumador",
      color: "#4A32B6",
    },
    {
      icon: Wine,
      label: "Consumo de alcohol",
      value: "Ocasionalmente",
      color: "#4A32B6",
    },
    {
      icon: Activity,
      label: "Actividad física",
      value: "3-4 veces por semana",
      color: "#4A32B6",
    },
  ];

  const informacionClinica = [
    { label: "Peso", value: "68 kg" },
    { label: "Estatura", value: "1.65 m" },
    { label: "Índice de Masa Corporal", value: "24.9" },
    { label: "Presión arterial", value: "110/70 mmHg" },
    { label: "Frecuencia cardíaca", value: "72 lpm" },
  ];

  const contactoEmergencia = [
    { label: "Nombre", value: "Juan Hernandez" },
    { label: "Relación", value: "Hermano" },
    { label: "Teléfono", value: "6181234567" },
  ];

  return (
    <div className="min-h-screen bg-white font-sans">

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

      <main className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10">
        <div className="max-w-7xl mx-auto">

          <div className="mb-6 sm:mb-8 md:mb-10">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium text-black mb-2 sm:mb-3">
              Expediente médico
            </h1>
            <p className="text-[#535353] text-sm sm:text-base md:text-lg lg:text-[24px] font-light leading-snug sm:leading-normal md:leading-[30px] lg:leading-[32px] mt-1">
              Ve detalladamente todo tu historial medico y documentos
            </p>
          </div>

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
                  tab.label === "Información médica"
                    ? "border-b-2 border-[#7355F7]"
                    : ""
                }`}
              >
                {tab.label}
              </span>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-6 mb-6 sm:mb-8 md:mb-10 mt-6 sm:mt-8">
            <div>
              <h2 className="text-black text-sm sm:text-base md:text-lg font-medium mb-1">
                Información médica
              </h2>
              <p className="text-black/50 text-xs sm:text-sm">
                Aquí puedes ver tu información médica personal y relevante
              </p>
            </div>

            <div
              className="w-full lg:w-[569px] h-auto flex items-start sm:items-center gap-3 sm:gap-4 p-4"
              style={{
                backgroundColor: "rgba(115, 85, 247, 0.2)",
                borderRadius: "10px",
              }}
            >
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-[#7355F7] flex-shrink-0 mt-0.5 sm:mt-0" />
              <div className="min-w-0">
                <p className="text-[#7355F7] text-xs sm:text-sm md:text-base font-medium break-words">
                  Tu información está protegida y encriptada
                </p>
                <p className="text-black text-[11px] sm:text-xs md:text-sm break-words">
                  Solo tú y tu equipo médico pueden verla
                </p>
              </div>
            </div>
          </div>

          <div
            className="w-full p-4 sm:p-6 md:p-8 mb-6 sm:mb-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "12px",
            }}
          >
            <h3 className="text-sm sm:text-base md:text-lg font-medium text-black mb-4 sm:mb-6 md:mb-8">
              Resumen de salud
            </h3>

            <div className="flex flex-col md:flex-row md:justify-between gap-y-6 sm:gap-y-8 md:gap-x-8">
              <div className="flex flex-col gap-5 sm:gap-6 md:gap-8">
                {resumenSalud.slice(0, 3).map((item, index) => (
                  <div key={index} className="flex items-start gap-3 sm:gap-4">
                    <item.icon
                      className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-0.5"
                      style={{ color: item.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-[#89898A] text-xs sm:text-sm">
                        {item.label}
                      </p>
                      <p className="text-black text-sm sm:text-base font-regular break-words">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-5 sm:gap-6 md:gap-8">
                {resumenSalud.slice(3, 6).map((item, index) => (
                  <div key={index} className="flex items-start gap-3 sm:gap-4">
                    <item.icon
                      className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-0.5"
                      style={{ color: item.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-[#89898A] text-xs sm:text-sm">
                        {item.label}
                      </p>
                      <p className="text-black text-sm sm:text-base font-regular break-words">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className="w-full p-4 sm:p-6 md:p-8 mb-6 sm:mb-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "12px",
            }}
          >
            <h3 className="text-sm sm:text-base md:text-lg font-medium text-black mb-4 sm:mb-6">
              Información clínica
            </h3>

            <div className="flex flex-col">
              {informacionClinica.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 py-3 border-b border-gray-200 last:border-b-0"
                >
                  <span className="text-black text-xs sm:text-sm md:text-base break-words">
                    {item.label}
                  </span>
                  <span className="text-black text-xs sm:text-sm md:text-base font-regular text-right flex-shrink-0">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="w-full p-4 sm:p-6 md:p-8 mb-6 sm:mb-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "12px",
            }}
          >
            <h3 className="text-sm sm:text-base md:text-lg font-medium text-black mb-4 sm:mb-6">
              Contacto de emergencia
            </h3>

            <div className="flex flex-col">
              {contactoEmergencia.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 py-3 border-b border-gray-200 last:border-b-0"
                >
                  <span className="text-black text-xs sm:text-sm md:text-base break-words">
                    {item.label}
                  </span>
                  <span className="text-black text-xs sm:text-sm md:text-base font-regular text-right flex-shrink-0">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="w-full p-4 sm:p-6 md:p-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "12px",
            }}
          >
            <h3 className="text-sm sm:text-base md:text-lg font-medium text-black mb-4 sm:mb-6">
              Médico tratante
            </h3>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden bg-gray-300 flex items-center justify-center flex-shrink-0">
                  <img src="/doctora.jpg" alt="Dra. Laura Martinez" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-black text-sm sm:text-base font-medium break-words">
                    Dra. Laura Martinez
                  </p>
                  <p className="text-[#89898A] text-xs sm:text-sm break-words">
                    Especialista en Infectología
                  </p>
                  <p className="text-[#89898A] text-xs sm:text-sm break-words">
                    Cédula profesional: 1225464568
                  </p>
                </div>
              </div>

              
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}