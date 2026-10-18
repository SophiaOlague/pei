"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarCheck,
  Star,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function Landing() {
  const router = useRouter();

  const doctors = [
    {
      name: "Dr Jose Mart",
      specialty: "Infectólogo",
      rating: "4.9",
      image: "/doctor.jpg",
    },
    {
      name: "Dr Laura Martinez",
      specialty: "Infectóloga",
      rating: "4.8",
      image: "/doctor.jpg",
    },
    {
      name: "Dr David Mercado",
      specialty: "Family medicine",
      rating: "4.9",
      image: "/doctor.jpg",
    },
    {
      name: "Dr Sofia Marquez",
      specialty: "Infectóloga",
      rating: "4.8",
      image: "/doctor.jpg",
    },
  ];

  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = doctors.length;

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

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
        <h1 className="text-black text-2xl sm:text-3xl md:text-4xl lg:text-[60px] font-medium leading-tight sm:leading-snug lg:leading-[70px]">
          Agenda tu cita
        </h1>
        <p className="text-[#717171] text-sm sm:text-base md:text-lg lg:text-[24px] font-normal leading-snug sm:leading-normal lg:leading-[32px] mt-2">
          Elige la mejor opción para ti
        </p>

        <div className="mt-6 sm:mt-10 md:mt-12 flex flex-col lg:flex-row gap-6 lg:gap-8">
          
          <div className="w-full lg:w-[571px] lg:h-[278px] bg-[#7355F7] rounded-2xl p-6 sm:p-8 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-white flex-shrink-0" />
                <h3 className="text-white text-lg sm:text-xl md:text-2xl lg:text-[28px] font-medium">
                  Cita de emergencia
                </h3>
              </div>
              <span className="text-white text-base sm:text-lg md:text-xl lg:text-[24px] font-normal">
                $550
              </span>
            </div>

            <p className="text-white/90 text-sm sm:text-base md:text-lg lg:text-[24px] font-normal mt-6">
              Mira a un doctor justo ahora. Disponibles 24/7 para urgencias.
            </p>

            <button
              onClick={() => router.push("/completa-cita-emergencia")}
              className="w-full sm:w-[192px] h-11 sm:h-[43px] bg-white rounded-lg text-[#7355F7] text-sm sm:text-base lg:text-[20px] font-medium hover:opacity-90 transition mt-6 lg:mt-auto cursor-pointer"
            >
              Buscar ahora
            </button>
          </div>

          <div className="w-full lg:w-[571px] lg:h-[278px] bg-[#E3DDFD] rounded-2xl p-6 sm:p-8 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <CalendarCheck className="w-10 h-10 sm:w-12 sm:h-12 text-[#8970F8] flex-shrink-0" />
                <h3 className="text-[#7355F7] text-lg sm:text-xl md:text-2xl lg:text-[28px] font-medium">
                  Agendar cita
                </h3>
              </div>
              <span className="text-[#7355F7] text-base sm:text-lg md:text-xl lg:text-[24px] font-normal">
                $280
              </span>
            </div>

            <p className="text-black text-sm sm:text-base md:text-lg lg:text-[24px] font-normal mt-6">
              Elige el día y hora.
              <br />
              Disponibles diariamente.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 mt-6 lg:mt-auto">
              <button
                onClick={() => router.push("/completa-cita")}
                className="w-full sm:w-[192px] h-11 sm:h-[42px] bg-[#7355F7] rounded-lg text-white text-sm sm:text-base lg:text-[20px] font-normal hover:bg-[#6244d9] transition cursor-pointer"
              >
                Elige fecha
              </button>
              <button
                onClick={() => router.push("/completa-cita")}
                className="w-full sm:w-[192px] h-11 sm:h-[42px] bg-[#AB99FA] rounded-lg text-white text-sm sm:text-base lg:text-[20px] font-normal hover:bg-[#9d8af0] transition cursor-pointer"
              >
                Siguiente cita hoy
              </button>
            </div>
          </div>
        </div>

        <div className="mt-12 sm:mt-16">
          <h2 className="text-black text-2xl sm:text-3xl md:text-4xl lg:text-[48px] font-normal leading-tight sm:leading-snug lg:leading-[58px]">
            Nuestros doctores
          </h2>
          <p className="text-[#717171] text-sm sm:text-base md:text-lg lg:text-[20px] font-normal leading-snug sm:leading-normal lg:leading-[28px] mt-2">
            Todos nuestros doctores están especializados en PEI.
          </p>

          <div className="mt-8 sm:mt-10 relative">
            <button
              onClick={prevSlide}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition -ml-3 sm:-ml-4 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-[#535353]" />
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition -mr-3 sm:-mr-4 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-[#535353]" />
            </button>

            <div className="overflow-hidden">
              <div
                className="flex gap-6 sm:gap-10 md:gap-16 transition-transform duration-500 ease-in-out"
                style={{
                  transform: `translateX(-${currentSlide * 280}px)`,
                }}
              >
                {doctors.map((doctor, index) => (
                  <div
                    key={index}
                    className="w-[259px] h-[303px] bg-[#EDEDED] rounded-2xl overflow-hidden flex-shrink-0"
                  >
                    <div className="w-[259px] h-[182px] overflow-hidden">
                      <Image
                        src={doctor.image}
                        alt={doctor.name}
                        width={259}
                        height={182}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="p-5">
                      <h3 className="text-black text-base sm:text-lg md:text-[20px] font-normal">
                        {doctor.name}
                      </h3>
                      <p className="text-[#2F2F2F] text-sm sm:text-[15px] font-normal mt-1">
                        {doctor.specialty}
                      </p>
                      <div className="flex items-center gap-1 mt-2">
                        <Star className="w-[15px] h-[15px] text-[#E2C920] fill-[#E2C920]" />
                        <span className="text-[#E2C920] text-sm sm:text-[15px] font-normal">
                          {doctor.rating}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-2 mt-6">
            {doctors.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-3 h-3 rounded-full transition cursor-pointer ${
                  currentSlide === index ? "bg-[#7355F7]" : "bg-[#D9D9D9]"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}