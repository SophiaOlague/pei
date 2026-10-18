"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { authClient } from "@/lib/auth-client"; 

interface UserMenuProps {
  variant?: "light" | "dark";
  hideName?: boolean;
}

export function UserMenu({ variant = "light", hideName = false }: UserMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
            <span className={`${textColor} text-[14px] sm:text-[16px] lg:text-[20px] font-normal`}>
              Usuario 1
            </span>
          )}
          <ChevronDown
            className={`w-5 h-5 ${iconColor} transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </div>
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden flex-shrink-0">
          <Image
            src="/perfil-usuario.png"
            alt="Perfil"
            width={48}
            height={48}
            className="w-full h-full object-cover"
          />
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