import { Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { userProfile } from '../../../../db/schema';
import { ProfileAlreadyExistsError, RegistrationDataConflictError } from '../../domain/identity.errors';
import { evaluateLegalAcceptance, type CurrentLegalDocument } from '../../domain/legal-requirements';
import type { DoctorIdentityGateway, DoctorLegalIdentity } from '../../application/ports/doctor-identity.gateway';

// D-17 / P2: la causa del conflicto queda solo en un log sin datos personales; nada en audit_log. La carrera entre la
// comprobación y el INSERT/UPDATE (23505 user_profile_curp_unique) la traduce el caso de uso después de la UnitOfWork.
@Injectable()
export class DrizzleDoctorIdentityGateway implements DoctorIdentityGateway {
  private readonly logger = new Logger('DoctorIdentityGateway');

  async createDoctorUserProfile(input: { userId: string; firstName: string; lastName: string; curp: string; phone: string | null }): Promise<string> {
    const db = getDbContext();
    const [existing] = await db.select({ id: userProfile.id }).from(userProfile).where(eq(userProfile.userId, input.userId)).limit(1);
    if (existing) throw new ProfileAlreadyExistsError();
    const [taken] = await db.select({ id: userProfile.id }).from(userProfile).where(eq(userProfile.curp, input.curp)).limit(1);
    if (taken) {
      this.logger.warn('registration_conflict field=curp');
      throw new RegistrationDataConflictError('curp');
    }
    const [row] = await db
      .insert(userProfile)
      .values({ userId: input.userId, role: 'doctor', firstName: input.firstName, lastName: input.lastName, curp: input.curp, phone: input.phone })
      .returning({ id: userProfile.id });
    return row.id;
  }

  async findLegalIdentity(userProfileId: string): Promise<DoctorLegalIdentity | null> {
    const [row] = await getDbContext()
      .select({ firstName: userProfile.firstName, lastName: userProfile.lastName, curp: sql<string>`${userProfile.curp}`, phone: userProfile.phone, role: userProfile.role })
      .from(userProfile)
      .where(eq(userProfile.id, userProfileId))
      .limit(1);
    if (!row || row.role !== 'doctor') return null;
    const { role: _role, ...identity } = row;
    return identity;
  }

  async updateLegalIdentity(userProfileId: string, change: { firstName?: string; lastName?: string; curp?: string }): Promise<void> {
    const db = getDbContext();
    if (change.curp !== undefined) {
      const [taken] = await db.select({ id: userProfile.id }).from(userProfile).where(sql`${userProfile.curp} = ${change.curp} and ${userProfile.id} <> ${userProfileId}`).limit(1);
      if (taken) {
        this.logger.warn('registration_conflict field=curp');
        throw new RegistrationDataConflictError('curp');
      }
    }
    await db.update(userProfile).set({ ...change, updatedAt: sql`now()` }).where(eq(userProfile.id, userProfileId));
  }

  async updatePhone(userProfileId: string, phone: string | null): Promise<void> {
    await getDbContext().update(userProfile).set({ phone, updatedAt: sql`now()` }).where(eq(userProfile.id, userProfileId));
  }

  async doctorLegalAccepted(userProfileId: string): Promise<boolean> {
    const { rows } = await getDbContext().execute<{ legal: CurrentLegalDocument[] | null }>(sql`
      with current_legal as (
        select distinct on (type) id, type, version from legal_document where published_at <= now() order by type, published_at desc
      )
      select json_agg(json_build_object(
               'type', c.type, 'documentId', c.id, 'version', c.version,
               'accepted', exists (select 1 from user_legal_acceptance a where a.legal_document_id = c.id and a.user_profile_id = ${userProfileId})
             ) order by c.type) as legal
        from current_legal c`);
    return evaluateLegalAcceptance('doctor', rows[0]?.legal ?? []).accepted;
  }
}
