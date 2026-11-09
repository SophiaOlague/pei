import { Inject, Injectable } from '@nestjs/common';
import {
  BOOKING_LEGAL_ACCEPTANCE_READER,
  type BookingLegalAcceptanceReader,
} from '../../identity/application/ports/booking-legal-acceptance.reader';
import type { BookingLegalAcceptances, BookingLegalReferences } from '../application/ports/appointments.ports';

// AP-26: delega en el lector de M02 (BOOKING_LEGAL_ACCEPTANCE_READER), que decide si la pareja de privacidad y términos
// está vigente y completa, y devuelve solo los identificadores que necesita la cita. Se lee dentro de la transacción
// activa de la reserva (el lector usa getDbContext).
@Injectable()
export class ReaderBookingLegalAcceptances implements BookingLegalAcceptances {
  constructor(@Inject(BOOKING_LEGAL_ACCEPTANCE_READER) private readonly reader: BookingLegalAcceptanceReader) {}

  async currentFor(userProfileId: string): Promise<BookingLegalReferences | null> {
    const acceptances = await this.reader.currentFor(userProfileId);
    if (!acceptances) return null;
    return { privacyLegalAcceptanceId: acceptances.privacy.acceptanceId, termsLegalAcceptanceId: acceptances.terms.acceptanceId };
  }
}
