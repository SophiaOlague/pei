"use client";

import Image from "next/image";
import { UserMenu } from "@/features/components/user-menu";

export function Landing() {
  const tarjetas = [
    {
      bg: "#EA3333",
      titulo: "Guía para familias aliadas a PEI",
      imagen: "/familia5.jpg",
      alt: "Familia ilustración",
      imagenIzquierda: false,
      items: [
        { num: "1.", texto: "Escucha activa y sin juicios" },
        { num: "2.", texto: "Apoyo emocional constante" },
        { num: "3.", texto: "Respeto e identidad" },
        { num: "4.", texto: "Acompañar sin intentar cambiar" },
        { num: "", texto: "Amar sin condiciones.", bold: true },
      ],
    },
    {
      bg: "#FD9F2B",
      titulo: "Cómo hablar de PrEP en familia",
      subtitulo: "Claves para abrir conversaciones sanas y sin juicios",
      imagen: "/hablar.jpg",
      alt: "Hablar PrEP ilustración",
      imagenIzquierda: true,
      items: [
        { num: "1.", texto: "Elige el momento adecuado" },
        { num: "2.", texto: "Usa lenguaje claro y empático" },
        { num: "3.", texto: "Respeta sus decisiones" },
      ],
    },
    {
      bg: "#E0C955",
      titulo: "Prevención para todas las edades",
      imagen: "/edades.jpg",
      alt: "Edades ilustración",
      imagenIzquierda: false,
      items: [
        { num: "", texto: "Infancia y adolescencia" },
        { num: "", texto: "Juventud" },
        { num: "", texto: "Adultez" },
        { num: "", texto: "Personas mayores" },
        { num: "", texto: "La prevención es un derecho en cada etapa" },
      ],
    },
    {
      bg: "#38934B",
      titulo: "Salud sexual y prevención",
      imagen: "/banca.jpg",
      alt: "Salud sexual ilustración",
      imagenIzquierda: true,
      items: [
        { num: "", texto: "Qué es la PrEP y cómo funciona." },
        { num: "", texto: "ITS: prevención y detección" },
        { num: "", texto: "Uso correcto métodos" },
        { num: "", texto: "Información clara para tener seguridad" },
      ],
    },
    {
      bg: "#3370FF",
      titulo: "Derechos y diversos",
      imagen: "/derechos2.jpg",
      alt: "Derechos ilustración",
      imagenIzquierda: false,
      items: [
        { num: "", texto: "Igualdad y no discriminación" },
        { num: "", texto: "Derechos legales" },
        { num: "", texto: "Recursos de apoyo" },
        { num: "", texto: "Informarse es defenderse" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-white">

      <nav className="flex items-center justify-between px-4 sm:px-6 md:px-8 py-3 sm:py-4 md:py-6 border-b border-gray-200">
        <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 flex-shrink-0">
          <Image
            src="/logo.svg"
            alt="Logo"
            width={80}
            height={80}
            className="object-contain w-full h-full"
          />
        </div>

        <UserMenu />
      </nav>

      <div className="text-center mt-6 sm:mt-8 lg:mt-10 mb-6 sm:mb-8 lg:mb-10 px-4">
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-[40px] font-normal leading-tight sm:leading-snug lg:leading-[60px] text-[#000000]">
          Prevención familiar
        </h1>
      </div>

      <div className="flex flex-col items-center gap-4 sm:gap-6 lg:gap-8 px-4">

        {tarjetas.map((tarjeta, index) => {
          const contenido = (
            <div className="flex-1 flex flex-col w-full p-5 sm:p-6 md:p-8">
              <h2 className="text-white text-base sm:text-lg md:text-[20px] font-semibold leading-snug sm:leading-[28px] text-left">
                {tarjeta.titulo}
              </h2>

              {tarjeta.subtitulo && (
                <p className="mt-3 sm:mt-5 md:mt-6 text-white text-sm sm:text-base md:text-[18px] font-light leading-snug sm:leading-[28px] text-left">
                  {tarjeta.subtitulo}
                </p>
              )}

              <ul className={`${tarjeta.subtitulo ? "mt-2 sm:mt-3 md:mt-4" : "mt-3 sm:mt-5 md:mt-8"} space-y-2 sm:space-y-3 text-left`}>
                {tarjeta.items.map((item, i) => (
                  <li
                    key={i}
                    className="text-white text-sm sm:text-base md:text-[18px] font-light leading-snug sm:leading-[28px]"
                  >
                    {item.num && `${item.num} `}
                    <span className={"bold" in item && item.bold ? "font-medium" : "font-medium"}>
                      {item.texto}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );

          const imagen = (
            <div className="w-full sm:w-1/2 flex-shrink-0 sm:self-stretch">
              <img
                src={tarjeta.imagen}
                alt={tarjeta.alt}
                className="w-full h-full min-h-[200px] sm:min-h-[260px] md:min-h-[300px] object-cover"
              />
            </div>
          );

          return (
            <div
              key={index}
              className="w-full max-w-[1270px] rounded-3xl overflow-hidden"
              style={{ backgroundColor: tarjeta.bg }}
            >
              <div className="flex flex-col sm:flex-row items-stretch">
                {tarjeta.imagenIzquierda ? (
                  <>
                    {imagen}
                    {contenido}
                  </>
                ) : (
                  <>
                    {contenido}
                    {imagen}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="mt-12 sm:mt-16 lg:mt-20 bg-[#7355F7] w-full">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
          <div className="text-center mb-10 sm:mb-12 lg:mb-14">
            <h2 className="text-white text-2xl sm:text-3xl lg:text-[30px] font-semibold">
              PEI
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <div className="flex flex-col gap-6">
              <p className="text-white text-base sm:text-lg font-normal sm:pl-8 lg:pl-12">
                Nos encuentras en:
              </p>

              <div className="flex items-center gap-4 sm:pl-8 lg:pl-12">
                <div className="w-[30px] h-[30px] flex-shrink-0">
                  <Image
                    src="/instagram-icon.png"
                    alt="Instagram"
                    width={30}
                    height={30}
                    className="object-contain w-full h-full"
                  />
                </div>
                <span className="text-white text-sm sm:text-base font-normal">Instagram</span>
              </div>

              <div className="flex items-center gap-4 sm:pl-8 lg:pl-12">
                <div className="w-[30px] h-[30px] flex-shrink-0">
                  <Image
                    src="/facebook-icon.png"
                    alt="Facebook"
                    width={30}
                    height={30}
                    className="object-contain w-full h-full"
                  />
                </div>
                <span className="text-white text-sm sm:text-base font-normal">Facebook</span>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <p className="text-white text-sm sm:text-base lg:text-[18px] font-normal leading-snug sm:leading-[26px]">
                Lorem ipsum dolor sit amet consectetur adipiscing elit, fermentum laoreet nullam dictum aptent mollis, orci mi ridiculus curae dapibus nulla.
              </p>
              <p className="text-white text-sm sm:text-base lg:text-[18px] font-normal leading-snug sm:leading-[26px]">
                Sollicitudin pullicitudin pulvinar lectus cubilia phasellus arcu eget condimentum taciti, litora inceptos cras molestie in tristique diam vehicula, neque nisl consequat
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}