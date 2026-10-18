"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function LlamadaActiva() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState("");

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error(err);
        setError("No se pudo acceder a la cámara o micrófono");
      }
    };

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const toggleMic = () => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setMicOn((prev) => !prev);
    }
  };

  const toggleCam = () => {
    if (streamRef.current) {
      const videoTracks = streamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setCamOn((prev) => !prev);
    }
  };

  const handleEndCall = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    router.push("/landing-inicio");
  };

  const handleSaveNote = () => {
    if (nota.trim() === "") return;
    console.log("Nota guardada:", nota);
    setNota("");
  };

  return (
    <div className="min-h-screen bg-white font-sans flex flex-col">

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

      <main className="flex-1 px-4 sm:px-6 md:px-8 py-6 sm:py-8 md:py-10">
        <div className="max-w-[1280px] mx-auto flex flex-col gap-6 sm:gap-8">

          <div className="relative w-full bg-black rounded-2xl overflow-hidden shadow-lg aspect-[16/9] sm:aspect-[1237/597]">

            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[55%] h-[85%] sm:w-[45%] sm:h-[80%] md:w-[40%] md:h-[75%] flex items-center justify-center">
                <div className="w-full h-full bg-[#1a1a1a] rounded-lg flex items-center justify-center overflow-hidden">
                  <img
                    src="/doctor.jpg"
                    alt="Dr. Wismichu"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>

            <div className="absolute top-3 left-3 sm:top-4 sm:left-4 md:top-5 md:left-5 z-10">
              <span className="text-white text-sm sm:text-base md:text-[18px] font-medium drop-shadow-md">
                Dr. OSCAR
              </span>
            </div>

            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 md:top-5 md:right-5 w-[100px] h-[75px] sm:w-[140px] sm:h-[105px] md:w-[170px] md:h-[125px] rounded-lg overflow-hidden bg-[#1a1a1a] shadow-lg z-10">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!camOn && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-[10px] sm:text-xs text-center px-1">
                  Cámara apagada
                </div>
              )}
            </div>

            <div className="absolute bottom-3 sm:bottom-4 md:bottom-5 left-1/2 -translate-x-1/2 flex items-end gap-4 sm:gap-6 md:gap-8 z-10">
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={toggleMic}
                  className={`w-12 h-12 sm:w-14 sm:h-14 md:w-[64px] md:h-[64px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    micOn
                      ? "bg-white/25 hover:bg-white/35"
                      : "bg-red-500 hover:bg-red-600"
                  }`}
                  aria-label={micOn ? "Silenciar micrófono" : "Activar micrófono"}
                >
                  {micOn ? (
                    <Mic className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white" />
                  ) : (
                    <MicOff className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white" />
                  )}
                </button>
                <span className="text-white text-[11px] sm:text-xs md:text-sm font-normal">
                  Micrófono
                </span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={toggleCam}
                  className={`w-12 h-12 sm:w-14 sm:h-14 md:w-[64px] md:h-[64px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                    camOn
                      ? "bg-white/25 hover:bg-white/35"
                      : "bg-red-500 hover:bg-red-600"
                  }`}
                  aria-label={camOn ? "Apagar cámara" : "Encender cámara"}
                >
                  {camOn ? (
                    <Video className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white" />
                  ) : (
                    <VideoOff className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white" />
                  )}
                </button>
                <span className="text-white text-[11px] sm:text-xs md:text-sm font-normal">
                  Cámara
                </span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={handleEndCall}
                  className="w-12 h-12 sm:w-14 sm:h-14 md:w-[64px] md:h-[64px] rounded-full bg-[#B7282E] hover:bg-[#9d2026] flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Finalizar llamada"
                >
                  <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white" />
                </button>
                <span className="text-white text-[11px] sm:text-xs md:text-sm font-normal">
                  Finalizar
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-black text-base sm:text-lg md:text-[20px] font-semibold">
              Motivo de la consulta
            </h3>
            <p className="text-[#717171] text-sm sm:text-base md:text-[16px] font-normal">
              Seguimiento PEI
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-black text-base sm:text-lg md:text-[20px] font-semibold">
              Notas rápidas
            </h3>

            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Escribe una nota rápida..."
              className="w-full min-h-[78px] p-4 rounded-lg border border-black/20 bg-white text-black text-sm sm:text-base focus:outline-none focus:border-[#7355F7] resize-none"
            />
          </div>

          <button
            onClick={handleSaveNote}
            disabled={nota.trim() === ""}
            className={`w-full max-w-[384px] h-11 sm:h-12 md:h-[50px] text-white text-sm sm:text-base md:text-[18px] font-medium rounded-lg transition-opacity flex items-center justify-center ${
              nota.trim() === ""
                ? "opacity-40 cursor-not-allowed"
                : "hover:opacity-90 cursor-pointer"
            }`}
            style={{ backgroundColor: "#7355F7" }}
          >
            Guardar nota
          </button>

        </div>
      </main>
    </div>
  );
}