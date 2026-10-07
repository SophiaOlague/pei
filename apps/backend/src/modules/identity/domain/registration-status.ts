import type { Role } from '../../../common/domain/role';

// Estado del registro del paciente (DP-8, DT-17, DT-21). No se guarda: se calcula en cada lectura.
//   registrationComplete = perfil && legales vigentes aceptados && identidad aprobada
//   canBookAppointments  = registrationComplete && rol 'patient' (M08 agrega sus propias condiciones)

export const REQUIRED_LEGAL_DOCUMENT_TYPES = ['privacy_notice', 'terms_and_conditions'] as const;
export type LegalDocumentType = (typeof REQUIRED_LEGAL_DOCUMENT_TYPES)[number];

export type IdentityStatus = 'not_submitted' | 'pending' | 'rejected' | 'approved';

export type MissingRequirement =
  | 'profile'
  | 'legal'
  | 'identity_submission'
  | 'identity_review'
  | 'identity_resubmission';

export interface CurrentLegalDocument {
  type: LegalDocumentType;
  documentId: string;
  version: string;
  accepted: boolean;
}

// Lo que el lector obtiene de la BD en una sola consulta.
export interface RegistrationSnapshot {
  role: Role | null; // null: la cuenta aún no tiene perfil
  hasPatientProfile: boolean;
  currentLegalDocuments: CurrentLegalDocument[];
  latestIdentityVerification: { status: Exclude<IdentityStatus, 'not_submitted'>; rejectionReason: string | null } | null;
}

export interface PendingLegalDocument {
  type: LegalDocumentType;
  documentId: string;
  version: string;
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

  // Falla cerrado: si falta publicar un tipo requerido, los legales no se consideran aceptados.
  const byType = new Map(snapshot.currentLegalDocuments.map((doc) => [doc.type, doc]));
  const allTypesPublished = REQUIRED_LEGAL_DOCUMENT_TYPES.every((type) => byType.has(type));
  const pending = snapshot.currentLegalDocuments
    .filter((doc) => !doc.accepted)
    .map(({ type, documentId, version }) => ({ type, documentId, version }));
  const legalAccepted = allTypesPublished && pending.length === 0;

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
