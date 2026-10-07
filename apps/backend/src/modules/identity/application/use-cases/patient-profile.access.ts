import type { Actor } from '../../../../common/application/actor';
import { PatientProfileRequiredError } from '../../domain/identity.errors';
import type { PatientProfileRepository, PatientProfileView } from '../ports/patient-profile.repository';

// Perfil de paciente del actor. Las rutas ya exigen el rol 'patient'; esto falla cerrado si no hay perfil.
export async function requirePatientProfile(
  actor: Actor,
  patientProfiles: PatientProfileRepository,
  options: { lock?: boolean } = {},
): Promise<PatientProfileView> {
  if (actor.role !== 'patient' || !actor.userProfileId) throw new PatientProfileRequiredError();
  const profile = options.lock
    ? await patientProfiles.lockByUserProfileId(actor.userProfileId)
    : await patientProfiles.findByUserProfileId(actor.userProfileId);
  if (!profile) throw new PatientProfileRequiredError();
  return profile;
}
