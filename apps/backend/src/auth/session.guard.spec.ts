import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionGuard } from './session.guard';
import type { AuthSession, SessionProvider } from './ports/session-provider';
import type { ActorProfileReader } from './ports/actor-profile-reader';
import type { AuthenticatedRequest } from './authenticated-request';

const session: AuthSession = {
  user: {
    id: 'user-1',
    email: 'paciente@example.test',
    name: 'Paciente',
    emailVerified: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  session: { id: 'session-1', expiresAt: new Date('2026-12-31T00:00:00Z') },
};

function requestWith(overrides: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return {
    headers: { 'user-agent': 'GestinovoApp/1.0 (iOS)' },
    ip: '::ffff:10.0.0.7',
    socket: { remoteAddress: '::ffff:10.0.0.7' },
    ...overrides,
  } as unknown as AuthenticatedRequest;
}

const contextOf = (request: AuthenticatedRequest) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as unknown as ExecutionContext;

describe('SessionGuard (contexto del actor)', () => {
  let getSession: jest.MockedFunction<SessionProvider['getSession']>;
  let findByUserId: jest.MockedFunction<ActorProfileReader['findByUserId']>;
  let guard: SessionGuard;

  beforeEach(() => {
    getSession = jest.fn();
    findByUserId = jest.fn();
    guard = new SessionGuard({ getSession }, { findByUserId });
  });

  it('[TC-M00-050][RNF-01] sin sesión → 401 y no consulta el perfil', async () => {
    getSession.mockResolvedValue(null);

    await expect(guard.canActivate(contextOf(requestWith()))).rejects.toThrow(UnauthorizedException);
    expect(findByUserId).not.toHaveBeenCalled();
  });

  it('[TC-M00-051][RN-001][RN-121] con sesión y perfil → actor con perfil, rol, IP y user-agent', async () => {
    getSession.mockResolvedValue(session);
    findByUserId.mockResolvedValue({ userProfileId: 'profile-1', role: 'doctor' });
    const request = requestWith();

    await expect(guard.canActivate(contextOf(request))).resolves.toBe(true);

    expect(findByUserId).toHaveBeenCalledWith('user-1');
    expect(request.actor).toEqual({
      userId: 'user-1',
      userProfileId: 'profile-1',
      role: 'doctor',
      ipAddress: '10.0.0.7',
      userAgent: 'GestinovoApp/1.0 (iOS)',
    });
  });

  it('[TC-M00-052][RN-002] con sesión pero sin perfil de dominio → autenticado, sin rol', async () => {
    getSession.mockResolvedValue(session);
    findByUserId.mockResolvedValue(null);
    const request = requestWith();

    await expect(guard.canActivate(contextOf(request))).resolves.toBe(true);
    expect(request.actor).toMatchObject({ userId: 'user-1', userProfileId: null, role: null });
  });

  it('[TC-M00-053] conserva request.session tal como la entrega el proveedor (respuesta de /me sin cambios)', async () => {
    getSession.mockResolvedValue(session);
    findByUserId.mockResolvedValue(null);
    const request = requestWith();

    await guard.canActivate(contextOf(request));
    expect(request.session).toBe(session);
  });

  it('[TC-M00-054] pasa los headers del request al proveedor de sesión', async () => {
    getSession.mockResolvedValue(null);
    const request = requestWith({ headers: { cookie: 'better-auth.session_token=abc' } } as Partial<AuthenticatedRequest>);

    await expect(guard.canActivate(contextOf(request))).rejects.toThrow(UnauthorizedException);
    expect(getSession).toHaveBeenCalledWith({ cookie: 'better-auth.session_token=abc' });
  });
});
