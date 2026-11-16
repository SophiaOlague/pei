import { AlertCircle } from "lucide-react";
import Link from "next/link";
import type { IdentityRequirement } from "@/lib/api";
import { identityFromBookingPath } from "./paths";

// Requisito de identidad para reservar (DP-8), tomado de GET /me/registration-status (`missing`) o de un
// RegistrationIncompleteError. Solo informa y dirige a la verificación, conservando el médico elegido para volver;
// no habilita ni bloquea nada por su cuenta (la reserva la autoriza el backend).
export const IDENTITY_REQUIREMENT_MESSAGE: Record<IdentityRequirement, string> =
  {
    identity_submission:
      "Para reservar necesitas verificar tu identidad con tu INE.",
    identity_resubmission:
      "Tu verificación de identidad fue rechazada. Envía de nuevo tu INE para poder reservar.",
    identity_review:
      "Tu INE está en revisión. Podrás reservar cuando tu identidad sea aprobada.",
  };

export const IDENTITY_REQUIREMENT_ACTION: Record<IdentityRequirement, string> =
  {
    identity_submission: "Verificar mi identidad",
    identity_resubmission: "Reenviar mi INE",
    identity_review: "Ver estado de mi verificación",
  };

export function IdentityRequirementNotice({
  requirement,
  doctorProfileId,
}: {
  requirement: IdentityRequirement;
  doctorProfileId?: string | null;
}) {
  return (
    <div
      role="alert"
      className="mt-6 w-full bg-[#E3DDFD] rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6"
    >
      <AlertCircle
        className="w-8 h-8 text-[#7355F7] flex-shrink-0"
        aria-hidden="true"
      />
      <p className="text-black text-sm sm:text-base md:text-[18px] flex-1">
        {IDENTITY_REQUIREMENT_MESSAGE[requirement]}
      </p>
      <Link
        href={identityFromBookingPath(doctorProfileId)}
        className="text-sm sm:text-base md:text-[18px] font-medium text-[#7355F7] hover:underline transition w-fit"
      >
        {IDENTITY_REQUIREMENT_ACTION[requirement]}
      </Link>
    </div>
  );
}
