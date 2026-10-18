import Image from "next/image";
import { UserMenu } from "@/features/components/user-menu";

// Header de paciente (mismo que agendar-cita).
export function PatientNav() {
  const link =
    "text-[14px] sm:text-[16px] lg:text-[20px] text-[#535353] hover:text-[#7355F7] transition hidden sm:block";
  return (
    <nav className="flex items-center justify-between px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-200">
      <Image
        src="/logo.svg"
        alt="Logo"
        width={48}
        height={48}
        className="object-contain"
      />
      <div className="flex items-center gap-3 sm:gap-6 lg:gap-8">
        <a href="/landing-inicio#por-que-prep" className={link}>
          Sobre PrEP
        </a>
        <a href="/landing-inicio" className={link}>
          Inicio
        </a>
        <a href="/landing-inicio#como-funciona" className={link}>
          Sobre nosotros
        </a>
      </div>
      <UserMenu />
    </nav>
  );
}
