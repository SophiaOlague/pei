"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Pill,
  Microscope,
  Droplet,
  Sun,
  Heart,
  Cigarette,
  Wine,
  Activity,
  Plus,
  ChevronRight,
} from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function LandingInicio() {
  const router = useRouter();

  const gruposSalud = [
    { icon: Droplet, label: "Grupo sanguíneo", value: "O+" },
    { icon: Sun, label: "Alergias", value: "Sin alergias" },
    { icon: Heart, label: "Condiciones médicas", value: "Ninguna" },
    { icon: Cigarette, label: "Tabaquismo", value: "No fumador" },
    { icon: Wine, label: "Consumo de alcohol", value: "Ocasionalmente" },
    { icon: Activity, label: "Actividad física", value: "3-4 veces por semana" },
  ];

  const expedienteItems = [
    { label: "General", path: "/historial-general" },
    { label: "Información médica", path: "/expediente" },
    { label: "Resultados de laboratorios", path: "/laboratorio" },
    { label: "Documentos", path: "/expediente-medico" },
    { label: "Historial", path: "/historial-medico" },
  ];

  return (
    <div className="min-h-screen bg-white font-sans">

      <style>{`
        @keyframes prideShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .pride-gradient {
          background: linear-gradient(
            90deg,
            #7355F7,
            #A78BFA,
            #60A5FA,
            #93C5FD,
            #34D399,
            #86EFAC,
            #FDE047,
            #FEF08A,
            #FB923C,
            #FDBA74,
            #EF4444,
            #FCA5A5,
            #7355F7
          );
          background-size: 400% 400%;
          animation: prideShift 60s ease-in-out infinite;
        }
        .minimal-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .minimal-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .minimal-scroll::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.08);
          border-radius: 2px;
        }
        .minimal-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.15);
        }
        .minimal-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 0, 0, 0.08) transparent;
        }
      `}</style>

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

      <div className="px-6 sm:px-8 md:px-10 mt-6 sm:mt-8 md:mt-10">
        <div className="max-w-7xl mx-auto">
          <section className="relative w-full overflow-hidden rounded-3xl pride-gradient">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.5' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                backgroundRepeat: "repeat",
                backgroundSize: "256px 256px",
                mixBlendMode: "overlay",
              }}
            />

            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row items-center justify-between min-h-[280px] sm:min-h-[320px] md:min-h-[360px]">

                <div className="flex-1 px-6 sm:px-8 md:px-10 py-8 sm:py-10 md:py-12 w-full sm:w-auto">
                  <h1 className="text-white text-3xl sm:text-4xl md:text-5xl font-semibold leading-tight drop-shadow-md">
                    Tu salud
                    <br />
                    Tu protección
                    <br />
                    Nuestra prioridad
                  </h1>
                </div>

                <div className="relative w-full sm:w-auto h-[180px] sm:h-[240px] md:h-[320px] flex items-end justify-center sm:justify-end self-end">
                  <img
                    src="/gayFeliz.png"
                    alt="Hero"
                    className="h-full w-auto object-contain object-bottom block"
                  />
                </div>

              </div>
            </div>
          </section>
        </div>
      </div>

      <main className="px-6 sm:px-8 md:px-10 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch">

            <div className="flex flex-col gap-6">

              <div
                className="w-full p-6 rounded-2xl flex-1"
                style={{
                  backgroundColor: "#7355F7",
                  borderRadius: "12px",
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Calendar className="w-6 h-6 text-white" strokeWidth={1.5} />
                  <h3 className="text-white text-[20px] font-regular">
                    Mi próxima cita
                  </h3>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className="text-white/70 text-[16px]">10 de Agosto</span>
                  <span className="w-1 h-1 bg-white/70 rounded-full"></span>
                  <span className="text-white/70 text-[16px]">05:30 p.m.</span>
                </div>

                <button
                  onClick={() => router.push("/videollamada")}
                  className="w-full h-[55px] text-[#7355F7] text-[20px] font-regular hover:opacity-90 transition-opacity cursor-pointer"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "10px",
                  }}
                >
                  Unirme a la llamada
                </button>
              </div>

              <div
                className="w-full p-6 rounded-2xl flex-1"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "12px",
                  minHeight: "340px",
                }}
              >
                <h3 className="text-black text-[20px] font-regular mb-6">
                  Mi expediente médico
                </h3>

                <div className="flex flex-col gap-3">
                  {expedienteItems.map((item, index) => (
                    <Link
                      key={index}
                      href={item.path}
                      className="w-full h-[42px] flex items-center gap-3 px-4 hover:opacity-80 transition-opacity cursor-pointer"
                      style={{
                        backgroundColor: "rgba(230, 230, 230, 0.4)",
                        borderRadius: "10px",
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: "#7355F7" }}
                      ></span>
                      <span className="text-black/50 text-[18px] font-regular">
                        {item.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

            </div>

            <div className="flex flex-col gap-6">

              <div
                onClick={() => router.push("/mis-prescripciones")}
                className="w-full p-6 rounded-2xl cursor-pointer hover:opacity-90 transition-opacity relative flex-1 flex flex-col"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "12px",
                }}
              >
                <ChevronRight
                  className="w-6 h-6 text-black/40 absolute top-4 right-4"
                  strokeWidth={1.5}
                />

                <div className="flex items-center gap-3 mb-3">
                  <Pill className="w-6 h-6 text-black" strokeWidth={1.5} />
                  <h3 className="text-black text-[20px] font-regular">
                    Mi próximo refill
                  </h3>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className="text-black/50 text-[16px]">10 de Agosto</span>
                  <span className="w-1 h-1 bg-black/50 rounded-full"></span>
                  <span className="text-black/50 text-[16px]">05:30 p.m.</span>
                </div>

                <p className="text-[#7355F7] text-[20px] font-regular mt-auto">
                  Ver más detalles
                </p>
              </div>

              <div
                className="w-full p-6 rounded-2xl flex-1 flex flex-col"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "12px",
                  minHeight: "360px",
                }}
              >
                <h3 className="text-black text-[20px] font-regular mb-6">
                  Mi resumen de salud
                </h3>

                <div className="flex flex-col gap-6 overflow-y-auto minimal-scroll pr-2 flex-1" style={{ maxHeight: "260px" }}>
                  {gruposSalud.map((item, index) => (
                    <div key={index} className="flex items-start gap-4">
                      <item.icon
                        className="w-6 h-6 flex-shrink-0 mt-0.5"
                        style={{ color: "#4A32B6" }}
                        strokeWidth={1.5}
                      />
                      <div>
                        <p className="text-black/50 text-[18px] font-regular">
                          {item.label}
                        </p>
                        <p className="text-black text-[18px] font-regular">
                          {item.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <div className="flex flex-col gap-6 md:col-span-2 lg:col-span-1">

              <button
                onClick={() => router.push("/detalle-laboratorio")}
                className="w-full p-6 rounded-2xl text-left hover:opacity-90 transition-opacity cursor-pointer flex-1"
                style={{
                  backgroundColor: "rgba(230, 230, 230, 0.3)",
                  borderRadius: "12px",
                  minHeight: "185px",
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Microscope className="w-6 h-6 text-black" strokeWidth={1.5} />
                  <h3 className="text-black text-[20px] font-regular">
                    Mis últimos laboratorios
                  </h3>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className="text-black/50 text-[16px]">10 de Agosto</span>
                  <span className="w-1 h-1 bg-black/50 rounded-full"></span>
                  <span className="text-black/50 text-[16px]">05:30 p.m.</span>
                </div>

                <div className="flex items-center justify-between mt-10">
                  <span className="text-black text-[20px] font-regular">
                    Resultados de laboratorios
                  </span>
                  <span
                    className="px-4 py-1.5 rounded-lg text-sm font-medium"
                    style={{
                      backgroundColor: "rgba(32, 216, 0, 0.1)",
                      color: "#20D800",
                    }}
                  >
                    Normal
                  </span>
                </div>
              </button>

              <button
                onClick={() => router.push("/agendar-cita")}
                className="w-full h-[58px] text-white text-[20px] font-regular hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2"
                style={{
                  backgroundColor: "#7355F7",
                  borderRadius: "10px",
                }}
              >
                <Plus className="w-5 h-5" />
                Agendar cita
              </button>

              <div
                onClick={() => router.push("/prevencion-fam")}
                className="w-full h-[121px] p-[1.5px] cursor-pointer"
                style={{
                  background: "linear-gradient(to right, #770088, #0158FB)",
                  borderRadius: "12px",
                }}
              >
                <div className="w-full h-full bg-white rounded-[10.5px] flex items-center justify-between px-6">
                  <span className="text-black text-[20px] font-regular flex-1">
                    Infecciones de de <br />
                    transmisión sexual
                  </span>
                  <div className="w-30 h-30 flex items-center justify-center flex-shrink-0">
                    <img
                      src="/condonMorado.png"
                      alt="Imagen ITS"
                      className="w-full h-full object-contain rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div
                onClick={() => router.push("/more-ets")}
                className="w-full h-[121px] p-[1.5px] cursor-pointer"
                style={{
                  background: "linear-gradient(to right, #028121, #E07C00)",
                  borderRadius: "12px",
                }}
              >
                <div className="w-full h-full bg-white rounded-[10.5px] flex items-center justify-between px-6">
                  <span className="text-black text-[20px] font-regular flex-1">
                    Más sobre ITS
                  </span>
                  <div className="w-45 h-50 flex items-center justify-center flex-shrink-0">
                    <img
                      src="/gaysFelices.png"
                      alt="Imagen ITS"
                      className="w-full h-full object-contain rounded-lg"
                    />
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      </main>
    </div>
  );
}