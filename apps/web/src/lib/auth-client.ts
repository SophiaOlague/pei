import { createAuthClient } from "better-auth/react";

// Backend de PEI: Better Auth vive en /api/auth (apps/backend, AuthController).
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

// Better Auth resuelve las rutas relativas contra el backend; los enlaces de los correos deben
// volver al frontend, así que se envían absolutas. El origen debe estar en AUTH_TRUSTED_ORIGINS.
export function appUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

type AuthError = { status?: number; code?: string; message?: string };

// Mensajes que no revelan si una cuenta existe.
export function authErrorMessage(error: AuthError): string {
  if (error.status === 429)
    return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Correo o contraseña incorrectos.";
    case "EMAIL_NOT_VERIFIED":
      return "Tu correo aún no está verificado. Te enviamos un nuevo enlace de verificación.";
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return "El enlace no es válido o ya expiró. Solicita uno nuevo.";
    case "INVALID_PASSWORD":
      return "La contraseña actual no es correcta.";
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return "Tu cuenta no tiene una contraseña que se pueda cambiar.";
    case "PASSWORD_TOO_SHORT":
      return "La contraseña debe tener al menos 8 caracteres.";
    case "PASSWORD_TOO_LONG":
      return "La contraseña no puede tener más de 128 caracteres.";
    default:
      return "No se pudo completar la operación. Inténtalo de nuevo.";
  }
}

// Correo pendiente de verificar, para el reenvío. Se guarda en sessionStorage y nunca en la URL.
const PENDING_EMAIL_KEY = "pei.pendingEmail";

export function rememberPendingEmail(email: string): void {
  try {
    sessionStorage.setItem(PENDING_EMAIL_KEY, email);
  } catch {}
}

export function pendingEmail(): string | null {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY);
  } catch {
    return null;
  }
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
