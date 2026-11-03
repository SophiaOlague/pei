"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { btnCls } from "@/features/components/auth-shell";
import { COMPLETE_REGISTRATION_PATH } from "@/features/components/require-registration";
import { ApiError, getMe } from "@/lib/api";

interface AdminIdentity {
  email: string;
}

const AdminContext = createContext<AdminIdentity | null>(null);

// Cuenta del administrador confirmada por RequireAdmin (GET /me). Solo para mostrarla; no autoriza nada.
export function useAdmin(): AdminIdentity {
  const admin = useContext(AdminContext);
  if (!admin) throw new Error("useAdmin requiere RequireAdmin");
  return admin;
}

// Redirección de la interfaz para el panel administrativo: solo el rol admin (GET /me) ve estas pantallas. Otro rol
// (o un 403) se envía a /completar-registro, que decide su destino (nunca a /admin). Sin sesión (401), a /login.
// La autorización real la hace el backend en cada endpoint (@Roles("admin")); la interfaz no cambia ni envía roles.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const me = await getMe();
      if (me.role !== "admin") {
        router.replace(COMPLETE_REGISTRATION_PATH);
        return;
      }
      setAdmin({ email: me.user.email });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login");
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        router.replace(COMPLETE_REGISTRATION_PATH);
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

  if (loadError)
    return (
      <div className="max-w-[520px] mx-auto mt-24 px-4">
        <p role="alert" className="text-[#E23A5C] text-[16px]">
          {loadError}
        </p>
        <button type="button" onClick={load} className={`${btnCls} mt-6`}>
          Reintentar
        </button>
      </div>
    );
  if (!admin) return null;
  return (
    <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>
  );
}
