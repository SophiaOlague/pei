"use client";

import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  clearMeCache,
  getMeCached,
  getProfilePhotoUrlCached,
  subscribeProfilePhoto,
} from "@/lib/api";
import { authClient } from "@/lib/auth-client";

interface UserMenuProps {
  variant?: "light" | "dark";
  hideName?: boolean;
}

export function UserMenu({
  variant = "light",
  hideName = false,
}: UserMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Nombre real: el del perfil (GET /me) o, si aún no hay perfil, el que la persona dio al registrarse.
  // Mientras carga, o si falla, no se muestra ningún nombre.
  const { data: session } = authClient.useSession();
  const userId = session?.user.id;
  const [nombre, setNombre] = useState("");
  // Avatar: la foto privada del perfil (GET /me/profile/photo) si existe; si no hay foto, sesión o la
  // descarga falla, se queda el avatar de la entrega. Se vuelve a pedir cuando se sube una foto nueva.
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  useEffect(
    () => subscribeProfilePhoto(() => setPhotoVersion((v) => v + 1)),
    [],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: photoVersion fuerza la recarga tras subir una foto.
  useEffect(() => {
    if (!userId) {
      setNombre("");
      setFotoUrl(null);
      return;
    }
    let cancelled = false;
    getMeCached(userId)
      .then(async (me) => {
        if (cancelled) return;
        const perfil = me.profile;
        setNombre(
          perfil
            ? `${perfil.firstName} ${perfil.lastName}`
            : (session?.user.name ?? ""),
        );
        const url = await getProfilePhotoUrlCached(
          userId,
          perfil?.hasPhoto ?? false,
        );
        if (!cancelled) setFotoUrl(url);
      })
      .catch(() => {
        if (cancelled) return;
        setNombre("");
        setFotoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, session?.user.name, photoVersion]);

  const textColor = variant === "dark" ? "text-white" : "text-[#535353]";
  const iconColor = variant === "dark" ? "text-white" : "text-[#7355F7]";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    clearMeCache();
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login");
        },
      },
    });
  };

  const menuItems = [
    { label: "Mis citas", path: "/mis-citas" },
    { label: "Prescripciones", path: "/mis-prescripciones" },
    { label: "Perfil", path: "/perfil-usuario" },
    { label: "Inicio", path: "/landing-inicio" },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-1">
          {!hideName && (
            <span
              className={`${textColor} text-[14px] sm:text-[16px] lg:text-[20px] font-normal`}
            >
              {nombre}
            </span>
          )}
          <ChevronDown
            className={`w-5 h-5 ${iconColor} transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden flex-shrink-0">
          {fotoUrl ? (
            // biome-ignore lint/performance/noImgElement: blob local de una imagen privada; next/image no aplica.
            <img
              src={fotoUrl}
              alt="Perfil"
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          ) : (
            <Image
              src="/perfil-usuario.png"
              alt="Perfil"
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          )}
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-3 w-[250px] bg-[#F5F5F5] rounded-2xl shadow-lg p-6 z-50">
          <div className="flex flex-col gap-5">
            {menuItems.map((item) => (
              <button
                key={item.path}
                onClick={() => {
                  router.push(item.path);
                  setIsOpen(false);
                }}
                className="text-left text-[#535353] text-[16px] sm:text-[18px] font-normal hover:text-[#7355F7] transition cursor-pointer"
              >
                {item.label}
              </button>
            ))}

            <button
              onClick={handleSignOut}
              className="text-left text-[#E23A5C] text-[16px] sm:text-[18px] font-normal hover:opacity-80 transition cursor-pointer"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
