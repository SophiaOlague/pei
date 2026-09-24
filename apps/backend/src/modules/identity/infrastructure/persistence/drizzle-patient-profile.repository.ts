import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { patientProfile as patientProfileTable } from '../../../../db/schema';
import type { PatientProfileRepository } from '../../domain/repositories/patient-profile.repository';
import { PatientProfile } from '../../domain/entities/patient-profile.entity';

@Injectable()
export class DrizzlePatientProfileRepository implements PatientProfileRepository {
  async create(input: {
    userProfileId: string;
    curp: string;
    photoUrl?: string;
    ineFrontUrl: string;
    ineBackUrl: string;
  }): Promise<PatientProfile> {
    const [row] = await getDbContext()
      .insert(patientProfileTable)
      .values(input)
      .returning();
    return new PatientProfile(row.id, row.userProfileId, row.curp!);
  }

  async findByCurp(curp: string): Promise<PatientProfile | null> {
    const [row] = await getDbContext()
      .select()
      .from(patientProfileTable)
      .where(eq(patientProfileTable.curp, curp))
      .limit(1);
    if (!row) return null;
    return new PatientProfile(row.id, row.userProfileId, row.curp!);
  }
}