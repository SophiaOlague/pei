import { Global, Module } from '@nestjs/common';
import { AUDIT_TRAIL } from './application/ports/audit-trail';
import { DrizzleAuditTrail } from './infrastructure/drizzle-audit-trail';

// Global: cualquier módulo de PEI puede inyectar AUDIT_TRAIL en sus casos de uso.
@Global()
@Module({
  providers: [{ provide: AUDIT_TRAIL, useClass: DrizzleAuditTrail }],
  exports: [AUDIT_TRAIL],
})
export class AuditModule {}
