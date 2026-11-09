import type { BookingLegalAcceptances } from '../../domain/booking-legal-acceptance';

export type { BookingLegalAcceptance, BookingLegalAcceptances } from '../../domain/booking-legal-acceptance';

// Lector de solo lectura que M02 exporta para M08 (AP-19, AP-25, AP-26; M08-diseno A.17.1). Devuelve las dos
// aceptaciones legales vigentes del paciente (privacidad y términos) o null. Se lee dentro de la transacción activa
// (getDbContext), después de CanBookAppointmentsPolicy. No modifica nada.
export interface BookingLegalAcceptanceReader {
  currentFor(userProfileId: string): Promise<BookingLegalAcceptances | null>;
}

export const BOOKING_LEGAL_ACCEPTANCE_READER = Symbol('BOOKING_LEGAL_ACCEPTANCE_READER');
