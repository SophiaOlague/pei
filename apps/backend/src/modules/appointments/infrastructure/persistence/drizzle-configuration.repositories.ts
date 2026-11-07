import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { cancellationPolicy, consultationPriceConfiguration } from '../../../../db/schema';
import type { CancellationPolicyRepository, ConsultationPriceRepository } from '../../application/ports/appointments.ports';
import type { PolicyVersion } from '../../domain/cancellation-policy';
import type { PriceVersion } from '../../domain/consultation-price';

// Estructuras aprobadas en AP-3 (2026-11-07). P-3: las publicaciones se serializan con pg_advisory_xact_lock, que
// funciona también con la tabla vacía. La integridad en BD (solo inserción, una versión abierta) llega con M-1 #5.
const PRICE_LOCK = 'pei.consultation_price_configuration.publish';
const POLICY_LOCK = 'pei.cancellation_policy.publish';

const PRICE = {
  id: consultationPriceConfiguration.id, price: consultationPriceConfiguration.price, currency: consultationPriceConfiguration.currency,
  effectiveFrom: consultationPriceConfiguration.effectiveFrom, effectiveUntil: consultationPriceConfiguration.effectiveUntil,
  createdBy: consultationPriceConfiguration.createdBy,
};
const POLICY = {
  id: cancellationPolicy.id, refundDeadlineHours: cancellationPolicy.refundDeadlineHours, maxReschedules: cancellationPolicy.maxReschedules,
  doctorWaitMinutes: cancellationPolicy.doctorWaitMinutes, patientToleranceMinutes: cancellationPolicy.patientToleranceMinutes,
  effectiveFrom: cancellationPolicy.effectiveFrom, effectiveUntil: cancellationPolicy.effectiveUntil, createdBy: cancellationPolicy.createdBy,
};

@Injectable()
export class DrizzleConsultationPriceRepository implements ConsultationPriceRepository {
  async lockForPublish(): Promise<void> {
    await getDbContext().execute(sql`select pg_advisory_xact_lock(hashtext(${PRICE_LOCK}))`);
  }

  async findEffective(now: Date): Promise<PriceVersion | null> {
    const t = consultationPriceConfiguration;
    const [row] = await getDbContext().select(PRICE).from(t)
      .where(and(lte(t.effectiveFrom, now), or(isNull(t.effectiveUntil), gt(t.effectiveUntil, now))))
      .orderBy(desc(t.effectiveFrom)).limit(1);
    return row ?? null;
  }

  async listVersions(): Promise<PriceVersion[]> {
    return getDbContext().select(PRICE).from(consultationPriceConfiguration).orderBy(desc(consultationPriceConfiguration.effectiveFrom));
  }

  async closeVersion(id: string, at: Date): Promise<void> {
    const t = consultationPriceConfiguration;
    await getDbContext().update(t).set({ effectiveUntil: at }).where(and(eq(t.id, id), isNull(t.effectiveUntil)));
  }

  async insertVersion(v: PriceVersion): Promise<void> {
    await getDbContext().insert(consultationPriceConfiguration).values(v);
  }
}

@Injectable()
export class DrizzleCancellationPolicyRepository implements CancellationPolicyRepository {
  async lockForPublish(): Promise<void> {
    await getDbContext().execute(sql`select pg_advisory_xact_lock(hashtext(${POLICY_LOCK}))`);
  }

  async findEffective(now: Date): Promise<PolicyVersion | null> {
    const t = cancellationPolicy;
    const [row] = await getDbContext().select(POLICY).from(t)
      .where(and(lte(t.effectiveFrom, now), or(isNull(t.effectiveUntil), gt(t.effectiveUntil, now))))
      .orderBy(desc(t.effectiveFrom)).limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<PolicyVersion | null> {
    const [row] = await getDbContext().select(POLICY).from(cancellationPolicy).where(eq(cancellationPolicy.id, id)).limit(1);
    return row ?? null;
  }

  async listVersions(): Promise<PolicyVersion[]> {
    return getDbContext().select(POLICY).from(cancellationPolicy).orderBy(desc(cancellationPolicy.effectiveFrom));
  }

  async closeVersion(id: string, at: Date): Promise<void> {
    await getDbContext().update(cancellationPolicy).set({ effectiveUntil: at }).where(and(eq(cancellationPolicy.id, id), isNull(cancellationPolicy.effectiveUntil)));
  }

  async insertVersion(v: PolicyVersion): Promise<void> {
    await getDbContext().insert(cancellationPolicy).values(v);
  }
}
