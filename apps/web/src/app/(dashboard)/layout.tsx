import type { ReactNode } from "react";
import { RequireRegistration } from "@/features/components/require-registration";
import { RequireSession } from "@/features/components/require-session";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireSession>
      <RequireRegistration>{children}</RequireRegistration>
    </RequireSession>
  );
}
