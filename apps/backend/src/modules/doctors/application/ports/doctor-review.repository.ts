import type { ReviewStatus } from '../../domain/review';
import type { LicenseReviewReason } from '../../domain/sensitive-change';

export const DOCTOR_REVIEW_REPOSITORY = Symbol('DOCTOR_REVIEW_REPOSITORY');

export interface IdentityReviewRecord {
  id: string;
  doctorId: string;
  attempt: number;
  revision: number;
  status: ReviewStatus;
  frontObjectKey: string | null;
  backObjectKey: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  documentsDeletedAt: Date | null;
}

export interface LicenseReviewRecord {
  id: string;
  doctorId: string;
  attempt: number;
  revision: number;
  status: ReviewStatus;
  reason: LicenseReviewReason;
  licenseNumber: string;
  specialtyId: string;
  documentObjectKey: string;
  rejectionReason: string | null;
  createdAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
}

// Las dos líneas de revisión del médico (plan v2 §7 y §8). Los triggers de 0012 validan el intento, la versión y la
// evidencia de cada INSERT; el caso de uso los calcula bajo el candado del perfil.
export interface DoctorReviewRepository {
  listIdentity(doctorId: string): Promise<IdentityReviewRecord[]>;
  listLicense(doctorId: string): Promise<LicenseReviewRecord[]>;
  // UPDATE … SET status = 'superseded' WHERE doctor_id = ? AND status = 'pending' RETURNING (a lo más una fila).
  supersedePendingIdentity(doctorId: string): Promise<IdentityReviewRecord | null>;
  supersedePendingLicense(doctorId: string): Promise<LicenseReviewRecord | null>;
  insertIdentity(input: { id: string; doctorId: string; attempt: number; revision: number; frontObjectKey: string; backObjectKey: string }): Promise<IdentityReviewRecord>;
  insertLicense(input: {
    id: string;
    doctorId: string;
    attempt: number;
    revision: number;
    reason: LicenseReviewReason;
    licenseNumber: string;
    specialtyId: string;
    documentObjectKey: string;
  }): Promise<LicenseReviewRecord>;
  // Purga de la INE después de la revisión (estado terminal, D-19): las dos claves a NULL y la fecha.
  markIdentityDocumentsDeleted(id: string): Promise<boolean>;

  // --- B6: revisión del admin (plan v2 §9: doctor_profile FOR UPDATE → revisión FOR UPDATE).
  findIdentityById(id: string): Promise<IdentityReviewRecord | null>;
  findLicenseById(id: string): Promise<LicenseReviewRecord | null>;
  lockIdentity(id: string): Promise<IdentityReviewRecord | null>;
  lockLicense(id: string): Promise<LicenseReviewRecord | null>;
  // UPDATE … WHERE id = ? AND status = 'pending' RETURNING; null si otro administrador revisó primero.
  markIdentityReviewed(input: ReviewUpdate): Promise<IdentityReviewRecord | null>;
  markLicenseReviewed(input: ReviewUpdate): Promise<LicenseReviewRecord | null>;
  // Colas en orden de llegada (las más antiguas primero).
  listPendingIdentity(page: number, pageSize: number): Promise<{ items: IdentityReviewRecord[]; total: number }>;
  listPendingLicense(page: number, pageSize: number): Promise<{ items: LicenseReviewRecord[]; total: number }>;
  // Conciliación (CLI): revisiones terminales que aún conservan las claves de la INE.
  findTerminalIdentityWithDocuments(limit: number): Promise<IdentityReviewRecord[]>;
}

export interface ReviewUpdate {
  id: string;
  status: 'approved' | 'rejected';
  reviewedBy: string;
  rejectionReason: string | null;
}
