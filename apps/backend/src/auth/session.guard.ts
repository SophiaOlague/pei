// src/auth/session.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { auth } from './auth.config';
import { fromNodeHeaders } from 'better-auth/node';

@Injectable()
export class SessionGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
      throw new UnauthorizedException('Sesión inválida o no proporcionada');
    }

    // Adjunta la sesión al request para que el controller/service la use después
    request.session = session;
    return true;
  }
}