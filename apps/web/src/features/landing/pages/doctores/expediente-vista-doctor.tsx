"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Home,
  ChevronDown,
  Plus,
  Activity,
  Heart,
  Stethoscope,
  Shield,
  Pill,
  Calendar,
  FileText,
  Microscope,
} from "lucide-react";

export function ExpedienteVistaDoctor() {
  const [activeTab, setActiveTab] = useState("Resumen");
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 });
  const [showAllHistorial, setShowAllHistorial] = useState(false);

  const tabs = [
    "Resumen",
    "Información médica",
    "Resultados de laboratorio",
    "Documentos",
    "Historial",
  ];

  // Datos del paciente (vendrán del backend)
  const paciente = {
    nombre: "Oscar",
    email: "Osc2@gmail.com",
    id: "12548967",
    edad: "29 años",
    activo: true,
  };

  // Resumen de salud
  const resumenSalud = [
    { icon: Activity, label: "Diagnóstico principal", value: "PrEP - Prevención del VIH" },
    { icon: Heart, label: "Estado general", value: "Salud estable" },
    { icon: Calendar, label: "Última consulta", value: "20 de mayo del 2026" },
    { icon: Stethoscope, label: "Médico tratante", value: "Dr. David Wismichu Díaz" },
  ];

  // Historial reciente
  const historialReciente = [
    { label: "Consulta de seguimiento", value: "15 de agosto del 2026" },
    { label: "Resultados de laboratorio", value: "16 de mayo del 2026" },
    { label: "PrEP Truvada - renovación de receta", value: "15 de agosto del 2026" },
    { label: "Evaluación final", value: "16 de mayo del 2026" },
  ];

  const historialCompleto = [
    ...historialReciente,
    { label: "Consulta inicial", value: "10 de enero del 2026" },
    { label: "Resultados de laboratorio", value: "12 de enero del 2026" },
  ];

  // Notas del médico
  const notasMedico = [
    "Paciente en tratamiento de PrEP desde 15/02/2024",
    "Buena adherencia al medicamento",
    "Se recomienda continuar con controles cada 3 meses",
    "Próximos estudios en agosto del 2026",
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

  const historialAMostrar = showAllHistorial ? historialCompleto : historialReciente;

  return (
    <div className="min-h-screen bg-white font-sans">
      
     
      {/* HEADER */}
     
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
            <ChevronDown className="w-5 h-5" />
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

     
      {/* CONTENIDO PRINCIPAL */}
   
      <main className="px-6 sm:px-8 md:px-10 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto">
          
          {/* Título y botón Nueva receta */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8 sm:mb-10">
            <div>
              <h1 className="!text-[40px] sm:text-4xl md:text-5xl font-medium text-black mb-3">
                Expediente del paciente
              </h1>
              <p className="text-black/50 !text-[20px] sm:text-base">
                Consulta y administra la información médica del paciente
              </p>
            </div>

            <button
              className="flex items-center justify-center gap-2 w-full sm:w-[235px] h-[38px] text-white !text-[18px] font-regularhover:opacity-90 transition-opacity cursor-pointer self-start sm:self-auto"
              style={{
                backgroundColor: "#7355F7",
                borderRadius: "5px",
              }}
            >
              
              Nueva receta
            </button>
          </div>

         
          {/* INFORMACIÓN DEL PACIENTE */}
         
          <div className="flex flex-col sm:flex-row items-start gap-6 mb-8 sm:mb-10">
            {/* Foto del paciente */}
            <div className="w-[191px] h-[191px] rounded-full overflow-hidden bg-gray-300 flex items-center justify-center flex-shrink-0">
              <img
                src="/persona-grande.jpg"
                alt={paciente.nombre}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Datos del paciente */}
            <div className="flex flex-col justify-center h-[191px]">
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-black !text-[20px] sm:text-3xl font-bold">
                  {paciente.nombre}
                </h2>
                {paciente.activo && (
                  <span
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: "rgba(32, 216, 0, 0.1)",
                      color: "#20D800",
                    }}
                  >
                    Paciente activo
                  </span>
                )}
              </div>
              <p className="text-black/50 !text-[18px] sm:text-base mb-2">
                {paciente.email}
              </p>
              <p className="text-black/50 !text-[18px] sm:text-base mb-2">
                ID: {paciente.id}
              </p>
              <p className="text-black/50 !text-[18px] sm:text-base">
                {paciente.edad}
              </p>
            </div>
          </div>

        
          {/* TABS / CARRUSEL */}
        
          <div className="relative mb-8 sm:mb-10 inline-block">
            <div className="flex items-center gap-6 sm:gap-8 md:gap-10 overflow-x-auto pb-3 scrollbar-hide">
              {tabs.map((tab, index) => (
                <button
                  key={tab}
                  ref={(el) => {
                    tabsRef.current[index] = el;
                  }}
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap !text-[18px] sm:text-base font-medium pb-3 transition-colors cursor-pointer ${
                    activeTab === tab
                      ? "text-[#7355F7]"
                      : "text-gray-500 hover:text-gray-700"
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

         
          {/* CONTENIDO DEL TAB "RESUMEN" */}
        
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            
            
            <div className="lg:col-span-1">
              <h2 className="text-black !text-[20px] sm:text-lg font-medium mb-6">
                Resumen de salud
              </h2>

              <div className="flex flex-col gap-6">
                {resumenSalud.map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <item.icon
                      className="w-5 h-5 text-[#7355F7] flex-shrink-0 mt-0.5"
                      strokeWidth={1.5}
                    />
                    <div>
                      <p className="text-black/50 !text-[18px] sm:text-sm mb-1">
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




            <div className="lg:col-span-1">
              <h2 className="text-black !text-[20px] sm:text-lg font-medium mb-6">
                Historial reciente
              </h2>

              <div className="flex flex-col gap-6">
                {historialAMostrar.map((item, index) => (
                  <div key={index}>
                    <p className="text-black/50 !text-[18px] sm:text-sm mb-1">
                      {item.label}
                    </p>
                    <p className="text-black !text-[18px] sm:text-base font-regular">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowAllHistorial(!showAllHistorial)}
                className="mt-6 text-[#7355F7] !text-[16px] sm:text-sm font-regular hover:underline transition-all cursor-pointer"
              >
                {showAllHistorial ? "Ver menos" : "Ver historial completo"}
              </button>
            </div>

           



            <div className="lg:col-span-1 flex flex-col gap-6">
              
              {/* Card Notas del médico */}
              <div
                className="w-full p-6 rounded-2xl"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "12px",
                  minHeight: "241px",
                }}
              >
                <h3 className="text-black !text-[20px] sm:text-lg font-medium mb-4">
                  Notas del médico
                </h3>

                <ul className="flex flex-col gap-3">
                  {notasMedico.map((nota, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-black/50 !text-[18px] sm:text-sm">•</span>
                      <span className="text-black/50 !text-[18px] sm:text-sm">
                        {nota}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Card Medicamento actual */}
              <div
                className="w-full p-6 rounded-2xl"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "12px",
                  minHeight: "145px",
                }}
              >
                <h3 className="text-black !text-[20px] sm:text-lg font-medium mb-4">
                  Medicamento actual
                </h3>

                <div className="flex items-center gap-3">
                  <Pill
                    className="w-5 h-5 text-[#7355F7] flex-shrink-0"
                    strokeWidth={1.5}
                  />
                  <div>
                    <p className="text-black !text-[18px] sm:text-base font-regular">
                      Truvada
                    </p>
                    <p className="text-black/50 !text-[16px] sm:text-sm">
                      Emtricitabina / Fumarato de tenofovir disoproxilo
                    </p>
                  </div>
                </div>
              </div>

            </div>

          </div>

        </div>
      </main>
    </div>
  );
}