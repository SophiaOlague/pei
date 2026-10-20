import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRIVATE_OBJECT_STORAGE, type PrivateObjectStorage } from '../../../private-storage/application/ports/private-object-storage';
import { DOCTOR_REVIEW_REPOSITORY, type DoctorReviewRepository, type IdentityReviewRecord } from '../ports/doctor-review.repository';

// D-19 (diseño v3 §E.1): la INE del médico se purga cuando su revisión termina (approved, rejected o superseded).
// Siempre DESPUÉS del commit (patrón DT-5 de M02): si se borrara antes, una revisión aún pendiente podría quedar sin
// documentos. Si falla, la fila conserva las claves y la purga puede repetirse (idempotente).
@Injectable()
export class DoctorIdentityDocumentPurger {
  private readonly logger = new Logger('DoctorIdentityDocumentPurger');

  constructor(
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    @Inject(DOCTOR_REVIEW_REPOSITORY) private readonly reviews: DoctorReviewRepository,
  ) {}

  async purge(review: Pick<IdentityReviewRecord, 'id' | 'frontObjectKey' | 'backObjectKey'>): Promise<boolean> {
    try {
      for (const key of [review.frontObjectKey, review.backObjectKey]) if (key) await this.storage.delete(key);
      return await this.reviews.markIdentityDocumentsDeleted(review.id);
    } catch {
      // Sin claves ni datos personales en el log.
      this.logger.warn(`doctor_identity_purge_failed review=${review.id}`);
      return false;
    }
  }
}
