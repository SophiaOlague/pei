import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../auth/authenticated-request';
import { RATE_LIMITER, type RateLimiter, type RateLimitRule } from '../application/ports/rate-limiter';

// DT-8: límites por usuario de las rutas de PEI que reciben archivos. No son límites de intentos de negocio
// (DT-16): solo frenan el abuso. Siempre activos.
export type IdentityRateLimitName = 'identity_verification_upload' | 'profile_photo_upload';

export const IDENTITY_RATE_LIMIT_RULES = Symbol('IDENTITY_RATE_LIMIT_RULES');

export const DEFAULT_IDENTITY_RATE_LIMIT_RULES: Record<IdentityRateLimitName, RateLimitRule> = {
  identity_verification_upload: { max: 3, windowSeconds: 3600 },
  profile_photo_upload: { max: 10, windowSeconds: 3600 },
};

const RATE_LIMIT_KEY = 'pei:rate-limit';
export const RateLimit = (name: IdentityRateLimitName) => SetMetadata(RATE_LIMIT_KEY, name);

// Va después de SessionGuard (necesita el actor) y antes de procesar el archivo.
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(IDENTITY_RATE_LIMIT_RULES) private readonly rules: Record<IdentityRateLimitName, RateLimitRule>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = this.reflector.get<IdentityRateLimitName | undefined>(RATE_LIMIT_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // Falla cerrado: una ruta con RateLimitGuard debe declarar su regla y tener un actor.
    if (!name || !this.rules[name] || !request.actor) {
      throw new HttpException('La ruta no tiene un límite de frecuencia configurado', HttpStatus.FORBIDDEN);
    }

    const decision = await this.limiter.consume(`${name}:${request.actor.userId}`, this.rules[name]);
    if (!decision.allowed) {
      context.switchToHttp().getResponse<Response>().setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw new HttpException('Demasiadas solicitudes. Intenta de nuevo más tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
