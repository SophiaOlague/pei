import { ApiError } from "@/lib/api";

// Errores de las pantallas de verificación de identidad de pacientes. 401 se trata en cada pantalla (se envía a
// /login); 403 se informa sin reintentar: el backend autoriza cada endpoint (solo administradores).
export function patientIdentityErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return "Tu cuenta no tiene permiso para consultar esta información.";
    if (error.status === 404) return "No se encontró la solicitud.";
    return error.message;
  }
  return "No se pudo cargar la información. Inténtalo de nuevo.";
}

// `stale`: la solicitud mostrada ya no es la real (409: ya revisada, posiblemente por otro administrador; 404: ya no
// existe) y hay que recargarla. Nunca se informa como éxito.
export function patientIdentityActionError(error: unknown): {
  message: string;
  stale: boolean;
} {
  if (error instanceof ApiError) {
    if (error.status === 409)
      return {
        message:
          "La solicitud ya no está pendiente; pudo resolverla otro administrador. Se actualizó la solicitud.",
        stale: true,
      };
    if (error.status === 404)
      return {
        message:
          "La solicitud ya no está disponible. Se actualizó la solicitud.",
        stale: true,
      };
    if (error.status === 403)
      return {
        message: "Tu cuenta no tiene permiso para resolver solicitudes.",
        stale: false,
      };
    return { message: error.message, stale: false };
  }
  return {
    message: "No se pudo completar la operación. Inténtalo de nuevo.",
    stale: false,
  };
}
