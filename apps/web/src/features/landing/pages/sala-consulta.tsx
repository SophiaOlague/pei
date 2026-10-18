"use client";

import {
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  User,
  Video,
  VideoOff,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

// Solo interfaz: el video real lo aportará el backend.
export function Landing() {
  const [joined, setJoined] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [chat, setChat] = useState(false);

  const toggle = (
    on: boolean,
    set: (v: boolean) => void,
    label: string,
    Icon: typeof Mic,
    IconOff: typeof Mic,
  ) => (
    <button
      onClick={() => set(!on)}
      aria-label={`${on ? "Desactivar" : "Activar"} ${label}`}
      aria-pressed={!on}
      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition ${on ? "bg-white/15 hover:bg-white/25 text-white" : "bg-[#E23A5C] text-white"}`}
    >
      {on ? <Icon /> : <IconOff />}
    </button>
  );

  if (!joined)
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-10">
        <Image src="/logo.svg" alt="Logo" width={48} height={48} />
        <h1 className="text-black text-[28px] sm:text-[40px] font-medium mt-6 text-center">
          Antes de entrar
        </h1>
        <p className="text-[#717171] text-[16px] sm:text-[20px] mt-2 text-center">
          Revisa tu cámara y micrófono · Dr Jose Mart, 10:00 AM
        </p>
        <div className="mt-8 w-full max-w-[560px] aspect-video bg-[#2B2B33] rounded-2xl flex items-center justify-center">
          {cam ? (
            <User className="w-20 h-20 text-white/40" />
          ) : (
            <VideoOff className="w-12 h-12 text-white/60" />
          )}
        </div>
        <div className="flex gap-4 mt-6 bg-[#2B2B33] p-2 rounded-full">
          {toggle(mic, setMic, "micrófono", Mic, MicOff)}
          {toggle(cam, setCam, "cámara", Video, VideoOff)}
        </div>
        <button
          onClick={() => setJoined(true)}
          className="mt-8 w-full max-w-[560px] h-[52px] bg-[#664BDB] rounded-lg text-white text-[18px] hover:bg-[#5a3fc4] transition"
        >
          Entrar a la consulta
        </button>
        <Link href="/mis-citas" className="text-[#664BDB] mt-5 hover:underline">
          Volver a mis citas
        </Link>
      </div>
    );

  return (
    <div className="h-screen bg-[#1B1B22] flex flex-col">
      <div className="flex-1 flex flex-col md:flex-row gap-4 p-4 min-h-0">
        <div className="flex-1 relative rounded-2xl overflow-hidden bg-black min-h-0">
          <Image
            src="/doctor.jpg"
            alt="Dr Jose Mart"
            fill
            className="object-cover"
          />
          <span className="absolute left-4 bottom-4 bg-black/60 text-white px-3 py-1 rounded-lg text-[14px]">
            Dr Jose Mart
          </span>
          <div className="absolute right-4 bottom-4 w-[110px] sm:w-[180px] aspect-video bg-[#2B2B33] rounded-xl border border-white/20 flex items-center justify-center">
            {cam ? (
              <User className="w-8 h-8 text-white/50" />
            ) : (
              <VideoOff className="w-6 h-6 text-white/60" />
            )}
            <span className="absolute left-2 bottom-1 text-white text-[12px]">
              Tú
            </span>
          </div>
        </div>
        {chat && (
          <aside className="md:w-[320px] h-[220px] md:h-auto bg-white rounded-2xl p-4 flex flex-col">
            <h2 className="text-black text-[18px] font-medium">Chat</h2>
            <div className="flex-1 mt-3 text-[#717171] text-[14px]">
              Aún no hay mensajes.
            </div>
            <input
              aria-label="Mensaje"
              placeholder="Escribe un mensaje"
              className="h-[42px] px-3 border border-gray-300 rounded-lg text-[14px] text-black focus:outline-none focus:border-[#684DDE]"
            />
          </aside>
        )}
      </div>
      <div className="flex justify-center gap-4 py-4 bg-[#12121A]">
        {toggle(mic, setMic, "micrófono", Mic, MicOff)}
        {toggle(cam, setCam, "cámara", Video, VideoOff)}
        <button
          onClick={() => setChat(!chat)}
          aria-label="Chat"
          aria-pressed={chat}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white transition ${chat ? "bg-[#7355F7]" : "bg-white/15 hover:bg-white/25"}`}
        >
          <MessageSquare />
        </button>
        <Link
          href="/mis-citas"
          aria-label="Terminar consulta"
          className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#E23A5C] text-white flex items-center justify-center hover:opacity-90 transition"
        >
          <PhoneOff />
        </Link>
      </div>
    </div>
  );
}
