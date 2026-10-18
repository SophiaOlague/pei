import type { ReactNode } from "react";
import { RequireSession } from "@/features/components/require-session";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <RequireSession>{children}</RequireSession>;
}
