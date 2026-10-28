import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import type { UnitOfWork } from '../../src/common/application/ports/unit-of-work';
import { BusinessRuleViolationError, UniqueConstraintViolationError } from '../../src/common/domain/persistence.errors';
import type { AuditTrail } from '../../src/modules/audit/application/ports/audit-trail';
import type { AuditEvent } from '../../src/modules/audit/domain/audit-event';
import type { DoctorIdentityGateway, DoctorLegalIdentity } from '../../src/modules/identity/application/ports/doctor-identity.gateway';
import { ProfileAlreadyExistsError, RegistrationDataConflictError } from '../../src/modules/identity/domain/identity.errors';
import { evaluateLegalAcceptance } from '../../src/modules/identity/domain/legal-requirements';
import type { DoctorProfileRecord, DoctorProfileRepository } from '../../src/modules/doctors/application/ports/doctor-profile.repository';
import type { DoctorReviewRepository, IdentityReviewRecord, LicenseReviewRecord, ReviewUpdate } from '../../src/modules/doctors/application/ports/doctor-review.repository';
import { InMemorySpecialtyCatalog } from './doctors-in-memory';
import { InMemoryIdentityStore } from './identity-in-memory';

// M03 B5: mundo en memoria del médico (perfil, revisiones e identidad sobre el almacén de Identity). Reproduce las reglas
// de la BD que importan a los casos de uso: unicidades (CURP, número de cédula, un pendiente por línea) y los triggers de
// 0012 (intento siguiente, versión vigente, evidencia de la cédula igual al perfil, número o especialidad solo con
// versión nueva). La revisión del admin (B6) se simula con `review`.

const trigger = (message: string) => new BusinessRuleViolationError(message, { code: 'P0001' });
const unique = (constraint: string) => new UniqueConstraintViolationError({ code: '23505', constraint });

interface DoctorState {
  profiles: DoctorProfileRecord[];
  identity: IdentityReviewRecord[];
  license: LicenseReviewRecord[];
}

export class InMemoryDoctorWorld implements DoctorProfileRepository, DoctorReviewRepository, DoctorIdentityGateway {
  doctor: DoctorState = { profiles: [], identity: [], license: [] };
  failAudit = false;
  // Igual que DrizzleDoctorIdentityGateway: el conflicto de CURP solo deja un log sin datos (D-17, P2).
  private readonly logger = new Logger('DoctorIdentityGateway');
  private curpConflict(): never {
    this.logger.warn('registration_conflict field=curp');
    throw new RegistrationDataConflictError('curp');
  }

  constructor(
    readonly store: InMemoryIdentityStore = new InMemoryIdentityStore(),
    readonly catalog: InMemorySpecialtyCatalog = InMemorySpecialtyCatalog.seeded(),
  ) {}

  get audit(): AuditEvent[] {
    return this.store.state.audit;
  }

  // ---------------- DoctorIdentityGateway
  async createDoctorUserProfile(input: { userId: string; firstName: string; lastName: string; curp: string; phone: string | null }): Promise<string> {
    if (await this.store.findByUserId(input.userId)) throw new ProfileAlreadyExistsError();
    if (await this.store.existsByCurp(input.curp)) this.curpConflict();
    const id = this.store.createDoctorForTest(input);
    this.userRow(id).phone = input.phone;
    return id;
  }
  private userRow(userProfileId: string) {
    const row = this.store.state.userProfiles.find((p) => p.id === userProfileId);
    if (!row) throw new Error('user_profile inexistente');
    return row;
  }
  async findLegalIdentity(userProfileId: string): Promise<DoctorLegalIdentity | null> {
    const row = this.store.state.userProfiles.find((p) => p.id === userProfileId);
    if (!row || row.role !== 'doctor' || row.curp === null) return null;
    return { firstName: row.firstName, lastName: row.lastName, curp: row.curp, phone: row.phone };
  }
  async updatePhone(userProfileId: string, phone: string | null): Promise<void> {
    this.userRow(userProfileId).phone = phone;
  }
  async doctorLegalAccepted(userProfileId: string): Promise<boolean> {
    const current = await this.store.findCurrent();
    return evaluateLegalAcceptance(
      'doctor',
      current.map((doc) => ({
        type: doc.type,
        documentId: doc.id,
        version: doc.version,
        accepted: this.store.state.acceptances.some((a) => a.userProfileId === userProfileId && a.legalDocumentId === doc.id),
      })),
    ).accepted;
  }
  // Pruebas: publica (si falta) y acepta el régimen del médico.
  acceptDoctorRegime(userProfileId: string): void {
    for (const type of ['privacy_policy', 'doctor_terms'] as const) {
      const doc = this.store.state.legalDocuments.find((d) => d.type === type) ?? this.store.publishLegalDocument(type, '2026-10');
      if (!this.store.state.acceptances.some((a) => a.userProfileId === userProfileId && a.legalDocumentId === doc.id)) {
        this.store.state.acceptances.push({ userProfileId, legalDocumentId: doc.id, ipAddress: null, userAgent: null });
      }
    }
  }

