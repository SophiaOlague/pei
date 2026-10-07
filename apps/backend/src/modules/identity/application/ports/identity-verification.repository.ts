import type { IdentityVerificationStatus } from '../../domain/identity-verification';

export interface IdentityVerificationRecord {
  id: string;
  patientProfileId: string;
  attempt: number;
  status: IdentityVerificationStatus;
  rejectionReason: string | null;
  frontObjectKey: string | null;
  backObjectKey: string | null;
  documentsDeletedAt: Date | null;
  createdAt: Date;
}

export interface IdentityVerificationDetail {
  id: string;
  status: IdentityVerificationStatus;
  attempt: number;
  submittedAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  patient: { firstName: string; lastName: string; birthDate: string | null; curp: string };
}

export interface PendingIdentityVerificationItem {
  id: string;
  attempt: number;
  submittedAt: Date;
}

export interface IdentityVerificationRepository {
  findLatestForPatient(patientProfileId: string): Promise<IdentityVerificationRecord | null>;
  findById(id: string): Promise<IdentityVerificationRecord | null>;
  findDetail(id: string): Promise<IdentityVerificationDetail | null>;
  create(input: { id: string; patientProfileId: string; attempt: number; frontObjectKey: string; backObjectKey: string }): Promise<void>;
  // Solo cambia un envío 'pending'; devuelve null si ya no lo estaba (otra revisión ganó).
  markReviewed(input: {
    id: string;
    status: 'approved' | 'rejected';
    reviewedBy: string;
    rejectionReason: string | null;
  }): Promise<IdentityVerificationRecord | null>;
  markDocumentsDeleted(id: string): Promise<void>;
  listPending(page: number, pageSize: number): Promise<{ items: PendingIdentityVerificationItem[]; total: number }>;
  // Envíos aprobados o rechazados que aún conservan claves (purga pendiente, DT-5 y DT-6).
  findReviewedWithDocuments(limit: number): Promise<IdentityVerificationRecord[]>;
}

export const IDENTITY_VERIFICATION_REPOSITORY = Symbol('IDENTITY_VERIFICATION_REPOSITORY');
