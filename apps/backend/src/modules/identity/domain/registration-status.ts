import type { Role } from '../../../common/domain/role';
import { evaluateLegalAcceptance, type CurrentLegalDocument, type PendingLegalDocument } from './legal-requirements';

export type { CurrentLegalDocument, PendingLegalDocument } from './legal-requirements';

// Estado del registro del paciente (DP-8, DT-17, DT-21). No se guarda: se calcula en cada lectura.
//   registrationComplete = perfil && legales vigentes del régimen del paciente aceptados && identidad aprobada
//   canBookAppointments  = registrationComplete && rol 'patient' (M08 agrega sus propias condiciones)

export type IdentityStatus = 'not_submitted' | 'pending' | 'rejected' | 'approved';

export type MissingRequirement =
  | 'profile'
  | 'legal'
  | 'identity_submission'
  | 'identity_review'
  | 'identity_resubmission';

// Lo que el lector obtiene de la BD en una sola consulta.
export interface RegistrationSnapshot {
  role: Role | null; // null: la cuenta aún no tiene perfil
  hasPatientProfile: boolean;
  currentLegalDocuments: CurrentLegalDocument[];
  latestIdentityVerification: { status: Exclude<IdentityStatus, 'not_submitted'>; rejectionReason: string | null } | null;
}

export interface RegistrationStatus {
  profileCompleted: boolean;
  legal: { accepted: boolean; pending: PendingLegalDocument[] };
  identity: { status: IdentityStatus; rejectionReason: string | null };
  registrationComplete: boolean;
  canBookAppointments: boolean;
  missing: MissingRequirement[];
}

export function computeRegistrationStatus(snapshot: RegistrationSnapshot): RegistrationStatus {
  const profileCompleted = snapshot.role === 'patient' && snapshot.hasPatientProfile;

  // Solo cuentan los documentos del régimen vigente del paciente; falla cerrado si no hay régimen publicado.
  const { accepted: legalAccepted, pending } = evaluateLegalAcceptance('patient', snapshot.currentLegalDocuments);

  const latest = snapshot.latestIdentityVerification;
  const identityStatus: IdentityStatus = latest?.status ?? 'not_submitted';
  const rejectionReason = identityStatus === 'rejected' ? (latest?.rejectionReason ?? null) : null;

  const missing: MissingRequirement[] = [];
  if (!profileCompleted) missing.push('profile');
  if (!legalAccepted) missing.push('legal');
  if (identityStatus === 'not_submitted') missing.push('identity_submission');
  if (identityStatus === 'pending') missing.push('identity_review');
  if (identityStatus === 'rejected') missing.push('identity_resubmission');

  const registrationComplete = profileCompleted && legalAccepted && identityStatus === 'approved';

  return {
    profileCompleted,
    legal: { accepted: legalAccepted, pending },
    identity: { status: identityStatus, rejectionReason },
    registrationComplete,
    canBookAppointments: registrationComplete && snapshot.role === 'patient',
    missing,
  };
}

// M03 A4 (M02-6; D-24, D-30, D-31): el estado del registro se compone por rol.
//   patient, o cuenta sin perfil (el perfil que crea es de paciente) → estado del paciente, sin cambios en su contrato.
//   doctor → null hasta la fase B, que añade sus requisitos (INE, cédula, especialidad) (D-A4-2).
//   admin, organization → null: no tienen registro.
export function composesRegistrationStatus(role: Role | null): boolean {
  return role === null || role === 'patient';
}

export function composeRegistrationStatus(snapshot: RegistrationSnapshot): RegistrationStatus | null {
  return composesRegistrationStatus(snapshot.role) ? computeRegistrationStatus(snapshot) : null;
}
