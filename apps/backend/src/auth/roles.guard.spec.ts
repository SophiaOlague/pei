import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import type { Actor } from '../common/application/actor';
import type { Role } from '../common/domain/role';

class SampleController {
  @Roles('admin')
  adminOnly() {}

  @Roles('doctor', 'admin')
  doctorOrAdmin() {}

  withoutRoles() {}
}

@Roles('organization')
class OrganizationController {
  inherited() {}

  @Roles('admin')
  overridden() {}
}

function contextFor(controller: new () => object, handler: string, actor?: Actor): ExecutionContext {
  return {
    getHandler: () => (controller.prototype as Record<string, unknown>)[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  } as unknown as ExecutionContext;
}

const actorWith = (role: Role | null): Actor => ({
  userId: 'user-1',
  userProfileId: role ? 'profile-1' : null,
  role,
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('[TC-M00-040][RF-02][RN-001] rol permitido → acceso', () => {
    expect(guard.canActivate(contextFor(SampleController, 'adminOnly', actorWith('admin')))).toBe(true);
  });

  it('[TC-M00-041][RF-02] cualquiera de varios roles permitidos → acceso', () => {
    expect(guard.canActivate(contextFor(SampleController, 'doctorOrAdmin', actorWith('doctor')))).toBe(true);
    expect(guard.canActivate(contextFor(SampleController, 'doctorOrAdmin', actorWith('admin')))).toBe(true);
  });

  it.each(['patient', 'doctor', 'organization'] as Role[])('[TC-M00-042][RF-02] rol %s en ruta de admin → 403', (role) => {
    expect(() => guard.canActivate(contextFor(SampleController, 'adminOnly', actorWith(role)))).toThrow(
      ForbiddenException,
    );
  });

  it('[TC-M00-043][RF-02][RN-002] usuario autenticado sin perfil de dominio → 403', () => {
    expect(() => guard.canActivate(contextFor(SampleController, 'adminOnly', actorWith(null)))).toThrow(
      new ForbiddenException('El usuario aún no tiene un perfil con rol asignado'),
    );
  });

  it('[TC-M00-044][RNF-01] sin actor (no pasó por SessionGuard) → 401', () => {
    expect(() => guard.canActivate(contextFor(SampleController, 'adminOnly'))).toThrow(UnauthorizedException);
  });

  it('[TC-M00-045][RNF-10] ruta sin @Roles → 403 aunque el actor sea admin (falla cerrado)', () => {
    expect(() => guard.canActivate(contextFor(SampleController, 'withoutRoles', actorWith('admin')))).toThrow(
      new ForbiddenException('La ruta no declara roles permitidos'),
    );
  });

  it('[TC-M00-046][RF-02] @Roles a nivel de clase aplica a sus handlers y el del handler tiene prioridad', () => {
    expect(guard.canActivate(contextFor(OrganizationController, 'inherited', actorWith('organization')))).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(OrganizationController, 'overridden', actorWith('organization'))),
    ).toThrow(ForbiddenException);
    expect(guard.canActivate(contextFor(OrganizationController, 'overridden', actorWith('admin')))).toBe(true);
  });
});
