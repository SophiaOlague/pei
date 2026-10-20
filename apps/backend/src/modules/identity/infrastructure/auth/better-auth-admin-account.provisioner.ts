import { Inject, Injectable } from '@nestjs/common';
import { AUTH_INSTANCE, type Auth } from '../../../../auth/auth.config';
import type { AdminAccountProvisioner } from '../../application/ports/admin-account-provisioner';

// Pantalla del cliente web que completa el restablecimiento (apps/web/src/app/restablecer-contrasena).
// Better Auth redirige ahí con ?token=… o ?error=INVALID_TOKEN.
export const PASSWORD_SETUP_PATH = '/restablecer-contrasena';

// El mensaje nunca incluye el valor de APP_WEB_URL.
export class PasswordSetupNotConfiguredError extends Error {
  constructor(reason: string) {
    super(`El enlace para definir la contraseña no está configurado: ${reason}`);
    this.name = 'PasswordSetupNotConfiguredError';
  }
}

// DT-10: única regla para los destinos de los enlaces de correo en el cliente web (la usan la validación previa
// y los envíos). APP_WEB_URL debe ser una URL http(s) sin credenciales, query ni fragmento, y el destino debe pasar
// la misma comprobación de orígenes de confianza que Better Auth aplica al abrir el enlace (si no,
// INVALID_CALLBACK_URL).
export function webAppRedirect(appWebUrl: string | undefined, path: string, isTrustedOrigin: (url: string) => boolean): string {
  const raw = appWebUrl?.trim();
  if (!raw) throw new PasswordSetupNotConfiguredError('falta APP_WEB_URL');
  let base: URL;
  try {
    base = new URL(raw);
  } catch {
    throw new PasswordSetupNotConfiguredError('APP_WEB_URL no es una URL válida');
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new PasswordSetupNotConfiguredError('APP_WEB_URL debe usar http o https');
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new PasswordSetupNotConfiguredError('APP_WEB_URL no puede incluir credenciales, query ni fragmento');
  }
  const target = `${base.origin}${base.pathname.replace(/\/+$/, '')}${path}`;
  if (!isTrustedOrigin(target)) {
    throw new PasswordSetupNotConfiguredError('el origen de APP_WEB_URL no está entre los orígenes de confianza de Better Auth');
  }
  return target;
}

export function passwordSetupRedirect(appWebUrl: string | undefined, isTrustedOrigin: (url: string) => boolean): string {
  return webAppRedirect(appWebUrl, PASSWORD_SETUP_PATH, isTrustedOrigin);
}

// DT-12 con Better Auth (opción C): la cuenta se crea SIN credencial ni correo de verificación; el único correo del
// bootstrap es el enlace para definir la contraseña (resetPassword crea la credencial). Hasta entonces no puede
// iniciar sesión (sin credencial) ni verificar su correo (createAuth, rejectVerificationWithoutPassword). Con la
// contraseña definida, el primer inicio de sesión responde EMAIL_NOT_VERIFIED y Better Auth envía la verificación.
@Injectable()
export class BetterAuthAdminAccountProvisioner implements AdminAccountProvisioner {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  async assertPasswordSetupConfigured(): Promise<void> {
    await this.webRedirect(PASSWORD_SETUP_PATH);
  }

  async findUserIdByEmail(email: string): Promise<string | null> {
    const context = await this.auth.$context;
    const found = await context.internalAdapter.findUserByEmail(email.toLowerCase());
    return found?.user.id ?? null;
  }

  // Mismo criterio que el inicio de sesión y que el bloqueo de la verificación (createAuth): cuenta "credential"
  // de ese usuario con contraseña.
  async hasPasswordCredential(userId: string): Promise<boolean> {
    const context = await this.auth.$context;
    return Boolean((await context.internalAdapter.findCredentialAccount(userId))?.password);
  }

  // Solo la fila user (emailVerified: false): sin cuenta de credenciales, sin sesión y sin correo.
  async createAccount(input: { email: string; name: string }): Promise<string> {
    const context = await this.auth.$context;
    // Origen "admin": alta hecha por la plataforma, no por la propia persona (solo se usa si se configura
    // user.validateUserInfo, que PEI no usa).
    const created = await context.internalAdapter.createUser(
      { email: input.email.toLowerCase(), name: input.name, emailVerified: false },
      { method: 'admin' },
    );
    if (!created?.id) throw new Error('No se pudo crear la cuenta del administrador');
    return created.id;
  }

  async sendPasswordSetup(email: string): Promise<void> {
    const redirectTo = await this.webRedirect(PASSWORD_SETUP_PATH);
    await this.auth.api.requestPasswordReset({ body: { email, redirectTo } });
  }

  // Orígenes de confianza efectivos de Better Auth (trustedOrigins, baseURL y variables propias de Better Auth).
  private async webRedirect(path: string): Promise<string> {
    const context = await this.auth.$context;
    return webAppRedirect(process.env.APP_WEB_URL, path, (url) => context.isTrustedOrigin(url, { allowRelativePaths: false }));
  }
}
