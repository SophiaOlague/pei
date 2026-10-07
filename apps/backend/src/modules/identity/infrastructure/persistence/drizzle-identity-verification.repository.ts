import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { patientIdentityVerification as verification, patientProfile, userProfile } from '../../../../db/schema';
import type {
  IdentityVerificationDetail,
  IdentityVerificationRecord,
  IdentityVerificationRepository,
  PendingIdentityVerificationItem,
} from '../../application/ports/identity-verification.repository';

const RECORD_COLUMNS = {
  id: verification.id,
  patientProfileId: verification.patientId,
  attempt: verification.attempt,
  status: verification.status,
  rejectionReason: verification.rejectionReason,
  frontObjectKey: verification.ineFrontObjectKey,
  backObjectKey: verification.ineBackObjectKey,
  documentsDeletedAt: verification.documentsDeletedAt,
  createdAt: verification.createdAt,
};

@Injectable()
export class DrizzleIdentityVerificationRepository implements IdentityVerificationRepository {
  async findLatestForPatient(patientProfileId: string): Promise<IdentityVerificationRecord | null> {
    const [row] = await getDbContext()
      .select(RECORD_COLUMNS)
      .from(verification)
      .where(eq(verification.patientId, patientProfileId))
      .orderBy(desc(verification.attempt))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<IdentityVerificationRecord | null> {
    const [row] = await getDbContext().select(RECORD_COLUMNS).from(verification).where(eq(verification.id, id)).limit(1);
    return row ?? null;
  }

  async findDetail(id: string): Promise<IdentityVerificationDetail | null> {
    const [row] = await getDbContext()
      .select({
        id: verification.id,
        status: verification.status,
        attempt: verification.attempt,
        submittedAt: verification.createdAt,
        reviewedAt: verification.reviewedAt,
        rejectionReason: verification.rejectionReason,
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        birthDate: userProfile.birthDate,
        curp: patientProfile.curp,
      })
      .from(verification)
      .innerJoin(patientProfile, eq(patientProfile.id, verification.patientId))
      .innerJoin(userProfile, eq(userProfile.id, patientProfile.userProfileId))
      .where(eq(verification.id, id))
      .limit(1);
    if (!row) return null;
    const { firstName, lastName, birthDate, curp, ...submission } = row;
    return { ...submission, patient: { firstName, lastName, birthDate, curp } };
  }

  async create(input: { id: string; patientProfileId: string; attempt: number; frontObjectKey: string; backObjectKey: string }): Promise<void> {
    await getDbContext().insert(verification).values({
      id: input.id,
      patientId: input.patientProfileId,
      attempt: input.attempt,
      ineFrontObjectKey: input.frontObjectKey,
      ineBackObjectKey: input.backObjectKey,
      status: 'pending',
    });
  }

  async markReviewed(input: {
    id: string;
    status: 'approved' | 'rejected';
    reviewedBy: string;
    rejectionReason: string | null;
  }): Promise<IdentityVerificationRecord | null> {
    const [row] = await getDbContext()
      .update(verification)
      .set({
        status: input.status,
        reviewedBy: input.reviewedBy,
        reviewedAt: sql`now()`,
        rejectionReason: input.rejectionReason,
        updatedAt: sql`now()`,
      })
      .where(and(eq(verification.id, input.id), eq(verification.status, 'pending')))
      .returning(RECORD_COLUMNS);
    return row ?? null;
  }

  async markDocumentsDeleted(id: string): Promise<void> {
    await getDbContext()
      .update(verification)
      .set({ ineFrontObjectKey: null, ineBackObjectKey: null, documentsDeletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(verification.id, id), inArray(verification.status, ['approved', 'rejected']), isNull(verification.documentsDeletedAt)));
  }

  async listPending(page: number, pageSize: number): Promise<{ items: PendingIdentityVerificationItem[]; total: number }> {
    const db = getDbContext();
    const items = await db
      .select({ id: verification.id, attempt: verification.attempt, submittedAt: verification.createdAt })
      .from(verification)
      .where(eq(verification.status, 'pending'))
      .orderBy(asc(verification.createdAt), asc(verification.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const [{ total }] = await db.select({ total: count() }).from(verification).where(eq(verification.status, 'pending'));
    return { items, total };
  }

  async findReviewedWithDocuments(limit: number): Promise<IdentityVerificationRecord[]> {
    return getDbContext()
      .select(RECORD_COLUMNS)
      .from(verification)
      .where(
        and(
          inArray(verification.status, ['approved', 'rejected']),
          or(isNotNull(verification.ineFrontObjectKey), isNotNull(verification.ineBackObjectKey)),
        ),
      )
      .orderBy(asc(verification.reviewedAt))
      .limit(limit);
  }
}
