import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { validateImage } from '../../../private-storage/domain/file-signature';
import { contentTypeForObjectKey } from '../../../private-storage/domain/object-key';
import { PRIVATE_OBJECT_STORAGE, type PrivateObjectStorage, type StoredObject } from '../../../private-storage/application/ports/private-object-storage';
import { DOCTOR_IDENTITY_GATEWAY, type DoctorIdentityGateway } from '../../../identity/application/ports/doctor-identity.gateway';
import { doctorPhotoKey } from '../../domain/object-keys';
import { DoctorPhotoNotFoundError, DoctorProfileRequiredError, NoChangesError } from '../../domain/doctor.errors';
import { DOCTOR_PROFILE_REPOSITORY, type DoctorProfileRecord, type DoctorProfileRepository } from '../ports/doctor-profile.repository';
import { SPECIALTY_REPOSITORY, type SpecialtyRepository } from '../ports/specialty.repository';
import { requireDoctor } from '../doctor-status.service';

export interface DoctorProfileView {
  doctorProfileId: string;
  firstName: string;
  lastName: string;
  curp: string;
  phone: string | null;
  bio: string | null;
  licenseNumber: string | null;
  specialty: { id: string; code: string; name: string; isActive: boolean } | null;
  hasPhoto: boolean;
}

export async function loadDoctorProfile(actor: Actor, profiles: DoctorProfileRepository): Promise<DoctorProfileRecord> {
  const userProfileId = requireDoctor(actor);
  const profile = await profiles.findByUserProfileId(userProfileId);
  if (!profile) throw new DoctorProfileRequiredError();
  return profile;
}

// RF-09: el médico ve su propio perfil (su CURP incluida). Nunca claves de objetos ni URLs.
@Injectable()
export class GetDoctorProfileUseCase {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    @Inject(DOCTOR_IDENTITY_GATEWAY) private readonly identity: DoctorIdentityGateway,
    @Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository,
  ) {}

  async execute(actor: Actor): Promise<DoctorProfileView> {
    const profile = await loadDoctorProfile(actor, this.profiles);
    const [identity, specialty] = await Promise.all([this.identity.findLegalIdentity(profile.userProfileId), this.specialties.findById(profile.specialtyId)]);
    if (!identity) throw new DoctorProfileRequiredError();
    return {
      doctorProfileId: profile.id,
      firstName: identity.firstName,
      lastName: identity.lastName,
      curp: identity.curp,
      phone: identity.phone,
      bio: profile.bio,
      licenseNumber: profile.licenseNumber,
      specialty: specialty ? { id: specialty.id, code: specialty.code, name: specialty.name, isActive: specialty.isActive } : null,
      hasPhoto: profile.photoObjectKey !== null,
    };
  }
}

// D-9: bio y teléfono se editan libremente: no cambian versiones ni el estado, y no se auditan (diseño v3 §I).
@Injectable()
export class UpdateDoctorProfileUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    @Inject(DOCTOR_IDENTITY_GATEWAY) private readonly identity: DoctorIdentityGateway,
  ) {}

  async execute(actor: Actor, input: { phone?: string | null; bio?: string | null }): Promise<void> {
    if (input.phone === undefined && input.bio === undefined) throw new NoChangesError();
    const userProfileId = requireDoctor(actor);
    await this.unitOfWork.runInTransaction(async () => {
      const profile = await this.profiles.lockByUserProfileId(userProfileId);
      if (!profile) throw new DoctorProfileRequiredError();
      if (input.bio !== undefined) await this.profiles.updateBio(profile.id, input.bio);
      if (input.phone !== undefined) await this.identity.updatePhone(userProfileId, input.phone);
    });
  }
}

// D-9, H.2: foto del médico (JPEG o PNG de 5 MB). La foto anterior se elimina después del commit.
@Injectable()
export class UpdateDoctorPhotoUseCase {
  private readonly logger = new Logger('UpdateDoctorPhoto');

  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
  ) {}

  async execute(actor: Actor, bytes: Buffer | undefined): Promise<void> {
    const profile = await loadDoctorProfile(actor, this.profiles);
    const image = validateImage(bytes);
    const key = doctorPhotoKey(profile.id, randomUUID(), image.extension);
    await this.storage.put(key, image.bytes, image.contentType);
    let previous: string | null;
    try {
      previous = await this.unitOfWork.runInTransaction(async () => {
        const locked = await this.profiles.lockByUserProfileId(profile.userProfileId);
        if (!locked) throw new DoctorProfileRequiredError();
        await this.profiles.setPhotoObjectKey(locked.id, key);
        return locked.photoObjectKey;
      });
    } catch (error) {
      await this.storage.delete(key).catch(() => this.logger.warn('doctor_photo_compensation_failed'));
      throw error;
    }
    if (previous) await this.storage.delete(previous).catch(() => this.logger.warn('doctor_photo_previous_delete_failed'));
  }
}

@Injectable()
export class OpenDoctorPhotoUseCase {
  constructor(
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
  ) {}

  async execute(actor: Actor): Promise<StoredObject & { contentType: string }> {
    const profile = await loadDoctorProfile(actor, this.profiles);
    if (!profile.photoObjectKey) throw new DoctorPhotoNotFoundError();
    const file = await this.storage.openForRead(profile.photoObjectKey);
    return { ...file, contentType: contentTypeForObjectKey(profile.photoObjectKey) };
  }
}
