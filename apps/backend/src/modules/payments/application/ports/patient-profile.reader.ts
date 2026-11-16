// F4: perfil de paciente del actor autenticado. La sesión solo trae userProfileId; CC-4 compara con patient_profile.id.
export const PATIENT_PROFILE_READER = Symbol('PATIENT_PROFILE_READER');

export interface PatientProfileReader {
  patientProfileIdFor(userProfileId: string): Promise<string | null>;
}
