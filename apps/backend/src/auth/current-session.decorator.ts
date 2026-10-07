import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthSession } from './ports/session-provider';
import type { AuthenticatedRequest } from './authenticated-request';

// Inyecta en el handler la sesión que validó SessionGuard.
export const CurrentSession = createParamDecorator((_data: unknown, context: ExecutionContext): AuthSession => {
  const { session } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!session) {
    // La ruta no pasó por SessionGuard.
    throw new UnauthorizedException('Sesión inválida o no proporcionada');
  }
  return session;
});
