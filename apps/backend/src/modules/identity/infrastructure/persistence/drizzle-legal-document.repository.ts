import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { legalDocument, userLegalAcceptance } from '../../../../db/schema';
import type { LegalDocumentRepository, LegalDocumentRecord } from '../../domain/repositories/legal-document.repository';

@Injectable()
export class DrizzleLegalDocumentRepository implements LegalDocumentRepository {
  async findLatestByType(type: 'privacy_notice' | 'terms_and_conditions'): Promise<LegalDocumentRecord | null> {
    const [doc] = await getDbContext()
      .select()
      .from(legalDocument)
      .where(eq(legalDocument.type, type))
      .orderBy(desc(legalDocument.publishedAt))
      .limit(1);
    return doc ?? null;
  }

  async recordAcceptance(userProfileId: string, legalDocumentId: string): Promise<void> {
    await getDbContext().insert(userLegalAcceptance).values({ userProfileId, legalDocumentId });
  }
}