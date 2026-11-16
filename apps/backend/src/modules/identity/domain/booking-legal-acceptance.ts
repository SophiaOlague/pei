import type { Role } from '../../../common/domain/role';
import { LEGAL_REGIMES_BY_AUDIENCE, resolveLegalRegime, type LegalDocumentType } from './legal-requirements';

// AP-19, AP-25 y AP-26 (M08-diseno A.17): las dos aceptaciones legales del paciente (privacidad y términos) que habilitan
// una reserva. Lógica pura: el lector (Drizzle o el doble en memoria) entrega los documentos vigentes con la aceptación
// del usuario, si existe, y esta función decide.

export type PrivacyDocumentType = Extract<LegalDocumentType, 'privacy_policy' | 'privacy_notice'>;
export type TermsDocumentType = Extract<LegalDocumentType, 'patient_terms' | 'terms_and_conditions'>;

export interface BookingLegalAcceptance<T extends LegalDocumentType = LegalDocumentType> {
  acceptanceId: string; // user_legal_acceptance.id
  legalDocumentId: string;
  type: T;
  version: string;
}

export interface BookingLegalAcceptances {
  regime: 'current' | 'legacy';
  privacy: BookingLegalAcceptance<PrivacyDocumentType>;
  terms: BookingLegalAcceptance<TermsDocumentType>;
}

// Documento vigente de un tipo (el más reciente con published_at <= ahora) y la aceptación del usuario, si la hay.
export interface CurrentLegalDocumentAcceptance {
  type: LegalDocumentType;
  documentId: string;
  version: string;
  acceptanceId: string | null;
}

const PRIVACY_TYPES: readonly LegalDocumentType[] = ['privacy_policy', 'privacy_notice'];
const TERMS_TYPES: readonly LegalDocumentType[] = ['patient_terms', 'terms_and_conditions'];

// Falla cerrado: null si el perfil no es de paciente, si no hay un régimen completo publicado o si falta la aceptación
// de cualquiera de los dos documentos vigentes del régimen (incluido el caso de una versión nueva no aceptada).
export function selectBookingLegalAcceptances(
  role: Role | null,
  currentDocuments: readonly CurrentLegalDocumentAcceptance[],
): BookingLegalAcceptances | null {
  if (role !== 'patient') return null;
  const regime = resolveLegalRegime('patient', currentDocuments.map((doc) => doc.type));
  if (!regime) return null;
  const pick = (types: readonly LegalDocumentType[]) => {
    const type = regime.find((t) => types.includes(t));
    const doc = type ? currentDocuments.find((d) => d.type === type) : undefined;
    return doc && doc.acceptanceId ? { acceptanceId: doc.acceptanceId, legalDocumentId: doc.documentId, type: doc.type, version: doc.version } : null;
  };
  const privacy = pick(PRIVACY_TYPES);
  const terms = pick(TERMS_TYPES);
  if (!privacy || !terms) return null;
  return {
    regime: regime === LEGAL_REGIMES_BY_AUDIENCE.patient[0] ? 'current' : 'legacy',
    privacy: privacy as BookingLegalAcceptance<PrivacyDocumentType>,
    terms: terms as BookingLegalAcceptance<TermsDocumentType>,
  };
}
