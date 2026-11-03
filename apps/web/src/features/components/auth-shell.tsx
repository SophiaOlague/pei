import type { ReactNode } from "react";

// Layout compartido de las pantallas de acceso: panel morado + contenido. El portal profesional cambia el panel.
export function AuthShell({
  children,
  panel,
}: {
  children: ReactNode;
  panel?: { title: ReactNode; subtitle: string; className?: string };
}) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div
        className={`w-full lg:w-1/2 ${panel?.className ?? "bg-[#684DDE]"} flex flex-col items-start px-6 sm:px-10 lg:px-16 py-10 lg:py-12 relative lg:min-h-screen`}
      >
        <img
          src="/logo-blanco.svg"
          alt="Logo PEI"
          width={50}
          height={30}
          className="absolute top-6 left-6 sm:top-8 sm:left-8"
        />
        <h1 className="text-white text-[32px] sm:text-[40px] lg:text-[52px] font-semibold leading-[40px] sm:leading-[50px] lg:leading-[62px] mt-16 lg:mt-20">
          {panel?.title ?? (
            <>
              Tu salud
              <br />
              Tu protección
              <br />
              Nuestra prioridad
            </>
          )}
        </h1>
        <p className="text-white text-[14px] sm:text-[16px] lg:text-[18px] mt-[30px] lg:mt-[50px] max-w-[500px]">
          {panel?.subtitle ??
            "PEI hace que comprar PrEP sea fácil, confidencial y accesible"}
        </p>
        <div className="mt-[40px] lg:mt-[80px] w-full max-w-[450px] lg:max-w-[500px] hidden sm:block">
          <img
            src="/login.png"
            alt="Dos personas agarradas de la mano"
            className="object-contain w-full h-auto"
          />
        </div>
      </div>
      <div className="w-full lg:w-1/2 bg-white flex flex-col items-center px-6 sm:px-10 lg:px-12 py-10 lg:pt-[120px]">
        <div className="w-full max-w-[635px]">{children}</div>
      </div>
    </div>
  );
}

export const inputCls =
  "w-full h-[50px] sm:h-[52px] px-4 border border-gray-300 rounded-lg text-[14px] sm:text-[16px] text-black placeholder-[#9A9A9A] focus:outline-none focus:border-[#684DDE]";
export const btnCls =
  "w-full h-[52px] sm:h-[54px] bg-[#664BDB] rounded-lg text-white text-[16px] sm:text-[20px] hover:bg-[#5a3fc4] transition disabled:opacity-50";
