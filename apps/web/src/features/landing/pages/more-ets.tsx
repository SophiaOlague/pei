"use client";

import Image from "next/image";
import { UserMenu } from "@/features/components/user-menu";

export function Landing() {
  const tarjetas = [
    {
      bg: "#770088",
      titulo: "No solo VIH",
      imagen: "/vih-icon.png",
      alt: "VIH ilustración",
      imagenIzquierda: false,
      parrafos: [
        "El VIH no es la única infección a la que estamos expuestos cuando tenemos relaciones sexuales sin usar protección. Existen otras ITS que pueden causar problemas de salud significativos si no se detectan y tratan a tiempo.",
      ],
      items: [
        { label: "Secreciones anómalas:", texto: " Flujo genital con tonalidades verdosas, amarillentas o grisáceas." },
        { label: "Molestias locales:", texto: " Sensación de quemazón, picor o dolor tanto en el área genital como en la anal." },
        { label: "Alteraciones en la piel:", texto: " Llagas, ampollas o úlceras alrededor de tus zonas íntimas." },
      ],
    },
    {
      bg: "#004CFF",
      titulo: "Sífilis",
      imagen: "/sifilis-icon.png",
      alt: "Sífilis ilustración",
      imagenIzquierda: true,
      parrafos: [
        "Es una infección de origen bacteriano que se contrae principalmente mediante relaciones sexuales sin protección (ya sea por vía oral, vaginal o anal) y puede transmitirse durante el embarazo.",
        "Síntomas presentes:",
      ],
      items: [
        { label: "Lesión inicial:", texto: " Suele aparecer una pequeña úlcera o llaga indolora." },
        { label: "Desaparición de la lesión:", texto: " Aunque esa llaga inicial desaparecerá, la infección persiste." },
      ],
    },
    {
      bg: "#028121",
      titulo: "Virus del Papiloma Humano",
      imagen: "/vph-icon.png",
      alt: "VPH ilustración",
      imagenIzquierda: false,
      parrafos: [
        "El VPH, o Virus del Papiloma Humano, es una infección que se contagia principalmente al mantener relaciones sexuales sin protección (ya sea por vía oral, vaginal o anal).",
        "Se han identificado más de 100 tipos distintos del virus, los cuales se agrupan en dos grandes familias según su impacto en la salud:",
      ],
      items: [
        { label: "Tipos de Alto Riesgo:", texto: " Esta categoría es la más preocupante, pues puede causar cáncer." },
        { label: "Tipos de Bajo Riesgo:", texto: " Estos tipos pueden causar verrugas genitales pero no están asociados al cáncer." },
      ],
    },
    {
      bg: "#E07C00",
      titulo: "Gonorrea",
      imagen: "/gonorrea.png",
      alt: "Gonorrea ilustración",
      imagenIzquierda: true,
      parrafos: [
        "Es una infección bacteriana que se contrae principalmente al mantener relaciones sexuales sin protección (ya sea por vía oral, vaginal o anal).",
        "Síntomas presentes:",
      ],
      items: [
        { label: "Lesiones:", texto: " Aparecen ampollas o llagas en la zona genital, el ano o la vulva del paciente." },
        { label: "Reactivación:", texto: " Aunque las lesiones iniciales desaparecen, el virus permanece en el cuerpo." },
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
          Infecciones de transmisión sexual
        </h1>
      </div>

      <div className="flex flex-col items-center gap-4 sm:gap-6 lg:gap-8 px-4">

        {tarjetas.map((tarjeta, index) => {
          const contenido = (
            <div className="flex-1 flex flex-col w-full p-5 sm:p-6 md:p-8 min-w-0">
              <h2 className="text-white text-base sm:text-lg md:text-[20px] font-semibold leading-snug sm:leading-[28px] text-left">
                {tarjeta.titulo}
              </h2>

              <div className="mt-4 sm:mt-6 md:mt-8">
                {tarjeta.parrafos.map((p, i) => (
                  <p
                    key={i}
                    className="text-white text-sm sm:text-base md:text-[18px] font-light leading-snug sm:leading-[28px] mb-3 sm:mb-4"
                  >
                    {p}
                  </p>
                ))}

                <ul className="space-y-1 sm:space-y-2">
                  {tarjeta.items.map((item, i) => (
                    <li
                      key={i}
                      className="text-white text-sm sm:text-base md:text-[18px] font-light leading-snug sm:leading-[28px]"
                    >
                      <span className="font-medium">{item.label}</span>
                      {item.texto}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );

          const imagen = (
            <div className="flex-shrink-0 w-full sm:w-auto flex items-center justify-center p-4 sm:p-6">
              <div className="w-32 h-32 sm:w-40 sm:h-40 md:w-52 md:h-52 lg:w-[300px] lg:h-[300px]">
                <Image
                  src={tarjeta.imagen}
                  alt={tarjeta.alt}
                  width={300}
                  height={300}
                  className="object-contain w-full h-full"
                />
              </div>
            </div>
          );

          return (
            <div
              key={index}
              className="w-full max-w-[1270px] rounded-3xl overflow-hidden"
              style={{ backgroundColor: tarjeta.bg }}
            >
              <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 md:gap-6 p-2 sm:p-3 md:p-4">
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
                Sollicitudin pulvinar lectus cubilia phasellus arcu eget condimentum taciti, litora inceptos cras molestie in tristique diam vehicula, neque nisl consequat
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}