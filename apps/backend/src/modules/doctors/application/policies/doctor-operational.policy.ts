import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { isOperational, type DoctorStatus } from '../../domain/doctor-status';
import { DoctorNotFoundError, DoctorNotOperationalError } from '../../domain/doctor.errors';
import { DOCTOR_PROFILE_REPOSITORY, type DoctorProfileRepository } from '../ports/doctor-profile.repository';
import { DoctorStatusService, requireDoctor } from '../doctor-status.service';

// M03 B7 (D-13, D-23, RN-004; diseño v3 §D.6; plan v2 §9): política que M07 (agenda) y M08 (citas) aplican DENTRO de
// su caso de uso y de su UnitOfWork. Solo opera un médico habilitado (`canOperate`, D-38): aprobado por el
// administrador y con el registro completo, aceptación legal vigente incluida. El perfil se lee con FOR SHARE: un cambio
// sensible concurrente (que toma FOR UPDATE) espera a que termine la operación del llamador, o la política ve el
// estado ya actualizado. No es un bloqueo global: el médico no aprobado sigue entrando y consultando su estado.
// Las consecuencias sobre citas existentes al volver a pending son de M08 (fuera de M03).
@Injectable()
export class DoctorOperationalPolicy {
  constructor(
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    private readonly statusService: DoctorStatusService,
  ) {}

  // Para M08: el paciente agenda con un médico concreto.
  async statusOf(doctorProfileId: string): Promise<DoctorStatus> {
    const profile = await this.profiles.lockForShareById(doctorProfileId);
    if (!profile) throw new DoctorNotFoundError();
    return (await this.statusService.read(profile)).status;
  }

  async assertCanOperate(doctorProfileId: string): Promise<void> {
    if (!isOperational(await this.statusOf(doctorProfileId))) throw new DoctorNotOperationalError();
  }

  // Para M07: el propio médico gestiona su agenda. Devuelve su doctorProfileId.
  async assertActorCanOperate(actor: Actor): Promise<string> {
    const userProfileId = requireDoctor(actor);
    const own = await this.profiles.findByUserProfileId(userProfileId);
    if (!own) throw new DoctorNotFoundError();
    await this.assertCanOperate(own.id);
    return own.id;
  }
}