  // ---------------- DoctorProfileRepository
  profileRow(id: string): DoctorProfileRecord {
    const row = this.doctor.profiles.find((p) => p.id === id);
    if (!row) throw new Error('doctor_profile inexistente');
    return row;
  }
  async create(input: { userProfileId: string; specialtyId: string; bio: string | null }): Promise<DoctorProfileRecord> {
    if (this.doctor.profiles.some((p) => p.userProfileId === input.userProfileId)) throw unique('doctor_profile_user_profile_id_unique');
    const row: DoctorProfileRecord = { id: randomUUID(), ...input, licenseNumber: null, photoObjectKey: null, identityRevision: 1, professionalRevision: 1 };
    this.doctor.profiles.push(row);
    return { ...row };
  }
  async findByUserProfileId(userProfileId: string): Promise<DoctorProfileRecord | null> {
    const row = this.doctor.profiles.find((p) => p.userProfileId === userProfileId);
    return row ? { ...row } : null;
  }
  async lockByUserProfileId(userProfileId: string): Promise<DoctorProfileRecord | null> {
    return this.findByUserProfileId(userProfileId);
  }
  async findById(id: string): Promise<DoctorProfileRecord | null> {
    const row = this.doctor.profiles.find((p) => p.id === id);
    return row ? { ...row } : null;
  }
  async lockById(id: string): Promise<DoctorProfileRecord | null> {
    return this.findById(id);
  }
  async lockForShareById(id: string): Promise<DoctorProfileRecord | null> {
    return this.findById(id);
  }
  async listAll(): Promise<DoctorProfileRecord[]> {
    return this.doctor.profiles.map((p) => ({ ...p }));
  }
  // Trigger doctor_profile_revisions (0012) y doctor_profile_license_number_unique.
  async applyRevisions(input: { id: string; identityBump: 0 | 1; professionalBump: 0 | 1; licenseNumber?: string; specialtyId?: string }): Promise<DoctorProfileRecord> {
    const row = this.profileRow(input.id);
    const numberChanges = input.licenseNumber !== undefined && input.licenseNumber !== row.licenseNumber;
    const specialtyChanges = input.specialtyId !== undefined && input.specialtyId !== row.specialtyId;
    if ((numberChanges || specialtyChanges) && input.professionalBump !== 1) {
      throw trigger('Cambiar el número de cédula o la especialidad exige una nueva versión profesional');
    }
    if (numberChanges && this.doctor.profiles.some((p) => p.id !== row.id && p.licenseNumber === input.licenseNumber)) {
      throw unique('doctor_profile_license_number_unique');
    }
    Object.assign(row, {
      identityRevision: row.identityRevision + input.identityBump,
      professionalRevision: row.professionalRevision + input.professionalBump,
      ...(input.licenseNumber !== undefined ? { licenseNumber: input.licenseNumber } : {}),
      ...(input.specialtyId !== undefined ? { specialtyId: input.specialtyId } : {}),
    });
    return { ...row };
  }
  async updateBio(id: string, bio: string | null): Promise<void> {
    this.profileRow(id).bio = bio;
  }
  async setPhotoObjectKey(id: string, key: string): Promise<void> {
    this.profileRow(id).photoObjectKey = key;
  }

