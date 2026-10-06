import { Injectable } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'http';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.config';
import type { AuthSession, SessionProvider } from './ports/session-provider';

@Injectable()
export class BetterAuthSessionProvider implements SessionProvider {
  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    return result ?? null;
  }
}
