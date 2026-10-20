import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../../common/application/ports/unit-of-work';
import { UniqueConstraintViolationError } from '../../../../../common/domain/persistence.errors';
import { AUDIT_TRAIL, type AuditTrail } from '../../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../../audit/domain/audit-actor';
import { assertActivationChange, parseSpecialtyCode, parseSpecialtyName } from '../../../domain/specialty';
import {
  AdminRequiredError,
  SpecialtyAlreadyExistsError,
  SpecialtyAlreadyInStateError,
  SpecialtyNotFoundError,
} from '../../../domain/doctor.errors';
import { SPECIALTY_REPOSITORY, type SpecialtyRecord, type SpecialtyRepository } from '../../ports/specialty.repository';
import { DoctorAuditEvents } from '../../doctor-audit-events';

// M03 B1: catálogo de especialidades (D-5, D-26, D-33, D-34, R-4, Z-2; diseño v3 §F; plan v2 §11 y §12).

export interface ActiveSpecialtyView {
  id: string;
  code: string;
  name: string;
}

export type AdminSpecialtyView = SpecialtyRecord;

function requireAdmin(actor: Actor): void {
  if (actor.role !== 'admin' || !actor.userProfileId) throw new AdminRequiredError();
}

// 23505 de specialty_code_unique o specialty_name_lower_uq → 409 con el campo; cualquier otro error sigue igual.
function translateDuplicate(error: unknown): never {
  if (error instanceof UniqueConstraintViolationError) {
    if (error.detail.constraint === 'specialty_code_unique') throw new SpecialtyAlreadyExistsError('code');
    if (error.detail.constraint === 'specialty_name_lower_uq') throw new SpecialtyAlreadyExistsError('name');
  }
  throw error;
}

// GET /specialties: cualquier sesión (el médico la elige antes de tener perfil). Las inactivas no se listan (§F).
@Injectable()
export class ListActiveSpecialtiesUseCase {
  constructor(@Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository) {}

  async execute(): Promise<ActiveSpecialtyView[]> {
    const rows = await this.specialties.listActive();
    return rows.map(({ id, code, name }) => ({ id, code, name }));
  }
}

@Injectable()
export class ListAllSpecialtiesUseCase {
  constructor(@Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository) {}

  async execute(actor: Actor): Promise<AdminSpecialtyView[]> {
    requireAdmin(actor);
    return this.specialties.listAll();
  }
}

// D-5: el catálogo se amplía sin código ni migraciones.
@Injectable()
export class CreateSpecialtyUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository,
  ) {}

  async execute(actor: Actor, input: { code: string; name: string }): Promise<AdminSpecialtyView> {
    requireAdmin(actor);
    const code = parseSpecialtyCode(input.code);
    const name = parseSpecialtyName(input.name);
    try {
      return await this.unitOfWork.runInTransaction(async () => {
        const created = await this.specialties.create({ code, name });
        await this.auditTrail.record(DoctorAuditEvents.specialtyCreated(AuditActor.fromActor(actor), created.id, created.code));
        return created;
      });
    } catch (error) {
      translateDuplicate(error);
    }
  }
}

// R-4: solo el nombre visible; `code` es inmutable (el DTO no lo admite). Sin cambio real no hay escritura ni evento.
@Injectable()
export class UpdateSpecialtyUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository,
  ) {}

  async execute(actor: Actor, id: string, input: { name: string }): Promise<AdminSpecialtyView> {
    requireAdmin(actor);
    const name = parseSpecialtyName(input.name);
    try {
      return await this.unitOfWork.runInTransaction(async () => {
        const current = await this.specialties.lockById(id);
        if (!current) throw new SpecialtyNotFoundError();
        if (current.name === name) return current;
        const updated = await this.specialties.updateName(id, name);
        if (!updated) throw new SpecialtyNotFoundError();
        await this.auditTrail.record(DoctorAuditEvents.specialtyUpdated(AuditActor.fromActor(actor), id, ['name']));
        return updated;
      });
    } catch (error) {
      translateDuplicate(error);
    }
  }
}

// Z-2, D-26, D-33: desactivar o reactivar. No toca médicos, versiones ni revisiones.
@Injectable()
export class ChangeSpecialtyActivationUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository,
  ) {}

  async execute(actor: Actor, id: string, active: boolean): Promise<AdminSpecialtyView> {
    requireAdmin(actor);
    return this.unitOfWork.runInTransaction(async () => {
      const current = await this.specialties.lockById(id);
      if (!current) throw new SpecialtyNotFoundError();
      assertActivationChange(current.isActive, active);
      // WHERE is_active = <esperado>: bajo el FOR UPDATE no debería fallar; si fallara, nada cambió.
      const updated = await this.specialties.setActive(id, active);
      if (!updated) throw new SpecialtyAlreadyInStateError();
      await this.auditTrail.record(DoctorAuditEvents.specialtyActivationChanged(AuditActor.fromActor(actor), id, active));
      return updated;
    });
  }
}
