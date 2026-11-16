import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import type { Role } from '../../../../common/domain/role';
import type { BookingLegalAcceptanceReader } from '../../application/ports/booking-legal-acceptance.reader';
import {
  selectBookingLegalAcceptances,
  type BookingLegalAcceptances,
  type CurrentLegalDocumentAcceptance,
} from '../../domain/booking-legal-acceptance';

type Row = { role: Role | null; legal: CurrentLegalDocumentAcceptance[] | null };

// Una sola consulta, sin caché y dentro de la transacción activa. Los documentos vigentes se calculan con la hora de la
// BD y la misma regla que DrizzleRegistrationStatusReader (el más reciente por tipo con published_at <= now()); en lugar
// del booleano «aceptado», devuelve el id de la fila de user_legal_acceptance (única por usuario y documento).
@Injectable()
export class DrizzleBookingLegalAcceptanceReader implements BookingLegalAcceptanceReader {
  async currentFor(userProfileId: string): Promise<BookingLegalAcceptances | null> {
    const { rows } = await getDbContext().execute<Row>(sql`
      with current_legal as (
        select distinct on (type) id, type, version
          from legal_document
         where published_at <= now()
         order by type, published_at desc
      )
      select
        (select role from user_profile where id = ${userProfileId}) as role,
        (select json_agg(json_build_object(
                  'type', c.type,
                  'documentId', c.id,
                  'version', c.version,
                  'acceptanceId', (select a.id from user_legal_acceptance a
                                    where a.legal_document_id = c.id and a.user_profile_id = ${userProfileId})
                ) order by c.type)
           from current_legal c) as legal
    `);
    const row = rows[0];
    return selectBookingLegalAcceptances(row?.role ?? null, row?.legal ?? []);
  }
}
