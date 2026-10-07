import { Inject, Injectable } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'http';
import { fromNodeHeaders } from 'better-auth/node';
import { AUTH_INSTANCE, type Auth } from './auth.config';
import type { AuthSession, SessionProvider } from './ports/session-provider';

@Injectable()
export class BetterAuthSessionProvider implements SessionProvider {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const result = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
    return result ?? null;
  }
}
