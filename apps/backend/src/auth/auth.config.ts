import { Logger } from '@nestjs/common';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { expo } from '@better-auth/expo';
import type { AuthEmail, EmailSender } from '../modules/identity/application/ports/email-sender';

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
}

const logger = new Logger('BetterAuth');

// Los correos se envían sin esperar la respuesta: el tiempo de respuesta no revela si la cuenta existe.
// Los errores se registran sin destinatario, enlace ni token.
function sendInBackground(emailSender: EmailSender, email: AuthEmail): void {
  emailSender.send(email).catch((error: unknown) => {
    logger.error(`No se pudo enviar un correo de tipo ${email.kind}: ${(error as Error)?.message ?? 'error'}`);
  });
}

export function createAuth({ database, emailSender, config, rateLimit = AUTH_RATE_LIMIT }: CreateAuthOptions) {
  return betterAuth({
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
        sendInBackground(emailSender, { kind: 'password_reset', to: user.email, url });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: TOKEN_EXPIRES_IN_SECONDS,
      sendVerificationEmail: async ({ user, url }) => {
        sendInBackground(emailSender, { kind: 'email_verification', to: user.email, url });
      },
    },
    // La identidad del paciente (nombre legal, correo) no se modifica por Better Auth (DP-12).
    // /delete-user ya está desactivado por defecto.
    disabledPaths: ['/update-user', '/change-email'],
    rateLimit: { enabled: true, storage: 'memory', ...rateLimit },
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
    // Para RNF-07 (2FA) se agregará más adelante el plugin twoFactor de Better Auth.
  });
}

export type Auth = ReturnType<typeof createAuth>;

export const AUTH_INSTANCE = Symbol('AUTH_INSTANCE');
