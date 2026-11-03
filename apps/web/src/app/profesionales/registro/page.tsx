import { RequireSession } from "@/features/components/require-session";
import { DoctorPortal } from "@/features/professionals/doctor-portal";
import { PROFESSIONAL_ACCESS_PATH } from "@/features/professionals/paths";

// Solo exige sesión: el portal decide por el rol que informa el backend.
export default function RegistroProfesionalPage() {
  return (
    <RequireSession redirectTo={PROFESSIONAL_ACCESS_PATH}>
      <DoctorPortal />
    </RequireSession>
  );
}
