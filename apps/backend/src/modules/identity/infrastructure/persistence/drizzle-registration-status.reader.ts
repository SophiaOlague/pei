import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import type { Role } from '../../../../common/domain/role';
import type { RegistrationStatusReader } from '../../application/ports/registration-status-reader';
import type { CurrentLegalDocument, RegistrationSnapshot } from '../../domain/registration-status';

type SnapshotRow = {
  role: Role | null;
  has_patient_profile: boolean;
  legal: CurrentLegalDocument[] | null;
  identity: { status: 'pending' | 'approved' | 'rejected'; rejectionReason: string | null } | null;
};

// DP-8: una sola consulta, sin caché. Las versiones legales vigentes se calculan con la hora de la BD.
@Injectable()
export class DrizzleRegistrationStatusReader implements RegistrationStatusReader {
  async read(userId: string): Promise<RegistrationSnapshot> {
    const { rows } = await getDbContext().execute<SnapshotRow>(sql`
      with profile as (
        select up.id as user_profile_id, up.role, pp.id as patient_profile_id
          from user_profile up
          left join patient_profile pp on pp.user_profile_id = up.id
         where up.user_id = ${userId}
      ),
      current_legal as (
        select distinct on (type) id, type, version
          from legal_document
         where published_at <= now()
         order by type, published_at desc
      )
      select
        (select role from profile) as role,
        coalesce((select patient_profile_id is not null from profile), false) as has_patient_profile,
        (select json_agg(json_build_object(
                  'type', c.type,
                  'documentId', c.id,
                  'version', c.version,
                  'accepted', exists (
                    select 1 from user_legal_acceptance a
                     where a.legal_document_id = c.id
                       and a.user_profile_id = (select user_profile_id from profile))
                ) order by c.type)
           from current_legal c) as legal,
        (select json_build_object('status', v.status, 'rejectionReason', v.rejection_reason)
           from patient_identity_verification v
          where v.patient_id = (select patient_profile_id from profile)
          order by v.attempt desc
          limit 1) as identity
    `);
    const row = rows[0];
    return {
      role: row?.role ?? null,
      hasPatientProfile: row?.has_patient_profile === true,
      currentLegalDocuments: row?.legal ?? [],
      latestIdentityVerification: row?.identity ?? null,
    };
  }
}
