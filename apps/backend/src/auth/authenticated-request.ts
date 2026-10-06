import type { Request } from 'express';
import type { Actor } from '../common/application/actor';
import type { AuthSession } from './ports/session-provider';

// Request después de pasar por SessionGuard.
export type AuthenticatedRequest = Request & {
  session?: AuthSession;
  actor?: Actor;
};

const MAX_USER_AGENT_LENGTH = 512;

// IP y user-agent del cliente para auditoría (RN-121).
// request.ip respeta la opción "trust proxy" de Express: mientras no se configure (depende del
// despliegue, aún no definido), X-Forwarded-For se ignora y no puede usarse para falsear la IP.
export function extractRequestMetadata(request: Request): { ipAddress: string | null; userAgent: string | null } {
  const rawIp = request.ip ?? request.socket?.remoteAddress ?? null;
  // Dirección IPv4 representada como IPv6 (::ffff:127.0.0.1) → 127.0.0.1
  const ipAddress = rawIp ? rawIp.replace(/^::ffff:/, '') : null;

  const header = request.headers['user-agent'];
  const userAgent = typeof header === 'string' && header.length > 0 ? header.slice(0, MAX_USER_AGENT_LENGTH) : null;

  return { ipAddress, userAgent };
}
