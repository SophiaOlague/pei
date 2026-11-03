"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthShell } from "@/features/components/auth-shell";
import { ADMIN_HOME_PATH } from "@/features/components/require-registration";
import {
  ApiError,
  clearMeCache,
  type DoctorProfile,
  type DoctorStatus,
  type DoctorVerificationHistory,
  getDoctorProfile,
  getDoctorStatus,
  getDoctorVerificationHistory,
  getMe,
  type Me,
} from "@/lib/api";
import { authClient, forgetProfessionalIntent } from "@/lib/auth-client";
import {
  DoctorLegalSection,
  DoctorProfileForm,
  errorMessage,
  HistorySection,
  IdentitySection,
  LicenseSection,
  ProfileSection,
  StatusSection,
} from "./doctor-sections";
import { PROFESSIONAL_ACCESS_PATH } from "./paths";
import { PROFESSIONAL_PANEL } from "./professional-access";

type View =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "patient" }
  | { kind: "new" }
  | { kind: "doctor" };

// /profesionales/registro: decide por el rol que informa el backend. Sin rol, crea el perfil médico; médico, su
// portal; paciente, aviso (los perfiles se mantienen separados); administrador, su panel.
export function DoctorPortal() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "loading" });

  const load = useCallback(async () => {
    setView({ kind: "loading" });
    try {
      const me: Me = await getMe();
      if (me.role === "admin") {
        router.replace(ADMIN_HOME_PATH);
        return;
      }
      if (me.role === "doctor") {
        forgetProfessionalIntent();
        setView({ kind: "doctor" });
      } else if (me.role === null) setView({ kind: "new" });
      else {
        // Cuenta de paciente: no hay registro profesional que continuar.
        forgetProfessionalIntent();
        setView({ kind: "patient" });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace(PROFESSIONAL_ACCESS_PATH);
        return;
      }
      setView({ kind: "error", message: errorMessage(error) });
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const signOut = async () => {
    // Aunque el servidor no responda, la interfaz sale del portal; la sesión la invalida el backend.
    await authClient.signOut().catch(() => undefined);
    clearMeCache();
    forgetProfessionalIntent();
    router.replace(PROFESSIONAL_ACCESS_PATH);
  };

  if (view.kind === "loading") return null;
  if (view.kind === "doctor") return <DoctorDashboard onSignOut={signOut} />;

  return (
    <AuthShell panel={PROFESSIONAL_PANEL}>
      {view.kind === "error" && (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-[#E23A5C] text-[16px]">
            {view.message}
          </p>
          <button
            type="button"
            onClick={load}
            className="text-[#684DDE] text-left hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}
      {view.kind === "patient" && (
        <div className="flex flex-col gap-4">
          <h2 className="text-black text-[26px] font-medium">
            Esta cuenta es de paciente
          </h2>
          <p className="text-[#535353] text-[15px]">
            Los perfiles de paciente y de profesional se mantienen separados.
            Para registrarte como profesional de la salud, cierra sesión y crea
            una cuenta profesional con otro correo.
          </p>
          <button
            type="button"
            onClick={signOut}
            className="text-[#684DDE] text-left hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      )}
      {view.kind === "new" && <DoctorProfileForm onCreated={load} />}
    </AuthShell>
  );
}

function DoctorDashboard({ onSignOut }: { onSignOut: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<DoctorStatus | null>(null);
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [history, setHistory] = useState<DoctorVerificationHistory | null>(
    null,
  );
  const [error, setError] = useState("");

  // El estado siempre lo deriva el backend; se vuelve a pedir después de cada envío.
  const refresh = useCallback(async () => {
    setError("");
    try {
      const [nextStatus, nextProfile, nextHistory] = await Promise.all([
        getDoctorStatus(),
        getDoctorProfile(),
        getDoctorVerificationHistory(),
      ]);
      setStatus(nextStatus);
      setProfile(nextProfile);
      setHistory(nextHistory);
    } catch (e) {
      // Sesión expirada: vuelve al acceso profesional (página pública, sin bucle). Otros errores se muestran.
      if (e instanceof ApiError && e.status === 401) {
        clearMeCache();
        router.replace(PROFESSIONAL_ACCESS_PATH);
        return;
      }
      setError(errorMessage(e));
    }
  }, [router]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-[#F7F7FB]">
      <header className="bg-[#2F2A6B] text-white">
        <div className="max-w-[960px] mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo-blanco.svg" alt="Logo PEI" width={40} height={26} />
            <span className="text-[15px] sm:text-[17px] font-medium">
              Portal profesional
            </span>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="text-[14px] hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="max-w-[960px] mx-auto px-4 sm:px-8 py-8 flex flex-col gap-6">
        {error && (
          <div
            role="alert"
            className="text-[#E23A5C] text-[15px] flex gap-3 items-center"
          >
            {error}
            <button
              type="button"
              onClick={refresh}
              className="text-[#684DDE] hover:underline"
            >
              Reintentar
            </button>
          </div>
        )}
        {status && profile && history && (
          <>
            <StatusSection status={status} profile={profile} />
            <DoctorLegalSection
              pending={status.missing.includes("legal")}
              onAccepted={refresh}
            />
            <IdentitySection status={status} onSubmitted={refresh} />
            <LicenseSection
              status={status}
              profile={profile}
              onSubmitted={refresh}
            />
            <ProfileSection profile={profile} onChanged={refresh} />
            <HistorySection history={history} />
          </>
        )}
      </main>
    </div>
  );
}
