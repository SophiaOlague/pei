"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function HistorialPrescripciones() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Historial");
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 });

  const tabs = [
    { label: "Activo", path: "/mis-prescripciones" },
    { label: "Historial", path: null },
    { label: "Refill y entregas", path: "/refill-entregas" },
  ];

  const historial = [
    { fecha: "15 de mayo del 2026", medicamento: "Truvada - 30 días" },
    { fecha: "15 de mayo del 2026", medicamento: "Truvada - 30 días" },
    { fecha: "15 de mayo del 2026", medicamento: "Truvada - 30 días" },
    { fecha: "15 de mayo del 2026", medicamento: "Truvada - 30 días" },
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
              Mi historial de prescripciones
            </h1>
            <p className="text-black/50 text-sm sm:text-base">
              Encuentra todas tus prescripciones
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

          <div className="w-full flex flex-col">
            {historial.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 py-4 sm:py-5 border-b border-gray-200"
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#7355F7]/10 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-[#7355F7]" strokeWidth={1.5} />
                  </div>

                  <div className="min-w-0">
                    <p className="text-black/50 text-xs sm:text-sm mb-1">
                      {item.fecha}
                    </p>
                    <p className="text-black text-sm sm:text-base font-medium break-words">
                      {item.medicamento}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => router.push("/detalle-prescripciones")}
                  className="text-black/50 text-xs sm:text-sm md:text-base hover:text-black transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                >
                  Ver detalles
                </button>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}