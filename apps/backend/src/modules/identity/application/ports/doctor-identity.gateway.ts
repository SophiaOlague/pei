// M03 (plan v2 §2.1 A4 y §7ter.2): puerto RESTRINGIDO que Identity exporta para el módulo de médicos. Es la única vía
// por la que M03 crea o modifica un user_profile: el rol lo fija este puerto (siempre 'doctor') y la CURP sigue siendo
// única entre roles (R-12, D-20, D-35). Un duplicado responde RegistrationDataConflictError, sin revelar la causa (D-17).
// Todas las operaciones se ejecutan dentro de la UnitOfWork de quien llama.

export interface DoctorLegalIdentity {
  firstName: string;
  lastName: string;
  curp: string;
  phone: string | null;
}

export interface DoctorIdentityGateway {
  // Crea el user_profile con rol doctor. Lanza ProfileAlreadyExistsError si la cuenta ya tiene perfil.
  createDoctorUserProfile(input: { userId: string; firstName: string; lastName: string; curp: string; phone: string | null }): Promise<string>;
  findLegalIdentity(userProfileId: string): Promise<DoctorLegalIdentity | null>;
  // Solo los campos presentes. La CURP llega normalizada y validada.
  updateLegalIdentity(userProfileId: string, change: { firstName?: string; lastName?: string; curp?: string }): Promise<void>;
  updatePhone(userProfileId: string, phone: string | null): Promise<void>;
  // DC-2 (B5): estado legal del médico con el régimen resuelto (D-32, R-13): ¿aceptó las versiones vigentes?
  doctorLegalAccepted(userProfileId: string): Promise<boolean>;
}

export const DOCTOR_IDENTITY_GATEWAY = Symbol('DOCTOR_IDENTITY_GATEWAY');
