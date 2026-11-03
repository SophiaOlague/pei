import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import type { UnitOfWork } from '../../src/common/application/ports/unit-of-work';
import type { Role } from '../../src/common/domain/role';
import type { AuditTrail } from '../../src/modules/audit/application/ports/audit-trail';
import type { AuditEvent } from '../../src/modules/audit/domain/audit-event';
import type { PrivateObjectStorage, StoredObject } from '../../src/modules/private-storage/application/ports/private-object-storage';
import type { UserProfileRecord, UserProfileRepository } from '../../src/modules/identity/application/ports/user-profile.repository';
import type {
  EditableProfileFields,
  PatientProfileRepository,
  PatientProfileView,
} from '../../src/modules/identity/application/ports/patient-profile.repository';
import type {
  IdentityVerificationDetail,
  IdentityVerificationRecord,
  IdentityVerificationRepository,
  PendingIdentityVerificationItem,
} from '../../src/modules/identity/application/ports/identity-verification.repository';
import type {
  CurrentLegalDocumentRecord,
  LegalDocumentRepository,
  NewLegalDocument,
  PublishedLegalDocument,
} from '../../src/modules/identity/application/ports/legal-document.repository';
import type { RegistrationStatusReader } from '../../src/modules/identity/application/ports/registration-status-reader';
import type { AdminAccountProvisioner } from '../../src/modules/identity/application/ports/admin-account-provisioner';
import type { RegistrationSnapshot } from '../../src/modules/identity/domain/registration-status';
import { UniqueConstraintViolationError } from '../../src/common/domain/persistence.errors';
import { StoredFileNotFoundError } from '../../src/modules/private-storage/domain/private-storage.errors';

// Dobles EN MEMORIA de los puertos de Identity para pruebas unitarias de casos de uso y E2E sin BD.
// Reproducen las reglas de la BD que importan a M02 (unicidades y el "solo un pending") y, con
// InMemoryUnitOfWork, revierten el estado si la unidad de trabajo falla.

interface UserProfileRow {
  id: string;
  userId: string;
  role: Role;
  firstName: string;
  lastName: string;
  // M03 R-12: la CURP vive en user_profile (NULL para admin).
  curp: string | null;
  birthDate: string | null;
  phone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
}
interface PatientProfileRow {
  id: string;
  userProfileId: string;
  address: string | null;
  photoObjectKey: string | null;
}
interface LegalDocumentRow extends CurrentLegalDocumentRecord {}
interface AcceptanceRow {
  userProfileId: string;
  legalDocumentId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

interface State {
  userProfiles: UserProfileRow[];
  patientProfiles: PatientProfileRow[];
  verifications: (IdentityVerificationRecord & { reviewedBy: string | null; reviewedAt: Date | null })[];
  legalDocuments: LegalDocumentRow[];
  acceptances: AcceptanceRow[];
  audit: AuditEvent[];
}

const unique = (constraint: string) => new UniqueConstraintViolationError({ code: '23505', constraint });

export class InMemoryIdentityStore implements UserProfileRepository, LegalDocumentRepository, RegistrationStatusReader {
  state: State = { userProfiles: [], patientProfiles: [], verifications: [], legalDocuments: [], acceptances: [], audit: [] };
  now = () => new Date();

  // Los dos repositorios que comparten el nombre "create" se exponen como vistas del mismo almacén.
  readonly patientProfiles: PatientProfileRepository = {
    findByUserProfileId: (id) => this.findByUserProfileId(id),
    lockByUserProfileId: (id) => this.findByUserProfileId(id),
    create: (input) => this.createPatientProfile(input),
    updateEditableFields: (profile, fields) => this.updateEditableFields(profile, fields),
    setPhotoObjectKey: (id, key) => this.setPhotoObjectKey(id, key),
  };

  readonly verifications: IdentityVerificationRepository = {
    findLatestForPatient: (id) => this.findLatestForPatient(id),
    findById: (id) => this.findById(id),
    findDetail: (id) => this.findDetail(id),
    create: (input) => this.createVerification(input),
    markReviewed: (input) => this.markReviewed(input),
    markDocumentsDeleted: (id) => this.markDocumentsDeleted(id),
    listPending: (page, size) => this.listPending(page, size),
    findReviewedWithDocuments: (limit) => this.findReviewedWithDocuments(limit),
  };

