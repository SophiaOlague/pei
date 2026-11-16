import type { Actor } from '../../../../common/application/actor';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { AdminRequiredError, DoctorProfileRequiredError, PatientProfileRequiredError } from '../../domain/appointments.errors';

// Las rutas ya exigen el rol con @Roles; los casos de uso también fallan cerrado.
export function requirePatient(actor: Actor): string {
  if (actor?.role !== 'patient' || !actor.userProfileId) throw new PatientProfileRequiredError();
  return actor.userProfileId;
}

export function requireDoctor(actor: Actor): string {
  if (actor?.role !== 'doctor' || !actor.userProfileId) throw new DoctorProfileRequiredError();
  return actor.userProfileId;
}

export function requireAdmin(actor: Actor): string {
  if (actor?.role !== 'admin' || !actor.userProfileId) throw new AdminRequiredError();
  return actor.userProfileId;
}

export const SYSTEM_PROCESS = {
  holdExpiry: 'appointments.hold-expiry',
  payments: 'appointments.payments',
  videoconsultation: 'appointments.videoconsultation',
} as const;

export const systemActor = (process: string) => AuditActor.system(process);
