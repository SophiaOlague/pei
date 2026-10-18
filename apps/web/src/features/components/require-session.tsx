"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { authClient } from "@/lib/auth-client";

// Redirección de la interfaz: sin sesión, no se muestran estas pantallas.
// La protección de los datos la hace el backend (SessionGuard responde 401).
export function RequireSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !data) router.replace("/login");
  }, [isPending, data, router]);

  if (isPending || !data) return null;
  return <>{children}</>;
}
