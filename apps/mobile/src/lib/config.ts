// Origen del backend de PEI (sin /api/auth ni barra final), p. ej. http://192.168.1.10:3000.
// Expo inserta las variables EXPO_PUBLIC_* en el bundle: aquí nunca va un secreto.
const TRAILING_SLASHES = /\/+$/;

function readApiUrl(): string {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!value) {
    throw new Error(
      "Falta EXPO_PUBLIC_API_URL. Copia .env.example a .env.local y define el origen del backend."
    );
  }
  return value.replace(TRAILING_SLASHES, "");
}

export const API_URL = readApiUrl();

// Ruta base de Better Auth en el backend (auth.controller.ts: @Controller('api/auth')).
export const AUTH_BASE_URL = `${API_URL}/api/auth`;
