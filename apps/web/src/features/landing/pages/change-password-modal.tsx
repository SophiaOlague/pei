"use client";

import { X } from "lucide-react";
import { useState } from "react";
import {
  authClient,
  authErrorMessage,
  PASSWORD_MAX,
  PASSWORD_MIN,
} from "@/lib/auth-client";

// Cambio de contraseña con la operación de Better Auth (POST /api/auth/change-password), con la sesión
// actual. revokeOtherSessions: se cierran las demás sesiones, igual que al restablecer la contraseña
// (revokeSessionsOnPasswordReset en apps/backend); la sesión actual recibe una cookie nueva.
// Las contraseñas solo viajan en la petición: no se registran ni se guardan.
export function ChangePasswordModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!currentPassword || !newPassword || !confirmPassword)
      return setError("Por favor, completa todos los campos");
    if (newPassword !== confirmPassword)
      return setError("Las contraseñas no coinciden");
    if (newPassword.length < PASSWORD_MIN)
      return setError(
        `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`,
      );
    if (newPassword.length > PASSWORD_MAX)
      return setError(
        `La contraseña no puede tener más de ${PASSWORD_MAX} caracteres`,
      );
    setSending(true);
    setError("");
    try {
      const { error: apiError } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (apiError) {
        setError(authErrorMessage(apiError));
        return;
      }
      onChanged();
    } catch {
      setError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setSending(false);
    }
  };

  const inputClass =
    "w-full h-12 sm:h-[50px] px-4 border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:border-[#7355F7]";
  const labelClass = "text-sm sm:text-base text-[#535353] block mb-2";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: fondo del modal de la entrega; se cierra también con el botón.
    // biome-ignore lint/a11y/useKeyWithClickEvents: el botón de cerrar es la alternativa de teclado.
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
        className="bg-white rounded-2xl shadow-xl p-5 sm:p-6 md:p-8 w-full max-w-[500px]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h3
            id="change-password-title"
            className="text-lg sm:text-xl md:text-[22px] font-medium text-black"
          >
            Cambiar contraseña
          </h3>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5 text-[#535353]" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-4"
        >
          <div>
            <label htmlFor="currentPassword" className={labelClass}>
              Contraseña actual
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="newPassword" className={labelClass}>
              Nueva contraseña
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={`Mínimo ${PASSWORD_MIN} caracteres`}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className={labelClass}>
              Confirmar contraseña
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la contraseña"
              className={inputClass}
            />
          </div>
          {error && (
            <p role="alert" className="text-[#E23A5C] text-[14px]">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={sending}
            className="w-full h-12 sm:h-[50px] bg-[#7355F7] rounded-lg text-white text-sm sm:text-base font-medium hover:bg-[#6244d9] transition mt-2 cursor-pointer disabled:opacity-50"
          >
            {sending ? "Guardando..." : "Guardar cambio"}
          </button>
        </form>
      </div>
    </div>
  );
}
