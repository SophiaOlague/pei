import { Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { doctorProfile } from '../../../../db/schema';
import type { DoctorProfileRecord, DoctorProfileRepository } from '../../application/ports/doctor-profile.repository';

const COLUMNS = {
  id: doctorProfile.id,
  userProfileId: doctorProfile.userProfileId,
  specialtyId: doctorProfile.specialtyId,
  licenseNumber: doctorProfile.licenseNumber,
  bio: doctorProfile.bio,
  photoObjectKey: doctorProfile.photoObjectKey,
  identityRevision: doctorProfile.identityRevision,
  professionalRevision: doctorProfile.professionalRevision,
};

@Injectable()
export class DrizzleDoctorProfileRepository implements DoctorProfileRepository {
  async create(input: { userProfileId: string; specialtyId: string; bio: string | null }): Promise<DoctorProfileRecord> {
    const [row] = await getDbContext().insert(doctorProfile).values(input).returning(COLUMNS);
    return row;
  }

  async findByUserProfileId(userProfileId: string): Promise<DoctorProfileRecord | null> {
    const [row] = await getDbContext().select(COLUMNS).from(doctorProfile).where(eq(doctorProfile.userProfileId, userProfileId)).limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<DoctorProfileRecord | null> {
    const [row] = await getDbContext().select(COLUMNS).from(doctorProfile).where(eq(doctorProfile.id, id)).limit(1);
    return row ?? null;
  }

  async lockById(id: string): Promise<DoctorProfileRecord | null> {
    const [row] = await getDbContext().select(COLUMNS).from(doctorProfile).where(eq(doctorProfile.id, id)).for('update').limit(1);
    return row ?? null;
  }

  async lockForShareById(id: string): Promise<DoctorProfileRecord | null> {
    const [row] = await getDbContext().select(COLUMNS).from(doctorProfile).where(eq(doctorProfile.id, id)).for('share').limit(1);
    return row ?? null;
  }

  async listAll(): Promise<DoctorProfileRecord[]> {
    return getDbContext().select(COLUMNS).from(doctorProfile).orderBy(asc(doctorProfile.createdAt), asc(doctorProfile.id));
  }

  async lockByUserProfileId(userProfileId: string): Promise<DoctorProfileRecord | null> {
    const [row] = await getDbContext().select(COLUMNS).from(doctorProfile).where(eq(doctorProfile.userProfileId, userProfileId)).for('update').limit(1);
    return row ?? null;
  }

  async applyRevisions(input: { id: string; identityBump: 0 | 1; professionalBump: 0 | 1; licenseNumber?: string; specialtyId?: string }): Promise<DoctorProfileRecord> {
    const [row] = await getDbContext()
      .update(doctorProfile)
      .set({
        identityRevision: sql`${doctorProfile.identityRevision} + ${input.identityBump}`,
        professionalRevision: sql`${doctorProfile.professionalRevision} + ${input.professionalBump}`,
        ...(input.licenseNumber !== undefined ? { licenseNumber: input.licenseNumber } : {}),
        ...(input.specialtyId !== undefined ? { specialtyId: input.specialtyId } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(doctorProfile.id, input.id))
      .returning(COLUMNS);
    return row;
  }

  async updateBio(id: string, bio: string | null): Promise<void> {
    await getDbContext().update(doctorProfile).set({ bio, updatedAt: sql`now()` }).where(eq(doctorProfile.id, id));
  }

  async setPhotoObjectKey(id: string, key: string): Promise<void> {
    await getDbContext().update(doctorProfile).set({ photoObjectKey: key, updatedAt: sql`now()` }).where(eq(doctorProfile.id, id));
  }
}
