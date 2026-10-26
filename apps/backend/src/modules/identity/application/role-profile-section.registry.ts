import { Injectable } from '@nestjs/common';
import type { Actor } from '../../../common/application/actor';
import type { Role } from '../../../common/domain/role';

// M03 (plan v2 §2.1 A4, B7; D-31): GET /me se compone por rol. Identity resuelve al paciente y a la cuenta sin perfil;
// otros módulos registran la sección de su rol al iniciar (el médico, desde DoctorsModule). Así Identity no depende de
// ningún módulo consumidor (RT-M03-11).
export interface RoleProfileSection {
  profile(actor: Actor): Promise<unknown>;
  registrationStatus(actor: Actor): Promise<unknown>;
}

@Injectable()
export class RoleProfileSectionRegistry {
  private readonly sections = new Map<Role, RoleProfileSection>();

  register(role: Role, section: RoleProfileSection): void {
    if (role === 'patient') throw new Error('La sección del paciente la resuelve Identity');
    if (this.sections.has(role)) throw new Error(`Ya hay una sección registrada para el rol ${role}`);
    this.sections.set(role, section);
  }

  sectionFor(role: Role | null): RoleProfileSection | null {
    return role ? (this.sections.get(role) ?? null) : null;
  }
}
