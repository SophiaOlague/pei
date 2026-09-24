import { PatientProfile } from '../entities/patient-profile.entity';

export interface PatientProfileRepository {
  create(profile: {
    userProfileId: string;
    curp: string;
    photoUrl?: string;
    ineFrontUrl: string;
    ineBackUrl: string;
  }): Promise<PatientProfile>;
  findByCurp(curp: string): Promise<PatientProfile | null>;
}

export const PATIENT_PROFILE_REPOSITORY = Symbol('PATIENT_PROFILE_REPOSITORY');