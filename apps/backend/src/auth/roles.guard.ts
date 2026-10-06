import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../common/domain/role';
import { ROLES_KEY } from './roles.decorator';
import type { AuthenticatedRequest } from './authenticated-request';

// RF-02: aplica los permisos según el rol de dominio del actor.
// Debe ir después de SessionGuard: @UseGuards(SessionGuard, RolesGuard).
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const { actor } = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!actor) {
      throw new UnauthorizedException('Sesión inválida o no proporcionada');
    }
    // Falla cerrado: una ruta protegida por RolesGuard sin @Roles es un error de configuración.
    if (!allowedRoles || allowedRoles.length === 0) {
      throw new ForbiddenException('La ruta no declara roles permitidos');
    }
    if (!actor.role) {
      throw new ForbiddenException('El usuario aún no tiene un perfil con rol asignado');
    }
    if (!allowedRoles.includes(actor.role)) {
      throw new ForbiddenException('Tu rol no tiene permiso para esta operación');
    }
    return true;
  }
}
