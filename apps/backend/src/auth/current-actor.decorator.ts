import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Actor } from '../common/application/actor';
import type { AuthenticatedRequest } from './authenticated-request';

// Inyecta en el handler el Actor que construyó SessionGuard.
export const CurrentActor = createParamDecorator((_data: unknown, context: ExecutionContext): Actor => {
  const { actor } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!actor) {
    // La ruta no pasó por SessionGuard.
    throw new UnauthorizedException('Sesión inválida o no proporcionada');
  }
  return actor;
});
