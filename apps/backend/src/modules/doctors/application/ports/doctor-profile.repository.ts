export const DOCTOR_PROFILE_REPOSITORY = Symbol('DOCTOR_PROFILE_REPOSITORY');

export interface DoctorProfileRecord {
  id: string;
  userProfileId: string;
  specialtyId: string;
  licenseNumber: string | null;
  bio: string | null;
  photoObjectKey: string | null;
  identityRevision: number;
  professionalRevision: number;
}

export interface DoctorProfileRepository {
  create(input: { userProfileId: string; specialtyId: string; bio: string | null }): Promise<DoctorProfileRecord>;
  findByUserProfileId(userProfileId: string): Promise<DoctorProfileRecord | null>;
  findById(id: string): Promise<DoctorProfileRecord | null>;
  // B6: el admin bloquea el perfil por id antes de revisar (plan v2 §9).
  lockById(id: string): Promise<DoctorProfileRecord | null>;
  // B7 (plan v2 §9): la política de M07/M08 lee el perfil con FOR SHARE dentro de la transacción del llamador.
  lockForShareById(id: string): Promise<DoctorProfileRecord | null>;
  // B6: todos los médicos, por fecha de registro (la lista del admin filtra por el estado derivado).
  listAll(): Promise<DoctorProfileRecord[]>;
  // SELECT … FOR UPDATE (plan v2 §9): serializa los cambios sensibles, los envíos y las revisiones del médico.
  lockByUserProfileId(userProfileId: string): Promise<DoctorProfileRecord | null>;
  // Una sola sentencia: versiones +0/+1 y, si cambian, número o especialidad (el trigger de 0012 exige la versión).
  applyRevisions(input: {
    id: string;
    identityBump: 0 | 1;
    professionalBump: 0 | 1;
    licenseNumber?: string;
    specialtyId?: string;
  }): Promise<DoctorProfileRecord>;
  updateBio(id: string, bio: string | null): Promise<void>;
  setPhotoObjectKey(id: string, key: string): Promise<void>;
}
