import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Actor } from '../../../../common/application/actor';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { Curp } from '../../../identity/domain/curp';
import { ProfileAlreadyExistsError, RegistrationDataConflictError } from '../../../identity/domain/identity.errors';
import { DOCTOR_IDENTITY_GATEWAY, type DoctorIdentityGateway } from '../../../identity/application/ports/doctor-identity.gateway';
import { parseLegalName } from '../../domain/legal-name';
import { SpecialtyInactiveError, SpecialtyNotFoundError } from '../../domain/doctor.errors';
import { SPECIALTY_REPOSITORY, type SpecialtyRepository } from '../ports/specialty.repository';
import { DOCTOR_PROFILE_REPOSITORY, type DoctorProfileRepository } from '../ports/doctor-profile.repository';
import { DoctorAuditEvents } from '../doctor-audit-events';

export interface RegisterDoctorProfileInput {
  firstName: string;
  lastName: string;
  curp: string;
  specialtyId: string;
  phone?: string | null;
  bio?: string | null;
}

// RF-01, RF-05, RN-001, D-1, D-5, D-20, D-35: una cuenta sin perfil crea su perfil de médico. El rol lo fija el puerto
// de Identity. El médico queda con ambas líneas en `required` (diseño v3 §D.5, escenario 1): la INE y la cédula se
// envían después con sus endpoints. D-17: un duplicado responde 409 genérico (log sin datos; nada en audit_log, P2).
@Injectable()
export class RegisterDoctorProfileUseCase {
  private readonly logger = new Logger('RegisterDoctorProfile');

  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(DOCTOR_IDENTITY_GATEWAY) private readonly identity: DoctorIdentityGateway,
    @Inject(DOCTOR_PROFILE_REPOSITORY) private readonly profiles: DoctorProfileRepository,
    @Inject(SPECIALTY_REPOSITORY) private readonly specialties: SpecialtyRepository,
  ) {}

  async execute(actor: Actor, input: RegisterDoctorProfileInput): Promise<{ doctorProfileId: string; userProfileId: string }> {
    if (actor.userProfileId) throw new ProfileAlreadyExistsError();
    const name = parseLegalName(input);
    const curp = Curp.parse(input.curp).value;

    try {
      return await this.unitOfWork.runInTransaction(async () => {
        // D-33: solo una especialidad activa, comprobada bajo FOR SHARE (plan v2 §9).
        const specialty = await this.specialties.lockForShare(input.specialtyId);
        if (!specialty) throw new SpecialtyNotFoundError();
        if (!specialty.isActive) throw new SpecialtyInactiveError();

        const userProfileId = await this.identity.createDoctorUserProfile({ userId: actor.userId, ...name, curp, phone: input.phone ?? null });
        const profile = await this.profiles.create({ userProfileId, specialtyId: specialty.id, bio: input.bio ?? null });
        await this.auditTrail.record(DoctorAuditEvents.profileCreated(AuditActor.fromActor({ ...actor, userProfileId, role: 'doctor' }), profile.id));
        return { doctorProfileId: profile.id, userProfileId };
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationError) {
        if (error.detail.constraint === 'user_profile_curp_unique') {
          this.logger.warn('registration_conflict field=curp');
          throw new RegistrationDataConflictError('curp');
        }
        if (error.detail.constraint === 'user_profile_user_id_unique' || error.detail.constraint === 'doctor_profile_user_profile_id_unique') {
          throw new ProfileAlreadyExistsError();
        }
      }
      throw error;
    }
  }
}
