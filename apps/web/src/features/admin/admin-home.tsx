import { BadgeDollarSign, UserCheck } from "lucide-react";
import Link from "next/link";
import { ADMIN_CONSULTATION_PRICE_PATH, ADMIN_PROFESSIONALS_PATH } from "./paths";

// Inicio del panel administrativo. Sin estadísticas: el backend aún no expone indicadores agregados.
export function AdminHome() {
  return (
    <div className="max-w-[960px]">
      <h1 className="text-black text-[26px] sm:text-[36px] font-medium">
        Administración de PEI
      </h1>
      <p className="text-[#6B6B6B] text-[16px] sm:text-[18px] mt-2">
        Gestiona la verificación de los profesionales y el precio de las consultas.
      </p>
      <div className="grid sm:grid-cols-2 gap-4 mt-8">
        <Link
          href={ADMIN_PROFESSIONALS_PATH}
          className="block bg-white rounded-xl border border-gray-200 p-6 hover:border-[#684DDE] transition"
        >
          <UserCheck size={28} className="text-[#684DDE]" aria-hidden="true" />
          <h2 className="text-black text-[18px] font-medium mt-4">
            Revisión de profesionales
          </h2>
          <p className="text-[#6B6B6B] text-[14px] mt-1">
            Revisa la identidad y la cédula profesional de los médicos.
          </p>
        </Link>
        <Link
          href={ADMIN_CONSULTATION_PRICE_PATH}
          className="block bg-white rounded-xl border border-gray-200 p-6 hover:border-[#684DDE] transition"
        >
          <BadgeDollarSign size={28} className="text-[#684DDE]" aria-hidden="true" />
          <h2 className="text-black text-[18px] font-medium mt-4">
            Precio de consulta
          </h2>
          <p className="text-[#6B6B6B] text-[14px] mt-1">
            Consulta y actualiza el precio global de las consultas.
          </p>
        </Link>
      </div>
    </div>
  );
}
