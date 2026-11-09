import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { CLOCK, type Clock } from '../../../../common/application/ports/clock';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { CancellationPolicyNotConfiguredError, ConsultationPriceNotConfiguredError, UnchangedCancellationPolicyError, UnchangedConsultationPriceError } from '../../domain/appointments.errors';
import { sameParameters, validatePolicy, type PolicyParameters, type PolicyVersion } from '../../domain/cancellation-policy';
import { CONSULTATION_CURRENCY, normalizePrice, type PriceVersion } from '../../domain/consultation-price';
import { AppointmentAuditEvents } from '../appointments-audit-events';
import {
  CANCELLATION_POLICY_REPOSITORY, CONSULTATION_PRICE_REPOSITORY, type CancellationPolicyRepository, type ConsultationPriceRepository,
} from '../ports/appointments.ports';
import { requireAdmin } from './actors';

// M08 RF-66 (propuesto, C-23) y RF-16: configuración versionada por el administrador. Publicar = en una transacción,
// candado de publicación (P-3) → cerrar la vigente (effective_until = ahora) → insertar la nueva (effective_from = ahora)
// → auditoría con el valor anterior y el nuevo. Ninguna versión existente se modifica en ningún otro campo.

export interface PriceView {
  id: string;
  price: string;
  currency: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdBy: string;
}
export interface PolicyView extends PolicyParameters {
  id: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdBy: string;
}

const priceView = (v: PriceVersion): PriceView => ({
  id: v.id, price: v.price, currency: v.currency, effectiveFrom: v.effectiveFrom.toISOString(),
  effectiveUntil: v.effectiveUntil?.toISOString() ?? null, createdBy: v.createdBy,
});
const policyView = (v: PolicyVersion): PolicyView => ({
  id: v.id, refundDeadlineHours: v.refundDeadlineHours, maxReschedules: v.maxReschedules, doctorWaitMinutes: v.doctorWaitMinutes,
  patientToleranceMinutes: v.patientToleranceMinutes, maxProtectedWaitMinutes: v.maxProtectedWaitMinutes,
  reconnectGraceMinutes: v.reconnectGraceMinutes, effectiveFrom: v.effectiveFrom.toISOString(),
  effectiveUntil: v.effectiveUntil?.toISOString() ?? null, createdBy: v.createdBy,
});
const params = (v: PolicyParameters): Record<string, number> => ({
  refundDeadlineHours: v.refundDeadlineHours, maxReschedules: v.maxReschedules, doctorWaitMinutes: v.doctorWaitMinutes,
  patientToleranceMinutes: v.patientToleranceMinutes, maxProtectedWaitMinutes: v.maxProtectedWaitMinutes,
  reconnectGraceMinutes: v.reconnectGraceMinutes,
});



@Injectable()
export class ConsultationPriceService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CONSULTATION_PRICE_REPOSITORY) private readonly prices: ConsultationPriceRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async current(actor: Actor): Promise<PriceView> {
    requireAdmin(actor);
    const v = await this.prices.findEffective(this.clock.now());
    if (!v) throw new ConsultationPriceNotConfiguredError();
    return priceView(v);
  }

  async versions(actor: Actor): Promise<PriceView[]> {
    requireAdmin(actor);
    return (await this.prices.listVersions()).map(priceView);
  }

  async publish(actor: Actor, rawPrice: unknown, source: 'admin_panel' | 'initial_setup' = 'admin_panel'): Promise<PriceView> {
    const adminProfileId = requireAdmin(actor);
    const price = normalizePrice(rawPrice);
    return this.uow.runInTransaction(async () => {
      await this.prices.lockForPublish();
      const now = this.clock.now();
      const previous = await this.prices.findEffective(now);
      if (previous && previous.price === price) throw new UnchangedConsultationPriceError();
      if (previous) await this.prices.closeVersion(previous.id, now);
      const next: PriceVersion = { id: randomUUID(), price, currency: CONSULTATION_CURRENCY, effectiveFrom: now, effectiveUntil: null, createdBy: adminProfileId };
      await this.prices.insertVersion(next);
      await this.audit.record(AppointmentAuditEvents.pricePublished(AuditActor.fromActor(actor), next.id, {
        previousVersionId: previous?.id ?? null, previousPrice: previous?.price ?? null, newPrice: price, currency: CONSULTATION_CURRENCY,
        effectiveFrom: now.toISOString(), source,
      }));
      return priceView(next);
    });
  }
}

@Injectable()
export class CancellationPolicyService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly audit: AuditTrail,
    @Inject(CANCELLATION_POLICY_REPOSITORY) private readonly policies: CancellationPolicyRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async current(actor: Actor): Promise<PolicyView> {
    requireAdmin(actor);
    const v = await this.policies.findEffective(this.clock.now());
    if (!v) throw new CancellationPolicyNotConfiguredError();
    return policyView(v);
  }

  async versions(actor: Actor): Promise<PolicyView[]> {
    requireAdmin(actor);
    return (await this.policies.listVersions()).map(policyView);
  }

  async publish(actor: Actor, input: Record<string, unknown>, source: 'admin_panel' | 'initial_setup' = 'admin_panel'): Promise<PolicyView> {
    const adminProfileId = requireAdmin(actor);
    const parameters = validatePolicy(input);
    return this.uow.runInTransaction(async () => {
      await this.policies.lockForPublish();
      const now = this.clock.now();
      const previous = await this.policies.findEffective(now);
      if (previous && sameParameters(previous, parameters)) throw new UnchangedCancellationPolicyError();
      if (previous) await this.policies.closeVersion(previous.id, now);
      const next: PolicyVersion = { id: randomUUID(), ...parameters, effectiveFrom: now, effectiveUntil: null, createdBy: adminProfileId };
      await this.policies.insertVersion(next);
      await this.audit.record(AppointmentAuditEvents.policyPublished(AuditActor.fromActor(actor), next.id, {
        previousVersionId: previous?.id ?? null, previous: previous ? params(previous) : null, next: params(parameters),
        effectiveFrom: now.toISOString(), source,
      }));
      return policyView(next);
    });
  }
}
