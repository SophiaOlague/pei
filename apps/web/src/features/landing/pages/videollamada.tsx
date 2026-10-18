"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Video, VideoOff, Phone } from "lucide-react";
import { UserMenu } from "@/features/components/user-menu";

export function VideoLlamada() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleJoinCall = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    router.push("/llamada-activa");
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

      <main className="flex-1 flex flex-col items-center justify-start px-4 sm:px-6 md:px-8 py-6 sm:py-8 md:py-10 gap-6 sm:gap-8">

        <div className="w-full max-w-[900px] flex flex-col gap-6 sm:gap-8">

          <div className="relative w-full aspect-[16/9] bg-black rounded-2xl overflow-hidden shadow-lg">

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-sm sm:text-base text-center px-4">
                {error}
              </div>
            )}

            {!camOn && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-sm sm:text-base">
                Cámara apagada
              </div>
            )}

            <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:gap-4">
              <button
                onClick={toggleMic}
                className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  micOn
                    ? "bg-white/20 hover:bg-white/30"
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

              <button
                onClick={toggleCam}
                className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  camOn
                    ? "bg-white/20 hover:bg-white/30"
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
            </div>
          </div>

          <div className="w-full bg-[#F8F8F8] rounded-2xl p-4 sm:p-5 md:p-6 flex items-center gap-4 sm:gap-5">

            <div className="w-16 h-16 sm:w-18 sm:h-18 md:w-20 md:h-20 rounded-full overflow-hidden flex-shrink-0 bg-gray-300">
              <img
                src="/doctor.jpg"
                alt="Dr. Oscar Wismichu"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-black text-base sm:text-lg md:text-[20px] font-semibold break-words">
                Dr. Oscar Wismichu
              </h3>
              <p className="text-[#717171] text-sm sm:text-base md:text-[16px] font-normal break-words">
                Especialista en Infectología
              </p>
              <p className="text-[#717171] text-xs sm:text-sm md:text-[14px] font-normal break-words">
                Cédula profesional: 1225464568
              </p>
            </div>

            <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-[#00D856]/15 flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#00D856] animate-pulse"></span>
              <span className="text-[#00D856] text-xs sm:text-sm font-medium whitespace-nowrap">
                En línea
              </span>
            </div>

          </div>

          <button
            onClick={handleJoinCall}
            className="w-full max-w-[384px] mx-auto h-11 sm:h-12 md:h-[50px] text-white text-sm sm:text-base md:text-[18px] font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2"
            style={{
              backgroundColor: "#7355F7",
              borderRadius: "10px",
            }}
          >
            <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
            Unirme a la llamada
          </button>

        </div>

      </main>
    </div>
  );
}