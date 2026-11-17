import type { IncomingHttpHeaders } from 'http';
import type { AuthSession, SessionProvider } from '../../src/auth/ports/session-provider';

// Sesión de los runners de test/flujo que no pueden iniciar sesión con contraseña (nunca se guarda ni se restablece).
//
// - Solo autentica los `user.id` EXACTOS que recibe al construirse (como mucho dos: el admin y el médico de prueba,
//   leídos de la rama al arrancar). Cualquier otro valor de la cabecera → sin sesión (401), sin recurrir al proveedor real.
// - Sin la cabecera, delega en el proveedor real (Better Auth): las demás peticiones no cambian.
// - Solo entrega el id: el perfil y el rol los resuelve SessionGuard con el ActorProfileReader real y los aplica
//   RolesGuard, así que la cabecera no concede rol ni permisos por sí misma.
export const FLOW_USER_HEADER = 'x-flow-user';
const MAX_FLOW_USERS = 2;

export class FlowSessionProvider implements SessionProvider {
  private readonly allowed: ReadonlySet<string>;

  constructor(private readonly real: SessionProvider, allowedUserIds: readonly string[]) {
    const ids = new Set(allowedUserIds);
    if (ids.size === 0 || ids.size > MAX_FLOW_USERS || ids.size !== allowedUserIds.length || [...ids].some((id) => typeof id !== 'string' || id.trim() === '')) {
      throw new Error('FlowSessionProvider: entre uno y dos user.id distintos y no vacíos');
    }
    this.allowed = ids;
  }

  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const value = headers[FLOW_USER_HEADER];
    if (value === undefined) return this.real.getSession(headers);
    if (typeof value !== 'string' || !this.allowed.has(value)) return null;
    const now = new Date();
    return {
      user: { id: value, email: 'flow-user@m00.test.invalid', name: 'Usuario de prueba M03', emailVerified: true, createdAt: now, updatedAt: now },
      session: { id: `flow-${value}`, expiresAt: new Date(Date.now() + 3_600_000) },
    };
  }
}
