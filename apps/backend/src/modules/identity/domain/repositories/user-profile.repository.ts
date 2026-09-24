import { UserProfile, Role } from '../entities/user-profile.entity';

export interface UserProfileRepository {
  create(profile: {
    userId: string;
    role: Role;
    firstName: string;
    lastName: string;
    phone?: string;
    birthDate?: string;
  }): Promise<UserProfile>;
  existsByUserId(userId: string): Promise<boolean>;
}

export const USER_PROFILE_REPOSITORY = Symbol('USER_PROFILE_REPOSITORY');