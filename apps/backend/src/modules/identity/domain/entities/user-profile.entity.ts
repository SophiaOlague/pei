// Entidad pura: sin Drizzle, sin decoradores de Nest, sin nada externo.
// Representa las reglas de negocio de un perfil de usuario.

import type { Role } from '../../../../common/domain/role';

export type { Role };

export class UserProfile {
  constructor(
    public readonly id: string | null, // null antes de persistir
    public readonly userId: string,
    public readonly role: Role,
    public readonly firstName: string,
    public readonly lastName: string,
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.firstName?.trim()) {
      throw new Error('El nombre es obligatorio');
    }
    if (!this.lastName?.trim()) {
      throw new Error('El apellido es obligatorio');
    }
  }

  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}