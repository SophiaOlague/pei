"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function Landing() {
  const router = useRouter();

  return (
    <div className="flex flex-col font-sans">

      <section 
        className="relative flex flex-col px-4 sm:px-6 md:px-10 pt-6 sm:pt-8 md:pt-10 overflow-hidden min-h-svh" 
        style={{ backgroundColor: '#7355F7' }}
      >
        <div 
          className="absolute inset-0 opacity-[0.12] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '256px 256px'
          }}
        />

        <div className="relative z-10 w-full max-w-7xl mx-auto flex-1 flex flex-col">

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6 mb-6 sm:mb-12 md:mb-16">
            <div className="flex-shrink-0">
              <img 
                src="/logo-pei.png"
                className="h-8 xs:h-10 sm:h-12 md:h-14 w-auto"
              />
            </div>
            
            <nav className="flex flex-wrap items-center justify-center gap-2 xs:gap-3 sm:gap-3 md:gap-6 lg:gap-8">
              <Link 
                href="#buscar-citas" 
                className="text-white hover:opacity-80 transition-opacity text-[11px] xs:text-xs sm:text-sm md:text-base font-medium whitespace-nowrap"
              >
                Sobre PrEP
              </Link>
              
              <Link 
                href="#como-funciona" 
                className="text-white hover:opacity-80 transition-opacity text-[11px] xs:text-xs sm:text-sm md:text-base font-medium whitespace-nowrap"
              >
                Sobre nosotros
              </Link>
              
              <Link 
                href="/login" 
                className="text-white hover:opacity-80 transition-opacity text-[11px] xs:text-xs sm:text-sm md:text-base font-medium whitespace-nowrap"
              >
                Iniciar sesión
              </Link>
              
              <button 
                onClick={() => router.push("/signup")}
                className="text-white px-2.5 xs:px-3 sm:px-4 md:px-6 py-1 xs:py-1.5 sm:py-2 md:py-2.5 text-[11px] xs:text-xs sm:text-sm md:text-base font-medium hover:bg-white/10 transition-all whitespace-nowrap cursor-pointer"
                style={{
                  background: 'transparent',
                  border: '2px solid white',
                  borderRadius: '9999px'
                }}
              >
                Registrarse
              </button>
            </nav>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-end gap-6 sm:gap-8 lg:gap-12">
            <div className="flex-1 text-center lg:text-left w-full lg:pb-8">
              <h1 className="text-[26px] xs:text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight mb-3 sm:mb-4">
                La mejor decisión es
                <br className="hidden sm:block" />
                <span className="text-white/95">cuidarte</span>
              </h1>
              
              <p className="text-white/80 text-sm xs:text-base sm:text-lg md:text-xl mb-5 sm:mb-8 max-w-lg mx-auto lg:mx-0 leading-relaxed">
                En PEI pensamos primero en ti, es seguro, efectivo y
                <br className="hidden sm:block" />
                está a tu alcance.
              </p>

              <button 
                onClick={() => router.push("/signup")}
                className="px-5 xs:px-6 sm:px-8 md:px-10 py-2.5 sm:py-3 md:py-3.5 rounded-md font-semibold text-xs xs:text-sm sm:text-base md:text-lg hover:opacity-90 transition-all shadow-lg mb-5 sm:mb-8 cursor-pointer"
                style={{ 
                  backgroundColor: 'oklch(70.4% 0.14 182.503)',
                  color: '#000000'
                }}
              >
                Agenda tu cita
              </button>

              <div className="w-full flex justify-center lg:justify-start mt-8 sm:mt-12 md:mt-20 lg:mt-24">
                <div className="flex flex-wrap items-center justify-center gap-4 xs:gap-5 sm:gap-6 md:gap-10">
                  <span className="text-white/90 text-[10px] xs:text-xs sm:text-sm md:text-base">Seguro</span>
                  <span className="text-white/90 text-[10px] xs:text-xs sm:text-sm md:text-base">Confidencial</span>
                  <span className="text-white/90 text-[10px] xs:text-xs sm:text-sm md:text-base">Atención 24/7</span>
                  <span className="text-white/90 text-[10px] xs:text-xs sm:text-sm md:text-base">Envío discreto</span>
                </div>
              </div>
            </div>

            <div className="flex-1 flex justify-center lg:justify-end items-end w-full mt-6 lg:mt-0 max-w-xs xs:max-w-sm sm:max-w-md lg:max-w-lg">
              <img 
                src="/personas.png" 
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-40">
        <div className="max-w-7xl mx-auto">
          <div 
            className="rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-10 lg:p-12"
            style={{
              background: 'linear-gradient(to right, oklch(44.4% 0.177 26.899), oklch(55.3% 0.195 38.402), oklch(82.8% 0.189 84.429), oklch(64.8% 0.2 131.684),oklch(70.4% 0.14 182.503), oklch(48.8% 0.243 264.376), oklch(45.7% 0.24 277.023))'
            }}
          >
            <div className="flex flex-col lg:flex-row items-center gap-6 sm:gap-8 lg:gap-12">
              <div className="w-full lg:w-1/2">
                <h2 className="text-white text-lg xs:text-xl sm:text-2xl md:text-3xl lg:text-4xl leading-tight">
                  PEI es tu mejor aliado, con él puedes hacer compras mucho mejor y más rápido con más cuidado con más seguridad
                </h2>
              </div>

              <div className="w-full lg:w-1/2 bg-white rounded-2xl p-5 sm:p-8 md:p-10">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-8">
                  <div className="flex flex-col items-center text-center">
                    <svg className="w-9 xs:w-10 sm:w-12 md:w-14 h-9 xs:h-10 sm:h-12 md:h-14 text-[oklch(51.1%_0.262_276.966)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="text-gray-800 text-sm sm:text-base md:text-lg font-bold mt-3 sm:mt-4">Tomalo diariamente</h3>
                    <p className="text-gray-500 text-xs sm:text-sm mt-1">Una pastilla al día es suficiente</p>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <svg className="w-9 xs:w-10 sm:w-12 md:w-14 h-9 xs:h-10 sm:h-12 md:h-14 text-[oklch(51.1%_0.262_276.966)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <h3 className="text-gray-800 text-sm sm:text-base md:text-lg font-bold mt-3 sm:mt-4">Crea protección</h3>
                    <p className="text-gray-500 text-xs sm:text-sm mt-1">Una pastilla al día es suficiente</p>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <svg className="w-9 xs:w-10 sm:w-12 md:w-14 h-9 xs:h-10 sm:h-12 md:h-14 text-[oklch(51.1%_0.262_276.966)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <h3 className="text-gray-800 text-sm sm:text-base md:text-lg font-bold mt-3 sm:mt-4">Vive feliz</h3>
                    <p className="text-gray-500 text-xs sm:text-sm mt-1">Una pastilla al día es suficiente</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
        <div className="col-span-1">
          <div className="w-full aspect-square bg-gray-200 flex items-center justify-center">
            <img src="/imagen1.jpg" className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="col-span-1">
          <div className="w-full h-full bg-white border border-gray-200 p-4 sm:p-4 md:p-6 flex items-center justify-center aspect-square overflow-hidden">
            <p className="text-gray-800 text-[24px] sm:text-[20px] md:text-[22px] lg:text-[28px] xl:text-[32px] text-center leading-tight font-medium">
              CREA
              <br />
              PROTECCIÓN
              <br />
              CON UNA
              <br />
              SOLA
              <br />
              PASTILLA
            </p>
          </div>
        </div>

        <div className="col-span-1">
          <div className="w-full aspect-square bg-gray-200 flex items-center justify-center">
            <img src="/imagen2.jpg" className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="col-span-1">
          <div className="w-full h-full bg-white border border-gray-200 p-4 sm:p-4 md:p-6 flex items-center justify-center aspect-square overflow-hidden">
            <p className="text-gray-800 text-[24px] sm:text-[20px] md:text-[22px] lg:text-[28px] xl:text-[32px] text-center leading-tight font-medium">
              PEI ES TU
              <br />
              MEJOR OPCIÓN,
              <br />
              PEI ES TU
              <br />
              ALIADO
            </p>
          </div>
        </div>

        <div className="col-span-1">
          <div className="w-full h-full bg-white border border-gray-200 p-4 sm:p-4 md:p-6 flex items-center justify-center aspect-square overflow-hidden">
            <p className="text-gray-800 text-[24px] sm:text-[20px] md:text-[22px] lg:text-[28px] xl:text-[32px] text-center leading-tight font-medium">
              PEI ES TU
              <br />
              MEJOR OPCIÓN,
              <br />
              PEI ES TU
              <br />
              ALIADO
            </p>
          </div>
        </div>

        <div className="col-span-1">
          <div className="w-full aspect-square bg-gray-200 flex items-center justify-center">
            <img src="/imagen3.jpg" className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="col-span-1">
          <div className="w-full h-full bg-white border border-gray-200 p-4 sm:p-4 md:p-6 flex items-center justify-center aspect-square overflow-hidden">
            <p className="text-gray-800 text-[24px] sm:text-[20px] md:text-[22px] lg:text-[28px] xl:text-[32px] text-center leading-tight font-medium">
              PEI ES TU
              <br />
              MEJOR OPCIÓN,
              <br />
              PEI ES TU
              <br />
              ALIADO
            </p>
          </div>
        </div>

        <div className="col-span-1">
          <div className="w-full aspect-square bg-gray-200 flex items-center justify-center">
            <img src="/imagen4.jpg" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      <section id="buscar-citas" className="bg-white px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-40">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 lg:gap-12">
            <div className="w-full lg:w-1/2 flex flex-col">
              <h2 className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl font-medium text-gray-800 mb-6 sm:mb-10">
                Busca citas disponibles y <br className="hidden sm:block" />
                antirretrovirales
              </h2>

              <div className="mb-5 sm:mb-8 flex-1">
                <h3 className="text-lg xs:text-xl sm:text-2xl md:text-3xl font-medium text-gray-800 mb-2">Citas inmediatas</h3>
                <p className="text-gray-600 text-sm sm:text-base md:text-lg">
                  Reserva citas de salud sexual rápidas y discretas para ayudarte en situaciones de emergencia.
                </p>
              </div>

              <div className="mb-5 sm:mb-8 flex-1">
                <h3 className="text-lg xs:text-xl sm:text-2xl md:text-3xl font-medium text-gray-800 mb-2">Agendar citas</h3>
                <p className="text-gray-600 text-sm sm:text-base md:text-lg">
                  Agenda citas con nuestros especialistas de salud sexual y VIH para exámenes de PrEP y más, citas disponibles cuando necesites.
                </p>
              </div>

              <div className="mb-5 sm:mb-8 flex-1">
                <h3 className="text-lg xs:text-xl sm:text-2xl md:text-3xl font-medium text-gray-800 mb-2">Antirretrovirales</h3>
                <p className="text-gray-600 text-sm sm:text-base md:text-lg">
                  Accede a antirretrovirales (ARV) y PrEP a un precio accesible, también obtén apoyo continuo para el manejo del VIH y cuidado de la salud sexual.
                </p>
              </div>

              <div 
                className="w-full rounded-xl p-5 sm:p-8 flex items-center justify-between mt-2 sm:mt-auto gap-4"
                style={{ 
                  backgroundColor: 'oklch(51.1% 0.262 276.966)',
                  borderRadius: '10px',
                  minHeight: '140px',
                }}
              >
                <div className="flex items-center gap-3 sm:gap-6">
                  <svg className="w-8 xs:w-10 sm:w-12 h-8 xs:h-10 sm:h-12 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <div>
                    <h4 className="text-white text-base xs:text-lg sm:text-xl md:text-2xl font-bold">
                      Atención confidencial
                    </h4>
                    <p className="text-white/80 text-xs sm:text-sm md:text-base">
                      Toda la información de tus pacientes <br className="hidden sm:block" />
                      está protegida y encriptada
                    </p>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-14 h-14 xs:w-16 xs:h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 flex items-center justify-center overflow-hidden">
                    <img src="/pastilla.png" className="w-full h-full object-contain" />
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-1/2">
              <div 
                className="w-full overflow-hidden bg-gray-200 rounded-2xl"
                style={{ aspectRatio: '641/922' }}
              >
                <img src="/persona-grande.jpg" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>

 
      <section className="bg-white px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-18">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 sm:mb-16">
            <h2 className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl font-medium text-black mb-3 sm:mb-6">¿Por qué usar PrEP?</h2>
            <p className="text-gray-600 text-sm sm:text-base md:text-lg lg:text-xl max-w-4xl">
              La PrEP es una pastilla de toma diaria que puede reducir el riesgo de infección por el VIH hasta en un 99 % cuando se toma según las indicaciones.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-8">
            <div className="bg-[#0159FB] rounded-2xl p-5 sm:p-8 text-white">
              <div className="w-10 xs:w-12 sm:w-14 h-10 xs:h-12 sm:h-14 rounded-full bg-white/20 flex items-center justify-center mb-3 sm:mb-6">
                <svg className="w-5 xs:w-6 sm:w-7 h-5 xs:h-6 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg xs:text-xl sm:text-2xl font-bold mb-2">Altamente efectivo</h3>
              <p className="text-white/80 text-sm sm:text-base">Hasta un 99 % de eficacia en la prevención del VIH cuando se toma según lo prescrito.</p>
            </div>
            <div className="bg-[#0159FB] rounded-2xl p-5 sm:p-8 text-white">
              <div className="w-10 xs:w-12 sm:w-14 h-10 xs:h-12 sm:h-14 rounded-full bg-white/20 flex items-center justify-center mb-3 sm:mb-6">
                <svg className="w-5 xs:w-6 sm:w-7 h-5 xs:h-6 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-lg xs:text-xl sm:text-2xl font-bold mb-2">Soporte médico</h3>
              <p className="text-white/80 text-sm sm:text-base">Consulta a médicos con licencia en línea y recibe apoyo continuo.</p>
            </div>
            <div className="bg-[#0159FB] rounded-2xl p-5 sm:p-8 text-white">
              <div className="w-10 xs:w-12 sm:w-14 h-10 xs:h-12 sm:h-14 rounded-full bg-white/20 flex items-center justify-center mb-3 sm:mb-6">
                <svg className="w-5 xs:w-6 sm:w-7 h-5 xs:h-6 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-lg xs:text-xl sm:text-2xl font-bold mb-2">Discreto y conveniente</h3>
              <p className="text-white/80 text-sm sm:text-base">Entregamos en su domicilio con un embalaje discreto para proteger su privacidad.</p>
            </div>
          </div>
        </div>
      </section>

  
      <section id="como-funciona" className="bg-white px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-24">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl font-medium text-black mb-8 sm:mb-16">Cómo funciona PEI</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-10">
            <div className="text-center">
              <div className="w-14 xs:w-16 sm:w-20 h-14 xs:h-16 sm:h-20 rounded-full text-white text-2xl xs:text-3xl sm:text-4xl font-bold flex items-center justify-center mx-auto mb-3 sm:mb-6" style={{ backgroundColor: 'oklch(52.7% 0.154 150.069)' }}>1</div>
              <h3 className="text-lg xs:text-xl sm:text-2xl font-bold text-gray-800 mb-2">Completa tu registro</h3>
              <p className="text-gray-600 text-sm sm:text-base">Responde un breve formulario sobre tu salud y estilo de vida.</p>
            </div>
            <div className="text-center">
              <div className="w-14 xs:w-16 sm:w-20 h-14 xs:h-16 sm:h-20 rounded-full text-white text-2xl xs:text-3xl sm:text-4xl font-bold flex items-center justify-center mx-auto mb-3 sm:mb-6" style={{ backgroundColor: 'oklch(52.7% 0.154 150.069)' }}>2</div>
              <h3 className="text-lg xs:text-xl sm:text-2xl font-bold text-gray-800 mb-2">Opinión médica</h3>
              <p className="text-gray-600 text-sm sm:text-base">Un profesional autorizado revisa sus respuestas y su historial médico.</p>
            </div>
            <div className="text-center">
              <div className="w-14 xs:w-16 sm:w-20 h-14 xs:h-16 sm:h-20 rounded-full text-white text-2xl xs:text-3xl sm:text-4xl font-bold flex items-center justify-center mx-auto mb-3 sm:mb-6" style={{ backgroundColor: 'oklch(52.7% 0.154 150.069)' }}>3</div>
              <h3 className="text-lg xs:text-xl sm:text-2xl font-bold text-gray-800 mb-2">Prescripción aprobada</h3>
              <p className="text-gray-600 text-sm sm:text-base">Si el médico aprueba PrEP para ti, te hará la prescripción.</p>
            </div>
            <div className="text-center">
              <div className="w-14 xs:w-16 sm:w-20 h-14 xs:h-16 sm:h-20 rounded-full text-white text-2xl xs:text-3xl sm:text-4xl font-bold flex items-center justify-center mx-auto mb-3 sm:mb-6" style={{ backgroundColor: 'oklch(52.7% 0.154 150.069)' }}>4</div>
              <h3 className="text-lg xs:text-xl sm:text-2xl font-bold text-gray-800 mb-2">Envío de medicamentos</h3>
              <p className="text-gray-600 text-sm sm:text-base">Entregamos tu medicamento en la puerta de tu casa con embalaje discreto.</p>
            </div>
          </div>

          <section className="bg-white px-0 sm:px-6 md:px-10 py-12 sm:py-20 md:py-24">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-10">
                <div className="flex flex-col gap-5 sm:gap-8">
                  <div className="relative overflow-hidden rounded-2xl bg-gray-200 aspect-[806/427]">
                    <img src="/papaya.jpg" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="text-sm xs:text-base sm:text-lg md:text-xl lg:text-2xl text-center text-gray-800 leading-tight">
                      El placer no tiene prejuicios: la salud se comparte, la protección se usa y el sexo se disfruta.
                    </p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="relative overflow-hidden rounded-2xl bg-gray-200 w-full aspect-[498/550] max-h-[500px] sm:max-h-[700px] lg:max-h-[800px]">
                    <img src="/mujeres.jpg" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>

  
      <section className="bg-white px-4 sm:px-6 md:px-10 py-12 sm:py-16 md:py-5">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl text-black mb-8 sm:mb-16">Prevención familiar</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-8 mb-6 sm:mb-10">
            <div 
              className="relative rounded-2xl p-5 sm:p-8 overflow-hidden min-h-[180px] sm:min-h-[220px]"
              style={{ backgroundColor: 'oklch(87.9% 0.169 91.605)' }}
            >
              <div className="relative z-10 max-w-[65%] sm:max-w-[55%]">
                <h3 className="text-lg xs:text-xl sm:text-2xl font-bold text-white mb-2">Guía para familias aliadas a PEI</h3>
                <p className="text-white text-xs sm:text-sm md:text-base">Herramientas para apoyar desde el amor y respeto.</p>
              </div>
              <div className="absolute bottom-0 right-0 w-24 xs:w-32 sm:w-40 md:w-48 h-24 xs:h-32 sm:h-40 md:h-48">
                <img src="/familia1.png" className="w-full h-full object-cover" />
              </div>
            </div>
            <div 
              className="relative rounded-2xl p-5 sm:p-8 overflow-hidden min-h-[180px] sm:min-h-[220px]"
              style={{ backgroundColor: 'oklch(52.7% 0.154 150.069)' }}
            >
              <div className="relative z-10 max-w-[65%] sm:max-w-[55%]">
                <h3 className="text-lg xs:text-xl sm:text-2xl font-bold text-white mb-2">Cómo hablar de PrEP en familia</h3>
                <p className="text-white/80 text-xs sm:text-sm md:text-base">Consejos prácticos para tener conversaciones sin juicios</p>
              </div>
              <div className="absolute bottom-0 right-0 w-24 xs:w-32 sm:w-40 md:w-48 h-24 xs:h-32 sm:h-40 md:h-48">
                <img src="/familia2.png" className="w-full h-full object-cover" />
              </div>
            </div>
            <div 
              className="relative rounded-2xl p-5 sm:p-8 overflow-hidden min-h-[180px] sm:min-h-[220px]"
              style={{ backgroundColor: '#0159FB' }}
            >
              <div className="relative z-10 max-w-[65%] sm:max-w-[55%]">
                <h3 className="text-lg xs:text-xl sm:text-2xl font-bold text-white mb-2">Prevención para todas las edades</h3>
                <p className="text-white/80 text-xs sm:text-sm md:text-base">Información clara para cada etapa de la vida</p>
              </div>
              <div className="absolute bottom-0 right-0 w-24 xs:w-32 sm:w-40 md:w-48 h-24 xs:h-32 sm:h-40 md:h-48">
                <img src="/familia3.png" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          <div 
            className="relative rounded-2xl p-5 sm:p-8 md:p-10 overflow-hidden min-h-[160px] sm:min-h-[200px]"
            style={{ backgroundColor: 'oklch(29.3% 0.136 325.661)' }}
          >
            <div className="relative z-10 max-w-[75%] sm:max-w-[65%]">
              <h3 className="text-lg xs:text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2">
                ¿Necesitas orientación para hablar sobre PrEP?
              </h3>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                <p className="text-white/70 text-xs sm:text-sm md:text-base">Estamos aquí para apoyarte</p>
                <button 
                  onClick={() => router.push("/signup")}
                  className="bg-white text-[oklch(29.3%_0.136_325.661)] px-5 sm:px-8 py-2 sm:py-2.5 rounded-full font-semibold text-xs sm:text-sm md:text-base hover:bg-white/90 transition-all cursor-pointer w-fit"
                >
                  Leer más
                </button>
              </div>
            </div>
            <div className="absolute bottom-0 right-0 w-24 xs:w-32 sm:w-40 md:w-48 h-24 xs:h-32 sm:h-40 md:h-48">
              <img src="/orientacion.png" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      <section className="flex-1 bg-white px-4 sm:px-6 md:px-10 py-6 sm:py-8 md:py-10">
        <div className="max-w-7xl mx-auto"></div>
      </section>
    </div>
  );
}