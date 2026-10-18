"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Home,
  Settings,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Calendar,
  BookOpen,
  FileText,
  FlaskConical,
  ClipboardList,
  Shield,
} from "lucide-react";

export function NuevaRecetaDoctor() {
  const [medicamento, setMedicamento] = useState("Truvada (Emtricitabina/Tenofovir DF)");
  const [presentacion, setPresentacion] = useState("Tableta 200mg/300mg");
  const [dosis, setDosis] = useState("1 Tableta");
  const [frecuencia, setFrecuencia] = useState("Diaria");
  const [duracion, setDuracion] = useState("30 días");
  const [instrucciones, setInstrucciones] = useState(
    "Todo medicamento debe tener su receta, tomar en ayuno o en un horario en el que recuerdes y puedas tomarlo al día siguiente"
  );

  const accesosDirectos = [
    { icon: BookOpen, titulo: "Nueva receta", desc: "Crea una nueva receta" },
    { icon: MessageSquare, titulo: "Enviar mensaje", desc: "Enviar mensaje al paciente" },
    { icon: FileText, titulo: "Ver expediente", desc: "Consulta expediente" },
    { icon: FlaskConical, titulo: "Solicitar estudios", desc: "Solicitar estudios de lab." },
    { icon: ClipboardList, titulo: "Notas clínicas", desc: "Agrega notas a la consulta" },
    { icon: Calendar, titulo: "Programar seguimiento", desc: "Agenda próxima cita" },
  ];

  return (
    <div className="min-h-screen bg-white font-sans">
      
      
      {/*header*/}


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

  

      <main className="px-6 sm:px-8 md:px-10 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto">
          
          {/* Título */}
          <div className="mb-8 sm:mb-10">
            <h1 className="!text-[40px] sm:text-4xl md:text-5xl font-medium text-black mb-3">
              Nueva receta
            </h1>
            <p className="text-black/50 !text-[20px] sm:text-base">
              Crea y envía una nueva receta a tu paciente.
            </p>
          </div>

          

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            
          


            <div className="flex flex-col gap-6">
              
             
              <div
                className="w-full rounded-2xl p-5 flex items-center gap-4"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "20px",
                  minHeight: "127px",
                }}
              >
               
                <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-300 flex items-center justify-center flex-shrink-0">
                  <img
                    src="/persona-grande.jpg"
                  />
                </div>

              
                <div className="flex-1">
                  <h3 className="text-black !text-[18px] sm:text-base font-regular mb-1">
                    Salomon Diaz
                  </h3>
                  <p className="text-black/50 !text-[16px] mb-1">
                    ID paciente: 675346975
                  </p>
                  <p className="text-black !text-[14px]">
                    29 años · Masculino
                  </p>
                </div>

                {/* Ver expediente */}
                <button className="flex items-center gap-2 text-black/50 !text-[16px] hover:text-black/70 transition-colors cursor-pointer self-end">
                  Ver expediente
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

             
             
              <h2 className="text-black !text-[20px] sm:text-lg font-medium">
                Medicamento
              </h2>

              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-black/50 !text-[18px] mb-2">
                    Medicamento
                  </label>
                  <div className="relative">
                    <select
                      value={medicamento}
                      onChange={(e) => setMedicamento(e.target.value)}
                      className="w-full h-[38px] px-3 pr-9 bg-[#E6E6E6]/30 rounded-lg  text-black !text-[16px] appearance-none cursor-pointer focus:outline-none focus:border-[#7355F7]"
                    >
                      <option>Truvada (Emtricitabina/Tenofovir DF)</option>
                      <option>Descovy (Emtricitabina/Tenofovir AF)</option>
                      <option>Generic PrEP</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-black absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-black/50 !text-[18px] mb-2">
                    Presentación
                  </label>
                  <div className="relative">
                    <select
                      value={presentacion}
                      onChange={(e) => setPresentacion(e.target.value)}
                      className="w-full h-[38px] px-3 pr-9 rounded-lg bg-[#E6E6E6]/30 text-black !text-[16px] appearance-none cursor-pointer focus:outline-none focus:border-[#7355F7]"
                    >
                      <option>Tableta 200mg/300mg</option>
                      <option>Tableta 200mg/25mg</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-black absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* frecuencia y duración */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-black/50 !text-[18px] mb-2">
                    Dosis
                  </label>
                  <div className="relative">
                    <select
                      value={dosis}
                      onChange={(e) => setDosis(e.target.value)}
                      className="w-full h-[38px] px-3 pr-9 rounded-lg bg-[#E6E6E6]/30 text-black !text-[16px] appearance-none cursor-pointer focus:outline-none focus:border-[#7355F7]"
                    >
                      <option>1 Tableta</option>
                      <option>2 Tabletas</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-black absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-black/50 !text-[18px] mb-2">
                    Frecuencia
                  </label>
                  <div className="relative">
                    <select
                      value={frecuencia}
                      onChange={(e) => setFrecuencia(e.target.value)}
                      className="w-full h-[38px] px-3 pr-9 rounded-lg bg-[#E6E6E6]/30 text-black !text-[16px] appearance-none cursor-pointer focus:outline-none focus:border-[#7355F7]"
                    >
                      <option>Diaria</option>
                      <option>Semanal</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-black absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-black/50 !text-[18px] mb-2">
                    Duración de tratamiento
                  </label>
                  <div className="relative">
                    <select
                      value={duracion}
                      onChange={(e) => setDuracion(e.target.value)}
                      className="w-full h-[38px] px-3 pr-9 rounded-lg bg-[#E6E6E6]/30 text-black !text-[16px] appearance-none cursor-pointer focus:outline-none focus:border-[#7355F7]"
                    >
                      <option>30 días</option>
                      <option>60 días</option>
                      <option>90 días</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-black absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* instrucciones para el paciente */}
              <div>
                <label className="block text-black/50 !text-[18px] mb-2">
                  Instrucciones para el paciente
                </label>
                <textarea
                  value={instrucciones}
                  onChange={(e) => setInstrucciones(e.target.value)}
                  rows={3}
                  className="w-full h-[60px] p-3 text-black !text-[16px] resize-none focus:outline-none focus:border-[#7355F7]"
                  style={{
                    backgroundColor: "rgba(230, 230, 230, 0.3)",
                    borderRadius: "5px",
                  }}
                />
              </div>

              {/* Botones */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  className="h-[38px] text-black/50 !text-[16px] font-regular hover:bg-black/5 transition-colors cursor-pointer"
                  style={{
                    border: "1px solid rgba(169, 169, 169, 0.5)",
                    borderRadius: "7px",
                  }}
                >
                  Vaciar todos los campos
                </button>
                <button
                  className="sm:col-span-2 h-[38px] text-white !text-[16px] font-regular hover:opacity-90 transition-opacity cursor-pointer"
                  style={{
                    backgroundColor: "#7355F7",
                    borderRadius: "7px",
                  }}
                >
                  Generar receta
                </button>
              </div>

            </div>

           
{/*accesos directos*/}

            <div className="flex flex-col gap-6">
              
              <h2 className="text-black !text-[20px] font-regular">
                Accesos directos
              </h2>

              
              <div className="grid grid-cols-2 gap-4">
                {accesosDirectos.map((acceso, index) => (
                  <button
                    key={index}
                    className="flex flex-col items-start text-left p-4 hover:opacity-90 transition-opacity cursor-pointer"
                    style={{
                      backgroundColor: "rgba(230, 230, 230, 0.3)",
                      borderRadius: "12px",
                      minHeight: "94px",
                    }}
                  >
                    <acceso.icon className="w-5 h-5 text-[#7355F7] mb-3" strokeWidth={1.5} />
                    <h3 className="text-black !text-[18px] font-regular mb-1">
                      {acceso.titulo}
                    </h3>
                    <p className="text-black/50 !text-[18px]">
                      {acceso.desc}
                    </p>
                  </button>
                ))}
              </div>

             
              <div
                className="w-full p-4 flex items-start gap-3"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "12px",
                }}
              >
                <Shield className="w-5 h-5 text-[#7355F7] flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                <div>
                  <h3 className="text-black !text-[20px] font-regular mb-1">
                    Información importante
                  </h3>
                  <p className="text-black/50 !text-[18px]">
                    Todas las recetas son enviadas electrónicamente y cumplen con la normativa de salud vigente.
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