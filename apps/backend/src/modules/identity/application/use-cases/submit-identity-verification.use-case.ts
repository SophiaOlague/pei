import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { nextSubmissionAttempt } from '../../domain/identity-verification';
import { validateImage } from '../../../private-storage/domain/file-signature';
import { identityDocumentKey } from '../../domain/object-keys';
import { IdentityVerificationPendingError } from '../../domain/identity.errors';
import { PRIVATE_OBJECT_STORAGE, type PrivateObjectStorage } from '../../../private-storage/application/ports/private-object-storage';
import { PATIENT_PROFILE_REPOSITORY, type PatientProfileRepository } from '../ports/patient-profile.repository';
import {
  IDENTITY_VERIFICATION_REPOSITORY,
  type IdentityVerificationRepository,
} from '../ports/identity-verification.repository';
import { IdentityAuditEvents } from '../identity-audit-events';
import { requirePatientProfile } from './patient-profile.access';

export interface IdentityDocumentFiles {
  front?: Buffer;
  back?: Buffer;
}

// RF-07, DP-11, DT-2, DT-4, DT-16: envío del INE (frente y reverso) para revisión del administrador.
// - Un solo envío 'pending'; reenvío solo tras 'rejected'; 'approved' no se reenvía.
// - Las claves las genera el servidor (sin datos personales) y la BD guarda solo claves.
// - Compensación (DT-6): si la BD falla después de subir, se eliminan los objetos subidos.
@Injectable()
export class SubmitIdentityVerificationUseCase {
  private readonly logger = new Logger('SubmitIdentityVerification');

  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(PRIVATE_OBJECT_STORAGE) private readonly storage: PrivateObjectStorage,
    @Inject(PATIENT_PROFILE_REPOSITORY) private readonly patientProfiles: PatientProfileRepository,
    @Inject(IDENTITY_VERIFICATION_REPOSITORY) private readonly verifications: IdentityVerificationRepository,
  ) {}

  async execute(actor: Actor, files: IdentityDocumentFiles): Promise<{ submissionId: string; status: 'pending'; attempt: number }> {
    const profile = await requirePatientProfile(actor, this.patientProfiles);
    const front = validateImage(files.front);
    const back = validateImage(files.back);

    // Comprobación previa para no subir archivos que de todas formas se rechazarían; se repite en la transacción.
    nextSubmissionAttempt(await this.verifications.findLatestForPatient(profile.patientProfileId));

    const submissionId = randomUUID();
    const frontKey = identityDocumentKey(profile.patientProfileId, submissionId, 'front', front.extension);
    const backKey = identityDocumentKey(profile.patientProfileId, submissionId, 'back', back.extension);
    const uploaded: string[] = [];

    try {
      await this.storage.put(frontKey, front.bytes, front.contentType);
      uploaded.push(frontKey);
      await this.storage.put(backKey, back.bytes, back.contentType);
      uploaded.push(backKey);

      const attempt = await this.unitOfWork.runInTransaction(async () => {
        // Bloquea el perfil: dos envíos simultáneos del mismo paciente se serializan.
        await this.patientProfiles.lockByUserProfileId(profile.userProfileId);
        const attempt = nextSubmissionAttempt(await this.verifications.findLatestForPatient(profile.patientProfileId));
        await this.verifications.create({
          id: submissionId,
          patientProfileId: profile.patientProfileId,
          attempt,
          frontObjectKey: frontKey,
          backObjectKey: backKey,
        });
        await this.auditTrail.record(IdentityAuditEvents.verificationSubmitted(AuditActor.fromActor(actor), submissionId, attempt));
        return attempt;
      });
      return { submissionId, status: 'pending', attempt };
    } catch (error) {
      await this.compensate(submissionId, uploaded);
      // El índice único parcial (un solo 'pending') o la unicidad (paciente, intento) ganaron una carrera.
      if (error instanceof UniqueConstraintViolationError) throw new IdentityVerificationPendingError();
      throw error;
    }
  }

  private async compensate(submissionId: string, keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (error) {
        // Huérfano sin fila en la BD: deuda de conciliación (DT-6). Sin la clave en el registro.
        this.logger.error(`No se pudo compensar un objeto del envío ${submissionId}: ${(error as Error)?.name ?? 'Error'}`);
      }
    }
  }
}
