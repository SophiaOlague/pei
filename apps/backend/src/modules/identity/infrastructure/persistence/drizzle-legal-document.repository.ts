import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { userLegalAcceptance } from '../../../../db/schema';
import type {
  CurrentLegalDocumentRecord,
  LegalDocumentRepository,
} from '../../application/ports/legal-document.repository';

@Injectable()
export class DrizzleLegalDocumentRepository implements LegalDocumentRepository {
  // La versión vigente de cada tipo es la de published_at más reciente que no sea futura; el índice
  // único (type, published_at) evita empates (DT-20). now() es la hora de la BD.
  async findCurrent(): Promise<CurrentLegalDocumentRecord[]> {
    const { rows } = await getDbContext().execute<{
      id: string;
      type: CurrentLegalDocumentRecord['type'];
      version: string;
      published_at: string | Date;
      content: string;
    }>(sql`
      select distinct on (type) id, type, version, published_at, content
        from legal_document
       where published_at <= now()
       order by type, published_at desc
    `);
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      version: row.version,
      publishedAt: new Date(row.published_at),
      content: row.content,
    }));
  }

  async recordAcceptances(input: {
    userProfileId: string;
    legalDocumentIds: string[];
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await getDbContext()
      .insert(userLegalAcceptance)
      .values(
        input.legalDocumentIds.map((legalDocumentId) => ({
          userProfileId: input.userProfileId,
          legalDocumentId,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        })),
      )
      // user_legal_acceptance es de solo inserción: repetir una aceptación no la modifica.
      .onConflictDoNothing({ target: [userLegalAcceptance.userProfileId, userLegalAcceptance.legalDocumentId] });
  }
}
