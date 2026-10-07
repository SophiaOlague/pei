// Límite de frecuencia de operaciones sensibles (DT-8). Siempre activo.
// El adaptador en memoria solo sirve con una instancia del backend; con varias instancias es obligatorio
// un adaptador con almacenamiento distribuido.
export interface RateLimitRule {
  max: number;
  windowSeconds: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
}

export const RATE_LIMITER = Symbol('RATE_LIMITER');