  // ---------------- DoctorReviewRepository
  async listIdentity(doctorId: string): Promise<IdentityReviewRecord[]> {
    return this.doctor.identity.filter((r) => r.doctorId === doctorId).sort((a, b) => a.attempt - b.attempt).map((r) => ({ ...r }));
  }
  async listLicense(doctorId: string): Promise<LicenseReviewRecord[]> {
    return this.doctor.license.filter((r) => r.doctorId === doctorId).sort((a, b) => a.attempt - b.attempt).map((r) => ({ ...r }));
  }
  async supersedePendingIdentity(doctorId: string): Promise<IdentityReviewRecord | null> {
    const row = this.doctor.identity.find((r) => r.doctorId === doctorId && r.status === 'pending');
    if (!row) return null;
    row.status = 'superseded';
    return { ...row };
  }
  async supersedePendingLicense(doctorId: string): Promise<LicenseReviewRecord | null> {
    const row = this.doctor.license.find((r) => r.doctorId === doctorId && r.status === 'pending');
    if (!row) return null;
    row.status = 'superseded';
    return { ...row };
  }
  private checkInsert(rows: { doctorId: string; attempt: number; status: string }[], input: { doctorId: string; attempt: number; revision: number }, current: number, line: 'identity' | 'license') {
    const next = rows.filter((r) => r.doctorId === input.doctorId).reduce((m, r) => Math.max(m, r.attempt), 0) + 1;
    if (input.revision !== current) throw trigger('La revisión no corresponde a la versión vigente');
    if (input.attempt !== next) throw trigger('El intento debe ser el siguiente');
    if (rows.some((r) => r.doctorId === input.doctorId && r.status === 'pending')) throw unique(`doctor_${line}_verification_one_pending_uq`);
  }
  async insertIdentity(input: { id: string; doctorId: string; attempt: number; revision: number; frontObjectKey: string; backObjectKey: string }): Promise<IdentityReviewRecord> {
    this.checkInsert(this.doctor.identity, input, this.profileRow(input.doctorId).identityRevision, 'identity');
    const row: IdentityReviewRecord = { ...input, status: 'pending', rejectionReason: null, createdAt: new Date(), reviewedBy: null, reviewedAt: null, documentsDeletedAt: null };
    this.doctor.identity.push(row);
    return { ...row };
  }
  async insertLicense(input: Parameters<DoctorReviewRepository['insertLicense']>[0]): Promise<LicenseReviewRecord> {
    const profile = this.profileRow(input.doctorId);
    this.checkInsert(this.doctor.license, input, profile.professionalRevision, 'license');
    if (input.licenseNumber !== profile.licenseNumber || input.specialtyId !== profile.specialtyId) {
      throw trigger('La evidencia de la cédula debe coincidir con el perfil vigente');
    }
    const row: LicenseReviewRecord = { ...input, status: 'pending', rejectionReason: null, createdAt: new Date(), reviewedBy: null, reviewedAt: null };
    this.doctor.license.push(row);
    return { ...row };
  }
  async markIdentityDocumentsDeleted(id: string): Promise<boolean> {
    const row = this.doctor.identity.find((r) => r.id === id && r.status !== 'pending' && r.documentsDeletedAt === null);
    if (!row) return false;
    Object.assign(row, { frontObjectKey: null, backObjectKey: null, documentsDeletedAt: new Date() });
    return true;
  }

