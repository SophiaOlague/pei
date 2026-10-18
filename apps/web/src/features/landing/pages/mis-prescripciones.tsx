"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Circle } from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function MisPrescripciones() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Activo");
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 });

  const tabs = [
    { label: "Activo", path: null },
    { label: "Historial", path: "/historial-prescripciones" },
    { label: "Refill y entregas", path: "/refill-entregas" },
  ];

  useEffect(() => {
    const activeIndex = tabs.findIndex((t) => t.label === activeTab);
    const activeButton = tabsRef.current[activeIndex];

    if (activeButton) {
      setIndicatorStyle({
        width: activeButton.offsetWidth,
        left: activeButton.offsetLeft,
      });
    }
  }, [activeTab]);

  const handleTabClick = (tab: { label: string; path: string | null }) => {
    if (tab.path) {
      router.push(tab.path);
    } else {
      setActiveTab(tab.label);
    }
  };

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

      <main className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 sm:py-8 md:py-10">
        <div className="max-w-7xl mx-auto">

          <div className="mb-6 sm:mb-8 md:mb-10">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-medium text-black mb-2 sm:mb-3">
              Mis prescripciones
            </h1>
            <p className="text-black/50 text-sm sm:text-base">
              Ve tus prescripciones actuales y pasadas
            </p>
          </div>

          <div className="relative mb-6 sm:mb-8 md:mb-10 inline-block max-w-full">
            <div className="flex items-center gap-4 sm:gap-6 md:gap-8 lg:gap-10 overflow-x-auto pb-3 scrollbar-hide">
              {tabs.map((tab, index) => (
                <button
                  key={tab.label}
                  ref={(el) => {
                    tabsRef.current[index] = el;
                  }}
                  onClick={() => handleTabClick(tab)}
                  className={`whitespace-nowrap text-xs sm:text-sm md:text-base font-medium pb-3 transition-colors cursor-pointer ${
                    activeTab === tab.label
                      ? "text-[#7355F7]"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-px bg-[#535353]/19"></div>

            <div
              className="absolute bottom-0 h-[2px] bg-[#7355F7] transition-all duration-300"
              style={{
                width: `${indicatorStyle.width}px`,
                left: `${indicatorStyle.left}px`,
              }}
            ></div>
          </div>

          <div
            className="w-full p-4 sm:p-6 md:p-8 mb-6 sm:mb-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "12px",
            }}
          >
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div className="flex items-start gap-4 sm:gap-6 min-w-0">
                <div className="w-24 h-16 sm:w-32 sm:h-20 md:w-40 md:h-24 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <img src="/medicamento.png" alt="Descovy" className="w-full h-full object-contain" />
                </div>

                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg md:text-xl font-bold text-black mb-2">
                    Descovy
                  </h3>
                  <p className="text-black/50 text-xs sm:text-sm md:text-base mb-2 break-words">
                    Emtricitabina + Tenofovir alafenamida
                  </p>
                  <p className="text-black/50 text-xs sm:text-sm md:text-base font-bold">
                    30 tabletas
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-[#00D856]/15 self-start sm:self-auto flex-shrink-0">
                <Circle className="w-2 h-2 fill-[#00D856] text-[#00D856]" />
                <span className="text-[#00D856] text-xs sm:text-sm font-medium">
                  Activo
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
              <div>
                <p className="text-[#89898A] text-xs sm:text-sm md:text-base mb-1">
                  Dosis
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  1 tableta diaria
                </p>
              </div>
              <div>
                <p className="text-[#89898A] text-xs sm:text-sm md:text-base mb-1">
                  Prescrito en
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  15 de Marzo del 2026
                </p>
              </div>
              <div>
                <p className="text-[#89898A] text-xs sm:text-sm md:text-base mb-1">
                  Siguiente refill
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  20 de mayo del 2026
                </p>
              </div>
            </div>

            <button
              onClick={() => router.push("/detalle-prescripciones")}
              className="w-full h-10 sm:h-[38px] rounded-lg border border-black/50 text-[#89898A] text-sm font-medium hover:bg-black/5 transition-colors cursor-pointer"
            >
              Ver detalles
            </button>
          </div>

          <div className="w-full">
            <h3 className="text-sm sm:text-base md:text-lg font-medium text-black mb-4 sm:mb-6">
              Información de entrega
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <div>
                <p className="text-[#89898A] text-xs sm:text-sm md:text-base mb-1">
                  Próxima entrega
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  25 de mayo del 2026
                </p>
              </div>
              <div>
                <p className="text-[#89898A] text-xs sm:text-sm md:text-base mb-1">
                  Dirección del envío
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  25 de mayo del 2026
                </p>
              </div>
              <div>
                <p className="text-[#89898A] text-xs sm:text-sm md:text-base mb-1">
                  Método de envío
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  Estándar(2-3 días)
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}