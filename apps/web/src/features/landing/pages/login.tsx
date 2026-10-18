"use client";

import Image from "next/image";
import Link from "next/link";
import { EyeOff, Eye } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { appUrl, authClient, authErrorMessage, rememberPendingEmail } from "@/lib/auth-client";

export function Landing() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      alert("Por favor, completa todos los campos");
      return;
    }

    setLoading(true);
    // Si el correo no está verificado, el backend reenvía el enlace y responde EMAIL_NOT_VERIFIED.
    const { error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: appUrl("/completar-registro"),
    });
    setLoading(false);

    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED") rememberPendingEmail(email);
      alert(authErrorMessage(error));
      return;
    }

    router.push("/completar-registro");
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

   
      <div className="w-full lg:w-1/2 bg-[#684DDE] flex flex-col justify-start items-start px-6 sm:px-10 lg:px-16 py-10 lg:py-12 relative lg:min-h-screen">

        <div className="absolute top-6 left-6 sm:top-8 sm:left-8">
          <img
            src="/logo-blanco.svg"
            alt="Logo PEI"
            width={50}
            height={30}
            className="object-contain"
          />
        </div>

        <h1 className="text-white text-[32px] sm:text-[40px] lg:text-[52px] font-semibold leading-[40px] sm:leading-[50px] lg:leading-[62px] mt-16 lg:mt-20">
          Tu salud
          <br />
          Tu protección
          <br />
          Nuestra prioridad
        </h1>

        <p className="text-white text-[14px] sm:text-[16px] lg:text-[18px] font-normal mt-[30px] sm:mt-[40px] lg:mt-[50px] max-w-[500px]">
          PEI hace que comprar PrEP sea, fácil, confidencial y accesible
        </p>

        
<div className="mt-[60px] sm:mt-[80px] lg:mt-[100px] w-full max-w-[450px] lg:max-w-[500px]">
  <img
    src="/login.png"
    alt="Dos personas agarradas de la mano"
    width={520}
    height={400}
    className="object-contain w-full h-auto"
  />
</div>
      </div>

  
      <div className="w-full lg:w-1/2 bg-white flex flex-col justify-start items-center px-6 sm:px-10 lg:px-12 py-10 lg:pt-[80px] lg:pb-0">
        <h2 className="text-black text-[26px] sm:text-[34px] lg:text-[40px] font-medium leading-[34px] sm:leading-[44px] lg:leading-[50px] w-full max-w-[635px] text-left">
          Bienvenido de nuevo
        </h2>

        <p className="text-black text-[15px] sm:text-[16px] lg:text-[18px] font-light leading-[24px] sm:leading-[26px] w-full max-w-[635px] mt-3 text-left">
          Inicia sesión en tu cuenta
        </p>

        <div className="w-full max-w-[635px] mt-[45px] sm:mt-[55px]">
          <label className="text-black text-[15px] sm:text-[16px] font-normal block">
            Correo
          </label>
          <div className="relative mt-[16px] sm:mt-[20px]">
            <input
              type="email"
              placeholder="Introduce tu correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-[50px] sm:h-[52px] px-4 border border-gray-300 rounded-lg text-[14px] sm:text-[16px] font-normal text-[#9A9A9A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#684DDE]"
            />
          </div>
        </div>

      
        <div className="w-full max-w-[635px] mt-[35px] sm:mt-[45px]">
          <div className="flex justify-between items-center gap-2">
            <label className="text-black text-[15px] sm:text-[16px] font-normal">
              Contraseña
            </label>
            <Link href="/olvide-contrasena" className="text-[#9A9A9A] text-[12px] sm:text-[14px] font-normal cursor-pointer hover:text-[#684DDE] transition whitespace-nowrap">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative mt-[16px] sm:mt-[20px]">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Introduce tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-[50px] sm:h-[52px] px-4 border border-gray-300 rounded-lg text-[14px] sm:text-[16px] font-normal text-[#9A9A9A] placeholder-[#9A9A9A] focus:outline-none focus:border-[#684DDE] pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2"
            >
              {showPassword ? (
                <Eye className="w-[22px] h-[22px] sm:w-[25px] sm:h-[25px] text-[#9A9A9A] cursor-pointer" />
              ) : (
                <EyeOff className="w-[22px] h-[22px] sm:w-[25px] sm:h-[25px] text-[#9A9A9A] cursor-pointer" />
              )}
            </button>
          </div>
        </div>

        
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full max-w-[635px] h-[52px] sm:h-[54px] bg-[#664BDB] rounded-lg text-white text-[16px] sm:text-[20px] font-normal hover:bg-[#5a3fc4] transition mt-[45px] sm:mt-[55px]"
        >
          Iniciar sesión
        </button>

       
        <div className="w-full max-w-[635px] flex items-center gap-4 mt-[40px] sm:mt-[50px]">
          <hr className="flex-1 border-[#9A9A9A]" />
          <span className="text-[#9A9A9A] text-[13px] sm:text-[15px] font-normal whitespace-nowrap">
            o continua con
          </span>
          <hr className="flex-1 border-[#9A9A9A]" />
        </div>

        <div className="w-full max-w-[635px] flex flex-col sm:flex-row gap-4 mt-[30px]">
          <button className="flex-1 h-[50px] sm:h-[54px] border-2 border-[#664BDB] rounded-lg flex items-center justify-center gap-3 hover:bg-gray-50 transition">
            <Image
              src="/google.png"
              alt="Google"
              width={26}
              height={26}
              className="object-contain"
            />
            <span className="text-[#664BDB] text-[13px] sm:text-[14px] font-normal">
              Continua con google
            </span>
          </button>

          <button className="flex-1 h-[50px] sm:h-[54px] border-2 border-[#664BDB] rounded-lg flex items-center justify-center gap-3 hover:bg-gray-50 transition">
            <Image
              src="/apple.png"
              alt="Apple"
              width={26}
              height={26}
              className="object-contain"
            />
            <span className="text-[#664BDB] text-[13px] sm:text-[14px] font-normal">
              Continua con apple
            </span>
          </button>
        </div>

        
        <p className="text-[#89898A] text-[15px] sm:text-[16px] font-normal mt-[35px] sm:mt-[45px]">
          ¿No tienes una cuenta?
        </p>

       
        <button
          onClick={() => router.push("/signup")}
          className="w-[147px] h-[50px] sm:h-[52px] border-2 border-[#7355F7] rounded-lg text-[#7355F7] text-[15px] sm:text-[16px] font-normal hover:bg-[#7355F7] hover:text-white transition mt-[20px] sm:mt-[25px] mb-10 lg:mb-0"
        >
          Sign up
        </button>
      </div>
    </div>
  );
}