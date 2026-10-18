"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, CheckCircle } from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function CompletaCita() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [phone, setPhone] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const availableDates = [
    { day: "1", month: "Ago", full: "1 de Agosto, 2026" },
    { day: "2", month: "Ago", full: "2 de Agosto, 2026" },
    { day: "3", month: "Ago", full: "3 de Agosto, 2026" },
    { day: "4", month: "Ago", full: "4 de Agosto, 2026" },
    { day: "5", month: "Ago", full: "5 de Agosto, 2026" },
    { day: "6", month: "Ago", full: "6 de Agosto, 2026" },
    { day: "7", month: "Ago", full: "7 de Agosto, 2026" },
    { day: "8", month: "Ago", full: "8 de Agosto, 2026" },
    { day: "9", month: "Ago", full: "9 de Agosto, 2026" },
    { day: "10", month: "Ago", full: "10 de Agosto, 2026" },
    { day: "11", month: "Ago", full: "11 de Agosto, 2026" },
    { day: "12", month: "Ago", full: "12 de Agosto, 2026" },
    { day: "13", month: "Ago", full: "13 de Agosto, 2026" },
    { day: "14", month: "Ago", full: "14 de Agosto, 2026" },
  ];

  const availableTimes = [
    "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
    "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
    "16:00", "16:30", "17:00", "17:30",
  ];

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const numericValue = value.replace(/[^0-9+\s-]/g, "");
    setPhone(numericValue);
  };

  const handleDateClick = (full: string) => {
    setSelectedDate((prev) => (prev === full ? "" : full));
  };

  const handleTimeClick = (time: string) => {
    setSelectedTime((prev) => (prev === time ? "" : time));
  };

  const handleConfirm = () => {
    setShowSuccess(true);
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    router.push("/landing-inicio");
  };

  return (
    <div className="min-h-screen bg-white font-sans relative">

      <style>{`
        .minimal-scroll::-webkit-scrollbar {
          height: 3px;
        }
        .minimal-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .minimal-scroll::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.06);
          border-radius: 2px;
        }
        .minimal-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.12);
        }
        .minimal-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 0, 0, 0.06) transparent;
        }
      `}</style>

      {showSuccess && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onClick={handleCloseSuccess}
        >
          <div
            className="bg-white rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-2xl flex flex-col items-center text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#20D800]/15 flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-[#20D800]" strokeWidth={2} />
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-black mb-2">
              ¡Pago exitoso!
            </h3>

            <p className="text-[#717171] text-sm sm:text-base mb-6">
              Tu cita ha sido agendada correctamente.
            </p>

            <div className="w-full bg-[#F8F8F8] rounded-xl p-4 sm:p-5 mb-6 flex flex-col gap-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#717171] text-xs sm:text-sm">Doctor</span>
                <span className="text-black text-sm sm:text-base font-medium text-right">
                  Dr Laura Josefa
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#717171] text-xs sm:text-sm">Especialidad</span>
                <span className="text-black text-sm sm:text-base font-medium text-right">
                  Infectología
                </span>
              </div>
              <div className="border-t border-black/10"></div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#717171] text-xs sm:text-sm">Fecha</span>
                <span className="text-black text-sm sm:text-base font-medium text-right">
                  {selectedDate || "Por definir"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#717171] text-xs sm:text-sm">Hora</span>
                <span className="text-black text-sm sm:text-base font-medium text-right">
                  {selectedTime || "Por definir"}
                </span>
              </div>
              <div className="border-t border-black/10"></div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#717171] text-xs sm:text-sm">Total pagado</span>
                <span className="text-[#664BDB] text-base sm:text-lg font-bold text-right">
                  $200 MXN
                </span>
              </div>
            </div>

            <button
              onClick={handleCloseSuccess}
              className="w-full h-12 sm:h-[50px] rounded-lg text-white text-sm sm:text-base font-medium hover:opacity-90 transition-opacity cursor-pointer"
              style={{ backgroundColor: "#664BDB" }}
            >
              Ir al inicio
            </button>
          </div>
        </div>
      )}

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
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-16">
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
                    Cita programada
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
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium text-black mb-3">
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
                  Fechas disponibles
                </label>
                <div className="flex gap-3 overflow-x-auto pb-3 minimal-scroll">
                  {availableDates.map((item, index) => {
                    const isSelected = selectedDate === item.full;
                    return (
                      <button
                        key={index}
                        onClick={() => handleDateClick(item.full)}
                        className={`flex-shrink-0 w-[62px] h-[62px] rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#664BDB] text-white border-2 border-[#664BDB]"
                            : "bg-white text-[#664BDB] border-2 border-[#664BDB]/40 hover:border-[#664BDB]"
                        }`}
                      >
                        <span className="text-base sm:text-[18px] font-semibold leading-none">
                          {item.day}
                        </span>
                        <span className="text-xs sm:text-[14px] font-normal mt-1 leading-none">
                          {item.month}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-black text-sm sm:text-base font-medium mb-2">
                  Horarios disponibles
                </label>
                <div className="flex gap-3 overflow-x-auto pb-3 minimal-scroll">
                  {availableTimes.map((time, index) => {
                    const isSelected = selectedTime === time;
                    return (
                      <button
                        key={index}
                        onClick={() => handleTimeClick(time)}
                        className={`flex-shrink-0 w-[62px] h-[62px] rounded-lg flex items-center justify-center transition-all cursor-pointer text-sm sm:text-base font-normal ${
                          isSelected
                            ? "bg-[#664BDB] text-white border-2 border-[#664BDB]"
                            : "bg-white text-[#664BDB] border-2 border-[#664BDB]/40 hover:border-[#664BDB]"
                        }`}
                      >
                        {time}
                      </button>
                    );
                  })}
                </div>
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
                onClick={handleConfirm}
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