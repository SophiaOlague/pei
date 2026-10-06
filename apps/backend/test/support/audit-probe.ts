import { Controller, Inject, Injectable, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../../src/auth/session.guard';
import { RolesGuard } from '../../src/auth/roles.guard';
import { Roles } from '../../src/auth/roles.decorator';
import { CurrentActor } from '../../src/auth/current-actor.decorator';
import type { Actor } from '../../src/common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../src/common/application/ports/unit-of-work';
import { DomainError } from '../../src/common/domain/domain-error';
import { AUDIT_TRAIL, type AuditTrail } from '../../src/modules/audit/application/ports/audit-trail';
import { AuditEvent } from '../../src/modules/audit/domain/audit-event';
import { AuditActor } from '../../src/modules/audit/domain/audit-actor';

// Caso de uso y controller SOLO para pruebas: reproducen el patrón que usarán los módulos de PEI
// (operación + AuditTrail.record() dentro de la misma UnitOfWork, actor tomado de la sesión).

export const PROBE_ACTION = 'test.audit_probe.approved';

export class ProbeRuleError extends DomainError {
  readonly kind = 'business_rule';
  constructor() {
    super('La regla de la operación de prueba no se cumple');
  }
}

@Injectable()
export class ApproveProbeUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
  ) {}

  execute(actor: Actor, input: { id: string; failAfterAudit: boolean }) {
    return this.unitOfWork.runInTransaction(async () => {
      await this.auditTrail.record(
        AuditEvent.create({
          actor: AuditActor.fromActor(actor),
          action: PROBE_ACTION,
          entity: { type: 'audit_probe', id: input.id },
          metadata: { reason: 'prueba E2E' },
        }),
      );
      if (input.failAfterAudit) throw new ProbeRuleError();
      return { approved: input.id };
    });
  }
}

@Controller('audit-probe')
@UseGuards(SessionGuard, RolesGuard)
export class AuditProbeController {
  constructor(private readonly approve: ApproveProbeUseCase) {}

  @Post(':id/approve')
  @Roles('admin')
  run(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query('fail') fail?: string) {
    return this.approve.execute(actor, { id, failAfterAudit: fail === '1' });
  }
}
