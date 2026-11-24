"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { btnCls } from "@/features/components/auth-shell";
import { PROFESSIONAL_PORTAL_PATH } from "@/features/professionals/paths";
import {
  ApiError,
  getMe,
  getRegistrationStatus,
  isReacceptancePending,
  pendingRegistrationStep,
} from "@/lib/api";

export const COMPLETE_REGISTRATION_PATH = "/completar-registro";
// Revisión EXPLÍCITA de una reaceptación pendiente («Revisar y aceptar»). Sin este parámetro, /completar-registro
// envía al panel a quien solo tiene una reaceptación pendiente (p. ej., al iniciar sesión), donde ve el aviso.
export const REVIEW_LEGAL_PARAM = "revisar";
export const REVIEW_LEGAL_PATH = `${COMPLETE_REGISTRATION_PATH}?${REVIEW_LEGAL_PARAM}=1`;
// Panel administrativo (app/admin).
export const ADMIN_HOME_PATH = "/admin";

// Redirección de la interfaz. Primero el rol (GET /me): el administrador va a /admin sin consultar el registro
// de pacientes. Para los demás, según GET /me/registration-status: si falta el perfil o la aceptación legal,
// se envía a /completar-registro (que no usa este guard, así que no hay bucle). Si una consulta falla, se
// muestra el error en lugar de redirigir. La autorización real la hace el backend en cada endpoint.
// Excepción (D-37, RN-140): con una reaceptación pendiente (registro ya completado y una versión legal nueva sin
// aceptar) se muestra el panel con un aviso para revisarla; se puede posponer. Agendar lo sigue rechazando el backend.
export function RequireRegistration({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");
  const [message, setMessage] = useState("");
  const [reacceptance, setReacceptance] = useState(false);
  const [postponed, setPostponed] = useState(false);

  const check = useCallback(async () => {
    setState("checking");
    try {
      const me = await getMe();
      if (me.role === "admin") {
        router.replace(ADMIN_HOME_PATH);
        return;
      }
      if (me.role === "doctor") {
        router.replace(PROFESSIONAL_PORTAL_PATH);
        return;
      }
      const status = await getRegistrationStatus();
      const step = pendingRegistrationStep(status);
      if (step === "legal" && isReacceptancePending(status)) {
        setReacceptance(true);
        setState("ok");
        return;
      }
      setReacceptance(false);
      if (step !== null) {
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
  return (
    <>
      {reacceptance && !postponed ? (
        <output className="bg-[#FEF3C7] text-[#78350F] px-4 py-3 text-[15px] flex flex-wrap items-center gap-3">
          <p className="flex-1 min-w-[240px]">
            Hay una nueva versión de los documentos legales. Puedes seguir
            usando la plataforma y consultar tus citas; para agendar nuevas
            citas necesitas aceptarla.
          </p>
          <button
            type="button"
            onClick={() => router.push(REVIEW_LEGAL_PATH)}
            className="font-semibold text-[#7355F7]"
          >
            Revisar y aceptar
          </button>
          <button
            type="button"
            onClick={() => setPostponed(true)}
            className="text-[#616161]"
          >
            Ahora no
          </button>
        </output>
      ) : null}
      {children}
    </>
  );
}
