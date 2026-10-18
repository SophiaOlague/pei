"use client";

import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthShell, btnCls, inputCls } from "@/features/components/auth-shell";
import {
  authClient,
  authErrorMessage,
  PASSWORD_MAX,
  PASSWORD_MIN,
} from "@/lib/auth-client";

export function Landing() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // El enlace del correo pasa por el backend, que redirige aquí con ?token=… o ?error=INVALID_TOKEN.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error");
    if (urlError) setError(authErrorMessage({ code: urlError }));
    setToken(params.get("token"));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token)
      return setError(
        "El enlace no es válido o ya expiró. Solicita uno nuevo.",
      );
    if (password.length < PASSWORD_MIN)
      return setError(
        `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`,
      );
    if (password.length > PASSWORD_MAX)
      return setError(
        `La contraseña no puede tener más de ${PASSWORD_MAX} caracteres`,
      );
    if (password !== confirm) return setError("Las contraseñas no coinciden");
    setError("");
    // El backend revoca las sesiones abiertas al restablecer.
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    if (error) return setError(authErrorMessage(error));
    setDone(true);
  };

  if (done)
    return (
      <AuthShell>
        <CheckCircle2 className="w-14 h-14 text-[#664BDB]" />
        <h2 className="text-black text-[26px] sm:text-[40px] font-medium mt-6">
          Contraseña actualizada
        </h2>
        <p className="text-black text-[16px] sm:text-[18px] font-light mt-3">
          Ya puedes iniciar sesión con tu nueva contraseña.
        </p>
        <Link
          href="/login"
          className={`${btnCls} mt-10 flex items-center justify-center`}
        >
          Ir a iniciar sesión
        </Link>
      </AuthShell>
    );

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    withEye = false,
  ) => (
    <div className="mt-8">
      <label htmlFor={id} className="text-black text-[16px] block">
        {label}
      </label>
      <div className="relative mt-4">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => set(e.target.value)}
          placeholder={label}
          className={`${inputCls} pr-12`}
        />
        {withEye && (
          <button
            type="button"
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShow(!show)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9A9A9A]"
          >
            {show ? <Eye size={24} /> : <EyeOff size={24} />}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <AuthShell>
      <form onSubmit={submit} noValidate>
        <h2 className="text-black text-[26px] sm:text-[40px] font-medium">
          Crea una nueva contraseña
        </h2>
        <p className="text-black text-[15px] sm:text-[18px] font-light mt-3">
          Mínimo 8 caracteres.
        </p>
        {field("password", "Nueva contraseña", password, setPassword, true)}
        {field("confirm", "Confirmar contraseña", confirm, setConfirm)}
        {error && (
          <p role="alert" className="text-[#E23A5C] text-[14px] mt-3">
            {error}
          </p>
        )}
        <button type="submit" className={`${btnCls} mt-10`}>
          Restablecer contraseña
        </button>
      </form>
    </AuthShell>
  );
}
