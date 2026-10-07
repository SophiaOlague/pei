import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/application/ports/clock';
import type { RateLimitDecision, RateLimiter, RateLimitRule } from '../../application/ports/rate-limiter';

const MAX_ENTRIES = 100_000;

// DT-8: ventana fija en memoria. Válido SOLO con una instancia del backend: los contadores se pierden al
// reiniciar y no se comparten entre procesos. Antes de desplegar varias instancias es obligatorio un
// adaptador de RateLimiter con almacenamiento distribuido.
@Injectable()
export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number; expiresAt: number }>();

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision> {
    const now = this.clock.now().getTime();
    const windowMs = rule.windowSeconds * 1000;
    this.prune(now);

    const current = this.windows.get(key);
    if (!current || now >= current.expiresAt) {
      this.windows.set(key, { startedAt: now, count: 1, expiresAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (current.count >= rule.max) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)) };
    }
    current.count++;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private prune(now: number): void {
    if (this.windows.size < MAX_ENTRIES) return;
    for (const [key, entry] of this.windows) {
      if (now >= entry.expiresAt) this.windows.delete(key);
    }
  }
}
