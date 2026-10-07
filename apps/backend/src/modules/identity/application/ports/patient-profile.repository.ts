export interface PatientProfileView {
  patientProfileId: string;
  userProfileId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  curp: string;
  phone: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  photoObjectKey: string | null;
}

// Campos editables por el paciente (DP-12).
export interface EditableProfileFields {
  phone?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

export interface PatientProfileRepository {
  findByUserProfileId(userProfileId: string): Promise<PatientProfileView | null>;
  // Igual que findByUserProfileId, pero bloquea la fila del perfil hasta el fin de la transacción.
  lockByUserProfileId(userProfileId: string): Promise<PatientProfileView | null>;
  existsByCurp(curp: string): Promise<boolean>;
  create(input: { userProfileId: string; curp: string; address: string | null }): Promise<string>;
  updateEditableFields(profile: PatientProfileView, fields: EditableProfileFields): Promise<void>;
  setPhotoObjectKey(patientProfileId: string, key: string): Promise<void>;
}

export const PATIENT_PROFILE_REPOSITORY = Symbol('PATIENT_PROFILE_REPOSITORY');
