import { Global, Module } from '@nestjs/common';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';
import * as schema from '../db/schema';
import { SESSION_PROVIDER } from './ports/session-provider';
import { ACTOR_PROFILE_READER } from './ports/actor-profile-reader';
import { BetterAuthSessionProvider } from './better-auth-session.provider';
import { DrizzleActorProfileReader } from './drizzle-actor-profile.reader';
import { SessionGuard } from './session.guard';
import { RolesGuard } from './roles.guard';
import { AUTH_INSTANCE, createAuth, loadAuthConfig } from './auth.config';
import { EMAIL_DISPATCHES, EmailDispatchRegistry } from './email-dispatches';
import { EMAIL_SENDER, type EmailSender } from '../modules/identity/application/ports/email-sender';
import { loadResendConfig, ResendEmailSender } from '../modules/identity/infrastructure/email/resend-email-sender';

// Global para que cualquier controller pueda usar @UseGuards(SessionGuard, RolesGuard).
// AUTH_INSTANCE es la instancia de Better Auth (fábrica createAuth); las pruebas la reemplazan por una
// con el adaptador en memoria.
@Global()
@Module({
  providers: [
    { provide: EMAIL_SENDER, useFactory: () => new ResendEmailSender(loadResendConfig()) },
    // Sin registro activo no guarda nada; solo los CLI lo activan para esperar los correos (email-dispatches.ts).
    { provide: EMAIL_DISPATCHES, useValue: new EmailDispatchRegistry() },
    {
      provide: AUTH_INSTANCE,
      inject: [EMAIL_SENDER, EMAIL_DISPATCHES],
      useFactory: (emailSender: EmailSender, emailDispatches: EmailDispatchRegistry) =>
        createAuth({
          database: drizzleAdapter(db, {
            provider: 'pg',
            schema: { user: schema.user, account: schema.account, session: schema.session, verification: schema.verification },
          }),
          emailSender,
          config: loadAuthConfig(),
          emailDispatches,
        }),
    },
    { provide: SESSION_PROVIDER, useClass: BetterAuthSessionProvider },
    { provide: ACTOR_PROFILE_READER, useClass: DrizzleActorProfileReader },
    SessionGuard,
    RolesGuard,
  ],
  exports: [AUTH_INSTANCE, EMAIL_SENDER, EMAIL_DISPATCHES, SESSION_PROVIDER, ACTOR_PROFILE_READER, SessionGuard, RolesGuard],
})
export class AuthModule {}
