import type { ReactNode } from "react";
import { AdminShell } from "@/features/admin/admin-shell";
import { RequireAdmin } from "@/features/admin/require-admin";
import { RequireSession } from "@/features/components/require-session";

// Panel administrativo. Sin RequireRegistration: el registro de pacientes no aplica al administrador.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSession>
      <RequireAdmin>
        <AdminShell>{children}</AdminShell>
      </RequireAdmin>
    </RequireSession>
  );
}
