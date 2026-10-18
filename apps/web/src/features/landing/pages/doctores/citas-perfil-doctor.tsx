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
  Users,
  FileText,
  Lock,
  Bell,
  UserCheck,
  UserPlus,
} from "lucide-react";

export function CitasPerfilDoctor() {
  const [showAllCitas, setShowAllCitas] = useState(false);

  // Estadísticas
  const stats = [
    { icon: Calendar, label: "Citas de hoy", value: "6" },
    { icon: Calendar, label: "Citas de esta semana", value: "24" },
    { icon: UserCheck, label: "Pacientes activos", value: "128" },
    { icon: UserPlus, label: "Pacientes nuevos", value: "12" },
  ];

  // Próximas citas
  const citas = [
    { hora: "10:00 AM", paciente: "María Gómez", tipo: "Consulta de seguimiento", activa: true },
    { hora: "11:30 AM", paciente: "Ricardo Hernández", tipo: "Consulta de seguimiento", activa: false },
    { hora: "01:00 PM", paciente: "Ana Torres", tipo: "Consulta de seguimiento", activa: false },
    { hora: "03:30 AM", paciente: "Luis Martínez", tipo: "Consulta de seguimiento", activa: false },
  ];

  // Actividad reciente
  const actividadReciente = [
    { paciente: "Ricardo Hernández", tipo: "Consulta de seguimiento", tiempo: "Hace 2 horas" },
    { paciente: "Ricardo Hernández", tipo: "Consulta de seguimiento", tiempo: "Hace 3 horas" },
    { paciente: "Ricardo Hernández", tipo: "Consulta de seguimiento", tiempo: "Hace 4 horas" },
  ];

  // Accesos rápidos
  const accesosRapidos = [
    { icon: Users, label: "Ver pacientes" },
  ];

  return (
    <div className="min-h-screen bg-white font-sans">
      
      {/* ============================================ */}
      {/* HEADER */}
      {/* ============================================ */}
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
            href="/"
            className="flex items-center gap-2 text-black/50 font-regular text-xl hover:opacity-70 transition-opacity cursor-pointer"
          >
            
           Inicio
          </Link>

          <button className="flex items-center gap-2 text-black/50 font-regular text-xl hover:opacity-70 transition-opacity cursor-pointer">
            
            Citas
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
          
          {/* Título y descripción */}
          <div className="mb-8 sm:mb-10">
            <h1 className="!text-[40px] sm:text-4xl md:text-5xl font-medium text-black mb-3">
              Dr. David  Martinez
            </h1>
            <p className="text-black/50 !text-[20px] sm:text-base">
              Especialista en infectología
            </p>
          </div>

          {/* ============================================ */}
          {/* CARDS DE ESTADÍSTICAS */}
          {/* ============================================ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-10">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="rounded-2xl p-6 flex flex-col items-center"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "10px",
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <stat.icon className="w-4 h-4 text-[#664BDB]" strokeWidth={2} />
                  <span className="text-[#89898A] !text-[18px] sm:text-sm" style={{ opacity: 0.6 }}>
                    {stat.label}
                  </span>
                </div>
                <span className="text-2xl sm:text-3xl font-regular text-black">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          


          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            
           

            <div className="w-full lg:w-2/3 flex flex-col gap-8">
              
              {/* Próximas citas */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-black !text-[20px] sm:text-lg font-regular">
                    Próximas citas
                  </h2>
                  <button
                    onClick={() => setShowAllCitas(!showAllCitas)}
                    className="text-black/40 !text-[18px] hover:text-black/60 transition-colors cursor-pointer"
                  >
                    Ver todas
                  </button>
                </div>

                <div
                  className="w-full rounded-2xl p-2"
                  style={{
                    backgroundColor: "rgba(230, 230, 230, 0.3)",
                    borderRadius: "10px",
                  }}
                >
                  {citas.slice(0, showAllCitas ? citas.length : 4).map((cita, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between gap-4 p-4">
                        {/* Card de hora */}
                        <div
                          className="w-[110px] h-[47px] rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: "rgba(230, 230, 230, 0.7)",
                            borderRadius: "10px",
                          }}
                        >
                          <span className="text-black !text-[18px] font-regular">
                            {cita.hora}
                          </span>
                        </div>

                        {/* Datos del paciente */}
                        <div className="flex-1">
                          <p className="text-black !text-[20px] sm:text-base font-regular">
                            {cita.paciente}
                          </p>
                          <p className="text-black/50 !text-[18px] sm:text-sm">
                            {cita.tipo}
                          </p>
                        </div>

                        {/* Botón Iniciar meet */}
                        
                      </div>

                      {/* Línea separadora */}
                      {index < citas.length - 1 && (
                        <div className="h-px bg-black/8 mx-4"></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actividad reciente */}
              <div>
                <h2 className="text-black !text-[20px] sm:text-lg font-regular mb-4">
                  Actividad reciente
                </h2>

                <div
                  className="w-full rounded-2xl p-2"
                  style={{
                    backgroundColor: "rgba(230, 230, 230, 0.3)",
                    borderRadius: "10px",
                  }}
                >
                  {actividadReciente.map((act, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between gap-4 p-4">
                        {/* Icono */}
                        <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-black" strokeWidth={1.5} />
                        </div>

                        {/* Datos */}
                        <div className="flex-1">
                          <p className="text-black !text-[20px] sm:text-base font-regular">
                            {act.paciente}
                          </p>
                          <p className="text-black/50 !text-[18px] sm:text-sm">
                            {act.tipo}
                          </p>
                        </div>

                        {/* Tiempo */}
                        <span className="text-black/30 !text-[16px] sm:text-sm flex-shrink-0">
                          {act.tiempo}
                        </span>
                      </div>

                      {/* Línea separadora */}
                      {index < actividadReciente.length - 1 && (
                        <div className="h-px bg-black/8 mx-4"></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

            </div>

         
            <div className="w-full lg:w-1/3 flex flex-col gap-8">
              
              <div>
                <h2 className="text-black/50 !text-[18px] sm:text-sm font-regular mb-2">
                  Accesos rápidos
                </h2>

                <div className="flex flex-col">
                  {accesosRapidos.map((acceso, index) => (
                    <button
                      key={index}
                      className="flex items-center justify-between py-3 text-black !text-[18px] sm:text-base font-regular hover:opacity-70 transition-opacity cursor-pointer"
                    >
                      <span>{acceso.label}</span>
                      <ChevronRight className="w-4 h-4 text-black" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Card morada - Atención confidencial */}
              <div
                className="w-full rounded-2xl p-6 sm:p-8 flex items-center justify-between gap-4"
                style={{
                  backgroundColor: "#664BDB",
                  borderRadius: "10px",
                  minHeight: "241px",
                }}
              >
                {/* Lado izquierdo - Texto */}
                <div className="flex-1">
                  <Lock className="w-6 h-6 text-white mb-4" strokeWidth={1.5} />
                  <h3 className="text-white !text-[20px] sm:text-lg font-medium mb-2">
                    Atención confidencial
                  </h3>
                  <p className="text-white/80 !text-[18px] sm:text-sm leading-relaxed">
                    Recuerda que toda la información de tus pacientes está protegida y encriptada
                  </p>
                </div>

                <div className="flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32">
                  
                 <img src="/platano.png" alt="Atención confidencial" className="w-full h-full object-contain" /> 
                </div>
              </div>

            </div>

          </div>

        </div>
      </main>
    </div>
  );
}