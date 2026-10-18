"use client";

import Image from "next/image";
import { Circle } from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function DetallePrescripciones() {
  return (
    <div className="min-h-screen bg-white font-sans">

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
        <div className="max-w-7xl mx-auto">

          <div className="mb-8 sm:mb-10">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-black mb-3">
              Mis prescripciones
            </h1>
            <p className="text-black/50 text-sm sm:text-base">
              Ve tus prescripciones actuales y pasadas
            </p>
          </div>

          <div
            className="w-full p-6 sm:p-8 mb-8"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.3)",
              borderRadius: "12px",
            }}
          >
            <div className="flex flex-col sm:flex-row items-start justify-between gap-6 mb-8">
              <div className="flex items-start gap-6">
                <div className="w-32 h-20 sm:w-40 sm:h-24 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <img src="/medicamento.png" alt="Descovy" className="w-full h-full object-contain" />
                </div>

                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-black mb-2">
                    Descovy
                  </h3>
                  <p className="text-black/50 text-sm sm:text-base mb-2">
                    Emtricitabina + Tenofovir alafenamida
                  </p>
                  <p className="text-black/50 text-sm sm:text-base font-bold">
                    30 tabletas
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#00D856]/15 self-start sm:self-auto">
                <Circle className="w-2 h-2 fill-[#00D856] text-[#00D856]" />
                <span className="text-[#00D856] text-sm font-medium">
                  Activo
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
              <div>
                <p className="text-[#89898A] text-sm sm:text-base mb-1">
                  Dosis
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  1 tableta diaria
                </p>
              </div>
              <div>
                <p className="text-[#89898A] text-sm sm:text-base mb-1">
                  Prescrito en
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  15 de Marzo del 2026
                </p>
              </div>
              <div>
                <p className="text-[#89898A] text-sm sm:text-base mb-1">
                  Siguiente refill
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  20 de mayo del 2026
                </p>
              </div>
            </div>

            <div className="border-t border-black/10 pt-6 sm:pt-8">
              <p className="text-black/70 text-sm sm:text-base leading-relaxed mb-4 sm:mb-5">
                Ambos principios activos son inhibidores de la transcriptasa inversa análogos de los nucleósidos (ITRN). Bloquean la enzima que el virus necesita para replicarse dentro de las células del sistema inmunitario (los linfocitos T CD4). La versión alafenamida (TAF) es una formulación más moderna que permite lograr altas concentraciones de fármaco dentro de las células objetivo con dosis más bajas en sangre, reduciendo el impacto en los riñones y los huesos comparado con versiones anteriores (como el tenofovir disoproxilo/TDF).
              </p>
              <p className="text-black/70 text-sm sm:text-base leading-relaxed mb-4 sm:mb-5">
                Debe tomarse aproximadamente a la misma hora todos los días. La adherencia es crucial para evitar que el virus genere resistencia al medicamento.
              </p>
              <p className="text-black/70 text-sm sm:text-base leading-relaxed">
                Si saltas dosis, la cantidad de medicamento en tu sangre baja. Esto le da al virus la oportunidad de mutar y hacerse resistente, lo que significa que este fármaco (y otros similares) podría dejar de funcionarte para siempre.
              </p>
            </div>
          </div>

          <div className="w-full">
            <h3 className="text-base sm:text-lg font-medium text-black mb-6">
              Información de entrega
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-[#89898A] text-sm sm:text-base mb-1">
                  Próxima entrega
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  25 de mayo del 2026
                </p>
              </div>
              <div>
                <p className="text-[#89898A] text-sm sm:text-base mb-1">
                  Dirección del envío
                </p>
                <p className="text-black text-sm sm:text-base font-regular">
                  25 de mayo del 2026
                </p>
              </div>
              <div>
                <p className="text-[#89898A] text-sm sm:text-base mb-1">
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