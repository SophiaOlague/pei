import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { computeRegistrationStatus } from '../../domain/registration-status';
import { NotAPatientError, RegistrationIncompleteError } from '../../domain/identity.errors';
import { REGISTRATION_STATUS_READER, type RegistrationStatusReader } from '../ports/registration-status-reader';

// DP-8, DT-21: en M02, canBookAppointments = registrationComplete && rol 'patient'.
// El caso de uso de agendar (M08) llama assertCanBookAppointments DENTRO de su ejecución; un decorador
// en el controller sería opcional y nunca lo sustituye. M08 agrega sus propias condiciones.
// No es un bloqueo global: /me, el perfil, el flujo legal y el envío del INE siguen disponibles.
@Injectable()
export class CanBookAppointmentsPolicy {
  constructor(@Inject(REGISTRATION_STATUS_READER) private readonly reader: RegistrationStatusReader) {}

  async assertCanBookAppointments(actor: Actor): Promise<void> {
    if (actor.role !== null && actor.role !== 'patient') throw new NotAPatientError();
    const status = computeRegistrationStatus(await this.reader.read(actor.userId));
    if (!status.canBookAppointments) throw new RegistrationIncompleteError(status.missing);
  }
}
