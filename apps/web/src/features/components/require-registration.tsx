"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { btnCls } from "@/features/components/auth-shell";
import {
  ApiError,
  getMe,
  getRegistrationStatus,
  pendingRegistrationStep,
} from "@/lib/api";

export const COMPLETE_REGISTRATION_PATH = "/completar-registro";
// Pantalla provisional del administrador (app/admin).
export const ADMIN_HOME_PATH = "/admin";

// Redirección de la interfaz. Primero el rol (GET /me): el administrador va a /admin sin consultar el registro
// de pacientes. Para los demás, según GET /me/registration-status: si falta el perfil o la aceptación legal,
// se envía a /completar-registro (que no usa este guard, así que no hay bucle). Si una consulta falla, se
// muestra el error en lugar de redirigir. La autorización real la hace el backend en cada endpoint.
export function RequireRegistration({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");
  const [message, setMessage] = useState("");

  const check = useCallback(async () => {
    setState("checking");
    try {
      const me = await getMe();
      if (me.role === "admin") {
        router.replace(ADMIN_HOME_PATH);
        return;
      }
      const status = await getRegistrationStatus();
      if (pendingRegistrationStep(status) !== null) {
        router.replace(COMPLETE_REGISTRATION_PATH);
        return;
      }
      setState("ok");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setMessage(
        error instanceof ApiError
          ? error.message
          : "No se pudo comprobar tu registro.",
      );
      setState("error");
    }
  }, [router]);

  useEffect(() => {
    check();
  }, [check]);

  if (state === "error")
    return (
      <div className="max-w-[520px] mx-auto mt-24 px-4">
        <p role="alert" className="text-[#E23A5C] text-[16px]">
          {message}
        </p>
        <button type="button" onClick={check} className={`${btnCls} mt-6`}>
          Reintentar
        </button>
      </div>
    );
  if (state === "checking") return null;
  return <>{children}</>;
}
