import type { Role } from '../../../common/domain/role';

// Requisitos legales por rol (M03 D-32, N1; plan v2 §6).
//
// Un régimen es el conjunto de tipos que un rol debe aceptar. Cada rol tiene una lista de regímenes, del más
// nuevo al más antiguo. Lo que cambia los requisitos es la PUBLICACIÓN de documentos, no los valores del enum:
// el régimen vigente de un rol es el primero de su lista cuyos tipos tienen TODOS una versión vigente.
//
// - Paciente: privacy_policy + patient_terms; mientras no estén publicados los dos, sigue el régimen de legado
//   (privacy_notice + terms_and_conditions), con el que aceptaron los pacientes de M02.
// - Médico: privacy_policy + doctor_terms; no tiene régimen de legado.
// - La transición es monotónica: los documentos son append-only, así que un régimen completo no deja de estarlo.

export const LEGAL_DOCUMENT_TYPES = [
  'privacy_notice',
  'terms_and_conditions',
  'privacy_policy',
  'patient_terms',
  'doctor_terms',
] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

// Tipos que ya no se publican: solo existen por las filas históricas de M02.
export const LEGACY_LEGAL_DOCUMENT_TYPES: readonly LegalDocumentType[] = ['privacy_notice', 'terms_and_conditions'];

export type LegalAudience = Extract<Role, 'patient' | 'doctor'>;
export const LEGAL_AUDIENCES: readonly LegalAudience[] = ['patient', 'doctor'];

export const LEGAL_REGIMES_BY_AUDIENCE: Readonly<Record<LegalAudience, readonly (readonly LegalDocumentType[])[]>> = {
  patient: [
    ['privacy_policy', 'patient_terms'],
    ['privacy_notice', 'terms_and_conditions'],
  ],
  doctor: [['privacy_policy', 'doctor_terms']],
};

export function isLegalAudience(role: Role | null): role is LegalAudience {
  return role === 'patient' || role === 'doctor';
}

// Tipos que debe aceptar el rol según los tipos que tienen una versión vigente; null si ningún régimen está completo.
export function resolveLegalRegime(
  audience: LegalAudience,
  effectiveTypes: Iterable<LegalDocumentType>,
): readonly LegalDocumentType[] | null {
  const effective = new Set(effectiveTypes);
  return LEGAL_REGIMES_BY_AUDIENCE[audience].find((regime) => regime.every((type) => effective.has(type))) ?? null;
}

// Documento vigente de un tipo y si el usuario lo aceptó (lo arma el lector en una sola consulta).
export interface CurrentLegalDocument {
  type: LegalDocumentType;
  documentId: string;
  version: string;
  accepted: boolean;
}

export interface PendingLegalDocument {
  type: LegalDocumentType;
  documentId: string;
  version: string;
}

// Estado legal de un rol: solo cuentan los documentos de su régimen vigente (RF-03, RF-04, RN-006).
// Falla cerrado: sin régimen completo publicado, los legales no cuentan como aceptados.
export function evaluateLegalAcceptance(
  audience: LegalAudience,
  currentLegalDocuments: readonly CurrentLegalDocument[],
): { accepted: boolean; pending: PendingLegalDocument[] } {
  const regime = resolveLegalRegime(audience, currentLegalDocuments.map((doc) => doc.type));
  if (!regime) return { accepted: false, pending: [] };
  const pending = currentLegalDocuments
    .filter((doc) => regime.includes(doc.type) && !doc.accepted)
    .map(({ type, documentId, version }) => ({ type, documentId, version }));
  return { accepted: pending.length === 0, pending };
}
