"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  FlaskConical,
  ChevronRight,
  Shield,
  Syringe,
  FlaskRound,
  ChevronLeft,
  X,
} from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function Landing() {
  const router = useRouter();
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const tabs = [
    { label: "General", path: "/historial-general" },
    { label: "Información médica", path: "/expediente" },
    { label: "Resultados de laboratorio", path: null },
    { label: "Documentos", path: "/expediente-medico" },
    { label: "Historial", path: "/historial-medico" },
  ];

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const firstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const prevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    );
  };

  const handleSelectDay = (day: number) => {
    const newDate = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      day
    );
    setSelectedDate(newDate);
    setShowCalendar(false);
  };

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  const renderDays = () => {
    const totalDays = daysInMonth(currentMonth);
    const firstDay = firstDayOfMonth(currentMonth);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10" />);
    }

    for (let day = 1; day <= totalDays; day++) {
      const isSelected =
        selectedDate &&
        selectedDate.getDate() === day &&
        selectedDate.getMonth() === currentMonth.getMonth() &&
        selectedDate.getFullYear() === currentMonth.getFullYear();

      days.push(
        <button
          key={day}
          onClick={() => handleSelectDay(day)}
          className={`w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-full text-[12px] sm:text-[13px] md:text-[14px] font-normal transition cursor-pointer ${
            isSelected
              ? "bg-[#7355F7] text-white"
              : "text-[#535353] hover:bg-[#E3DDFD]"
          }`}
        >
          {day}
        </button>
      );
    }

    return days;
  };

  const laboratorios = [
    {
      titulo: "VIH 4ta",
      icono: FlaskConical,
    },
    {
      titulo: "Función renal",
      icono: Shield,
    },
    {
      titulo: "Función hepática",
      icono: Syringe,
    },
    {
      titulo: "Prueba de ETS",
      icono: FlaskRound,
    },
  ];

  return (
    <div className="min-h-screen bg-white">

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
                tab.label === "Resultados de laboratorio"
                  ? "border-b-2 border-[#7355F7]"
                  : ""
              }`}
            >
              {tab.label}
            </span>
          ))}
        </div>

        <div className="mt-6 sm:mt-8 md:mt-12">
          <h2 className="text-black text-xl sm:text-2xl md:text-3xl lg:text-[45px] font-medium leading-tight sm:leading-snug md:leading-[46px] lg:leading-[55px]">
            Resumen de laboratorio
          </h2>
          <p className="text-[#535353] text-xs sm:text-sm md:text-base lg:text-[20px] font-light leading-snug sm:leading-normal md:leading-[26px] lg:leading-[28px] mt-2">
            Consulta tus estudios y resultados de laboratorio más recientes
          </p>
        </div>

        <div className="flex justify-end mt-4 sm:mt-6">
          <button
            onClick={() => setShowCalendar(true)}
            className="w-full sm:w-[231px] h-11 sm:h-12 md:h-[57px] border border-black rounded-lg flex items-center justify-center gap-2 sm:gap-3 hover:bg-gray-50 transition cursor-pointer"
          >
            <span className="text-black text-sm sm:text-base md:text-[18px] font-normal">
              {selectedDate
                ? `${selectedDate.getDate()} de ${monthNames[selectedDate.getMonth()]}`
                : "Filtrar por"}
            </span>
            <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6 md:w-[26px] md:h-[26px] text-black" />
          </button>
        </div>

        {laboratorios.map((lab, index) => {
          const Icono = lab.icono;
          const isLast = index === laboratorios.length - 1;

          return (
            <div
              key={index}
              className={`w-full bg-[#F8F8F8] rounded-2xl p-4 sm:p-6 md:p-8 mt-4 sm:mt-6 relative ${
                isLast ? "mb-12" : ""
              }`}
            >
              <div className="absolute top-3 right-3 sm:top-5 sm:right-5 md:top-6 md:right-6 w-[80px] sm:w-[95px] md:w-[108px] h-[24px] sm:h-[27px] md:h-[29px] bg-[#CDF2C6] rounded-md flex items-center justify-center">
                <span className="text-[#747474] text-xs sm:text-sm md:text-[18px] font-normal">
                  Negativo
                </span>
              </div>

              <div className="flex items-start gap-3 sm:gap-5 md:gap-8 pr-24 sm:pr-28 md:pr-32">
                <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-[80px] md:h-[80px] rounded-full bg-[#C3B7F8] flex items-center justify-center flex-shrink-0">
                  <Icono className="w-6 h-6 sm:w-8 sm:h-8 md:w-[40px] md:h-[40px] text-[#7355F7]" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-black text-base sm:text-lg md:text-[20px] font-medium break-words">
                    {lab.titulo}
                  </h3>
                  <p className="text-[#535353] text-sm sm:text-base md:text-[22px] font-normal mt-1">
                    Análisis de sangre
                  </p>
                </div>
              </div>

              <div className="mt-6 sm:mt-10 md:mt-[110px] flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
                <div>
                  <p className="text-[#535353] text-xs sm:text-sm md:text-[18px] font-normal">
                    Fecha: 22 de agosto del 2026
                  </p>
                  <p className="text-[#535353] text-xs sm:text-sm md:text-[18px] font-semibold mt-1">
                    Resultado: no reactivo
                  </p>
                </div>
                <button
                  onClick={() => router.push("/detalle-laboratorio")}
                  className="w-full sm:w-[200px] h-10 sm:h-[38px] border border-black rounded-lg flex items-center justify-center gap-2 hover:bg-gray-100 transition cursor-pointer"
                >
                  <span className="text-black text-sm sm:text-base md:text-[16px] font-normal">
                    Ver detalles
                  </span>
                  <ChevronRight className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-black" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showCalendar && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCalendar(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-4 sm:p-6 w-full max-w-[380px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 relative">
              <button
                onClick={prevMonth}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5 text-[#535353]" />
              </button>
              <h3 className="text-sm sm:text-base md:text-[18px] font-medium text-black">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </h3>
              <button
                onClick={nextMonth}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition cursor-pointer"
              >
                <ChevronRight className="w-5 h-5 text-[#535353]" />
              </button>
              <button
                onClick={() => setShowCalendar(false)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition absolute -top-1 right-0 cursor-pointer"
              >
                <X className="w-5 h-5 text-[#535353]" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {dayNames.map((day) => (
                <div
                  key={day}
                  className="w-7 h-7 sm:w-9 sm:h-9 md:w-10 md:h-10 flex items-center justify-center text-[10px] sm:text-[12px] md:text-[13px] font-medium text-[#9A9A9A]"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {renderDays()}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setSelectedDate(null);
                  setShowCalendar(false);
                }}
                className="text-xs sm:text-sm md:text-[14px] text-[#7355F7] font-medium hover:underline cursor-pointer"
              >
                quitar filtro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}