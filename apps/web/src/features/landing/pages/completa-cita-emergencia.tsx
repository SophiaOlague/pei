"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { Shield } from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function CompletaCitaEmergencia() {
  const [phone, setPhone] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const availableDates = [
    { day: "Lunes", date: "12", month: "Mayo", year: "2026", full: "Lunes, Mayo 12, 2026" },
    { day: "Martes", date: "13", month: "Mayo", year: "2026", full: "Martes, Mayo 13, 2026" },
    { day: "Miércoles", date: "14", month: "Mayo", year: "2026", full: "Miércoles, Mayo 14, 2026" },
    { day: "Jueves", date: "15", month: "Mayo", year: "2026", full: "Jueves, Mayo 15, 2026" },
    { day: "Viernes", date: "16", month: "Mayo", year: "2026", full: "Viernes, Mayo 16, 2026" },
    { day: "Lunes", date: "19", month: "Mayo", year: "2026", full: "Lunes, Mayo 19, 2026" },
    { day: "Martes", date: "20", month: "Mayo", year: "2026", full: "Martes, Mayo 20, 2026" },
    { day: "Miércoles", date: "21", month: "Mayo", year: "2026", full: "Miércoles, Mayo 21, 2026" },
  ];

  const availableTimes = [
    "9:00 am", "9:30 am", "10:00 am", "10:30 am", "11:00 am", "11:30 am",
    "12:00 pm", "12:30 pm", "1:00 pm", "1:30 pm", "2:00 pm", "2:30 pm",
    "3:00 pm", "3:30 pm", "4:00 pm", "4:30 pm", "5:00 pm", "5:30 pm",
  ];

  useEffect(() => {
    if (!selectedDate && !selectedTime) {
      setSelectedDate(availableDates[0].full);
      setSelectedTime(availableTimes[0]);
    }
  }, [selectedDate, selectedTime]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numericValue = value.replace(/[^0-9+\s-]/g, "");
    setPhone(numericValue);
  };

  return (
    <div className="min-h-screen bg-white font-sans relative">

      <nav className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-200">
        <div className="w-10 h-10 sm:w-12 sm:h-12">
          <Image
            src="/logo.svg"
            alt="Logo"
            width={80}
            height={80}
            className="object-contain"
          />
        </div>

       

        <UserMenu />
      </nav>

       
      <main className="px-6 sm:px-8 md:px-10 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 lg:gap-16">
          <div className="w-full lg:w-auto flex flex-col gap-6">
            <div className="w-full lg:w-[495px] rounded-2xl p-5 sm:p-6 bg-[#664BDB]/15">
              <h2 className="text-lg sm:text-xl font-medium mb-4" style={{ color: '#664BDB' }}>
                Resumen de la cita
              </h2>

              <div className="flex items-start gap-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-white/40 flex items-center justify-center flex-shrink-0">
                  <img src="/doctora.jpg" alt="Dr Laura Josefa" className="w-full h-full object-cover" />
                </div>

                <div className="flex-1">
                  <h3 className="text-base sm:text-lg text-black">
                    Dr Laura Josefa
                  </h3>
                  <p className="text-black/40 text-xs sm:text-sm mb-2">
                    Infectología
                  </p>

                  <div className="border-t border-black/30 my-2"></div>

                  <p className="text-black/40 text-xs">
                    Cita de emergencia
                  </p>
                  <p className="text-black/40 text-xs">
                    {selectedDate || "Fecha por asignar"} {selectedTime && `- ${selectedTime}`}
                  </p>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-[495px] bg-white border border-gray-300 rounded-2xl p-5 sm:p-6">
              <h2 className="text-lg sm:text-xl font-medium mb-4" style={{ color: '#664BDB' }}>
                Pago de la cita
              </h2>

              <div className="flex items-center justify-between mb-3">
                <span className="text-black text-sm sm:text-base">Consulta de emergencia</span>
                <span className="text-black text-sm sm:text-base">$200 MXN</span>
              </div>

              <div className="border-t border-gray-300 my-3"></div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-sm sm:text-base font-medium" style={{ color: '#664BDB' }}>
                  Total
                </span>
                <span className="text-sm sm:text-base font-medium" style={{ color: '#664BDB' }}>
                  $200 MXN
                </span>
              </div>

              <div className="border-t border-gray-300 my-3"></div>

              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-gray-500" />
                <span className="text-gray-500 text-xs sm:text-sm">Pago seguro</span>
              </div>
            </div>
          </div>

          <div className="w-full lg:flex-1 max-w-[635px]">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-black mb-3">
              Completa tu cita
            </h1>
            <p className="text-gray-600 text-sm sm:text-base mb-8 sm:mb-10">
              Por favor completa algunos datos para agendar tu cita.
            </p>

            <div className="flex flex-col gap-5 sm:gap-6">
              <div>
                <label className="block text-black text-sm sm:text-base font-medium mb-2">
                  Nombre completo
                </label>
                <input
                  type="text"
                  placeholder="Introduce tu nombre completo"
                  className="w-full h-[54px] px-4 border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#664BDB] transition-colors"
                />
              </div>

              <div>
                <label className="block text-black text-sm sm:text-base font-medium mb-2">
                  Correo
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  className="w-full h-[54px] px-4 border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#664BDB] transition-colors"
                />
              </div>

              <div>
                <label className="block text-black text-sm sm:text-base font-medium mb-2">
                  Número de teléfono
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="+52..."
                  value={phone}
                  onChange={handlePhoneChange}
                  className="w-full h-[54px] px-4 border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:border-[#664BDB] transition-colors"
                />
              </div>

              <div>
                <label className="block text-black text-sm sm:text-base font-medium mb-2">
                  Día y hora
                </label>
                <div className="flex flex-col sm:flex-row justify-between gap-4">
                  <input
                    type="text"
                    value={selectedDate || "Cargando..."}
                    readOnly
                    disabled
                    className="w-full sm:w-[48%] h-[54px] px-4 border border-gray-200 rounded-lg text-gray-500 bg-gray-50 cursor-not-allowed"
                  />
                  <input
                    type="text"
                    value={selectedTime || "Cargando..."}
                    readOnly
                    disabled
                    className="w-full sm:w-[48%] h-[54px] px-4 border border-gray-200 rounded-lg text-gray-500 bg-gray-50 cursor-not-allowed"
                  />
                </div>
                <p className="text-gray-500 text-xs mt-2">
                  * El sistema ha asignado automáticamente la cita más cercana disponible.
                </p>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="terms"
                  className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                />
                <label htmlFor="terms" className="text-gray-600 text-sm cursor-pointer">
                  Estoy de acuerdo con los{" "}
                  <a href="#" className="text-[#664BDB] hover:underline">
                    términos y condiciones.
                  </a>
                </label>
              </div>

              <button
                className="w-full h-[54px] rounded-lg text-white font-medium text-base sm:text-lg hover:opacity-90 transition-opacity cursor-pointer mt-4"
                style={{ backgroundColor: '#664BDB' }}
              >
                Confirmar y pagar $350.00
              </button>

              <p className="text-gray-500 text-xs text-center">
                Tendrás cita en línea con tu doctor
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}