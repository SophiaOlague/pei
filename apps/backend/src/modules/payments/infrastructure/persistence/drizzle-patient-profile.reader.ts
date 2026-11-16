import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { patientProfile } from '../../../../db/schema';
import type { PatientProfileReader } from '../../application/ports/patient-profile.reader';

// Solo lectura: id del perfil de paciente de un user_profile (columna única en 0000). No lee datos personales.
@Injectable()
export class DrizzlePatientProfileReader implements PatientProfileReader {
  async patientProfileIdFor(userProfileId: string): Promise<string | null> {
    const [row] = await getDbContext().select({ id: patientProfile.id }).from(patientProfile).where(eq(patientProfile.userProfileId, userProfileId)).limit(1);
    return row?.id ?? null;
  }
}
