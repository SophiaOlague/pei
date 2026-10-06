// src/auth/session.guard.ts
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SESSION_PROVIDER } from './ports/session-provider';
import type { SessionProvider } from './ports/session-provider';
import { ACTOR_PROFILE_READER } from './ports/actor-profile-reader';
import type { ActorProfileReader } from './ports/actor-profile-reader';
import { extractRequestMetadata, type AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(SESSION_PROVIDER) private readonly sessionProvider: SessionProvider,
    @Inject(ACTOR_PROFILE_READER) private readonly actorProfileReader: ActorProfileReader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const session = await this.sessionProvider.getSession(request.headers);

    if (!session) {
      throw new UnauthorizedException('Sesión inválida o no proporcionada');
    }

    // Un usuario recién registrado aún no tiene perfil de dominio: queda autenticado, pero sin rol.
    const profile = await this.actorProfileReader.findByUserId(session.user.id);

    // Adjunta la sesión y el actor al request para que el controller/service los use después
    request.session = session;
    request.actor = {
      userId: session.user.id,
      userProfileId: profile?.userProfileId ?? null,
      role: profile?.role ?? null,
      ...extractRequestMetadata(request),
    };
    return true;
  }
}
