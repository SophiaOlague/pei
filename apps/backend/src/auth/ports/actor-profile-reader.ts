import type { Role } from '../../common/domain/role';

// Perfil de dominio del usuario autenticado: su user_profile y su único rol (RN-001, RN-002).
export interface ActorProfile {
  userProfileId: string;
  role: Role;
}

export interface ActorProfileReader {
  findByUserId(userId: string): Promise<ActorProfile | null>;
}

export const ACTOR_PROFILE_READER = Symbol('ACTOR_PROFILE_READER');
