"use client";

import { Home, LogOut, type LucideIcon, UserCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { clearMeCache } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { ADMIN_HOME_PATH, ADMIN_PROFESSIONALS_PATH } from "./paths";
import { useAdmin } from "./require-admin";

interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Secciones del panel. Especialidades, usuarios y auditoría se agregarán aquí cuando existan sus pantallas.
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: ADMIN_HOME_PATH, label: "Inicio", icon: Home },
  {
    href: ADMIN_PROFESSIONALS_PATH,
    label: "Revisión de profesionales",
    icon: UserCheck,
  },
];

const isActive = (pathname: string, href: string) =>
  href === ADMIN_HOME_PATH
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

// Layout del panel administrativo: navegación lateral (superior en pantallas pequeñas), encabezado con la cuenta
// del administrador y cierre de sesión. Requiere RequireAdmin.
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { email } = useAdmin();

  const signOut = async () => {
    clearMeCache();
    await authClient.signOut({
      fetchOptions: { onSuccess: () => router.replace("/login") },
    });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F7F6FB]">
      <aside className="md:w-[260px] md:min-h-screen bg-[#684DDE] text-white flex md:flex-col shrink-0">
        <div className="flex items-center gap-3 px-4 md:px-6 py-4 md:py-8">
          <img src="/logo-blanco.svg" alt="Logo PEI" width={40} height={24} />
          <span className="hidden md:inline text-[18px] font-semibold">
            Administración
          </span>
        </div>
        <nav
          aria-label="Administración"
          className="flex md:flex-col gap-1 px-2 md:px-3 overflow-x-auto"
        >
          {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2 md:py-3 rounded-lg text-[14px] md:text-[16px] whitespace-nowrap transition ${
                  active ? "bg-white text-[#684DDE]" : "hover:bg-white/15"
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-end gap-4 px-4 sm:px-8 py-4 bg-white border-b border-gray-200">
          <span className="text-[14px] text-[#6B6B6B] truncate">
            Sesión iniciada como <span className="text-black">{email}</span>
          </span>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 text-[14px] text-[#684DDE] hover:underline shrink-0"
          >
            <LogOut size={16} aria-hidden="true" />
            Cerrar sesión
          </button>
        </header>
        <main className="flex-1 px-4 sm:px-8 py-6 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
