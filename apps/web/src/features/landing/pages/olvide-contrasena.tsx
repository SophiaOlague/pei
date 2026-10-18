"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AuthShell, btnCls, inputCls } from "@/features/components/auth-shell";
import { appUrl, authClient, authErrorMessage } from "@/lib/auth-client";

export function Landing() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email))
      return setError("Introduce un correo válido");
    setError("");
    // El backend responde igual exista o no la cuenta; solo se muestra error si no se pudo enviar.
    const { error } = await authClient.requestPasswordReset({
      email,
      redirectTo: appUrl("/restablecer-contrasena"),
    });
    if (error) return setError(authErrorMessage(error));
    setSent(true);
  };

  return (
    <AuthShell>
      {sent ? (
        <div className="flex flex-col items-start">
          <MailCheck className="w-14 h-14 text-[#664BDB]" />
          <h2 className="text-black text-[26px] sm:text-[40px] font-medium mt-6">
            Revisa tu correo
          </h2>
          <p className="text-black text-[16px] sm:text-[18px] font-light mt-3">
            Si <b className="font-medium">{email}</b> está registrado, te
            enviamos un enlace para restablecer tu contraseña.
          </p>
          <Link
            href="/restablecer-contrasena"
            className={`${btnCls} mt-10 flex items-center justify-center`}
          >
            Ya tengo el enlace
          </Link>
          <button
            onClick={() => setSent(false)}
            className="text-[#664BDB] text-[16px] mt-6 hover:underline"
          >
            Usar otro correo
          </button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <h2 className="text-black text-[26px] sm:text-[40px] font-medium">
            ¿Olvidaste tu contraseña?
          </h2>
          <p className="text-black text-[15px] sm:text-[18px] font-light mt-3">
            Escribe tu correo y te enviaremos un enlace para crear una nueva.
          </p>
          <label htmlFor="email" className="text-black text-[16px] block mt-12">
            Correo
          </label>
          <input
            id="email"
            type="email"
            placeholder="Introduce tu correo"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputCls} mt-4`}
          />
          {error && (
            <p role="alert" className="text-[#E23A5C] text-[14px] mt-2">
              {error}
            </p>
          )}
          <button type="submit" className={`${btnCls} mt-10`}>
            Enviar enlace
          </button>
          <Link
            href="/login"
            className="block text-center text-[#664BDB] text-[16px] mt-8 hover:underline"
          >
            Volver a iniciar sesión
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
