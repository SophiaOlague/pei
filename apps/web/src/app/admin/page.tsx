import { AdminHome } from "@/features/admin/admin-home";
import { RequireSession } from "@/features/components/require-session";

// Pantalla provisional del administrador. Sin RequireRegistration: el registro de pacientes no aplica.
export default function AdminPage() {
  return (
    <RequireSession>
      <AdminHome />
    </RequireSession>
  );
}