  // --- UserProfileRepository
  async findByUserId(userId: string): Promise<UserProfileRecord | null> {
    const row = this.state.userProfiles.find((p) => p.userId === userId);
    return row ? { id: row.id, role: row.role } : null;
  }
  private insertUserProfile(row: Omit<UserProfileRow, 'id'>): string {
    if (this.state.userProfiles.some((p) => p.userId === row.userId)) throw unique('user_profile_user_id_unique');
    // Igual que en la BD (0007): CURP única entre roles y obligatoria para paciente y médico.
    if (row.curp !== null && this.state.userProfiles.some((p) => p.curp === row.curp)) throw unique('user_profile_curp_unique');
    if ((row.role === 'patient' || row.role === 'doctor') && row.curp === null) {
      throw new Error('user_profile_curp_required_chk: paciente o médico sin CURP');
    }
    const id = randomUUID();
    this.state.userProfiles.push({ id, ...row });
    return id;
  }
  async createPatient(input: Parameters<UserProfileRepository['createPatient']>[0]): Promise<string> {
    return this.insertUserProfile({ ...input, role: 'patient' });
  }
  async createAdmin(input: { userId: string; firstName: string; lastName: string }): Promise<string> {
    return this.insertUserProfile({ ...input, role: 'admin', curp: null, birthDate: null, phone: null, emergencyContactName: null, emergencyContactPhone: null });
  }
  // Solo pruebas: un user_profile con rol doctor (M03 creará el registro real del médico). Requiere CURP (0007).
  createDoctorForTest(input: { userId: string; firstName: string; lastName: string; curp: string }): string {
    return this.insertUserProfile({ ...input, role: 'doctor', birthDate: null, phone: null, emergencyContactName: null, emergencyContactPhone: null });
  }
  async existsByCurp(curp: string): Promise<boolean> {
    return this.state.userProfiles.some((p) => p.curp === curp);
  }
  async lockAdminBootstrap(): Promise<void> {}
  async adminExists(): Promise<boolean> {
    return this.state.userProfiles.some((p) => p.role === 'admin');
  }

  // --- PatientProfileRepository (vista: patientProfiles)
  async findByUserProfileId(userProfileId: string): Promise<PatientProfileView | null> {
    const patient = this.state.patientProfiles.find((p) => p.userProfileId === userProfileId);
    const user = this.state.userProfiles.find((p) => p.id === userProfileId);
    if (!patient || !user) return null;
    return {
      patientProfileId: patient.id,
      userProfileId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: user.birthDate,
      curp: user.curp!,
      phone: user.phone,
      address: patient.address,
      emergencyContactName: user.emergencyContactName,
      emergencyContactPhone: user.emergencyContactPhone,
      photoObjectKey: patient.photoObjectKey,
    };
  }
  async createPatientProfile(input: { userProfileId: string; address: string | null }): Promise<string> {
    const id = randomUUID();
    this.state.patientProfiles.push({ id, userProfileId: input.userProfileId, address: input.address, photoObjectKey: null });
    return id;
  }

  async createVerification(input: { id: string; patientProfileId: string; attempt: number; frontObjectKey: string; backObjectKey: string }) {
    const sameAttempt = this.state.verifications.some((v) => v.patientProfileId === input.patientProfileId && v.attempt === input.attempt);
    if (sameAttempt) throw unique('patient_identity_verification_patient_attempt_uq');
    const pending = this.state.verifications.some((v) => v.patientProfileId === input.patientProfileId && v.status === 'pending');
    if (pending) throw unique('patient_identity_verification_one_pending_uq');
    this.state.verifications.push({
      id: input.id,
      patientProfileId: input.patientProfileId,
      attempt: input.attempt,
      status: 'pending',
      rejectionReason: null,
      frontObjectKey: input.frontObjectKey,
      backObjectKey: input.backObjectKey,
      documentsDeletedAt: null,
      createdAt: this.now(),
      reviewedBy: null,
      reviewedAt: null,
    });
  }
  async updateEditableFields(profile: PatientProfileView, fields: EditableProfileFields): Promise<void> {
    const user = this.state.userProfiles.find((p) => p.id === profile.userProfileId)!;
    const patient = this.state.patientProfiles.find((p) => p.id === profile.patientProfileId)!;
    const { address, ...contact } = fields;
    Object.assign(user, contact);
    if (address !== undefined) patient.address = address;
  }
  async setPhotoObjectKey(patientProfileId: string, key: string): Promise<void> {
    this.state.patientProfiles.find((p) => p.id === patientProfileId)!.photoObjectKey = key;
  }

