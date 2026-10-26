export const SPECIALTY_REPOSITORY = Symbol('SPECIALTY_REPOSITORY');

export interface SpecialtyRecord {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  deactivatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpecialtyRepository {
  // Solo las activas, ordenadas por nombre (GET /specialties).
  listActive(): Promise<SpecialtyRecord[]>;
  // Todas, activas e inactivas (GET /admin/specialties).
  listAll(): Promise<SpecialtyRecord[]>;
  findById(id: string): Promise<SpecialtyRecord | null>;
  // SELECT … FOR UPDATE dentro de la UnitOfWork (plan v2 §9).
  lockById(id: string): Promise<SpecialtyRecord | null>;
  // SELECT … FOR SHARE (plan v2 §9): asignar una especialidad comprueba is_active bajo el candado.
  lockForShare(id: string): Promise<SpecialtyRecord | null>;
  // Un duplicado de code o de lower(name) llega como UniqueConstraintViolationError con su constraint.
  create(input: { code: string; name: string }): Promise<SpecialtyRecord>;
  updateName(id: string, name: string): Promise<SpecialtyRecord | null>;
  // UPDATE … WHERE is_active = <estado esperado>; null si otra operación lo cambió primero.
  setActive(id: string, active: boolean): Promise<SpecialtyRecord | null>;
}
