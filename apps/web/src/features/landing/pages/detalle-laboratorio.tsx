"use client";

import Image from "next/image";
import { useRef } from "react";
import {
  Calendar as CalendarIcon,
  Syringe,
  Download,
  Droplet,
} from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function Landing() {
  const contentRef = useRef<HTMLDivElement>(null);

  const biometriaItems = [
    "Leucocitos",
    "Eritrocitos",
    "Hemoglobina",
    "Hematocrito",
    "Plaquetas",
  ];

  const infoEstudio = [
    { label: "Folio del estudio", value: "LAB-2026-00567" },
    { label: "Tipo de muestra", value: "Sangre venosa" },
    { label: "Fecha de toma", value: "16/05/2026-7:30 A.M." },
    { label: "Procesamiento", value: "16/05/2026-9:30 A.M." },
    { label: "Fecha de emisión", value: "28/07/2026-5:40 p.m." },
  ];

  const leyenda = [
    { color: "#63D77A", label: "Normal" },
    { color: "#E4CE6A", label: "Límite" },
    { color: "#CB3232", label: "Alto" },
    { color: "#3256CB", label: "Bajo" },
  ];

  const handleDownloadPDF = async () => {
    if (!contentRef.current) return;

    const html2canvas = (await import("html2canvas-pro")).default;
    const { jsPDF } = await import("jspdf");

    const canvas = await html2canvas(contentRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const imgProps = pdf.getImageProperties(imgData);
    const imgWidth = pdfWidth - 20;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

    const marginTop = 10;

    let heightLeft = imgHeight;
    let position = marginTop;

    pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight - 20;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + marginTop;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight - 20;
    }

    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(
        `Documento generado el ${new Date().toLocaleDateString("es-MX")} · Página ${i} de ${totalPages}`,
        pdfWidth / 2,
        pdfHeight - 5,
        { align: "center" }
      );
    }

    pdf.save(`resultado-laboratorio-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="min-h-screen bg-white pb-12 sm:pb-16">

      <nav
        data-html2canvas-ignore="true"
        className="flex items-center justify-between px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 border-b border-gray-200"
      >
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

      <div ref={contentRef} className="px-4 sm:px-6 md:px-8 max-w-[1350px] mx-auto mt-6 sm:mt-8 md:mt-10">

        <div data-html2canvas-ignore="true" className="hidden print:block mb-8 text-center">
          <h1 className="text-[28px] font-bold text-black mb-1">PEI</h1>
          <p className="text-sm text-[#717171]">Resultado de laboratorio</p>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">

          <div>
            <h1 className="text-black text-2xl sm:text-3xl md:text-4xl lg:text-[48px] font-medium leading-tight sm:leading-snug md:leading-[50px] lg:leading-[58px]">
              Resultado de laboratorio
            </h1>
            <p className="text-[#717171] text-sm sm:text-base md:text-lg lg:text-[18px] font-normal leading-snug sm:leading-normal md:leading-[26px] mt-2">
              Consulta los estudios y resultados de laboratorio
            </p>
          </div>

          <button
            data-html2canvas-ignore="true"
            onClick={handleDownloadPDF}
            className="w-full sm:w-[235px] h-11 sm:h-10 md:h-[38px] bg-[#7355F7] rounded-lg flex items-center justify-center gap-2 hover:bg-[#6244d9] transition cursor-pointer flex-shrink-0 self-start lg:self-end lg:mt-4"
          >
            <Download className="w-[18px] h-[18px] text-white" />
            <span className="text-white text-sm sm:text-base md:text-[16px] font-normal">
              Descargar PDF
            </span>
          </button>
        </div>

        <div className="mt-6 sm:mt-8 md:mt-12 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 lg:gap-8">

          <div>
            <h2 className="text-black text-base sm:text-lg md:text-[20px] font-medium">
              Oscar Wismichu
            </h2>
            <p className="text-[#717171] text-sm sm:text-base md:text-[18px] font-light mt-1 break-all">
              Osc2@gmail.com
            </p>
            <p className="text-[#717171] text-sm sm:text-base md:text-[18px] font-light mt-1">
              ID:12345
            </p>
          </div>

          <div className="flex items-start gap-3">
            <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6 text-[#7355F7] flex-shrink-0 mt-1" />
            <div>
              <p className="text-[#717171] text-sm sm:text-base md:text-[18px] font-normal">
                Fecha del estudio
              </p>
              <p className="text-black text-sm sm:text-base md:text-[16px] font-normal mt-1">
                15/07/2026
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Syringe className="w-5 h-5 sm:w-6 sm:h-6 text-[#7355F7] flex-shrink-0 mt-1" />
            <div>
              <p className="text-[#717171] text-sm sm:text-base md:text-[18px] font-normal">
                Laboratorio
              </p>
              <p className="text-black text-sm sm:text-base md:text-[16px] font-normal mt-1">
                Laboratorio Clínico
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 sm:mt-12 md:mt-16">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <h3 className="text-black text-base sm:text-lg md:text-[20px] font-medium">
              Resumen de laboratorio
            </h3>
            <div className="min-w-[90px] h-6 bg-[#ECECEC] rounded-md flex items-center justify-center gap-1 px-2">
              <div className="w-4 h-4 rounded-full bg-[#6ED861]"></div>
              <span className="text-xs sm:text-[13px] font-light text-[#535353]">Normal</span>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 lg:gap-8 mt-4">
            <p className="text-[#717171] text-sm sm:text-base md:text-[18px] font-normal">
              Los resultados del estudio se encuentran dentro del parámetro de referencia
            </p>

            <div className="flex flex-wrap items-center gap-3 sm:gap-4 md:gap-6">
              {leyenda.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-[#717171] text-xs sm:text-[13px] font-light">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 sm:mt-10 md:mt-12 flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-10 xl:gap-[80px]">

          <div className="w-full lg:max-w-[285px] bg-[#F8F8F8] rounded-2xl p-5 sm:p-6 flex flex-col">
            <div className="flex items-center gap-2">
              <Droplet className="w-5 h-5 sm:w-6 sm:h-6 text-[#7355F7] flex-shrink-0" />
              <h4 className="text-black text-base sm:text-lg md:text-[20px] font-normal">
                Biometría hemática
              </h4>
            </div>

            <div className="flex flex-col gap-1 mt-4">
              {biometriaItems.map((item, index) => (
                <p
                  key={index}
                  className="text-[#717171] text-sm sm:text-base md:text-[18px] font-normal"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>

          <div className="w-full lg:max-w-[474px] bg-[#F8F8F8] rounded-2xl p-5 sm:p-6">
            <h4 className="text-black text-base sm:text-lg md:text-[20px] font-medium">
              Información del estudio
            </h4>

            <div className="mt-5 sm:mt-6 flex flex-col gap-3">
              {infoEstudio.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between gap-3 sm:gap-4"
                >
                  <span className="text-[#717171] text-sm sm:text-base md:text-[18px] font-normal flex-shrink-0">
                    {item.label}
                  </span>
                  <span className="text-black text-sm sm:text-base md:text-[18px] font-normal text-right break-words min-w-0">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}