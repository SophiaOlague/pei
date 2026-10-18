import { RequireSession } from "@/features/components/require-session";
import { CompleteRegistration } from "@/features/registration/complete-registration";

// Solo exige sesión: el propio paso consulta el estado del registro (sin RequireRegistration, para no
// crear un bucle de redirecciones).
export default function CompletarRegistroPage() {
  return (
    <RequireSession>
      <CompleteRegistration />
    </RequireSession>
  );
}
