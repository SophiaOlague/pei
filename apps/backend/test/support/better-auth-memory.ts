import { memoryAdapter } from 'better-auth/adapters/memory';
import { AUTH_RATE_LIMIT, createAuth } from '../../src/auth/auth.config';
import type { AuthEmail, EmailSender } from '../../src/modules/identity/application/ports/email-sender';

// Better Auth REAL (la misma fábrica createAuth de PEI) con el adaptador en memoria y un EmailSender falso
// (DT-19). Sin Neon y sin correos reales.

export const TEST_AUTH_BASE_URL = 'http://localhost:3000';
export const TEST_AUTH_SECRET = 'secreto-solo-para-pruebas-e2e-de-pei-0123456789';

export class FakeEmailSender implements EmailSender {
  outbox: AuthEmail[] = [];
  async send(email: AuthEmail): Promise<void> {
    this.outbox.push(email);
  }
  last(kind: AuthEmail['kind'], to: string): AuthEmail | undefined {
    return this.outbox.filter((m) => m.kind === kind && m.to === to).at(-1);
  }
}

export interface MemoryDb {
  user: Record<string, any>[];
  session: Record<string, any>[];
  account: Record<string, any>[];
  verification: Record<string, any>[];
}

export function createMemoryAuth(options: { relaxedRateLimit?: boolean } = {}) {
  const data: MemoryDb = { user: [], session: [], account: [], verification: [] };
  const emailSender = new FakeEmailSender();
  // Las pruebas de flujos usan límites holgados; las de rate limit, los de producción (AUTH_RATE_LIMIT).
  const rateLimit = options.relaxedRateLimit
    ? { window: 60, max: 1000, customRules: Object.fromEntries(Object.keys(AUTH_RATE_LIMIT.customRules).map((p) => [p, { window: 60, max: 1000 }])) }
    : AUTH_RATE_LIMIT;
  const auth = createAuth({
    database: memoryAdapter(data),
    emailSender,
    config: { baseURL: TEST_AUTH_BASE_URL, secret: TEST_AUTH_SECRET, trustedOrigins: [TEST_AUTH_BASE_URL] },
    rateLimit,
  });
  return { auth, data, emailSender };
}

// El token de un enlace de verificación (?token=) o de recuperación (/reset-password/<token>).
export function tokenFromUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.searchParams.get('token') ?? parsed.pathname.split('/').at(-1)!;
}
