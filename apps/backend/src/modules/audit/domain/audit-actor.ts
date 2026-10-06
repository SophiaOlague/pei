import type { Actor } from '../../../common/application/actor';
import { InvalidAuditEventError } from './audit.errors';

// RN-120: el actor de una acción auditada es un usuario o el sistema.
// - Usuario: id de Better Auth (siempre) y user_profile (solo si ya completó su perfil),
//   con la IP y el user-agent del request (RN-121).
// - Sistema: proceso automático (expiración de reservas, recordatorios...). No tiene IP ni user-agent.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEM_PROCESS = /^[a-z][a-z0-9_.-]{0,99}$/;

export interface UserAuditActor {
  readonly type: 'user';
  readonly userId: string;
  readonly userProfileId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export interface SystemAuditActor {
  readonly type: 'system';
  readonly process: string;
}

export type AuditActor = UserAuditActor | SystemAuditActor;

export const AuditActor = {
  fromActor(actor: Actor): UserAuditActor {
    if (!actor?.userId?.trim()) {
      throw new InvalidAuditEventError('el actor usuario requiere userId');
    }
    if (actor.userProfileId !== null && !UUID.test(actor.userProfileId)) {
      throw new InvalidAuditEventError('userProfileId debe ser un UUID');
    }
    return Object.freeze({
      type: 'user',
      userId: actor.userId,
      userProfileId: actor.userProfileId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  },

  system(process: string): SystemAuditActor {
    if (typeof process !== 'string' || !SYSTEM_PROCESS.test(process)) {
      throw new InvalidAuditEventError('el actor sistema requiere un nombre de proceso en minúsculas (máx. 100)');
    }
    return Object.freeze({ type: 'system', process });
  },
};
