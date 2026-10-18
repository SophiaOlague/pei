"use client";

import { UserCircle } from "lucide-react";
import Image from "next/image";
import { UserMenu } from "@/features/components/user-menu";
import { authClient } from "@/lib/auth-client";

// Solo muestra lo que da la sesión de Better Auth (nombre y correo).
// Los datos del perfil de paciente (GET/PATCH /me/profile) se conectan en I3.
const PENDIENTE = "Pendiente de conectar";

export function Landing() {
  const { data } = authClient.useSession();
  const nombre = data?.user.name ?? "";
  const correo = data?.user.email ?? "";

  const labelClass =
    "text-sm sm:text-base md:text-[18px] font-light text-[#999999]";
  const valueClass =
    "text-sm sm:text-base md:text-[18px] font-light text-[#000000] break-words";
  const pendingClass =
    "text-sm sm:text-base md:text-[18px] font-light text-[#B0B0B0] italic";

  return (
    <div className="min-h-screen bg-white pb-8 sm:pb-12">
      {/* HEADER */}
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

      <div className="px-4 sm:px-6 md:px-8 max-w-7xl mx-auto">
        <div className="flex items-start mt-4 sm:mt-6 md:mt-8 lg:mt-10 mb-4 sm:mb-6 md:mb-8 lg:mb-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-[48px] font-medium leading-tight sm:leading-snug lg:leading-[56px] text-[#000000]">
            Mi perfil
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 md:gap-8 lg:gap-12 mb-6 sm:mb-8">
          <div className="flex-shrink-0">
            <UserCircle
              className="w-28 h-28 sm:w-36 sm:h-36 md:w-44 md:h-44 lg:w-[191px] lg:h-[191px] text-[#C9BEFB]"
              strokeWidth={1}
            />
          </div>

          <div className="flex-1 flex flex-col items-center sm:items-start gap-4 sm:gap-6 w-full">
            <div className="flex flex-col gap-1 text-center sm:text-left">
              <h2 className="text-lg sm:text-xl md:text-[20px] font-medium text-[#000000]">
                {nombre}
              </h2>
              <p className="text-sm sm:text-base md:text-[18px] font-light text-[#535353] break-all">
                {correo}
              </p>
            </div>
          </div>
        </div>

        {/* Información personal */}
        <div className="w-full bg-[#F8F8F8] rounded-2xl p-4 sm:p-6 md:p-8 mb-4 sm:mb-6">
          <h3 className="text-base sm:text-lg font-medium text-[#000000] mb-4 sm:mb-6">
            Información personal
          </h3>

          <div className="flex flex-col md:flex-row justify-between gap-4 sm:gap-6">
            <div className="flex flex-col gap-3 sm:gap-4 flex-1">
              <div>
                <p className={labelClass}>Nombre:</p>
                <p className={valueClass}>{nombre}</p>
              </div>
              <div>
                <p className={labelClass}>Número:</p>
                <p className={pendingClass}>{PENDIENTE}</p>
              </div>
              <div>
                <p className={labelClass}>Dirección:</p>
                <p className={pendingClass}>{PENDIENTE}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:gap-4 flex-1 md:items-end md:text-right">
              <div className="w-full">
                <p className={labelClass}>Fecha de nacimiento:</p>
                <p className={pendingClass}>{PENDIENTE}</p>
              </div>
              <div className="w-full">
                <p className={labelClass}>Contacto de emergencia:</p>
                <p className={pendingClass}>{PENDIENTE}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Seguridad */}
        <div className="w-full bg-[#F8F8F8] rounded-2xl p-4 sm:p-6 md:p-8">
          <h3 className="text-base sm:text-lg font-medium text-[#000000] mb-4 sm:mb-6">
            Seguridad
          </h3>

          <div className="flex flex-col gap-3 sm:gap-6">
            <div>
              <p className={labelClass}>Correo electrónico:</p>
              <p className={`${valueClass} break-all`}>{correo}</p>
              {/* El backend no permite cambiar el correo (/change-email desactivado, DP-12). */}
              <p className="text-[13px] text-[#999999] mt-1">
                El correo no se puede cambiar desde la aplicación.
              </p>
            </div>
            <div>
              <p className={labelClass}>Contraseña:</p>
              <p className={valueClass}>**********</p>
              <p className="text-[13px] text-[#999999] mt-1">
                Para cambiarla, usa «¿Olvidaste tu contraseña?» al iniciar
                sesión.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
