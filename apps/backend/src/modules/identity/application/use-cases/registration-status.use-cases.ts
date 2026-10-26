import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import {
  composeRegistrationStatus,
  composesRegistrationStatus,
  computeRegistrationStatus,
  type RegistrationStatus,
} from '../../domain/registration-status';
import { NotAPatientError } from '../../domain/identity.errors';
import { REGISTRATION_STATUS_READER, type RegistrationStatusReader } from '../ports/registration-status-reader';

// DP-8, DT-17: estado del registro del paciente, derivado en cada lectura y sin caché.
// Solo aplica a pacientes y a cuentas que aún no tienen perfil (el perfil que crean es de paciente).
@Injectable()
export class GetRegistrationStatusUseCase {
  constructor(@Inject(REGISTRATION_STATUS_READER) private readonly reader: RegistrationStatusReader) {}

  async execute(actor: Actor): Promise<RegistrationStatus> {
    if (actor.role !== null && actor.role !== 'patient') throw new NotAPatientError();
    return computeRegistrationStatus(await this.reader.read(actor.userId));
  }

  // Para GET /me: estado compuesto por rol (M03 A4). null sin consultar la BD cuando el rol no compone estado.
  async executeForActor(actor: Actor): Promise<RegistrationStatus | null> {
    if (!composesRegistrationStatus(actor.role)) return null;
    return composeRegistrationStatus(await this.reader.read(actor.userId));
  }
}
