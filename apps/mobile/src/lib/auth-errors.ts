// Traducción de los errores reales de Better Auth (auth.config.ts del backend) a mensajes para la persona.
// Nunca se muestra el mensaje crudo del servidor ni se registra en consola: puede incluir el correo.

export type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
} | null;

export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_verified"
  | "rate_limited"
  | "network"
  | "unknown";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

// better-fetch devuelve status 0 (o ninguno) cuando la petición no llega al servidor.
export function classifyAuthError(error: AuthErrorLike): AuthErrorKind {
  if (!error?.status) {
    return "network";
  }
  if (error.status === 429) {
    return "rate_limited";
  }
  if (error.status === 403 && error.code === "EMAIL_NOT_VERIFIED") {
    return "email_not_verified";
  }
  if (error.status === 401 || error.code === "INVALID_EMAIL_OR_PASSWORD") {
    return "invalid_credentials";
  }
  return "unknown";
}

const MESSAGES: Record<AuthErrorKind, string> = {
  email_not_verified: "Debes verificar tu correo antes de iniciar sesión.",
  invalid_credentials: "Correo o contraseña incorrectos.",
  network:
    "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
  rate_limited: "Demasiados intentos. Espera un momento e intenta de nuevo.",
  unknown: "Ocurrió un error inesperado. Intenta de nuevo.",
};

export function authErrorMessage(kind: AuthErrorKind): string {
  return MESSAGES[kind];
}
