import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { AUDIT_TRAIL, type AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import {
  AdminAlreadyExistsError,
  BootstrapAccountHasCredentialError,
  BootstrapAccountHasProfileError,
} from '../../domain/identity.errors';
import { USER_PROFILE_REPOSITORY, type UserProfileRepository } from '../ports/user-profile.repository';
import { ADMIN_ACCOUNT_PROVISIONER, type AdminAccountProvisioner } from '../ports/admin-account-provisioner';
import { IdentityAuditEvents } from '../identity-audit-events';

export const ADMIN_BOOTSTRAP_PROCESS = 'cli.admin-bootstrap';

export interface BootstrapAdminInput {
  email: string;
  firstName: string;
  lastName: string;
}

// El administrador y su perfil ya están confirmados, pero no se pudo solicitar el enlace para definir la
// contraseña. Repetir el bootstrap abortaría (ya existe un administrador): la recuperación es pedir un enlace
// nuevo («Olvidé mi contraseña»). El mensaje es fijo; la causa original queda en `cause`.
export class AdminPasswordSetupRequestFailedError extends Error {
  constructor(
    readonly userProfileId: string,
    options: { cause: unknown },
  ) {
    super('El administrador quedó creado, pero no se pudo solicitar el enlace para definir la contraseña', options);
    this.name = 'AdminPasswordSetupRequestFailedError';
  }
}

// DP-5, DT-12: primer administrador por CLI. Falla cerrado: solo funciona si no existe NINGÚN administrador.
// No acepta un rol como parámetro ni tiene endpoint HTTP.
//
// 0. Configuración del enlace de contraseña (APP_WEB_URL): si falta o es inválida, aborta antes de todo.
// 1. Comprobación previa: si ya hay un administrador, aborta sin crear nada.
// 2. Cuenta de Better Auth sin contraseña ni correo. Si ya existe una cuenta con ese correo, solo se reanuda si no
//    tiene perfil NI contraseña (la dejó una ejecución anterior interrumpida); si no, aborta sin asignar el rol.
// 3. En una UnitOfWork, con bloqueo consultivo y la comprobación repetida: user_profile 'admin' y
//    el evento identity.admin.bootstrapped con actor sistema.
// 4. Enlace para que el administrador defina su contraseña: es el único correo del bootstrap. La verificación del
//    correo la envía Better Auth en su primer inicio de sesión, ya con contraseña. Si la solicitud falla, el
//    administrador ya existe: AdminPasswordSetupRequestFailedError.
@Injectable()
export class BootstrapAdminUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_TRAIL) private readonly auditTrail: AuditTrail,
    @Inject(USER_PROFILE_REPOSITORY) private readonly userProfiles: UserProfileRepository,
    @Inject(ADMIN_ACCOUNT_PROVISIONER) private readonly accounts: AdminAccountProvisioner,
  ) {}

  async execute(input: BootstrapAdminInput): Promise<{ userProfileId: string; resumedExistingAccount: boolean }> {
    await this.accounts.assertPasswordSetupConfigured();
    if (await this.userProfiles.adminExists()) throw new AdminAlreadyExistsError();

    // Reanudación: una ejecución anterior pudo crear la cuenta y fallar antes del perfil.
    let userId = await this.accounts.findUserIdByEmail(input.email);
    const resumedExistingAccount = userId !== null;
    if (userId) {
      if (await this.userProfiles.findByUserId(userId)) throw new BootstrapAccountHasProfileError();
      // Una cuenta con contraseña no la creó el bootstrap (p. ej., el registro público): esa contraseña seguiría
      // dando acceso al administrador. Se rechaza antes de asignar el rol, crear el perfil o enviar correos.
      if (await this.accounts.hasPasswordCredential(userId)) throw new BootstrapAccountHasCredentialError();
    }
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

    try {
      await this.accounts.sendPasswordSetup(input.email);
    } catch (error) {
      throw new AdminPasswordSetupRequestFailedError(userProfileId, { cause: error });
    }
    return { userProfileId, resumedExistingAccount };
  }
}
