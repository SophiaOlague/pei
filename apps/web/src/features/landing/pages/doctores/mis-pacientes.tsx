"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Home,
  ChevronDown,
  Search,
  MessageSquare,
} from "lucide-react";

export function MisPacientes() {
  const [busqueda, setBusqueda] = useState("");

  // Datos de pacientes (vendrán del backend)
  const pacientes = [
    {
      id: "3456787654",
      nombre: "Salomon Díaz",
      ultimaCita: "05 Mayo 2025",
      estado: "Activo-Truvada",
      foto: "/persona-grande.jpg",
    },
    {
      id: "3456787654",
      nombre: "Salomon Díaz",
      ultimaCita: "05 Mayo 2025",
      estado: "Activo-Truvada",
      foto: "/persona-grande.jpg",
    },
    {
      id: "3456787654",
      nombre: "Salomon Díaz",
      ultimaCita: "05 Mayo 2025",
      estado: "Activo-Truvada",
      foto: "/persona-grande.jpg",
    },
    {
      id: "3456787654",
      nombre: "Salomon Díaz",
      ultimaCita: "05 Mayo 2025",
      estado: "Activo-Truvada",
      foto: "/persona-grande.jpg",
    },
    {
      id: "3456787654",
      nombre: "Salomon Díaz",
      ultimaCita: "05 Mayo 2025",
      estado: "Activo-Truvada",
      foto: "/persona-grande.jpg",
    },
  ];

  // Filtrar pacientes por búsqueda
  const pacientesFiltrados = pacientes.filter((paciente) =>
    paciente.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    paciente.id.includes(busqueda)
  );

  return (
    <div className="min-h-screen bg-white font-sans">
      
      {/* ============================================ */}
      {/* HEADER */}
      {/* ============================================ */}
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
            Citas
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

      {/* ============================================ */}
      {/* CONTENIDO PRINCIPAL */}
      {/* ============================================ */}
      <main className="px-6 sm:px-8 md:px-10 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto">

          {/* Título y descripción */}
          <div className="mb-8 sm:mb-10">
            <h1 className="!text-[40px] font-medium text-black mb-2">
              Mis pacientes
            </h1>
            <p className="!text-[20px] font-regular text-black/50">
              Gestor de base de pacientes.
            </p>
          </div>

          {/* ============================================ */}
          {/* BARRA DE BÚSQUEDA */}
          {/* ============================================ */}
          <div className="mb-8">
            <div
              className="w-full sm:w-[634px] h-[42px] flex items-center gap-3 px-4"
              style={{
                border: "1px solid rgba(0, 0, 0, 0.3)",
                borderRadius: "10px",
              }}
            >
              <Search className="w-5 h-5 text-black/50 flex-shrink-0" />
              <input
                type="text"
                placeholder="Buscar paciente..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full text-[20px] font-regular text-black/50 placeholder-black/50 focus:outline-none bg-transparent"
              />
            </div>
          </div>

          {/* ============================================ */}
          {/* ENCABEZADO DE LA TABLA */}
          {/* ============================================ */}
          <div
            className="w-full hidden sm:grid grid-cols-12 gap-4 px-6 py-3 mb-2"
            style={{
              backgroundColor: "rgba(230, 230, 230, 0.5)",
              borderRadius: "10px",
            }}
          >
            <div className="col-span-3">
              <span className="text-black !text-[18px] font-regular">
                Paciente
              </span>
            </div>
            <div className="col-span-3">
              <span className="text-black !text-[18px] font-regular">
                Última cita
              </span>
            </div>
            <div className="col-span-3">
              <span className="text-black !text-[18px] font-regular">
                Estado de tratamiento
              </span>
            </div>
            <div className="col-span-3">
              <span className="text-black text-[18px] font-regular">
                Acciones
              </span>
            </div>
          </div>

          {/* ============================================ */}
          {/* LISTA DE PACIENTES */}
          {/* ============================================ */}
          <div className="flex flex-col gap-4">
            {pacientesFiltrados.map((paciente, index) => (
              <div
                key={index}
                className="w-full p-6 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "12px",
                  minHeight: "115px",
                }}
              >
                {/* Paciente */}
                <div className="col-span-1 sm:col-span-3 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-300 flex items-center justify-center flex-shrink-0">
                    <img
                      src={paciente.foto}
                      alt={paciente.nombre}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-black text-[18px] font-regular mb-1">
                      {paciente.nombre}
                    </h3>
                    <p className="text-black/50 text-[18px] font-regular">
                      ID: {paciente.id}
                    </p>
                  </div>
                </div>

                {/* Última cita */}
                <div className="col-span-1 sm:col-span-3">
                  <span className="text-black !text-[18px] font-regular">
                    {paciente.ultimaCita}
                  </span>
                </div>

                {/* Estado de tratamiento */}
                <div className="col-span-1 sm:col-span-3">
                  <span className="text-black !text-[18px] font-regular">
                    {paciente.estado}
                  </span>
                </div>

                {/* Acciones */}
                <div className="col-span-1 sm:col-span-3 flex flex-col sm:flex-row gap-3">
                  <button
                    className="w-[260px] h-[40px] text-black text-[16px] font-regular hover:bg-black/5 transition-colors cursor-pointer"
                    style={{
                      border: "1px solid rgba(0, 0, 0, 0.35)",
                      borderRadius: "10px",
                    }}
                  >
                    Ver expediente
                  </button>
                  
                </div>
              </div>
            ))}

            {/* Si no hay resultados */}
            {pacientesFiltrados.length === 0 && (
              <div className="w-full p-8 text-center">
                <p className="text-black/50 text-lg">
                  No se encontraron pacientes con ese criterio de búsqueda.
                </p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}