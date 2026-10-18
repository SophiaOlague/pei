"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Home,
  MessageSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  Video,
  Bell,
  Settings,
} from "lucide-react";

export function CitasAdmin() {
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 6, 23));
  const [currentMonth, setCurrentMonth] = useState(6); // Julio = 6
  const [currentYear, setCurrentYear] = useState(2026);

  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const daysOfWeek = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  // Estadísticas
  const stats = [
    { icon: Calendar, label: "Citas programadas", value: "6" },
    { icon: CheckCircle, label: "Citas de completadas", value: "24" },
    { icon: Users, label: "Pacientes nuevos", value: "128" },
    { icon: XCircle, label: "Cancelaciones", value: "12" },
  ];

  // Citas del día
  const citas = [
    {
      hora: "10:00 AM",
      dia: "Hoy",
      paciente: "Salomon Díaz",
      tipo: "Consulta de seguimiento",
      foto: "/persona-grande.jpg",
      activa: true,
    },
    {
      hora: "12:30 PM",
      dia: "Hoy",
      paciente: "Diana Hernandez",
      tipo: "Consulta inicial",
      foto: "/persona-grande.jpg",
      activa: true,
    },
    {
      hora: "2:34 PM",
      dia: "Hoy",
      paciente: "Salomon Díaz",
      tipo: "Consulta de seguimiento",
      foto: "/persona-grande.jpg",
      activa: false,
    },
  ];

  // Días con citas (para el calendario)
  const diasConCitas = [6, 7, 23];

  const getDaysInMonth = (month: number, year: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (month: number, year: number) => {
    return new Date(year, month, 1).getDay();
  };

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleSelectDate = (day: number) => {
    setSelectedDate(new Date(currentYear, currentMonth, day));
  };

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);

  return (
    <div className="min-h-screen bg-white font-sans">
      
     
      {/* header */}
     
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
          
          
          <div className="mb-8 sm:mb-10">
            <h1 className="text-[40px] sm:text-4xl md:text-5xl font-medium text-black mb-3">
              Mis citas
            </h1>
            <p className="text-black/50 text-[20px] sm:text-base">
              Gestiona tus consultas y revisa el historial de citas.
            </p>
          </div>

         
  {/* cards de estadisticas */}

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
                  <span className="text-[#89898A] text-xs sm:text-sm" style={{ opacity: 0.6 }}>
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

            
            {/* lista de citas */}
            <div className="w-full lg:w-2/3 flex flex-col gap-6">
              {citas.map((cita, index) => (
                <div
                  key={index}
                  className="w-full rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-6"
                  style={{
                    backgroundColor: "rgba(230, 230, 230, 0.3)",
                    borderRadius: "20px",
                  }}
                >
                  
                  <div
                    className="w-full sm:w-[128px] h-[118px] rounded-2xl flex flex-col items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: "rgba(230, 230, 230, 0.5)",
                    }}
                  >
                    <span className="text-black text-lg sm:text-xl font-regular">
                      {cita.hora}
                    </span>
                    <span className="text-black/50 text-sm">
                      {cita.dia}
                    </span>
                  </div>

                  
                  <div className="w-[71px] h-[71px] rounded-full overflow-hidden bg-gray-300 flex items-center justify-center flex-shrink-0">
                    <img
                      src={cita.foto}
                      alt={cita.paciente}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  
                  <div className="flex-1">
                    <h3 className="text-black text-base sm:text-lg font-regular mb-1">
                      {cita.paciente}
                    </h3>
                    <p className="text-black/50 text-sm mb-2">
                      {cita.tipo}
                    </p>
                    <button className="text-black text-sm underline hover:opacity-70 transition-opacity cursor-pointer">
                      Ver detalles
                    </button>
                  </div>

                  
                  <button
                    disabled={!cita.activa}
                    className={`w-full sm:w-[117px] h-[38px] rounded-lg text-white text-sm font-medium transition-all ${
                      cita.activa
                        ? "cursor-pointer hover:opacity-90"
                        : "cursor-not-allowed"
                    }`}
                    style={{
                      backgroundColor: cita.activa ? "#7355F7" : "rgba(102, 75, 219, 0.48)",
                      borderRadius: "7px",
                    }}
                  >
                    Iniciar meet
                  </button>
                </div>
              ))}
            </div>

           


            <div className="w-full lg:w-1/3">
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={handlePrevMonth}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-500" />
                </button>

                <div className="flex items-center gap-2">
                  <select
                    value={currentMonth}
                    onChange={(e) => setCurrentMonth(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 cursor-pointer focus:outline-none focus:border-[#7355F7]"
                  >
                    {months.map((month, index) => (
                      <option key={index} value={index}>
                        {month}
                      </option>
                    ))}
                  </select>

                  <select
                    value={currentYear}
                    onChange={(e) => setCurrentYear(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 cursor-pointer focus:outline-none focus:border-[#7355F7]"
                  >
                    {[2025, 2026, 2027, 2028].map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleNextMonth}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              
              <div className="grid grid-cols-7 gap-1 mb-2">
                {daysOfWeek.map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs text-gray-500 font-medium py-2"
                  >
                    {day.slice(0, 3)}
                  </div>
                ))}
              </div>


              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, index) => (
                  <div key={`empty-${index}`} className="py-2"></div>
                ))}

                {Array.from({ length: daysInMonth }).map((_, index) => {
                  const day = index + 1;
                  const isSelected =
                    selectedDate?.getDate() === day &&
                    selectedDate?.getMonth() === currentMonth &&
                    selectedDate?.getFullYear() === currentYear;
                  const hasCita = diasConCitas.includes(day);

                  return (
                    <button
                      key={day}
                      onClick={() => handleSelectDate(day)}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[#7355F7] text-white"
                          : hasCita
                          ? "text-[#7355F7] font-regular hover:bg-[#7355F7]/10"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}