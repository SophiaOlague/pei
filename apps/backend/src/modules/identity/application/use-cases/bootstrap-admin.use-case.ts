import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { AdminAlreadyExistsError, BootstrapAccountHasProfileError } from '../../domain/identity.errors';
import { USER_PROFILE_REPOSITORY, type UserProfileRepository } from '../ports/user-profile.repository';
import { ADMIN_ACCOUNT_PROVISIONER, type AdminAccountProvisioner } from '../ports/admin-account-provisioner';
import { IdentityAuditEvents } from '../identity-audit-events';

export const ADMIN_BOOTSTRAP_PROCESS = 'cli.admin-bootstrap';

export interface BootstrapAdminInput {
  email: string;
  firstName: string;
  lastName: string;
}

// DP-5, DT-12: primer administrador por CLI. Falla cerrado: solo funciona si no existe NINGÚN administrador.
// No acepta un rol como parámetro ni tiene endpoint HTTP.
//
// 1. Comprobación previa: si ya hay un administrador, aborta sin crear nada.
// 2. Cuenta de Better Auth con contraseña aleatoria que se descarta (o reanuda una cuenta sin perfil).
// 3. En una UnitOfWork, con bloqueo consultivo y la comprobación repetida: user_profile 'admin' y
//    el evento identity.admin.bootstrapped con actor sistema.
// 4. Enlace para que el administrador defina su contraseña (la verificación del correo la envía Better Auth).
@Injectable()
export class BootstrapAdminUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(USER_PROFILE_REPOSITORY) private readonly userProfiles: UserProfileRepository,
    @Inject(ADMIN_ACCOUNT_PROVISIONER) private readonly accounts: AdminAccountProvisioner,
  ) {}

  async execute(input: BootstrapAdminInput): Promise<{ userProfileId: string; resumedExistingAccount: boolean }> {
    if (await this.userProfiles.adminExists()) throw new AdminAlreadyExistsError();

    // Reanudación: una ejecución anterior pudo crear la cuenta y fallar antes del perfil.
    let userId = await this.accounts.findUserIdByEmail(input.email);
    const resumedExistingAccount = userId !== null;
    if (userId && (await this.userProfiles.findByUserId(userId))) throw new BootstrapAccountHasProfileError();
    userId ??= await this.accounts.createAccount({ email: input.email, name: `${input.firstName} ${input.lastName}` });
    const accountUserId = userId;

    const userProfileId = await this.unitOfWork.runInTransaction(async () => {
      await this.userProfiles.lockAdminBootstrap();
      if (await this.userProfiles.adminExists()) throw new AdminAlreadyExistsError();
      if (await this.userProfiles.findByUserId(accountUserId)) throw new BootstrapAccountHasProfileError();
      const id = await this.userProfiles.createAdmin({ userId: accountUserId, firstName: input.firstName, lastName: input.lastName });
      await this.auditTrail.record(IdentityAuditEvents.adminBootstrapped(AuditActor.system(ADMIN_BOOTSTRAP_PROCESS), id));
      return id;
    });

    await this.accounts.sendPasswordSetup(input.email);
    return { userProfileId, resumedExistingAccount };
  }
}
