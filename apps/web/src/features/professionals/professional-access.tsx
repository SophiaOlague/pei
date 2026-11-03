"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { AuthShell, btnCls, inputCls } from "@/features/components/auth-shell";
import {
  appUrl,
  authClient,
  authErrorMessage,
  PASSWORD_MAX,
  PASSWORD_MIN,
  pendingEmail,
  rememberPendingEmail,
  rememberProfessionalIntent,
} from "@/lib/auth-client";
import { PROFESSIONAL_PORTAL_PATH } from "./paths";

// Panel del portal profesional: misma estructura que el acceso de pacientes, con otro color y otro mensaje.
export const PROFESSIONAL_PANEL = {
  title: (
    <>
      Portal para
      <br />
      profesionales
      <br />
      de la salud
    </>
  ),
  subtitle:
    "Regístrate, envía tu documentación y consulta el estado de tu revisión.",
  className: "bg-[#2F2A6B]",
};

const CONNECTION_ERROR =
  "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";

// /profesionales: crea la cuenta o inicia sesión. El perfil médico (y con él el rol) se crea después, ya con sesión.
export function ProfessionalAccess() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Al volver de /verificar-correo: «#ingresar» abre el inicio de sesión con el correo pendiente; «#crear», el alta.
  useEffect(() => {
    if (window.location.hash !== "#ingresar") return;
    setMode("signin");
    setEmail(pendingEmail() ?? "");
  }, []);

  const validate = (): string => {
    if (!email || !password || (mode === "signup" && (!name || !confirm)))
      return "Completa todos los campos.";
    if (mode === "signin") return "";
    if (password !== confirm) return "Las contraseñas no coinciden.";
    if (password.length < PASSWORD_MIN)
      return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
    if (password.length > PASSWORD_MAX)
      return `La contraseña no puede tener más de ${PASSWORD_MAX} caracteres.`;
    return "";
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;
    setLoading(true);
    rememberProfessionalIntent();
    const callbackURL = appUrl(PROFESSIONAL_PORTAL_PATH);
    let authError: Parameters<typeof authErrorMessage>[0] | null;
    try {
      ({ error: authError } =
        mode === "signup"
          ? await authClient.signUp.email({
              email,
              password,
              name,
              callbackURL,
            })
          : await authClient.signIn.email({ email, password, callbackURL }));
    } catch {
      // Sin conexión, Better Auth rechaza la promesa en lugar de devolver un error.
      setLoading(false);
      setError(CONNECTION_ERROR);
      return;
    }
    setLoading(false);
    if (authError) {
      if (authError.code === "EMAIL_NOT_VERIFIED") rememberPendingEmail(email);
      setError(authErrorMessage(authError));
      return;
    }
    if (mode === "signup") {
      // Con verificación obligatoria, la respuesta no distingue un correo ya registrado.
      rememberPendingEmail(email);
      router.push("/verificar-correo");
      return;
    }
    router.push(PROFESSIONAL_PORTAL_PATH);
  };

  const tab = (value: "signup" | "signin", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => {
        setMode(value);
        setError("");
      }}
      className={`flex-1 h-[44px] rounded-lg text-[15px] transition ${
        mode === value
          ? "bg-[#2F2A6B] text-white"
          : "text-[#535353] hover:bg-gray-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <AuthShell panel={PROFESSIONAL_PANEL}>
      <p className="inline-block text-[13px] font-medium text-[#2F2A6B] bg-[#ECEAFB] rounded-full px-3 py-1">
        Profesionales de la salud
      </p>
      <h2 className="text-black text-[28px] sm:text-[32px] font-medium mt-4">
        {mode === "signup" ? "Crea tu cuenta profesional" : "Inicia sesión"}
      </h2>
      <p className="text-[#89898A] text-[15px] mt-2">
        Después completarás tu perfil, aceptarás los documentos legales para
        profesionales y enviarás tu INE y tu cédula para revisión.
      </p>

      <div
        role="tablist"
        className="flex gap-2 mt-6 p-1 border border-gray-200 rounded-lg"
      >
        {tab("signup", "Crear cuenta")}
        {tab("signin", "Ya tengo cuenta")}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4 mt-6" noValidate>
        {mode === "signup" && (
          <label className="text-black text-[15px] flex flex-col gap-2">
            Nombre
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        )}
        <label className="text-black text-[15px] flex flex-col gap-2">
          Correo electrónico
          <input
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="text-black text-[15px] flex flex-col gap-2">
          Contraseña
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
          />
        </label>
        {mode === "signup" && (
          <label className="text-black text-[15px] flex flex-col gap-2">
            Confirmar contraseña
            <input
              className={inputCls}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-[#E23A5C] text-[14px]">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className={btnCls}>
          {loading
            ? "Procesando..."
            : mode === "signup"
              ? "Crear cuenta"
              : "Iniciar sesión"}
        </button>
      </form>

      <p className="text-[#89898A] text-[14px] mt-6">
        ¿Buscas atención como paciente?{" "}
        <Link href="/login" className="text-[#684DDE] hover:underline">
          Ir al acceso de pacientes
        </Link>
      </p>
    </AuthShell>
  );
}