  // ---------------- B6
  async findIdentityById(id: string) {
    const row = this.doctor.identity.find((r) => r.id === id);
    return row ? { ...row } : null;
  }
  async findLicenseById(id: string) {
    const row = this.doctor.license.find((r) => r.id === id);
    return row ? { ...row } : null;
  }
  async lockIdentity(id: string) {
    return this.findIdentityById(id);
  }
  async lockLicense(id: string) {
    return this.findLicenseById(id);
  }
  // Trigger *_before_update de 0012: solo desde pending y solo la revisión vigente se aprueba o rechaza.
  private markReviewed<T extends IdentityReviewRecord | LicenseReviewRecord>(rows: T[], input: ReviewUpdate, current: (r: T) => number): T | null {
    const row = rows.find((r) => r.id === input.id && r.status === 'pending');
    if (!row) return null;
    const maxAttempt = rows.filter((r) => r.doctorId === row.doctorId).reduce((m, r) => Math.max(m, r.attempt), 0);
    if (row.revision !== current(row) || row.attempt !== maxAttempt) throw trigger('Solo la revisión vigente se puede aprobar o rechazar');
    Object.assign(row, { status: input.status, reviewedBy: input.reviewedBy, reviewedAt: new Date(), rejectionReason: input.rejectionReason });
    return { ...row };
  }
  async markIdentityReviewed(input: ReviewUpdate) {
    return this.markReviewed(this.doctor.identity, input, (r) => this.profileRow(r.doctorId).identityRevision);
  }
  async markLicenseReviewed(input: ReviewUpdate) {
    return this.markReviewed(this.doctor.license, input, (r) => this.profileRow(r.doctorId).professionalRevision);
  }
  private page<T extends { status: string; createdAt: Date }>(rows: T[], page: number, pageSize: number) {
    const pending = rows.filter((r) => r.status === 'pending').sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return { items: pending.slice((page - 1) * pageSize, page * pageSize).map((r) => ({ ...r })), total: pending.length };
  }
  async listPendingIdentity(page: number, pageSize: number) {
    return this.page(this.doctor.identity, page, pageSize);
  }
  async listPendingLicense(page: number, pageSize: number) {
    return this.page(this.doctor.license, page, pageSize);
  }
  async findTerminalIdentityWithDocuments(limit: number) {
    return this.doctor.identity
      .filter((r) => r.status !== 'pending' && r.documentsDeletedAt === null && (r.frontObjectKey !== null || r.backObjectKey !== null))
      .slice(0, limit).map((r) => ({ ...r }));
  }

  // Pruebas: simula la revisión del admin sobre el pendiente de una línea (B6 la implementará).
  review(line: 'identity' | 'license', doctorId: string, status: 'approved' | 'rejected'): void {
    const row = (line === 'identity' ? this.doctor.identity : this.doctor.license).find((r) => r.doctorId === doctorId && r.status === 'pending');
    if (!row) throw new Error('sin revisión pendiente');
    Object.assign(row, { status, reviewedAt: new Date(), rejectionReason: status === 'rejected' ? 'Documento ilegible de prueba' : null });
  }
}

// Revierte Identity, el mundo del médico y el catálogo si el trabajo falla (misma UoW, como DrizzleUnitOfWork).
export class InMemoryDoctorUnitOfWork implements UnitOfWork {
  calls = 0;
  constructor(private readonly world: InMemoryDoctorWorld) {}
  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.calls++;
    const identity = structuredClone({ ...this.world.store.state, audit: [] });
    const auditLength = this.world.store.state.audit.length;
    const doctor = structuredClone(this.world.doctor);
    const catalog = this.world.catalog.snapshot();
    try {
      return await work();
    } catch (error) {
      this.world.store.state = { ...identity, audit: this.world.store.state.audit.slice(0, auditLength) };
      this.world.doctor = doctor;
      this.world.catalog.restore(catalog);
      throw error;
    }
  }
}

export class InMemoryDoctorAuditTrail implements AuditTrail {
  constructor(private readonly world: InMemoryDoctorWorld) {}
  async record(event: AuditEvent): Promise<void> {
    if (this.world.failAudit) throw new Error('fallo simulado de auditoría');
    this.world.store.state.audit.push(event);
  }
}
