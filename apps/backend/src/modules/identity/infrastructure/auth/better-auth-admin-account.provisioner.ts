import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AUTH_INSTANCE, type Auth } from '../../../../auth/auth.config';
import type { AdminAccountProvisioner } from '../../application/ports/admin-account-provisioner';

// DT-12 con Better Auth: la cuenta se crea con signUpEmail (hash y reglas de Better Auth) usando una
// contraseña aleatoria que no se muestra ni se guarda; el administrador define la suya con el enlace de
// recuperación. Con requireEmailVerification, Better Auth envía además la verificación del correo.
@Injectable()
export class BetterAuthAdminAccountProvisioner implements AdminAccountProvisioner {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  async findUserIdByEmail(email: string): Promise<string | null> {
    const context = await this.auth.$context;
    const found = await context.internalAdapter.findUserByEmail(email.toLowerCase());
    return found?.user.id ?? null;
  }

  async createAccount(input: { email: string; name: string }): Promise<string> {
    await this.auth.api.signUpEmail({
      body: { email: input.email, password: randomBytes(32).toString('base64url'), name: input.name },
    });
    // El registro responde igual exista o no la cuenta: el id se confirma leyendo la cuenta creada.
    const userId = await this.findUserIdByEmail(input.email);
    if (!userId) throw new Error('No se pudo crear la cuenta del administrador');
    return userId;
  }

  async sendPasswordSetup(email: string): Promise<void> {
    const redirectTo = process.env.APP_WEB_URL ? `${process.env.APP_WEB_URL.replace(/\/$/, '')}/reset-password` : undefined;
    await this.auth.api.requestPasswordReset({ body: { email, redirectTo } });
  }
}
