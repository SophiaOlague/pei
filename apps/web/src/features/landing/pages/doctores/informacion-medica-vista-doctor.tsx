"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Home,
  Settings,
  MessageSquare,
  Shield,
  Droplet,
  Sun,
  Heart,
  Cigarette,
  Wine,
  Activity,
  User,
  Send,
  ChevronDown,
} from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function InformacionMedicaVistaDoctor() {
  const [activeTab, setActiveTab] = useState("Información médica");
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 });

  const tabs = [
    "General",
    "Información médica",
    "Resultados de laboratorio",
    "Documentos",
    "Historial",
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

  useEffect(() => {
    const activeIndex = tabs.indexOf(activeTab);
    const activeButton = tabsRef.current[activeIndex];

    if (activeButton) {
      setIndicatorStyle({
        width: activeButton.offsetWidth,
        left: activeButton.offsetLeft,
      });
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-white font-sans">
      
   
   

   
      <header className="flex items-center justify-between px-6 sm:px-8 md:px-10 py-4 sm:py-5 border-b border-gray-100">
        <div className="flex-shrink-0">
          <img
            src="/logo-pei-negro.png"
            alt="PEI"
            className="h-10 sm:h-12 w-auto"
          />
        </div>

        <nav className="hidden md:flex items-center gap-6 lg:gap-10">
          <Link
            href="/landing-inicio"
            className="flex items-center gap-2 text-black/50 font-regular text-xl hover:opacity-70 transition-opacity cursor-pointer"
          >
            
            Inicio
          </Link>

          <button className="flex items-center gap-2 text-black/50 font-regular text-xl hover:opacity-70 transition-opacity cursor-pointer">
            <Link
            href="/citas-perfil-doctor">
            Citas
</Link>
          </button>

        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <button className="flex items-center gap-1 text-black font-regular text-xl hover:opacity-70 transition-opacity cursor-pointer">
            Oscar
            <ChevronDown className="w-4 h-4" />
          </button>

          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
            <img
              src="/persona-grande.jpg"
              alt="Usuario"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </header>

    
    


      <main className="px-6 sm:px-8 md:px-10 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto">

          {/* Título */}
          <div className="mb-8 sm:mb-10">
            <h1 className="!text-[40px] sm:text-4xl md:text-5xl font-medium text-black mb-3">
              Expediente médico
            </h1>
            <p className="text-black/50 !text-[20px] sm:text-base">
              Ve detalladamente todo tu historial médico y documentos
            </p>
          </div>

      
      



          <div className="relative mb-8 sm:mb-10 inline-block">
            <div className="flex items-center gap-6 sm:gap-8 md:gap-10 overflow-x-auto pb-3 scrollbar-hide">
              {tabs.map((tab, index) => (
                <button
                  key={tab}
                  ref={(el) => {
                    tabsRef.current[index] = el;
                  }}
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap !text-[20px] sm:text-base font-regular pb-3 transition-colors cursor-pointer ${
                    activeTab === tab
                      ? "text-[#7355F7]"
                      : "text-black/50 hover:text-gray-700"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Línea base gris */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-[#535353]/19"></div>

            {/* Línea morada indicadora */}
            <div
              className="absolute bottom-0 h-[2px] bg-[#7355F7] transition-all duration-300"
              style={{
                width: `${indicatorStyle.width}px`,
                left: `${indicatorStyle.left}px`,
              }}
            ></div>
          </div>

        
        




          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-8 sm:mb-10">
            <div>
              <h2 className="text-black !text-[20px] sm:text-lg font-regular mb-1">
                Información médica
              </h2>
              <p className="text-black/50 !text-[18px] sm:text-sm">
                Aquí puedes ver tu información médica personal y relevante
              </p>
            </div>

            <div
              className="w-full lg:w-[569px] h-auto lg:h-[70px] flex items-center gap-4 p-4"
              style={{
                backgroundColor: "rgba(115, 85, 247, 0.2)",
                borderRadius: "10px",
              }}
            >
              <Shield className="w-6 h-6 text-[#7355F7] flex-shrink-0" />
              <div>
                <p className="text-[#7355F7] !text-[20px] sm:text-base font-medium">
                  Tu información está protegida y encriptada
                </p>
                <p className="text-black/70 !text-[18px] sm:text-sm">
                  Solo tú y tu equipo médico pueden verla
                </p>
              </div>
            </div>
          </div>

         




          <div
            className="w-full p-6 sm:p-8 mb-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "12px",
            }}
          >
            <h3 className="text-base sm:text-lg font-medium text-black mb-6 sm:mb-8">
              Resumen de salud
            </h3>

            <div className="flex flex-col md:flex-row md:justify-between gap-y-6 sm:gap-y-8 md:gap-x-8">
              
              {/* Columna izquierda */}
              <div className="flex flex-col gap-6 sm:gap-8">
                {resumenSalud.slice(0, 3).map((item, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <item.icon
                      className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-0.5"
                      style={{ color: item.color }}
                    />
                    <div>
                      <p className="text-black/50 !text-[18px] sm:text-sm">
                        {item.label}
                      </p>
                      <p className="text-black !text-[18px] sm:text-base font-regular">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Columna derecha */}
              <div className="flex flex-col gap-6 sm:gap-8">
                {resumenSalud.slice(3, 6).map((item, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <item.icon
                      className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-0.5"
                      style={{ color: item.color }}
                    />
                    <div>
                      <p className="text-black/50 !text-[18px] sm:text-sm">
                        {item.label}
                      </p>
                      <p className="text-black !text-[18px] sm:text-base font-regular">
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>

        



          <div
            className="w-full p-6 sm:p-8 mb-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "12px",
            }}
          >
            <h3 className="!text-[20px] sm:text-lg font-medium text-black mb-6">
              Información clínica
            </h3>

            <div className="flex flex-col">
              {informacionClinica.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-gray-200 last:border-b-0"
                >
                  <span className="text-black/50 !text-[18px] sm:text-base">
                    {item.label}
                  </span>
                  <span className="text-black/50 !text-[18px] sm:text-base font-regular">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

         



          <div
            className="w-full p-6 sm:p-8 mb-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "12px",
            }}
          >
            <h3 className="!text-[20px] sm:text-lg font-medium text-black mb-6">
              Contacto de emergencia
            </h3>

            <div className="flex flex-col">
              {contactoEmergencia.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-gray-200 last:border-b-0"
                >
                  <span className="text-black/50 !text-[18px] sm:text-base">
                    {item.label}
                  </span>
                  <span className="text-black/50 !text-[18px] sm:text-base font-regular">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          


          <div
            className="w-full p-6 sm:p-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "12px",
            }}
          >
            <h3 className="!text-[20px] sm:text-lg font-medium text-black mb-6">
              Médico tratante
            </h3>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden bg-gray-300 flex items-center justify-center flex-shrink-0">
                  <User className="w-6 h-6 text-gray-500" />
                 <img src="/doctora.jpg" alt="Dra. Laura Martinez" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-black !text-[18px] sm:text-base font-medium">
                    Dra. Laura Martinez
                  </p>
                  <p className="text-black/50 !text-[18px] sm:text-sm">
                    Especialista en Infectología
                  </p>
                  <p className="text-black/50 !text-[18px] sm:text-sm">
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