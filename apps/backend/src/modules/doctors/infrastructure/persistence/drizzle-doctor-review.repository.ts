import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { doctorIdentityVerification as idv, doctorLicenseVerification as lic } from '../../../../db/schema';
import type { DoctorReviewRepository, IdentityReviewRecord, LicenseReviewRecord, ReviewUpdate } from '../../application/ports/doctor-review.repository';

const IDENTITY = {
  id: idv.id,
  doctorId: idv.doctorId,
  attempt: idv.attempt,
  revision: idv.identityRevision,
  status: idv.status,
  frontObjectKey: idv.ineFrontObjectKey,
  backObjectKey: idv.ineBackObjectKey,
  rejectionReason: idv.rejectionReason,
  createdAt: idv.createdAt,
  reviewedBy: idv.reviewedBy,
  reviewedAt: idv.reviewedAt,
  documentsDeletedAt: idv.documentsDeletedAt,
};

const LICENSE = {
  id: lic.id,
  doctorId: lic.doctorId,
  attempt: lic.attempt,
  revision: lic.professionalRevision,
  status: lic.status,
  reason: lic.reason,
  licenseNumber: lic.licenseNumber,
  specialtyId: lic.specialtyId,
  documentObjectKey: lic.documentObjectKey,
  rejectionReason: lic.rejectionReason,
  createdAt: lic.createdAt,
  reviewedBy: lic.reviewedBy,
  reviewedAt: lic.reviewedAt,
};

// updated_at lo fija el trigger de 0012 en toda modificación permitida.
@Injectable()
export class DrizzleDoctorReviewRepository implements DoctorReviewRepository {
  async listIdentity(doctorId: string): Promise<IdentityReviewRecord[]> {
    return getDbContext().select(IDENTITY).from(idv).where(eq(idv.doctorId, doctorId)).orderBy(asc(idv.attempt));
  }

  async listLicense(doctorId: string): Promise<LicenseReviewRecord[]> {
    return getDbContext().select(LICENSE).from(lic).where(eq(lic.doctorId, doctorId)).orderBy(asc(lic.attempt));
  }

  async supersedePendingIdentity(doctorId: string): Promise<IdentityReviewRecord | null> {
    const [row] = await getDbContext().update(idv).set({ status: 'superseded' }).where(and(eq(idv.doctorId, doctorId), eq(idv.status, 'pending'))).returning(IDENTITY);
    return row ?? null;
  }

  async supersedePendingLicense(doctorId: string): Promise<LicenseReviewRecord | null> {
    const [row] = await getDbContext().update(lic).set({ status: 'superseded' }).where(and(eq(lic.doctorId, doctorId), eq(lic.status, 'pending'))).returning(LICENSE);
    return row ?? null;
  }

  async insertIdentity(input: { id: string; doctorId: string; attempt: number; revision: number; frontObjectKey: string; backObjectKey: string }): Promise<IdentityReviewRecord> {
    const [row] = await getDbContext()
      .insert(idv)
      .values({ id: input.id, doctorId: input.doctorId, attempt: input.attempt, identityRevision: input.revision, ineFrontObjectKey: input.frontObjectKey, ineBackObjectKey: input.backObjectKey })
      .returning(IDENTITY);
    return row;
  }

  async insertLicense(input: Parameters<DoctorReviewRepository['insertLicense']>[0]): Promise<LicenseReviewRecord> {
    const [row] = await getDbContext()
      .insert(lic)
      .values({
        id: input.id,
        doctorId: input.doctorId,
        attempt: input.attempt,
        professionalRevision: input.revision,
        reason: input.reason,
        licenseNumber: input.licenseNumber,
        specialtyId: input.specialtyId,
        documentObjectKey: input.documentObjectKey,
      })
      .returning(LICENSE);
    return row;
  }

  async markIdentityDocumentsDeleted(id: string): Promise<boolean> {
    const rows = await getDbContext()
      .update(idv)
      .set({ ineFrontObjectKey: null, ineBackObjectKey: null, documentsDeletedAt: sql`now()` })
      .where(and(eq(idv.id, id), ne(idv.status, 'pending'), isNull(idv.documentsDeletedAt)))
      .returning({ id: idv.id });
    return rows.length > 0;
  }

  async findIdentityById(id: string): Promise<IdentityReviewRecord | null> {
    const [row] = await getDbContext().select(IDENTITY).from(idv).where(eq(idv.id, id)).limit(1);
    return row ?? null;
  }

  async findLicenseById(id: string): Promise<LicenseReviewRecord | null> {
    const [row] = await getDbContext().select(LICENSE).from(lic).where(eq(lic.id, id)).limit(1);
    return row ?? null;
  }

  async lockIdentity(id: string): Promise<IdentityReviewRecord | null> {
    const [row] = await getDbContext().select(IDENTITY).from(idv).where(eq(idv.id, id)).for('update').limit(1);
    return row ?? null;
  }

  async lockLicense(id: string): Promise<LicenseReviewRecord | null> {
    const [row] = await getDbContext().select(LICENSE).from(lic).where(eq(lic.id, id)).for('update').limit(1);
    return row ?? null;
  }

  async markIdentityReviewed(input: ReviewUpdate): Promise<IdentityReviewRecord | null> {
    const [row] = await getDbContext()
      .update(idv)
      .set({ status: input.status, reviewedBy: input.reviewedBy, reviewedAt: sql`now()`, rejectionReason: input.rejectionReason })
      .where(and(eq(idv.id, input.id), eq(idv.status, 'pending')))
      .returning(IDENTITY);
    return row ?? null;
  }

  async markLicenseReviewed(input: ReviewUpdate): Promise<LicenseReviewRecord | null> {
    const [row] = await getDbContext()
      .update(lic)
      .set({ status: input.status, reviewedBy: input.reviewedBy, reviewedAt: sql`now()`, rejectionReason: input.rejectionReason })
      .where(and(eq(lic.id, input.id), eq(lic.status, 'pending')))
      .returning(LICENSE);
    return row ?? null;
  }

  async listPendingIdentity(page: number, pageSize: number): Promise<{ items: IdentityReviewRecord[]; total: number }> {
    const db = getDbContext();
    const items = await db.select(IDENTITY).from(idv).where(eq(idv.status, 'pending')).orderBy(asc(idv.createdAt), asc(idv.id)).limit(pageSize).offset((page - 1) * pageSize);
    const [{ total }] = await db.select({ total: count() }).from(idv).where(eq(idv.status, 'pending'));
    return { items, total };
  }

  async listPendingLicense(page: number, pageSize: number): Promise<{ items: LicenseReviewRecord[]; total: number }> {
    const db = getDbContext();
    const items = await db.select(LICENSE).from(lic).where(eq(lic.status, 'pending')).orderBy(asc(lic.createdAt), asc(lic.id)).limit(pageSize).offset((page - 1) * pageSize);
    const [{ total }] = await db.select({ total: count() }).from(lic).where(eq(lic.status, 'pending'));
    return { items, total };
  }

  async findTerminalIdentityWithDocuments(limit: number): Promise<IdentityReviewRecord[]> {
    return getDbContext()
      .select(IDENTITY)
      .from(idv)
      .where(and(ne(idv.status, 'pending'), isNull(idv.documentsDeletedAt), or(isNotNull(idv.ineFrontObjectKey), isNotNull(idv.ineBackObjectKey))))
      .orderBy(asc(idv.createdAt))
      .limit(limit);
  }
}
