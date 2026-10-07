import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { patientProfile, userProfile } from '../../../../db/schema';
import type {
  EditableProfileFields,
  PatientProfileRepository,
  PatientProfileView,
} from '../../application/ports/patient-profile.repository';

const VIEW_COLUMNS = {
  patientProfileId: patientProfile.id,
  userProfileId: userProfile.id,
  firstName: userProfile.firstName,
  lastName: userProfile.lastName,
  birthDate: userProfile.birthDate,
  curp: patientProfile.curp,
  phone: userProfile.phone,
  address: patientProfile.address,
  emergencyContactName: userProfile.emergencyContactName,
  emergencyContactPhone: userProfile.emergencyContactPhone,
  photoObjectKey: patientProfile.photoObjectKey,
};

@Injectable()
export class DrizzlePatientProfileRepository implements PatientProfileRepository {
  async findByUserProfileId(userProfileId: string): Promise<PatientProfileView | null> {
    const [row] = await getDbContext()
      .select(VIEW_COLUMNS)
      .from(patientProfile)
      .innerJoin(userProfile, eq(userProfile.id, patientProfile.userProfileId))
      .where(eq(patientProfile.userProfileId, userProfileId))
      .limit(1);
    return row ?? null;
  }

  async lockByUserProfileId(userProfileId: string): Promise<PatientProfileView | null> {
    const [row] = await getDbContext()
      .select(VIEW_COLUMNS)
      .from(patientProfile)
      .innerJoin(userProfile, eq(userProfile.id, patientProfile.userProfileId))
      .where(eq(patientProfile.userProfileId, userProfileId))
      .limit(1)
      .for('update', { of: patientProfile });
    return row ?? null;
  }

  async existsByCurp(curp: string): Promise<boolean> {
    const [row] = await getDbContext()
      .select({ id: patientProfile.id })
      .from(patientProfile)
      .where(eq(patientProfile.curp, curp))
      .limit(1);
    return !!row;
  }

  async create(input: { userProfileId: string; curp: string; address: string | null }): Promise<string> {
    const [row] = await getDbContext().insert(patientProfile).values(input).returning({ id: patientProfile.id });
    return row.id;
  }

  async updateEditableFields(profile: PatientProfileView, fields: EditableProfileFields): Promise<void> {
    const db = getDbContext();
    const { address, ...contact } = fields;
    if (Object.keys(contact).length > 0) {
      await db
        .update(userProfile)
        .set({ ...contact, updatedAt: sql`now()` })
        .where(eq(userProfile.id, profile.userProfileId));
    }
    if (address !== undefined) {
      await db
        .update(patientProfile)
        .set({ address, updatedAt: sql`now()` })
        .where(eq(patientProfile.id, profile.patientProfileId));
    }
  }

  async setPhotoObjectKey(patientProfileId: string, key: string): Promise<void> {
    await getDbContext()
      .update(patientProfile)
      .set({ photoObjectKey: key, updatedAt: sql`now()` })
      .where(eq(patientProfile.id, patientProfileId));
  }
}
