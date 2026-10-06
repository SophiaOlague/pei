import type { Role } from '../domain/role';

// Quién ejecuta una operación. Lo construye la capa de presentación a partir de la sesión
// y lo reciben los casos de uso que necesiten autorizar o auditar (RN-120, RN-121).
export interface Actor {
  userId: string; // id de Better Auth
  userProfileId: string | null; // null mientras el usuario no completa su perfil de dominio
  role: Role | null;
  ipAddress: string | null;
  userAgent: string | null;
}
