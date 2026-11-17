import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SessionGuard } from '../../src/auth/session.guard';
import { RolesGuard } from '../../src/auth/roles.guard';
import { Roles } from '../../src/auth/roles.decorator';
import type { AuthSession, SessionProvider } from '../../src/auth/ports/session-provider';
import type { ActorProfileReader } from '../../src/auth/ports/actor-profile-reader';
import { FLOW_USER_HEADER, FlowSessionProvider } from './flow-session';

const ADMIN = 'admin-user-id';
const DOCTOR = 'doctor-user-id';

class RealProviderSpy implements SessionProvider {
  calls = 0;
  async getSession(): Promise<AuthSession | null> {
    this.calls++;
    return null;
  }
}

// Perfiles como los devolvería la BD: el rol NO lo decide la cabecera.
class ProfilesSpy implements ActorProfileReader {
  readonly asked: string[] = [];
  async findByUserId(userId: string) {
    this.asked.push(userId);
    if (userId === ADMIN) return { userProfileId: 'admin-profile', role: 'admin' as const };
    if (userId === DOCTOR) return { userProfileId: 'doctor-profile', role: 'doctor' as const };
    return null;
  }
}

class AdminRoutes {
  @Roles('admin')
  review() {}
}
class DoctorRoutes {
  @Roles('doctor')
  status() {}
}

function context(controller: new () => object, handler: string, headers: Record<string, unknown>) {
  const request: Record<string, unknown> = { headers, socket: { remoteAddress: '127.0.0.1' } };
  return {
    request,
    ctx: {
      getHandler: () => (controller.prototype as Record<string, unknown>)[handler],
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

async function guards(provider: SessionProvider, profiles: ActorProfileReader, controller: new () => object, handler: string, headers: Record<string, unknown>) {
  const { ctx } = context(controller, handler, headers);
  await new SessionGuard(provider, profiles).canActivate(ctx);
  return new RolesGuard(new Reflector()).canActivate(ctx);
}

describe('M03 runners de flujo: sesión restringida a los user.id de prueba (flow-session)', () => {
  it('[TC-M03-212][RF-02] solo acepta los user.id exactos recibidos; cualquier otro valor queda sin sesión y sin recurrir al proveedor real', async () => {
    const real = new RealProviderSpy();
    const provider = new FlowSessionProvider(real, [ADMIN, DOCTOR]);
    expect((await provider.getSession({ [FLOW_USER_HEADER]: ADMIN }))?.user.id).toBe(ADMIN);
    expect((await provider.getSession({ [FLOW_USER_HEADER]: DOCTOR }))?.user.id).toBe(DOCTOR);
    for (const other of ['', 'otro-id', `${ADMIN} `, ADMIN.toUpperCase(), 'inherited-real-admin']) {
      expect(await provider.getSession({ [FLOW_USER_HEADER]: other })).toBeNull();
    }
    expect(await provider.getSession({ [FLOW_USER_HEADER]: [ADMIN, DOCTOR] })).toBeNull();
    expect(real.calls).toBe(0);
  });

  it('[TC-M03-213][RF-02] sin la cabecera delega en el proveedor real (las demás peticiones no cambian)', async () => {
    const real = new RealProviderSpy();
    const provider = new FlowSessionProvider(real, [ADMIN]);
    expect(await provider.getSession({ cookie: 'better-auth.session_token=x' })).toBeNull();
    expect(real.calls).toBe(1);
  });

  it.each([
    ['vacío', []],
    ['tres ids', [ADMIN, DOCTOR, 'otro']],
    ['repetido', [ADMIN, ADMIN]],
    ['id en blanco', [' ']],
  ])('[TC-M03-214] rechaza una lista de ids no válida (%s)', (_name, ids) => {
    expect(() => new FlowSessionProvider(new RealProviderSpy(), ids)).toThrow(/entre uno y dos/);
  });

  it('[TC-M03-215][RF-02][D-22] con SessionGuard y RolesGuard reales: el rol sale del ActorProfileReader, no de la cabecera', async () => {
    const profiles = new ProfilesSpy();
    const provider = new FlowSessionProvider(new RealProviderSpy(), [ADMIN, DOCTOR]);
    await expect(guards(provider, profiles, AdminRoutes, 'review', { [FLOW_USER_HEADER]: ADMIN })).resolves.toBe(true);
    await expect(guards(provider, profiles, AdminRoutes, 'review', { [FLOW_USER_HEADER]: DOCTOR })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guards(provider, profiles, DoctorRoutes, 'status', { [FLOW_USER_HEADER]: DOCTOR })).resolves.toBe(true);
    await expect(guards(provider, profiles, DoctorRoutes, 'status', { [FLOW_USER_HEADER]: ADMIN })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guards(provider, profiles, AdminRoutes, 'review', { [FLOW_USER_HEADER]: 'otro-id' })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guards(provider, profiles, AdminRoutes, 'review', {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(profiles.asked).toEqual([ADMIN, DOCTOR, DOCTOR, ADMIN]);
  });

  it('[TC-M03-216][RF-02] un id permitido sin perfil en la BD queda autenticado pero sin rol (403), nunca con un rol inventado', async () => {
    const provider = new FlowSessionProvider(new RealProviderSpy(), ['sin-perfil']);
    await expect(guards(provider, new ProfilesSpy(), AdminRoutes, 'review', { [FLOW_USER_HEADER]: 'sin-perfil' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});
