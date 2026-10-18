"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function Landing() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documentos, setDocumentos] = useState([
    {
      documento: "Lab Results",
      tipo: "Resultado de laboratorio",
      fecha: "22 de abril del 2026",
    },
    {
      documento: "VIH certificado",
      tipo: "Resultado de laboratorio",
      fecha: "25 de abril del 2026",
    },
    {
      documento: "Prescripción Truvada",
      tipo: "Receta médica",
      fecha: "15 de marzo del 2026",
    },
    {
      documento: "Notas del doctor(Consulta)",
      tipo: "Notas médicas",
      fecha: "15 de marzo del 2026",
    },
    {
      documento: "VIH certificado",
      tipo: "Resultado de laboratorio",
      fecha: "25 de abril del 2026",
    },
    {
      documento: "Prescripción Truvada",
      tipo: "Receta médica",
      fecha: "15 de marzo del 2026",
    },
    {
      documento: "Notas del doctor(Consulta)",
      tipo: "Notas médicas",
      fecha: "15 de marzo del 2026",
    },
  ]);

  const tabs = [
    { label: "General", path: "/historial-general" },
    { label: "Información médica", path: "/expediente" },
    { label: "Resultados de laboratorio", path: "/laboratorio" },
    { label: "Documentos", path: null },
    { label: "Historial", path: "/historial-medico" },
  ];

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    const hoy = new Date();
    const meses = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ];
    const fechaFormateada = `${hoy.getDate()} de ${meses[hoy.getMonth()]} del ${hoy.getFullYear()}`;

    const nuevoDocumento = {
      documento: file.name,
      tipo: "Documento subido",
      fecha: fechaFormateada,
    };

    setDocumentos((prev) => [nuevoDocumento, ...prev]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-white pb-12 sm:pb-16">

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />

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
          Expediente médico
        </h1>
        <p className="text-[#535353] text-sm sm:text-base md:text-lg lg:text-[24px] font-light leading-snug sm:leading-normal md:leading-[30px] lg:leading-[32px] mt-1">
          Ve detalladamente todo tu historial medico y documentos
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
                tab.label === "Documentos"
                  ? "border-b-2 border-[#7355F7]"
                  : ""
              }`}
            >
              {tab.label}
            </span>
          ))}
        </div>

        <div className="mt-6 sm:mt-8 md:mt-10 w-full bg-[#E6E6E6]/30 rounded-2xl p-4 sm:p-6 md:px-8 md:py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div>
            <h3 className="text-black text-base sm:text-lg md:text-[20px] font-medium">
              Documentos
            </h3>
            <p className="text-[#717171] text-sm sm:text-base md:text-[18px] font-normal mt-1">
              Ve y descarga tus documentos médicos
            </p>
          </div>

          <button
            onClick={handleUploadClick}
            className="w-full sm:w-[262px] h-11 sm:h-12 md:h-[49px] bg-[#7355F7] rounded-lg text-white text-sm sm:text-base font-normal hover:bg-[#6244d9] transition cursor-pointer flex-shrink-0"
          >
            Subir documentos
          </button>
        </div>

        <div className="mt-6 sm:mt-8 md:mt-10 w-full">

          <div className="hidden sm:block">
            <div className="grid grid-cols-4 gap-3 md:gap-4 px-4 md:px-8 pb-4">
              <span className="text-[#89898A] text-sm md:text-base lg:text-[18px] font-normal">Documento</span>
              <span className="text-[#89898A] text-sm md:text-base lg:text-[18px] font-normal">Tipo</span>
              <span className="text-[#89898A] text-sm md:text-base lg:text-[18px] font-normal">Fecha</span>
              <span className="text-[#89898A] text-sm md:text-base lg:text-[18px] font-normal text-center">Acción</span>
            </div>

            <div className="bg-[#E6E6E6]/30 rounded-2xl">
              {documentos.map((doc, index) => (
                <div
                  key={index}
                  className={`grid grid-cols-4 gap-3 md:gap-4 px-4 md:px-8 py-4 md:py-6 items-center ${
                    index !== documentos.length - 1
                      ? "border-b border-gray-300"
                      : ""
                  }`}
                >
                  <span className="text-black text-sm md:text-base lg:text-[18px] font-normal break-words">
                    {doc.documento}
                  </span>
                  <span className="text-black text-sm md:text-base lg:text-[18px] font-normal break-words">
                    {doc.tipo}
                  </span>
                  <span className="text-black text-sm md:text-base lg:text-[18px] font-normal break-words">
                    {doc.fecha}
                  </span>
                  <button className="flex justify-center cursor-pointer">
                    <Download className="w-5 h-5 md:w-6 md:h-6 lg:w-[30px] lg:h-[30px] text-[#89898A] hover:text-[#7355F7] transition" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="sm:hidden flex flex-col gap-3">
            {documentos.map((doc, index) => (
              <div
                key={index}
                className="bg-[#E6E6E6]/30 rounded-2xl p-4 flex items-start justify-between gap-3"
              >
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <p className="text-black text-sm font-medium break-words">
                    {doc.documento}
                  </p>
                  <p className="text-[#717171] text-xs font-normal break-words">
                    {doc.tipo}
                  </p>
                  <p className="text-[#717171] text-[11px] font-normal">
                    {doc.fecha}
                  </p>
                </div>
                <button className="flex-shrink-0 pt-1 cursor-pointer">
                  <Download className="w-5 h-5 text-[#89898A] hover:text-[#7355F7] transition" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}