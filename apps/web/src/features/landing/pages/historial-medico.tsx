"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Calendar,
  Activity,
  Stethoscope,
  X,
} from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function HistorialMedico() {
  const router = useRouter();
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const tabs = [
    { label: "General", path: "/historial-general" },
    { label: "Información médica", path: "/expediente" },
    { label: "Resultados de laboratorios", path: "/laboratorio" },
    { label: "Documentos", path: "/expediente-medico" },
    { label: "Historial", path: null },
  ];

  const citasMedicas = [
    { fecha: "20 mayo 2026", hora: "2:20 pm", doctor: "Consulta Dr Jose Martinez", tipo: "Análisis de sangre" },
    { fecha: "20 mayo 2026", hora: "2:20 pm", doctor: "Consulta Dr Jose Martinez", tipo: "Análisis de sangre" },
    { fecha: "20 mayo 2026", hora: "2:20 pm", doctor: "Consulta Dr Jose Martinez", tipo: "Análisis de sangre" },
  ];

  const diagnosticos = [
    { fecha: "20 mayo 2026", diagnostico: "Exposición al VIH", codigo: "ICD-10: Z20" },
    { fecha: "15 febrero 2026", diagnostico: "Evaluación para PrEP", codigo: "ICD-10: Z20" },
    { fecha: "10 noviembre 2026", diagnostico: "Salud sexual", codigo: "ICD-10: Z20" },
  ];

  const tratamientos = [
    { fecha: "20 mayo 2026", tratamiento: "PrEP Truvada (Medictadel)", dosis: "1 tableta diaria" },
    { fecha: "15 febrero 2026", tratamiento: "PrEP Truvada (Medictadel)", dosis: "1 tableta diaria" },
    { fecha: "10 noviembre 2026", tratamiento: "PrEP Truvada (Medictadel-Truvada)", dosis: "2 tableta diaria" },
  ];

  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const daysOfWeek = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

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
    const date = new Date(currentYear, currentMonth, day);
    setSelectedDate(date);
    setShowCalendar(false);
  };

  const handleClearFilter = () => {
    setSelectedDate(null);
  };

  const formatDate = (date: Date) => {
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDay = getFirstDayOfMonth(currentMonth, currentYear);

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

      {showCalendar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
          onClick={() => setShowCalendar(false)}
        >
          <div
            className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 md:p-8 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800">
                Filtrar por fecha
              </h3>
              <button
                onClick={() => setShowCalendar(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handlePrevMonth}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronDown className="w-5 h-5 text-gray-500 rotate-90" />
              </button>
              <span className="text-sm sm:text-base md:text-lg font-medium text-gray-800">
                {months[currentMonth]} {currentYear}
              </span>
              <button
                onClick={handleNextMonth}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <ChevronDown className="w-5 h-5 text-gray-500 -rotate-90" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {daysOfWeek.map((day) => (
                <div key={day} className="text-center text-[10px] sm:text-xs text-gray-500 font-medium py-1.5 sm:py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, index) => (
                <div key={`empty-${index}`} className="py-1.5 sm:py-2"></div>
              ))}

              {Array.from({ length: daysInMonth }).map((_, index) => {
                const day = index + 1;
                const isSelected = selectedDate?.getDate() === day &&
                                   selectedDate?.getMonth() === currentMonth &&
                                   selectedDate?.getFullYear() === currentYear;

                return (
                  <button
                    key={day}
                    onClick={() => handleSelectDate(day)}
                    className={`py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#7355F7] text-white"
                        : "text-gray-700 hover:bg-[#7355F7]/10"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {selectedDate && (
              <button
                onClick={handleClearFilter}
                className="w-full mt-4 sm:mt-6 h-10 sm:h-[44px] rounded-lg border border-black/50 text-black text-sm font-medium hover:bg-black/5 transition-colors cursor-pointer"
              >
                Limpiar filtro
              </button>
            )}
          </div>
        </div>
      )}

      <main className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 sm:mb-8 md:mb-10">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium text-black mb-2 sm:mb-3">
              Mi historial médico
            </h1>
            <p className="text-[#535353] text-sm sm:text-base md:text-lg lg:text-[24px] font-light leading-snug sm:leading-normal md:leading-[30px] lg:leading-[32px] mt-1">
              tu historial médico
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
                  tab.label === "Historial"
                    ? "border-b-2 border-[#7355F7]"
                    : ""
                }`}
              >
                {tab.label}
              </span>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-6 sm:mb-8 mt-6 sm:mt-8">
            <div>
              <h2 className="text-base sm:text-lg md:text-xl font-bold text-black mb-1">
                Historial médico
              </h2>
              <p className="text-black/50 text-xs sm:text-sm md:text-base">
                Consulta el registro de tus citas y tratamiento.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
              {selectedDate && (
                <span className="text-xs sm:text-sm text-black/70 bg-[#7355F7]/10 px-3 py-1.5 rounded-lg">
                  {formatDate(selectedDate)}
                </span>
              )}
              <button
                onClick={() => setShowCalendar(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg border border-black/50 text-black text-xs sm:text-sm font-medium hover:bg-black/5 transition-colors cursor-pointer whitespace-nowrap"
              >
                Filtrar por
                <Calendar className="w-4 h-4" />
              </button>
            </div>
          </div>

  
          <div
            className="w-full p-4 sm:p-6 md:p-8 mb-6 sm:mb-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "18px",
            }}
          >
            <h3 className="text-sm sm:text-base md:text-lg font-medium text-black mb-4 sm:mb-6 md:mb-8">
              Citas médicas
            </h3>

            <div className="relative">
         
              <div className="absolute left-[15px] sm:left-[19px] top-4 bottom-4 w-px bg-[#7355F7]/30"></div>

              <div className="flex flex-col gap-6 sm:gap-8">
                {citasMedicas.map((cita, index) => (
                  <div key={index} className="flex items-start gap-3 sm:gap-4 relative">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#7355F7] flex items-center justify-center flex-shrink-0 z-10">
                      <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-white"></div>
                    </div>

                    <div className="flex-1 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-[#535353] text-[11px] sm:text-xs md:text-sm mb-1">
                          {cita.fecha} · {cita.hora}
                        </p>
                        <p className="text-black text-xs sm:text-sm md:text-base font-medium break-words">
                          {cita.doctor}
                        </p>
                        <p className="text-black/50 text-[11px] sm:text-xs md:text-sm">
                          {cita.tipo}
                        </p>
                      </div>

                      <div className="self-start sm:self-auto flex-shrink-0">
                        <span className="inline-block px-3 sm:px-4 py-1 sm:py-1.5 rounded-lg bg-[#20D800]/10 text-[#20D800] text-[11px] sm:text-xs md:text-sm font-medium">
                          Completado
                        </span>
                      </div>
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
              borderRadius: "18px",
            }}
          >
            <h3 className="text-sm sm:text-base md:text-lg font-medium text-black mb-4 sm:mb-6 md:mb-8">
              Diagnóstico
            </h3>

            <div className="flex flex-col gap-6 sm:gap-8">
              {diagnosticos.map((item, index) => (
                <div key={index} className="flex items-start gap-3 sm:gap-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center flex-shrink-0">
                    <Stethoscope className="w-4 h-4 sm:w-5 sm:h-5 text-[#7355F7]" strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="text-black/50 text-[11px] sm:text-xs md:text-sm mb-1">
                        {item.fecha}
                      </p>
                      <p className="text-black text-xs sm:text-sm md:text-base font-medium break-words">
                        {item.diagnostico}
                      </p>
                    </div>
                    <p className="text-black/50 text-[11px] sm:text-xs md:text-sm flex-shrink-0">
                      {item.codigo}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="w-full p-4 sm:p-6 md:p-8 mb-6 sm:mb-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "18px",
            }}
          >
            <h3 className="text-sm sm:text-base md:text-lg font-medium text-black mb-4 sm:mb-6 md:mb-8">
              Tratamientos
            </h3>

            <div className="flex flex-col gap-6 sm:gap-8">
              {tratamientos.map((item, index) => (
                <div key={index} className="flex items-start gap-3 sm:gap-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-[#7355F7]" strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2 min-w-0">
                    <div className="min-w-0">
                      <p className="text-black/50 text-[11px] sm:text-xs md:text-sm mb-1">
                        {item.fecha}
                      </p>
                      <p className="text-black text-xs sm:text-sm md:text-base font-regular break-words">
                        {item.tratamiento}
                      </p>
                    </div>
                    <p className="text-black/50 text-[11px] sm:text-xs md:text-sm font-regular flex-shrink-0">
                      {item.dosis}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}