  // --- IdentityVerificationRepository (vista: verifications)
  private record(v: State['verifications'][number]): IdentityVerificationRecord {
    const { reviewedBy: _b, reviewedAt: _a, ...record } = v;
    return { ...record };
  }
  async findLatestForPatient(patientProfileId: string): Promise<IdentityVerificationRecord | null> {
    const rows = this.state.verifications.filter((v) => v.patientProfileId === patientProfileId).sort((a, b) => b.attempt - a.attempt);
    return rows[0] ? this.record(rows[0]) : null;
  }
  async findById(id: string): Promise<IdentityVerificationRecord | null> {
    const row = this.state.verifications.find((v) => v.id === id);
    return row ? this.record(row) : null;
  }
  async findDetail(id: string): Promise<IdentityVerificationDetail | null> {
    const row = this.state.verifications.find((v) => v.id === id);
    if (!row) return null;
    const patient = this.state.patientProfiles.find((p) => p.id === row.patientProfileId)!;
    const user = this.state.userProfiles.find((p) => p.id === patient.userProfileId)!;
    return {
      id: row.id,
      status: row.status,
      attempt: row.attempt,
      submittedAt: row.createdAt,
      reviewedAt: row.reviewedAt,
      rejectionReason: row.rejectionReason,
      patient: { firstName: user.firstName, lastName: user.lastName, birthDate: user.birthDate, curp: user.curp! },
    };
  }
  async markReviewed(input: { id: string; status: 'approved' | 'rejected'; reviewedBy: string; rejectionReason: string | null }) {
    const row = this.state.verifications.find((v) => v.id === input.id && v.status === 'pending');
    if (!row) return null;
    Object.assign(row, { status: input.status, reviewedBy: input.reviewedBy, reviewedAt: this.now(), rejectionReason: input.rejectionReason });
    return this.record(row);
  }
  async markDocumentsDeleted(id: string): Promise<void> {
    const row = this.state.verifications.find((v) => v.id === id && v.status !== 'pending' && !v.documentsDeletedAt);
    if (row) Object.assign(row, { frontObjectKey: null, backObjectKey: null, documentsDeletedAt: this.now() });
  }
  async listPending(page: number, pageSize: number): Promise<{ items: PendingIdentityVerificationItem[]; total: number }> {
    const pending = this.state.verifications.filter((v) => v.status === 'pending').sort((a, b) => +a.createdAt - +b.createdAt);
    return {
      items: pending.slice((page - 1) * pageSize, page * pageSize).map((v) => ({ id: v.id, attempt: v.attempt, submittedAt: v.createdAt })),
      total: pending.length,
    };
  }
  async findReviewedWithDocuments(limit: number): Promise<IdentityVerificationRecord[]> {
    return this.state.verifications
      .filter((v) => v.status !== 'pending' && (v.frontObjectKey || v.backObjectKey))
      .slice(0, limit)
      .map((v) => this.record(v));
  }

  // --- LegalDocumentRepository
  async findCurrent(): Promise<CurrentLegalDocumentRecord[]> {
    const now = this.now();
    const current = new Map<string, LegalDocumentRow>();
    for (const doc of this.state.legalDocuments) {
      if (doc.publishedAt > now) continue;
      const best = current.get(doc.type);
      if (!best || doc.publishedAt > best.publishedAt) current.set(doc.type, doc);
    }
    return [...current.values()].map((doc) => ({ ...doc }));
  }
  async recordAcceptances(input: { userProfileId: string; legalDocumentIds: string[]; ipAddress: string | null; userAgent: string | null }) {
    const recorded: string[] = [];
    for (const legalDocumentId of input.legalDocumentIds) {
      const exists = this.state.acceptances.some((a) => a.userProfileId === input.userProfileId && a.legalDocumentId === legalDocumentId);
      if (!exists) {
        this.state.acceptances.push({ userProfileId: input.userProfileId, legalDocumentId, ipAddress: input.ipAddress, userAgent: input.userAgent });
        recorded.push(legalDocumentId);
      }
    }
    return recorded;
  }
  async publish(documents: NewLegalDocument[]): Promise<PublishedLegalDocument[]> {
    const publishedAt = this.now();
    return documents.map((doc) => {
      if (this.state.legalDocuments.some((d) => d.type === doc.type && d.version === doc.version)) {
        throw unique('legal_document_type_version_uq');
      }
      const row = { id: randomUUID(), type: doc.type, version: doc.version, publishedAt: doc.publishedAt ?? publishedAt, content: doc.content };
      this.state.legalDocuments.push(row);
      return { id: row.id, type: row.type, version: row.version, publishedAt: row.publishedAt };
    });
  }
  async inspectPublication() {
    const usersByRole: Partial<Record<'patient' | 'doctor', number>> = {};
    for (const { role } of this.state.userProfiles) if (role === 'patient' || role === 'doctor') usersByRole[role] = (usersByRole[role] ?? 0) + 1;
    return { now: this.now(), versions: this.state.legalDocuments.map(({ type, version, publishedAt }) => ({ type, version, publishedAt })), usersByRole };
  }
  async lockPublication(): Promise<void> {}
  publishLegalDocument(type: CurrentLegalDocumentRecord['type'], version: string, publishedAt = new Date(Date.now() - 60_000)) {
    const doc = { id: randomUUID(), type, version, publishedAt, content: `Texto sintético ${type} ${version}` };
    this.state.legalDocuments.push(doc);
    return doc;
  }

