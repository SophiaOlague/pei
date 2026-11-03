import { ApiError } from "@/lib/api";

// Errores de las pantallas administrativas. 401 cierra el panel (se envía a /login); 403 se informa sin reintentar
// la operación: el backend es quien autoriza cada endpoint.
export function adminErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return "Tu cuenta no tiene permiso para consultar esta información.";
    if (error.status === 404) return "No se encontró el profesional.";
    return error.message;
  }
  return "No se pudo cargar la información. Inténtalo de nuevo.";
}

export const isUnauthenticated = (error: unknown) =>
  error instanceof ApiError && error.status === 401;
