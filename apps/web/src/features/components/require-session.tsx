"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { authClient } from "@/lib/auth-client";

// Redirección de la interfaz: sin sesión, no se muestran estas pantallas.
// La protección de los datos la hace el backend (SessionGuard responde 401).
export function RequireSession({
  children,
  redirectTo = "/login",
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !data) router.replace(redirectTo);
  }, [isPending, data, router, redirectTo]);

  if (isPending || !data) return null;
  return <>{children}</>;
}
