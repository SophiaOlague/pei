import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { validateImage } from '../../../private-storage/domain/file-signature';
import { contentTypeForKey, isManagedObjectKey, profilePhotoKey } from '../../domain/object-keys';
import { NoEditableFieldsError, PatientProfileRequiredError } from '../../domain/identity.errors';
import { StoredFileNotFoundError } from '../../../private-storage/domain/private-storage.errors';
import {
  PRIVATE_OBJECT_STORAGE,
  type PrivateObjectStorage,
  type StoredObject,
} from '../../../private-storage/application/ports/private-object-storage';
import {
  PATIENT_PROFILE_REPOSITORY,
  type EditableProfileFields,
  type PatientProfileRepository,
} from '../ports/patient-profile.repository';
import { IDENTITY_VERIFICATION_REPOSITORY, type IdentityVerificationRepository } from '../ports/identity-verification.repository';
import { IdentityAuditEvents, type EditableFieldName } from '../identity-audit-events';
import { requirePatientProfile } from './patient-profile.access';

export interface PatientProfileResponse {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  curp: string;
  phone: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  hasPhoto: boolean;
}

// RF-09: el paciente consulta su perfil. No se audita (DT-14).
@Injectable()
export class GetPatientProfileUseCase {
  constructor(@Inject(PATIENT_PROFILE_REPOSITORY) private readonly patientProfiles: PatientProfileRepository) {}

  async execute(actor: Actor): Promise<PatientProfileResponse> {
    const profile = await requirePatientProfile(actor, this.patientProfiles);
    return {
      firstName: profile.firstName,
      lastName: profile.lastName,
      birthDate: profile.birthDate,
      curp: profile.curp,
      phone: profile.phone,
      address: profile.address,
      emergencyContactName: profile.emergencyContactName,
      emergencyContactPhone: profile.emergencyContactPhone,
      hasPhoto: profile.photoObjectKey !== null,
    };
  }
}

const EDITABLE_FIELDS = ['phone', 'address', 'emergencyContactName', 'emergencyContactPhone'] as const;

// DP-12: solo teléfono, dirección y contacto de emergencia. CURP, nombre legal y fecha de nacimiento
// no se editan en M02 (el DTO los rechaza con 400 y este caso de uso no los acepta).
@Injectable()
export class UpdatePatientProfileUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(PATIENT_PROFILE_REPOSITORY) private readonly patientProfiles: PatientProfileRepository,
  ) {}

  async execute(actor: Actor, patch: EditableProfileFields): Promise<{ updated: EditableFieldName[] }> {
    const fields: EditableProfileFields = {};
    for (const name of EDITABLE_FIELDS) {
      if (patch[name] !== undefined) fields[name] = patch[name];
    }
    const updated = Object.keys(fields) as EditableFieldName[];
    if (updated.length === 0) throw new NoEditableFieldsError();

    await this.unitOfWork.runInTransaction(async () => {
      const profile = await requirePatientProfile(actor, this.patientProfiles, { lock: true });
      await this.patientProfiles.updateEditableFields(profile, fields);
      await this.auditTrail.record(IdentityAuditEvents.profileUpdated(AuditActor.fromActor(actor), profile.patientProfileId, updated));
    });
    return { updated };
  }
}

// DT-7: foto de perfil privada. JPEG o PNG por firma binaria, 5 MB. La anterior se elimina después del commit.
@Injectable()
export class UpdateProfilePhotoUseCase {
  private readonly logger = new Logger('UpdateProfilePhoto');

  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    @Inject(PATIENT_PROFILE_REPOSITORY) private readonly patientProfiles: PatientProfileRepository,
  ) {}

  async execute(actor: Actor, bytes: Buffer | undefined): Promise<{ hasPhoto: true }> {
    const current = await requirePatientProfile(actor, this.patientProfiles);
    const image = validateImage(bytes);
    const key = profilePhotoKey(current.patientProfileId, randomUUID(), image.extension);

    await this.storage.put(key, image.bytes, image.contentType);
    let previousKey: string | null;
    try {
      previousKey = await this.unitOfWork.runInTransaction(async () => {
        const profile = await requirePatientProfile(actor, this.patientProfiles, { lock: true });
        await this.patientProfiles.setPhotoObjectKey(profile.patientProfileId, key);
        await this.auditTrail.record(IdentityAuditEvents.profileUpdated(AuditActor.fromActor(actor), profile.patientProfileId, ['photo']));
        return profile.photoObjectKey;
      });
    } catch (error) {
      await this.deleteQuietly(key, current.patientProfileId);
      throw error;
    }

    if (previousKey && isManagedObjectKey(previousKey)) await this.deleteQuietly(previousKey, current.patientProfileId);
    return { hasPhoto: true };
  }

  private async deleteQuietly(key: string, patientProfileId: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.error(`No se pudo eliminar una foto del perfil ${patientProfileId}: ${(error as Error)?.name ?? 'Error'}`);
    }
  }
}

// DT-7: el propietario ve su foto transmitida por el backend. No se audita (DT-14).
@Injectable()
export class OpenProfilePhotoUseCase {
  constructor(
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    @Inject(PATIENT_PROFILE_REPOSITORY) private readonly patientProfiles: PatientProfileRepository,
  ) {}

  async execute(actor: Actor): Promise<StoredObject & { contentType: string }> {
    const profile = await requirePatientProfile(actor, this.patientProfiles);
    const key = profile.photoObjectKey;
    if (!key || !isManagedObjectKey(key)) throw new StoredFileNotFoundError();
    const file = await this.storage.openForRead(key);
    return { ...file, contentType: contentTypeForKey(key) };
  }
}

// RF-07: el paciente consulta el estado de su verificación, sin documentos.
@Injectable()
export class GetMyIdentityVerificationUseCase {
  constructor(
    @Inject(PATIENT_PROFILE_REPOSITORY) private readonly patientProfiles: PatientProfileRepository,
    @Inject(IDENTITY_VERIFICATION_REPOSITORY) private readonly verifications: IdentityVerificationRepository,
  ) {}

  async execute(actor: Actor): Promise<{ status: string; attempt: number; rejectionReason: string | null }> {
    if (actor.role !== 'patient') throw new PatientProfileRequiredError();
    const profile = await requirePatientProfile(actor, this.patientProfiles);
    const latest = await this.verifications.findLatestForPatient(profile.patientProfileId);
    if (!latest) return { status: 'not_submitted', attempt: 0, rejectionReason: null };
    return {
      status: latest.status,
      attempt: latest.attempt,
      rejectionReason: latest.status === 'rejected' ? latest.rejectionReason : null,
    };
  }
}
