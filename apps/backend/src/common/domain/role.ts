// RN-001: cada usuario tiene un único rol de dominio. Coincide con role_enum del esquema.
export const ROLES = ['patient', 'doctor', 'admin', 'organization'] as const;

export type Role = (typeof ROLES)[number];
