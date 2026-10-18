"use client";

import Image from "next/image";
import { useState } from "react";
import { ShieldCheck, Stethoscope, Box, Lock, Headphones } from "lucide-react";
import { appUrl, authClient, authErrorMessage, PASSWORD_MAX, PASSWORD_MIN, rememberPendingEmail } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export function Landing() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    // Validaciones
    if (!fullName || !lastName || !email || !password || !confirmPassword) {
      alert("Por favor, completa todos los campos");
      return;
    }

    if (password !== confirmPassword) {
      alert("Las contraseñas no coinciden");
      return;
    }

    if (password.length < PASSWORD_MIN) {
      alert(`La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`);
      return;
    }

    if (password.length > PASSWORD_MAX) {
      alert(`La contraseña no puede tener más de ${PASSWORD_MAX} caracteres`);
      return;
    }

    setLoading(true);

    // Con verificación obligatoria, el backend responde igual si el correo ya existe:
    // la pantalla siguiente no distingue ambos casos.
    const { error } = await authClient.signUp.email({
      email,
      password,
      name: `${fullName} ${lastName}`,
      callbackURL: appUrl("/landing-inicio"),
    });
    setLoading(false);

    if (error) {
      alert(authErrorMessage(error));
      return;
    }

    rememberPendingEmail(email);
    router.push("/verificar-correo");
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* Lado Izquierdo - Morado */}
      <div className="w-full lg:w-1/2 bg-[#684DDE] flex flex-col justify-center items-start px-6 sm:px-10 lg:px-16 py-10 lg:py-0 relative overflow-hidden min-h-[400px] lg:min-h-screen">

        <div className="absolute top-6 left-6 sm:top-8 sm:left-8">
          <img
            src="/logo-blanco.svg"
            alt="Logo PEI"
            width={70}
            height={45}
            className="object-contain"
          />
        </div>

        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 800 1200"
          preserveAspectRatio="xMidYMid slice"
        >
          <polygon
            points="120,80 130,110 160,110 135,130 145,160 120,140 95,160 105,130 80,110 110,110"
            fill="rgba(255,255,255,0.25)"
          />

          <path
            d="M 250 50 Q 350 -20 450 60 Q 550 140 600 80 Q 700 0 750 100"
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="80"
            strokeLinecap="round"
          />

          <path
            d="M -50 700 Q 100 800 200 900 Q 300 1000 400 1150 Q 450 1250 500 1350"
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="60"
            strokeLinecap="round"
          />

          <polygon
            points="550,950 560,980 590,980 565,1000 575,1030 550,1010 525,1030 535,1000 510,980 540,980"
            fill="rgba(255,255,255,0.25)"
          />
        </svg>

        <div className="relative z-10 w-full flex flex-col gap-8 sm:gap-10 lg:gap-20 mt-20 lg:mt-16">

          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex-shrink-0">
              <ShieldCheck className="w-[32px] h-[32px] sm:w-[40px] sm:h-[40px] text-white" />
            </div>
            <div>
              <h3 className="text-white text-[18px] sm:text-[20px] lg:text-[24px] font-normal">Confidencial</h3>
              <p className="text-white text-[13px] sm:text-[14px] lg:text-[16px] font-normal">
                Tu privacidad es nuestra prioridad
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex-shrink-0">
              <Stethoscope className="w-[32px] h-[32px] sm:w-[40px] sm:h-[40px] text-white" />
            </div>
            <div>
              <h3 className="text-white text-[18px] sm:text-[20px] lg:text-[24px] font-normal">Apoyo médico</h3>
              <p className="text-white text-[13px] sm:text-[14px] lg:text-[16px] font-normal">
                Reciba atención de profesionales de la salud con licencia.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex-shrink-0">
              <Box className="w-[32px] h-[32px] sm:w-[40px] sm:h-[40px] text-white" />
            </div>
            <div>
              <h3 className="text-white text-[18px] sm:text-[20px] lg:text-[24px] font-normal">Entrega discreta</h3>
              <p className="text-white text-[13px] sm:text-[14px] lg:text-[16px] font-normal">
                Reciba sus pedidos en empaques discretos
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 sm:gap-4">
            <div className="flex-shrink-0">
              <Lock className="w-[32px] h-[32px] sm:w-[40px] sm:h-[40px] text-white" />
            </div>
            <div>
              <h3 className="text-white text-[18px] sm:text-[20px] lg:text-[24px] font-normal">Confiable y seguro</h3>
              <p className="text-white text-[13px] sm:text-[14px] lg:text-[16px] font-normal">
                Medicamentos aprobados por la COFEPRIS
              </p>
            </div>
          </div>

          <div className="mt-4 bg-white/10 rounded-xl p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
            <Headphones className="w-[28px] h-[28px] sm:w-[35px] sm:h-[35px] text-white flex-shrink-0" />
            <div>
              <p className="text-white text-[12px] sm:text-[14px] font-medium">¿Necesitas ayuda?</p>
              <p className="text-white text-[11px] sm:text-[12px] font-normal">Contacta con soporte técnico</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lado Derecho - Blanco */}
      <div className="w-full lg:w-1/2 bg-white flex flex-col justify-start items-center px-6 sm:px-10 lg:px-12 py-10 lg:pt-[60px] lg:pb-0 overflow-y-auto">

        <div className="w-full max-w-[600px] flex flex-col items-start">
          <h2 className="text-black text-[26px] sm:text-[30px] lg:text-[34px] font-medium leading-[34px] sm:leading-[40px] lg:leading-[44px] w-full text-left">
            Crea tu cuenta
          </h2>

          <p className="text-[#89898A] text-[14px] sm:text-[15px] font-normal leading-[22px] w-full mt-2 text-left">
            Únete a PEI y toma control de tu salud
          </p>

          <div className="w-full mt-[30px] sm:mt-[40px] flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="text-black text-[14px] sm:text-[15px] font-normal block">
                Nombre(s)
              </label>
              <div className="relative mt-[10px] sm:mt-[14px]">
                <input
                  type="text"
                  placeholder="Ingresa tus nombres"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-[52px] sm:h-[60px] px-4 border border-gray-300 rounded-lg text-[14px] font-normal text-[#9A9A9A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#684DDE]"
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="text-black text-[14px] sm:text-[15px] font-normal block">
                Apellidos
              </label>
              <div className="relative mt-[10px] sm:mt-[14px]">
                <input
                  type="text"
                  placeholder="Ingresa tus apellidos"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full h-[52px] sm:h-[60px] px-4 border border-gray-300 rounded-lg text-[14px] font-normal text-[#9A9A9A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#684DDE]"
                />
              </div>
            </div>
          </div>

          <div className="w-full mt-[14px]">
            <label className="text-black text-[14px] sm:text-[15px] font-normal block">
              E-mail
            </label>
            <div className="relative mt-[10px] sm:mt-[14px]">
              <input
                type="email"
                placeholder="Ingresa tu email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-[52px] sm:h-[60px] px-4 border border-gray-300 rounded-lg text-[14px] font-normal text-[#9A9A9A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#684DDE]"
              />
            </div>
          </div>

          <div className="w-full mt-[14px]">
            <label className="text-black text-[14px] sm:text-[15px] font-normal block">
              Contraseña
            </label>
            <div className="relative mt-[10px] sm:mt-[14px]">
              <input
                type="password"
                placeholder="Crea una contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[52px] sm:h-[60px] px-4 border border-gray-300 rounded-lg text-[14px] font-normal text-[#9A9A9A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#684DDE]"
              />
            </div>
          </div>

          <div className="w-full mt-[14px]">
            <label className="text-black text-[14px] sm:text-[15px] font-normal block">
              Confirmar contraseña
            </label>
            <div className="relative mt-[10px] sm:mt-[14px]">
              <input
                type="password"
                placeholder="Confirma tu contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-[52px] sm:h-[60px] px-4 border border-gray-300 rounded-lg text-[14px] font-normal text-[#9A9A9A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#684DDE]"
              />
            </div>
          </div>

          <div className="w-full mt-[14px] flex items-start gap-3">
            <input
              type="checkbox"
              className="w-[20px] h-[20px] mt-1 accent-[#7355F7] flex-shrink-0"
            />
            <p className="text-[#89898A] text-[13px] font-normal">
              Estoy de acuerdo con los{" "}
              <span className="text-[#7355F7] underline cursor-pointer">
                Términos de servicio
              </span>{" "}
              y{" "}
              <span className="text-[#7355F7] underline cursor-pointer">
                Política de privacidad
              </span>
            </p>
          </div>

          <button
            onClick={handleSignUp}
            disabled={loading}
            className="w-full h-[50px] bg-[#7355F7] rounded-lg text-white text-[16px] font-normal hover:bg-[#6244d9] transition mt-[20px] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Creando cuenta..." : "Crear cuenta"}
          </button>

          <p className="text-[#89898A] text-[15px] font-normal mt-[20px] w-full text-center">
            ¿Ya tienes una cuenta?
          </p>

          <button
            onClick={() => router.push("/login")}
            className="w-full h-[50px] border-2 border-[#7355F7] rounded-lg text-[#7355F7] text-[16px] font-normal hover:bg-[#7355F7] hover:text-white transition mt-[14px]"
          >
            Log in
          </button>

          <div className="w-full flex items-center gap-4 mt-[24px]">
            <hr className="flex-1 border-[#9A9A9A]" />
            <span className="text-[#9A9A9A] text-[14px] font-normal whitespace-nowrap">
              o crear cuenta con
            </span>
            <hr className="flex-1 border-[#9A9A9A]" />
          </div>

          <div className="w-full flex flex-col sm:flex-row gap-4 mt-5 mb-12">
            <button className="flex-1 h-[50px] border border-gray-300 rounded-lg flex items-center justify-center gap-3 hover:bg-gray-50 transition">
              <Image
                src="/google.png"
                alt="Google"
                width={24}
                height={24}
                className="object-contain"
              />
              <span className="text-[#000000] text-[14px] font-normal">
                Google
              </span>
            </button>

            <button className="flex-1 h-[50px] border border-gray-300 rounded-lg flex items-center justify-center gap-3 hover:bg-gray-50 transition">
              <Image
                src="/apple.png"
                alt="Apple"
                width={24}
                height={24}
                className="object-contain"
              />
              <span className="text-[#000000] text-[14px] font-normal">
                Apple
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}