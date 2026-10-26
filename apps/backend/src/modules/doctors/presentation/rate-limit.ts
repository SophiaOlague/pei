import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../auth/authenticated-request';
import { RATE_LIMITER, type RateLimiter, type RateLimitRule } from '../../identity/application/ports/rate-limiter';

// DT-8 (M02), plan v2 §12: límites por usuario de las rutas del médico que reciben archivos o cambian su identidad.
// Reutiliza el limitador de Identity (exportado) con reglas propias de M03. Solo frenan el abuso (no son reglas de negocio).
export type DoctorRateLimitName = 'doctor_identity_upload' | 'doctor_license_upload' | 'doctor_identity_change' | 'doctor_photo_upload';

export const DOCTOR_RATE_LIMIT_RULES = Symbol('DOCTOR_RATE_LIMIT_RULES');

export const DEFAULT_DOCTOR_RATE_LIMIT_RULES: Record<DoctorRateLimitName, RateLimitRule> = {
  doctor_identity_upload: { max: 3, windowSeconds: 3600 },
  doctor_license_upload: { max: 5, windowSeconds: 3600 },
  doctor_identity_change: { max: 5, windowSeconds: 3600 },
  doctor_photo_upload: { max: 10, windowSeconds: 3600 },
};

const RATE_LIMIT_KEY = 'pei:doctor-rate-limit';
export const DoctorRateLimit = (name: DoctorRateLimitName) => SetMetadata(RATE_LIMIT_KEY, name);

// Va después de SessionGuard (necesita el actor) y antes de procesar el archivo. Falla cerrado sin regla o sin actor.
@Injectable()
export class DoctorRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    @Inject(DOCTOR_RATE_LIMIT_RULES) private readonly rules: Record<DoctorRateLimitName, RateLimitRule>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = this.reflector.get<DoctorRateLimitName | undefined>(RATE_LIMIT_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
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
