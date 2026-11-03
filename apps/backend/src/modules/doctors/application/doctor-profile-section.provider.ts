import { Injectable, OnModuleInit } from '@nestjs/common';
import type { Actor } from '../../../common/application/actor';
import { RoleProfileSectionRegistry, type RoleProfileSection } from '../../identity/application/role-profile-section.registry';
import { GetDoctorProfileUseCase } from './use-cases/doctor-profile.use-cases';
import { GetDoctorStatusUseCase } from './use-cases/doctor-status.use-cases';

// M03 B7 (D-31, D-A4-2): sección del médico en GET /me. Antes de B7 el médico recibía `profile: null` y
// `registrationStatus: null`; ahora recibe su perfil y su estado derivado, más `canOperate` (D-13). Se registra en
// Identity al iniciar el módulo, sin que Identity dependa de M03.
@Injectable()
export class DoctorProfileSectionProvider implements RoleProfileSection, OnModuleInit {
  constructor(
    private readonly registry: RoleProfileSectionRegistry,
    private readonly getProfile: GetDoctorProfileUseCase,
    private readonly getStatus: GetDoctorStatusUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.register('doctor', this);
  }

  profile(actor: Actor) {
    return this.getProfile.execute(actor);
  }

  async registrationStatus(actor: Actor) {
    // D-38: canOperate lo deriva el dominio; no se recalcula a partir de status.
    return this.getStatus.execute(actor);
  }
}