  // --- RegistrationStatusReader
  async read(userId: string): Promise<RegistrationSnapshot> {
    const user = this.state.userProfiles.find((p) => p.userId === userId) ?? null;
    const patient = user ? this.state.patientProfiles.find((p) => p.userProfileId === user.id) ?? null : null;
    const current = await this.findCurrent();
    const latest = patient ? await this.findLatestForPatient(patient.id) : null;
    return {
      role: user?.role ?? null,
      hasPatientProfile: !!patient,
      currentLegalDocuments: current.map((doc) => ({
        type: doc.type,
        documentId: doc.id,
        version: doc.version,
        accepted: !!user && this.state.acceptances.some((a) => a.userProfileId === user.id && a.legalDocumentId === doc.id),
      })),
      latestIdentityVerification: latest ? { status: latest.status, rejectionReason: latest.rejectionReason } : null,
    };
  }
}

// UnitOfWork que revierte el estado del almacén si el trabajo falla (como un ROLLBACK).
export class InMemoryUnitOfWork implements UnitOfWork {
  calls = 0;
  failNext: Error | null = null;
  constructor(private readonly store: InMemoryIdentityStore) {}

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    this.calls++;
    const before = structuredClone({ ...this.store.state, audit: [] });
    const auditLength = this.store.state.audit.length;
    try {
      const result = await work();
      if (this.failNext) {
        const error = this.failNext;
        this.failNext = null;
        throw error;
      }
      return result;
    } catch (error) {
      const audit = this.store.state.audit.slice(0, auditLength);
      this.store.state = { ...before, audit };
      throw error;
    }
  }
}

export class InMemoryAuditTrail implements AuditTrail {
  constructor(private readonly store: InMemoryIdentityStore) {}
  async record(event: AuditEvent): Promise<void> {
    this.store.state.audit.push(event);
  }
}

export class FakeDocumentStorage implements PrivateObjectStorage {
  objects = new Map<string, { bytes: Buffer; contentType: string }>();
  failPut = false;
  failDelete = false;
  deleted: string[] = [];

  async put(key: string, bytes: Buffer, contentType: string): Promise<void> {
    if (this.failPut) throw new Error('fallo simulado de put');
    this.objects.set(key, { bytes, contentType });
  }
  async openForRead(key: string): Promise<StoredObject> {
    const object = this.objects.get(key);
    if (!object) throw new StoredFileNotFoundError();
    return { stream: Readable.from(object.bytes), contentLength: object.bytes.length };
  }
  async delete(key: string): Promise<void> {
    if (this.failDelete) throw new Error('fallo simulado de delete');
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

export class FakeAdminAccountProvisioner implements AdminAccountProvisioner {
  accounts = new Map<string, string>();
  passwordSetups: string[] = [];
  calls: string[] = [];
  // Ids de cuenta con contraseña (p. ej., creadas por el registro público).
  passwordCredentials = new Set<string>();
  // Si se fija, assertPasswordSetupConfigured falla con este error (configuración ausente o inválida).
  configError: Error | null = null;
  // Si se fija, sendPasswordSetup falla con este error (después de crear el administrador).
  passwordSetupError: Error | null = null;
  async assertPasswordSetupConfigured() {
    this.calls.push('assertPasswordSetupConfigured');
    if (this.configError) throw this.configError;
  }
  async findUserIdByEmail(email: string) {
    this.calls.push('findUserIdByEmail');
    return this.accounts.get(email) ?? null;
  }
  async hasPasswordCredential(userId: string) {
    this.calls.push('hasPasswordCredential');
    return this.passwordCredentials.has(userId);
  }
  async createAccount(input: { email: string }) {
    this.calls.push('createAccount');
    const id = `ba-${randomUUID()}`;
    this.accounts.set(input.email, id);
    return id;
  }
  async sendPasswordSetup(email: string) {
    this.calls.push('sendPasswordSetup');
    if (this.passwordSetupError) throw this.passwordSetupError;
    this.passwordSetups.push(email);
  }
}
