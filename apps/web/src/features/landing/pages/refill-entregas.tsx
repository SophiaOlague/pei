"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, XCircle } from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function RefillEntregas() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Refill y entregas");
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ width: 0, left: 0 });

  const [isEditing, setIsEditing] = useState(false);
  const [metodoEnvio] = useState("Estándar (2-3 días)");

  const [calle, setCalle] = useState("Calle Libertad");
  const [numero, setNumero] = useState("123");
  const [colonia, setColonia] = useState("Fracc. Las Golondrinas");
  const [codigoPostal, setCodigoPostal] = useState("34280");

  const [tempCalle, setTempCalle] = useState(calle);
  const [tempNumero, setTempNumero] = useState(numero);
  const [tempColonia, setTempColonia] = useState(colonia);
  const [tempCodigoPostal, setTempCodigoPostal] = useState(codigoPostal);

  const [refillCancelado, setRefillCancelado] = useState(false);

  const tabs = [
    { label: "Activo", path: "/mis-prescripciones" },
    { label: "Historial", path: "/historial-prescripciones" },
    { label: "Refill y entregas", path: null },
  ];

  const direccionCompleta = `CP. ${codigoPostal} ${calle} ${numero}, ${colonia}`;

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

  const handleEditClick = () => {
    setTempCalle(calle);
    setTempNumero(numero);
    setTempColonia(colonia);
    setTempCodigoPostal(codigoPostal);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setTempCalle(calle);
    setTempNumero(numero);
    setTempColonia(colonia);
    setTempCodigoPostal(codigoPostal);
    setIsEditing(false);
  };

  const handleSave = () => {
    setCalle(tempCalle);
    setNumero(tempNumero);
    setColonia(tempColonia);
    setCodigoPostal(tempCodigoPostal);
    setIsEditing(false);
  };

  const handleCancelRefill = () => {
    const confirmar = window.confirm(
      "¿Estás seguro de que quieres cancelar tu refill? Esta acción no se puede deshacer."
    );
    if (confirmar) {
      setRefillCancelado(true);
    }
  };

  const isFormValid =
    tempCalle.trim() !== "" &&
    tempNumero.trim() !== "" &&
    tempColonia.trim() !== "" &&
    tempCodigoPostal.trim() !== "";

  const inputClass =
    "w-full text-sm sm:text-base text-black bg-white border border-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-[#7355F7]";

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
              Refill y entregas
            </h1>
            <p className="text-black/50 text-sm sm:text-base">
              Consulta la fecha de tu próxima entrega de medicamento
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

          {refillCancelado ? (
            <div
              className="w-full rounded-2xl p-6 sm:p-8 md:p-10 flex flex-col items-center justify-center gap-4 text-center"
              style={{
                backgroundColor: "rgba(230, 230, 230, 0.3)",
                borderRadius: "12px",
                minHeight: "300px",
              }}
            >
              <XCircle className="w-12 h-12 sm:w-14 sm:h-14 text-[#B7282E]" strokeWidth={1.5} />
              <h2 className="text-black text-xl sm:text-2xl md:text-3xl font-medium">
                Refill cancelado
              </h2>
              <p className="text-black/50 text-sm sm:text-base max-w-md">
                Tu próxima entrega y el medicamento Descovy han sido cancelados.
                Si esto fue un error, contacta con tu médico o el equipo de soporte.
              </p>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 lg:gap-16">

              <div className="w-full lg:w-1/2 flex flex-col">
                <div className="mb-5 sm:mb-6">
                  <h2 className="text-base sm:text-lg font-regular text-black mb-2">
                    Mi próxima entrega
                  </h2>
                  <p className="text-black/50 text-sm sm:text-base">
                    25 de mayo del 2026
                  </p>
                </div>

                <div className="mb-5 sm:mb-6">
                  <h3 className="text-base sm:text-lg font-regular text-black mb-2">
                    Descovy
                  </h3>
                  <p className="text-black/50 text-sm sm:text-base break-words">
                    Emtricitabina + Tenofovir alafenamida
                  </p>
                  <p className="text-black/50 text-sm sm:text-base font-bold">
                    30 tabletas
                  </p>
                </div>
              </div>

              <div className="w-full lg:w-1/2">
                <div
                  className="w-full rounded-2xl p-4 sm:p-6 md:p-8 mb-4 sm:mb-6"
                  style={{
                    backgroundColor: "rgba(230, 230, 230, 0.3)",
                    borderRadius: "12px",
                  }}
                >
                  <h3 className="text-sm sm:text-base md:text-lg font-medium text-black mb-4">
                    Datos de envío
                  </h3>

                  <div className="mb-5 sm:mb-6">
                    <p className="text-black/50 text-xs sm:text-sm md:text-base mb-1">
                      Dirección del envío
                    </p>
                    {isEditing ? (
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="text-black/50 text-xs sm:text-sm mb-1 block">
                            Calle
                          </label>
                          <input
                            type="text"
                            value={tempCalle}
                            onChange={(e) => setTempCalle(e.target.value)}
                            placeholder="Ej. Calle Libertad"
                            className={inputClass}
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <div className="w-full sm:w-1/2">
                            <label className="text-black/50 text-xs sm:text-sm mb-1 block">
                              Número
                            </label>
                            <input
                              type="text"
                              value={tempNumero}
                              onChange={(e) => setTempNumero(e.target.value)}
                              placeholder="Ej. 123"
                              className={inputClass}
                            />
                          </div>
                          <div className="w-full sm:w-1/2">
                            <label className="text-black/50 text-xs sm:text-sm mb-1 block">
                              Código postal
                            </label>
                            <input
                              type="text"
                              value={tempCodigoPostal}
                              onChange={(e) => setTempCodigoPostal(e.target.value)}
                              placeholder="Ej. 34280"
                              className={inputClass}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-black/50 text-xs sm:text-sm mb-1 block">
                            Colonia
                          </label>
                          <input
                            type="text"
                            value={tempColonia}
                            onChange={(e) => setTempColonia(e.target.value)}
                            placeholder="Ej. Fracc. Las Golondrinas"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-black text-sm sm:text-base font-regular break-words">
                        {direccionCompleta}
                      </p>
                    )}
                  </div>

                  <div className="mb-5 sm:mb-6">
                    <p className="text-black/50 text-xs sm:text-sm md:text-base mb-1">
                      Método de envío
                    </p>
                    <p className="text-black text-sm sm:text-base font-regular">
                      {metodoEnvio}
                    </p>
                  </div>

                  {isEditing ? (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleSave}
                        disabled={!isFormValid}
                        className={`w-full h-12 sm:h-14 md:h-[55px] rounded-lg text-white text-sm sm:text-base font-medium transition-opacity flex items-center justify-center ${
                          isFormValid
                            ? "hover:opacity-90 cursor-pointer"
                            : "opacity-40 cursor-not-allowed"
                        }`}
                        style={{ backgroundColor: "#7355F7" }}
                      >
                        Guardar cambios
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="w-full h-12 sm:h-14 md:h-[55px] rounded-lg border border-black/40 text-black/60 text-sm sm:text-base font-medium hover:bg-black/5 transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleEditClick}
                      className="w-full h-12 sm:h-14 md:h-[55px] rounded-lg text-white text-sm sm:text-base font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2"
                      style={{ backgroundColor: "#7355F7" }}
                    >
                      <Pencil className="w-4 h-4" />
                      Modificar mis datos de envío
                    </button>
                  )}
                </div>

                <button
                  onClick={handleCancelRefill}
                  className="w-full h-12 sm:h-14 md:h-[55px] rounded-lg text-black/40 text-sm sm:text-base font-medium hover:bg-black/5 transition-colors cursor-pointer"
                  style={{ border: "1px solid rgba(0, 0, 0, 0.4)" }}
                >
                  Cancelar refill
                </button>
              </div>

            </div>
          )}

        </div>
      </main>
    </div>
  );
}