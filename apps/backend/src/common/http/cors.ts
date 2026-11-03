import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

// CORS con credenciales (cookie de sesión de Better Auth). Solo se autorizan los orígenes web confiables de
// AUTH_TRUSTED_ORIGINS (la misma lista que valida Better Auth, auth.config.ts): un origen distinto no recibe
// Access-Control-Allow-Origin, así que el navegador no le entrega la respuesta. Los esquemas que no son orígenes web
// (por ejemplo gestinovo:// de la app móvil, cuyas peticiones nativas no usan CORS) se omiten. Nunca se usa «*»: con
// credenciales el navegador lo rechaza y equivaldría a confiar en cualquier sitio.

export class InvalidCorsOriginError extends Error {
  constructor(origin: string) {
    super(`Origen CORS no admitido: «${origin}». Usa orígenes explícitos (esquema, host y puerto), nunca «*»`);
    this.name = 'InvalidCorsOriginError';
  }
}

export function corsAllowedOrigins(trustedOrigins: readonly string[]): string[] {
  const origins: string[] = [];
  for (const value of trustedOrigins) {
    if (value === '*' || value.includes('*')) throw new InvalidCorsOriginError(value);
    if (!/^https?:\/\//i.test(value)) continue;
    const url = new URL(value);
    // Un origen no lleva ruta, consulta ni barra final: se compara exactamente con la cabecera Origin.
    if (url.pathname !== '/' || url.search || url.hash || value.endsWith('/')) throw new InvalidCorsOriginError(value);
    origins.push(url.origin);
  }
  return [...new Set(origins)];
}

export function corsOptionsFor(trustedOrigins: readonly string[]): CorsOptions {
  return { origin: corsAllowedOrigins(trustedOrigins), credentials: true };
}
