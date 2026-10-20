import { Logger } from '@nestjs/common';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import { expo } from '@better-auth/expo';
import type { AuthEmail, EmailSender } from '../modules/identity/application/ports/email-sender';
import type { EmailDispatchRegistry } from './email-dispatches';

// Better Auth de PEI (M02, DP-2, DT-8, DT-11, DT-19) como fábrica: la base de datos y el EmailSender se
// inyectan, para que las pruebas usen el adaptador en memoria y un EmailSender falso.

export interface AuthConfig {
  baseURL?: string;
  secret?: string;
  trustedOrigins: string[];
}

// Encabezado con la IP del cliente que fija el backend (ver AuthController): Better Auth la usa para el
// rate limit y las sesiones. Cualquier valor que envíe el cliente con este nombre se reemplaza.
export const CLIENT_IP_HEADER = 'x-pei-client-ip';

type RateLimitRule = { window: number; max: number };

// DT-8: siempre activo (no depende de isProduction). Ventanas en segundos; clave: IP.
// storage 'memory' sirve con UNA instancia; con varias es obligatorio secondary-storage (distribuido).
export const AUTH_RATE_LIMIT = {
  window: 10,
  max: 100,
  customRules: {
    '/sign-in/email': { window: 60, max: 5 },
    '/sign-up/email': { window: 60, max: 3 },
    '/request-password-reset': { window: 900, max: 3 },
    '/send-verification-email': { window: 900, max: 3 },
    '/reset-password': { window: 900, max: 5 },
  } as Record<string, RateLimitRule>,
};

export const TOKEN_EXPIRES_IN_SECONDS = 3600;

// "gestinovo://" es el esquema histórico de la app móvil; se conserva sin renombrar.
const DEFAULT_TRUSTED_ORIGINS = ['http://localhost:3000', 'gestinovo://'];

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const origins = env.AUTH_TRUSTED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean);
  return {
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: origins?.length ? origins : DEFAULT_TRUSTED_ORIGINS,
  };
}

export interface CreateAuthOptions {
  database: BetterAuthOptions['database'];
  emailSender: EmailSender;
  config: AuthConfig;
  rateLimit?: { window: number; max: number; customRules: Record<string, RateLimitRule> };
  // Seguimiento de los envíos para un proceso que debe esperarlos antes de terminar (CLI); ver email-dispatches.ts.
  emailDispatches?: EmailDispatchRegistry;
}

const logger = new Logger('BetterAuth');

// Los correos se envían sin esperar la respuesta: el tiempo de respuesta no revela si la cuenta existe.
// Los errores se registran sin destinatario, enlace ni token. El envío se entrega a emailDispatches (si existe)
// para que un proceso que termina por su cuenta pueda esperarlo.
function sendInBackground(emailSender: EmailSender, email: AuthEmail, emailDispatches?: EmailDispatchRegistry): void {
  const dispatch = emailSender.send(email);
  dispatch.catch((error: unknown) => {
    logger.error(`No se pudo enviar un correo de tipo ${email.kind}: ${(error as Error)?.message ?? 'error'}`);
  });
  emailDispatches?.track(email.kind, dispatch);
}

// Código con el que se rechaza la verificación del correo de una cuenta sin contraseña.
export const VERIFICATION_REQUIRES_PASSWORD = 'EMAIL_VERIFICATION_REQUIRES_PASSWORD';

type CredentialLookup = (userId: string) => Promise<{ password?: string | null } | null>;

// DT-12: la cuenta del primer administrador se crea sin credencial y define su contraseña con el enlace de
// recuperación. Hasta entonces no puede verificar su correo: autoSignInAfterVerification le daría una sesión sin
// contraseña (por ejemplo, con un enlace pedido a /send-verification-email, que es público). Better Auth llama a
// este hook antes de marcar el correo como verificado y antes de crear la sesión; lanzar aquí impide ambos.
// Los pacientes no se ven afectados: siempre se crean con contraseña (/sign-up/email).
// Con callbackURL (ya validado por Better Auth contra los orígenes de confianza), se vuelve al cliente web con
// ?error=…, como en sus otros errores de verificación; sin él, 403.
async function rejectVerificationWithoutPassword(findCredential: CredentialLookup, userId: string, request?: Request): Promise<void> {
  if ((await findCredential(userId))?.password) return;
  const callbackURL = request ? new URL(request.url).searchParams.get('callbackURL') : null;
  if (callbackURL && /^https?:\/\//i.test(callbackURL)) {
    const target = new URL(callbackURL);
    target.searchParams.set('error', VERIFICATION_REQUIRES_PASSWORD);
    throw new APIError('FOUND', undefined, new Headers({ location: target.toString() }));
  }
  throw new APIError('FORBIDDEN', {
    code: VERIFICATION_REQUIRES_PASSWORD,
    message: 'Define tu contraseña e inicia sesión para verificar tu correo',
  });
}

export function createAuth({ database, emailSender, config, rateLimit = AUTH_RATE_LIMIT, emailDispatches }: CreateAuthOptions) {
  // Se asigna tras crear la instancia: el hook solo se ejecuta después, al verificar un correo.
  let findCredential: CredentialLookup = async () => null;
  const auth = betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    plugins: [expo()],
    database,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: TOKEN_EXPIRES_IN_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendInBackground(emailSender, { kind: 'password_reset', to: user.email, url }, emailDispatches);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: TOKEN_EXPIRES_IN_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        sendInBackground(emailSender, { kind: 'email_verification', to: user.email, url }, emailDispatches);
      },
      beforeEmailVerification: (user, request) => rejectVerificationWithoutPassword(findCredential, user.id, request),
    },
    // La identidad del paciente (nombre legal, correo) no se modifica por Better Auth (DP-12).
    // /delete-user ya está desactivado por defecto.
    disabledPaths: ['/update-user', '/change-email'],
    rateLimit: { enabled: true, storage: 'memory', ...rateLimit },
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    // Para RNF-07 (2FA) se agregará más adelante el plugin twoFactor de Better Auth.
  });
  findCredential = async (userId) => (await auth.$context).internalAdapter.findCredentialAccount(userId);
  return auth;
}

export type Auth = ReturnType<typeof createAuth>;

export const AUTH_INSTANCE = Symbol('AUTH_INSTANCE');
