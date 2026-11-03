"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthShell, btnCls } from "@/features/components/auth-shell";
import {
  PROFESSIONAL_ACCESS_PATH,
  PROFESSIONAL_PORTAL_PATH,
} from "@/features/professionals/paths";
import { PROFESSIONAL_PANEL } from "@/features/professionals/professional-access";
import {
  appUrl,
  authClient,
  authErrorMessage,
  hasProfessionalIntent,
  pendingEmail,
} from "@/lib/auth-client";

const WAIT = 30;

export function Landing() {
  const [seconds, setSeconds] = useState(WAIT);
  const [email, setEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  // Alta iniciada en /profesionales: misma verificación, presentación y destinos del portal profesional.
  const [professional, setProfessional] = useState(false);

  useEffect(() => {
    setEmail(pendingEmail());
    setProfessional(hasProfessionalIntent());
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  // El backend responde igual exista o no la cuenta; el mensaje tampoco lo distingue.
  const resend = async () => {
    if (!email) return;
    setSeconds(WAIT);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: appUrl(
        professional ? PROFESSIONAL_PORTAL_PATH : "/completar-registro",
      ),
    });
    setNotice(
      error
        ? authErrorMessage(error)
        : "Si la cuenta está pendiente de verificar, te enviamos un nuevo enlace.",
    );
  };

  return (
    <AuthShell panel={professional ? PROFESSIONAL_PANEL : undefined}>
      {professional && (
        <p className="inline-block text-[13px] font-medium text-[#2F2A6B] bg-[#ECEAFB] rounded-full px-3 py-1 mb-6">
          Profesionales de la salud
        </p>
      )}
      <Mail
        className={`w-14 h-14 ${professional ? "text-[#2F2A6B]" : "text-[#664BDB]"}`}
      />
      <h2 className="text-black text-[26px] sm:text-[40px] font-medium mt-6">
        Verifica tu correo
      </h2>
      <p className="text-black text-[16px] sm:text-[18px] font-light mt-3">
        {professional
          ? "Te enviamos un enlace de confirmación. Ábrelo para activar tu cuenta y continuar con tu registro profesional; si no lo ves, revisa tu carpeta de spam."
          : "Te enviamos un enlace de confirmación. Ábrelo para activar tu cuenta; si no lo ves, revisa tu carpeta de spam."}
      </p>
      <Link
        href={professional ? `${PROFESSIONAL_ACCESS_PATH}#ingresar` : "/login"}
        className={`${btnCls} mt-10 flex items-center justify-center`}
      >
        Ya verifiqué, iniciar sesión
      </Link>
      <button
        type="button"
        disabled={seconds > 0 || !email}
        onClick={resend}
        className="block w-full h-[52px] mt-4 border-2 border-[#7355F7] rounded-lg text-[#7355F7] text-[16px] hover:bg-[#7355F7] hover:text-white transition disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-[#7355F7]"
      >
        {seconds > 0 ? `Reenviar correo (${seconds}s)` : "Reenviar correo"}
      </button>
      {notice && (
        <output className="block text-black text-[14px] mt-4">{notice}</output>
      )}
      {!email && (
        <p className="text-[#9A9A9A] text-[14px] mt-4">
          Para reenviar el enlace, inicia sesión con tu correo: si no está
          verificado, te enviaremos uno nuevo.
        </p>
      )}
      <Link
        href={professional ? `${PROFESSIONAL_ACCESS_PATH}#crear` : "/signup"}
        className="block text-center text-[#664BDB] text-[16px] mt-8 hover:underline"
      >
        Cambiar correo
      </Link>
    </AuthShell>
  );
}
