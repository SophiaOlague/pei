import type { Role } from '../../../../common/domain/role';

export interface UserProfileRecord {
  id: string;
  role: Role;
}

export interface UserProfileRepository {
  findByUserId(userId: string): Promise<UserProfileRecord | null>;
  createPatient(input: {
    userId: string;
    firstName: string;
    lastName: string;
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
