"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Home,
  Settings,
  MessageSquare,
  ChevronDown,
  Download,
} from "lucide-react";

export function NuevaRecetaGenerada() {
  const [showAllRecetas, setShowAllRecetas] = useState(false);

  // Datos de la receta (vendrán del backend)
  const receta = {
    folio: "1556987456",
    fechaEmision: "28 de julio del 2026",
    paciente: {
      nombre: "María Gómez",
      id: "12658967",
      edad: "28 años",
      genero: "Femenino",
    },
    medico: {
      nombre: "Dr. David Wismichu Díaz",
      especialidad: "Infectología",
      cedula: "6548975645",
    },
    prescripcion: {
      medicamento: "Truvada",
      presentacion: "Tableta 200mg",
      dosis: "1 tableta",
      frecuencia: "Diaria",
      duracion: "30 días",
      compuesto: "Emtricitabina / fumarato de tenofovir disoproxilo",
      instrucciones: "Tomar una tableta cada 24 horas, con o sin alimentos.",
    },
  };

  // Historial de recetas
  const historialRecetas = [
    { fecha: "15 de mayo del 2026", medicamento: "Truvada - 30 días" },
    { fecha: "10 de abril del 2026", medicamento: "Truvada - 30 días" },
    { fecha: "20 de enero del 2026", medicamento: "Truvada - 30 días" },
    { fecha: "15 de diciembre del 2025", medicamento: "Truvada - 30 días" },
    { fecha: "10 de noviembre del 2025", medicamento: "Truvada - 30 días" },
  ];

  const recetasAMostrar = showAllRecetas
    ? historialRecetas
    : historialRecetas.slice(0, 3);

  return (
    <div className="min-h-screen bg-white font-sans">
      
    



      <header className="flex items-center justify-between px-6 sm:px-8 md:px-10 py-4 sm:py-5 border-b border-gray-100">
        <div className="flex-shrink-0">
          <img
            src="/logo-pei-negro.png"
            alt="PEI"
            className="h-10 sm:h-12 w-auto"
          />
        </div>

        <nav className="hidden md:flex items-center gap-6 lg:gap-10">
          <Link
            href="/landing-inicio"
            className="flex items-center gap-2 text-black/50 font-regular text-xl hover:opacity-70 transition-opacity cursor-pointer"
          >
            
           Inicio
          </Link>

         <button className="flex items-center gap-2 text-black/50 font-regular text-xl hover:opacity-70 transition-opacity cursor-pointer">
           <Link
           href="/citas-perfil-doctor">
            Citas
</Link>
          </button>

         
        </nav>

        <div className="flex items-center gap-3 sm:gap-4">
          <button className="flex items-center gap-1 text-black font-regular text-xl hover:opacity-70 transition-opacity cursor-pointer">
            Oscar
            <ChevronDown className="w-5 h-5" />
          </button>

          <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
            <img
              src="/persona-grande.jpg"
              alt="Usuario"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </header>

      

      <main className="px-6 sm:px-8 md:px-10 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto">
          
          
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8 sm:mb-10">
            <div>
              <h1 className="!text-[40px] sm:text-4xl md:text-5xl font-medium text-black mb-3">
                Nueva receta generada
              </h1>
              <p className="text-black/50 !text-[20px] sm:text-base">
                La receta ha sido creada correctamente y enviada al paciente
              </p>
            </div>

            <button
              className="flex items-center justify-center gap-2 w-full sm:w-[235px] h-[38px] text-white !text-[18px] font-regular hover:opacity-90 transition-opacity cursor-pointer self-start sm:self-auto"
              style={{
                backgroundColor: "#7355F7",
                borderRadius: "5px",
              }}
            >
              <Download className="w-5 h-5" />
              Descargar PDF
            </button>
          </div>

         
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
            
            
            <div className="lg:col-span-2">
              <div
                className="w-full rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "12px",
                }}
              >
                
                <div className="p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    
                    <div className="flex items-start gap-4">
                    
                      <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                       
                        
                        <img src="/logo-pei-negro.png" alt="PEI" className="w-full h-full object-contain" /> 
                      </div>

                      
                      <div>
                        <h2 className="text-black !text-[20px] sm:text-lg font-regular">
                          Receta médica
                        </h2>
                        <p className="text-black/50 !text-[18px] sm:text-sm">
                          Folio: {receta.folio}
                        </p>
                      </div>
                    </div>

                   
                    <div className="sm:text-right">
                      <p className="text-black/50 !text-[20px] sm:text-sm mb-1">
                        Fecha de emisión:
                      </p>
                      <p className="text-black !text-[18px] sm:text-sm font-regular">
                        {receta.fechaEmision}
                      </p>
                    </div>
                  </div>
                </div>

                
                <div className="h-px bg-black/8"></div>

                
                <div className="relative">
                  
                  <div className="hidden sm:block absolute left-1/2 top-0 bottom-0 w-px bg-black/8"></div>

                  <div className="grid grid-cols-1 sm:grid-cols-2">
                  
                    <div className="p-6 sm:p-8">
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <p className="text-black/50 !text-[18px] sm:text-sm mb-1">
                            Paciente:
                          </p>
                          <p className="text-black !text-[18px] sm:text-base font-regular mb-4">
                            {receta.paciente.nombre}
                          </p>

                          <p className="text-black/50 !text-[18px] sm:text-sm mb-1">
                            ID:
                          </p>
                          <p className="text-black !text-[18px] sm:text-base font-regular mb-4">
                            {receta.paciente.id}
                          </p>

                          <p className="text-black/50 !text-[18px] sm:text-sm mb-1">
                            Edad:
                          </p>
                          <p className="text-black !text-[18px] sm:text-base font-regular">
                            {receta.paciente.edad}
                          </p>
                        </div>

                        <div>
                          <p className="text-black/50 !text-[18px] sm:text-sm mb-1">
                            Género:
                          </p>
                          <p className="text-black !text-[18px] sm:text-base font-regular">
                            {receta.paciente.genero}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Lado derecho - Médico */}
                    <div className="p-6 sm:p-8">
                      <p className="text-black/50 !text-[18px] sm:text-sm mb-1">
                        Médico tratante:
                      </p>
                      <p className="text-black !text-[18px] sm:text-base font-regular mb-4">
                        {receta.medico.nombre}
                      </p>

                      <p className="text-black/50 !text-[18px] sm:text-sm mb-1">
                        Especialidad:
                      </p>
                      <p className="text-black !text-[18px] sm:text-base font-regular mb-4">
                        {receta.medico.especialidad}
                      </p>

                      <p className="text-black/50 !text-[18px] sm:text-sm mb-1">
                        Cédula profesional:
                      </p>
                      <p className="text-black !text-[18px] sm:text-base font-regular">
                        {receta.medico.cedula}
                      </p>
                    </div>
                  </div>
                </div>

             
                <div className="h-px bg-black/8"></div>

               
                <div className="p-6 sm:p-8">
                  <h3 className="text-black !text-[20px] sm:text-lg font-medium mb-6">
                    Prescripción
                  </h3>

                
                  <div className="w-full">
                   


                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-3">
                      <p className="text-black/50 !text-[18px] sm:text-sm">Medicamento</p>
                      <p className="text-black/50 !text-[18px] sm:text-sm">Presentación</p>
                      <p className="text-black/50 !text-[18px] sm:text-sm">Dosis</p>
                      <p className="text-black/50 !text-[18px] sm:text-sm">Frecuencia</p>
                      <p className="text-black/50 !text-[18px] sm:text-sm">Duración</p>
                    </div>

                    {/* Línea divisoria */}
                    <div className="h-px bg-black/8 mb-3"></div>

                    {/* Datos */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      <div>
                        <p className="text-black !text-[18px] sm:text-base font-regular">
                          {receta.prescripcion.medicamento}
                        </p>
                        <p className="text-black/50 text-[10px] sm:text-xs mt-1">
                          {receta.prescripcion.compuesto}
                        </p>
                      </div>
                      <p className="text-black !text-[18px] sm:text-base font-regular">
                        {receta.prescripcion.presentacion}
                      </p>
                      <p className="text-black !text-[18px] sm:text-base font-regular">
                        {receta.prescripcion.dosis}
                      </p>
                      <p className="text-black !text-[18px] sm:text-base font-regular">
                        {receta.prescripcion.frecuencia}
                      </p>
                      <p className="text-black !text-[18px] sm:text-base font-regular">
                        {receta.prescripcion.duracion}
                      </p>
                    </div>
                  </div>
                </div>

                
                <div className="h-px bg-black/8"></div>

             
                <div className="p-6 sm:p-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                   
                    <div>
                      <h3 className="text-black !text-[20px] sm:text-lg font-medium mb-3">
                        Intrucciones para el paciente
                      </h3>
                      <p className="text-black/50 !text-[18px] sm:text-sm">
                        {receta.prescripcion.instrucciones}
                      </p>
                    </div>

                    <div className="flex flex-col items-center justify-end text-center">
                    
                      <div className="w-32 h-12 mb-2 flex items-center justify-center">
                       
                        <svg
                          className="w-full h-full text-black"
                          viewBox="0 0 100 40"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1"
                        >
                          <path d="M10 30 Q 30 10, 50 25 T 90 20" />
                        </svg>
                      </div>
                      <p className="text-black text-xs sm:text-sm font-medium">
                        {receta.medico.nombre}
                      </p>
                      <p className="text-black/50 text-[10px] sm:text-xs">
                        Cédula Profesional:
                      </p>
                      <p className="text-black/50 text-[10px] sm:text-xs">
                        {receta.medico.cedula}
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          



            <div className="lg:col-span-1 flex flex-col gap-8">
              
              {/* Resumen de la receta */}
              <div>
                <h2 className="text-black !text-[20px] sm:text-lg font-medium mb-6">
                  Resumen de la receta
                </h2>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-black/50 !text-[18px] sm:text-base font-regular">Medicamento</span>
                    <span className="text-black !text-[18px] sm:text-base font-regular">
                      {receta.prescripcion.medicamento}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-black/50 !text-[18px] sm:text-base font-regular">Dosis</span>
                    <span className="text-black !text-[18px] sm:text-base font-regular">
                      {receta.prescripcion.dosis}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-black/50 !text-[18px] sm:text-base font-regular">Frecuencia</span>
                    <span className="text-black !text-[18px] sm:text-base font-regular">
                      {receta.prescripcion.frecuencia}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-black/50 !text-[18px] sm:text-sm">Duración</span>
                    <span className="text-black !text-[18px] sm:text-sm font-regular">
                      {receta.prescripcion.duracion}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-black/50 !text-[18px] sm:text-sm">Fecha de emisión</span>
                    <span className="text-black !text-[18px] sm:text-sm font-regular">
                      28/07/2026
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-black/50 !text-[18px] sm:text-sm">Folio</span>
                    <span className="text-black !text-[18px] sm:text-sm font-regular">
                      {receta.folio}
                    </span>
                  </div>
                </div>
              </div>

              {/* Historial de recetas del paciente */}
              <div>
                <h2 className="text-black !text-[20px] sm:text-lg font-medium mb-6">
                  Historial de recetas del paciente
                </h2>

                <div className="flex flex-col">
                  {recetasAMostrar.map((item, index) => (
                    <div key={index}>
                      <div className="py-3">
                        <p className="text-black/50 !text-[18px] sm:text-base mb-1">
                          {item.fecha}
                        </p>
                        <p className="text-black !text-[18px] sm:text-sm font-regular">
                          {item.medicamento}
                        </p>
                      </div>
                      {index < recetasAMostrar.length - 1 && (
                        <div className="h-px bg-black/8"></div>
                      )}
                    </div>
                  ))}
                </div>

                {historialRecetas.length > 3 && (
                  <button
                    onClick={() => setShowAllRecetas(!showAllRecetas)}
                    className="mt-4 text-[#4A32B6] !text-[18px] font-regular hover:underline transition-all cursor-pointer"
                  >
                    {showAllRecetas ? "Ver menos" : "Ver todas las recetas"}
                  </button>
                )}
              </div>

            </div>

          </div>

        </div>
      </main>
    </div>
  );
}