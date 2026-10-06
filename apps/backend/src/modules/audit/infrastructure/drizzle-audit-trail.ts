import { Injectable } from '@nestjs/common';
import { auditLog } from '../../../db/schema';
import { transactionStorage } from '../../../db/transaction-context';
import { translatePostgresError } from '../../../common/infrastructure/postgres-error-translator';
import type { AuditTrail } from '../application/ports/audit-trail';
import type { AuditEvent } from '../domain/audit-event';
import { AuditOutsideTransactionError } from '../domain/audit.errors';

@Injectable()
export class DrizzleAuditTrail implements AuditTrail {
  async record(event: AuditEvent): Promise<void> {
    // D6: solo dentro de una UnitOfWork, para que el evento se confirme o revierta con la operación.
    const tx = transactionStorage.getStore();
    if (!tx) {
      throw new AuditOutsideTransactionError();
    }

    try {
      await tx.insert(auditLog).values(toRow(event));
    } catch (error) {
      throw translatePostgresError(error) ?? error;
    }
  }
}

// created_at no se envía: lo fija PostgreSQL (trigger de audit_log).
export function toRow(event: AuditEvent): typeof auditLog.$inferInsert {
  const { actor } = event;
  const base = {
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    metadata: event.metadata,
  };

  if (actor.type === 'system') {
    return { ...base, actorType: 'system', actorUserId: null, actorUserProfileId: null, ipAddress: null, userAgent: null };
  }
  return {
    ...base,
    actorType: 'user',
    actorUserId: actor.userId,
    actorUserProfileId: actor.userProfileId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  };
}
