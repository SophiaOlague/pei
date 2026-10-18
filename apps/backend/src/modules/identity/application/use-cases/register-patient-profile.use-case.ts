import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { CLOCK, type Clock } from '../../../../common/application/ports/clock';
import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { createPatientIdentityData } from '../../domain/patient-identity-data';
import { ProfileAlreadyExistsError, RegistrationDataConflictError } from '../../domain/identity.errors';
import { USER_PROFILE_REPOSITORY, type UserProfileRepository } from '../ports/user-profile.repository';
import { PATIENT_PROFILE_REPOSITORY, type PatientProfileRepository } from '../ports/patient-profile.repository';
import { IdentityAuditEvents } from '../identity-audit-events';

export interface RegisterPatientProfileInput {
  firstName: string;
  lastName: string;
  curp: string;
  birthDate: string;
  phone?: string | null;
  address?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

// RF-01, RN-001, RN-002, DP-5: la cuenta (con correo verificado) crea su perfil de paciente.
// El rol lo fija el caso de uso: ningún dato del cliente lo elige.
// M03 R-12, D-20, D-35: la CURP se guarda en user_profile y es única entre todos los roles.
// D-17: una CURP que ya pertenece a otra cuenta responde un 409 genérico. La causa solo queda en un log sin datos
// personales; no se registra en audit_log, porque la operación se revierte (M01 D1, D2, D6).
@Injectable()
export class RegisterPatientProfileUseCase {
  private readonly logger = new Logger('RegisterPatientProfile');

  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(USER_PROFILE_REPOSITORY) private readonly userProfiles: UserProfileRepository,
    @Inject(PATIENT_PROFILE_REPOSITORY) private readonly patientProfiles: PatientProfileRepository,
  ) {}

  async execute(actor: Actor, input: RegisterPatientProfileInput): Promise<{ patientProfileId: string; userProfileId: string }> {
    if (actor.userProfileId) throw new ProfileAlreadyExistsError();
    const identity = createPatientIdentityData(input, this.clock.now());

    try {
      return await this.unitOfWork.runInTransaction(async () => {
        if (await this.userProfiles.findByUserId(actor.userId)) throw new ProfileAlreadyExistsError();
        if (await this.userProfiles.existsByCurp(identity.curp.value)) throw new RegistrationDataConflictError('curp');

        const userProfileId = await this.userProfiles.createPatient({
          userId: actor.userId,
          firstName: identity.firstName,
          lastName: identity.lastName,
          curp: identity.curp.value,
          birthDate: identity.birthDate,
          phone: input.phone ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
        });
        const patientProfileId = await this.patientProfiles.create({
          userProfileId,
          address: input.address ?? null,
        });

        // El actor ya tiene perfil: el evento queda ligado a él.
        await this.auditTrail.record(
          IdentityAuditEvents.profileCreated(AuditActor.fromActor({ ...actor, userProfileId }), patientProfileId),
        );
        return { patientProfileId, userProfileId };
      });
    } catch (error) {
      // Carrera: otra petición creó el perfil o usó la CURP entre la comprobación y el INSERT (23505).
      const conflict =
        error instanceof RegistrationDataConflictError
          ? error
          : error instanceof UniqueConstraintViolationError && error.detail.constraint === 'user_profile_curp_unique'
            ? new RegistrationDataConflictError('curp')
            : null;
      if (conflict) {
        // Solo el campo: nunca el valor, el nombre ni identificadores de la persona.
        this.logger.warn(`registration_conflict field=${conflict.conflictField}`);
        throw conflict;
      }
      if (error instanceof UniqueConstraintViolationError && error.detail.constraint === 'user_profile_user_id_unique') {
        throw new ProfileAlreadyExistsError();
      }
      throw error;
    }
  }
}
