"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthShell, btnCls } from "@/features/components/auth-shell";
import { COMPLETE_REGISTRATION_PATH } from "@/features/components/require-registration";
import { ApiError, clearMeCache, getMe } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

// Pantalla PROVISIONAL del administrador: confirma la sesión y el rol. No tiene funciones de administración.
// Otro rol se envía a /completar-registro, que decide su destino (nunca a /admin). La autorización real la hace
// el backend en cada endpoint.
export function AdminHome() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const me = await getMe();
      if (me.role !== "admin") {
        router.replace(COMPLETE_REGISTRATION_PATH);
        return;
      }
      setEmail(me.user.email);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setLoadError(
        error instanceof ApiError
          ? error.message
          : "No se pudo comprobar tu cuenta.",
      );
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const signOut = async () => {
    clearMeCache();
    await authClient.signOut({
      fetchOptions: { onSuccess: () => router.replace("/login") },
    });
  };

  if (loadError)
    return (
      <AuthShell>
        <p role="alert" className="text-[#E23A5C] text-[16px]">
          {loadError}
        </p>
        <button type="button" onClick={load} className={`${btnCls} mt-6`}>
          Reintentar
        </button>
      </AuthShell>
    );

  if (!email) return null;

  return (
    <AuthShell>
      <h2 className="text-black text-[26px] sm:text-[40px] font-medium">
        Administración de PEI
      </h2>
      <p className="text-black text-[16px] sm:text-[18px] font-light mt-3">
        El panel de administración de PEI está en preparación
      </p>
      <p className="text-[#9A9A9A] text-[15px] mt-6">
        Sesión iniciada como <span className="text-black">{email}</span>
      </p>
      <button type="button" onClick={signOut} className={`${btnCls} mt-10`}>
        Cerrar sesión
      </button>
    </AuthShell>
  );
}
