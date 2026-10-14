import type { Role } from '../../../../common/domain/role';

export interface UserProfileRecord {
  id: string;
  role: Role;
}

export interface UserProfileRepository {
  findByUserId(userId: string): Promise<UserProfileRecord | null>;
  // M03 R-12: la CURP vive en user_profile y es única entre todos los roles (D-20, D-35).
  existsByCurp(curp: string): Promise<boolean>;
  createPatient(input: {
    userId: string;
    firstName: string;
    lastName: string;
    curp: string;
    birthDate: string;
    phone: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  }): Promise<string>;
  createAdmin(input: { userId: string; firstName: string; lastName: string }): Promise<string>;
  // Bootstrap del primer administrador (DT-12): serializa las ejecuciones hasta el fin de la transacción.
  lockAdminBootstrap(): Promise<void>;
  adminExists(): Promise<boolean>;
}

export const USER_PROFILE_REPOSITORY = Symbol('USER_PROFILE_REPOSITORY');
