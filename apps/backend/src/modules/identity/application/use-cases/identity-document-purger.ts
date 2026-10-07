import { Inject, Injectable, Logger } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { isManagedObjectKey } from '../../domain/object-keys';
import { DOCUMENT_STORAGE, type DocumentStorage } from '../ports/document-storage';
import {
  IDENTITY_VERIFICATION_REPOSITORY,
  type IdentityVerificationRecord,
  type IdentityVerificationRepository,
} from '../ports/identity-verification.repository';

// DT-5: al aprobar o rechazar un envío se eliminan del bucket sus dos imágenes; la evidencia de la
// verificación (estado, intento, revisión, motivo, documents_deleted_at y auditoría) permanece.
//
// Orden: primero se eliminan los objetos y después se limpian las claves. Si la eliminación falla, el envío
// queda "revisado con claves presentes" y el CLI identity:purge-documents lo completa después.
// Los registros nunca incluyen claves de objetos.
@Injectable()
export class IdentityDocumentPurger {
  private readonly logger = new Logger('IdentityDocumentPurger');

  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    @Inject(IDENTITY_VERIFICATION_REPOSITORY) private readonly verifications: IdentityVerificationRepository,
  ) {}

  // true si el envío ya no conserva documentos.
  async purge(record: IdentityVerificationRecord): Promise<boolean> {
    if (record.status === 'pending') return false;
    try {
      for (const key of [record.frontObjectKey, record.backObjectKey]) {
        // Las filas anteriores a M02 pueden guardar URLs en estas columnas (DT-3): no son objetos del bucket privado.
        if (key && isManagedObjectKey(key)) await this.storage.delete(key);
      }
      await this.unitOfWork.runInTransaction(() => this.verifications.markDocumentsDeleted(record.id));
      return true;
    } catch (error) {
      this.logger.error(`No se pudieron eliminar los documentos del envío ${record.id}: ${(error as Error)?.name ?? 'Error'}`);
      return false;
    }
  }
}
