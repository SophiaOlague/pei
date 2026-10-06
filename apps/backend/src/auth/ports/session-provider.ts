import type { IncomingHttpHeaders } from 'http';

// Sesión autenticada tal como la entrega el proveedor de identidad (hoy Better Auth).
// La forma coincide con la de Better Auth para que /me siga respondiendo lo mismo.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  user: AuthUser;
  session: { id: string; expiresAt: Date };
}

export interface SessionProvider {
  getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null>;
}

export const SESSION_PROVIDER = Symbol('SESSION_PROVIDER');
