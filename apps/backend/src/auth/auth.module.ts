import { Global, Module } from '@nestjs/common';
import { SESSION_PROVIDER } from './ports/session-provider';
import { ACTOR_PROFILE_READER } from './ports/actor-profile-reader';
import { BetterAuthSessionProvider } from './better-auth-session.provider';
import { DrizzleActorProfileReader } from './drizzle-actor-profile.reader';
import { SessionGuard } from './session.guard';
import { RolesGuard } from './roles.guard';

// Global para que cualquier controller pueda usar @UseGuards(SessionGuard, RolesGuard).
@Global()
@Module({
  providers: [
    { provide: SESSION_PROVIDER, useClass: BetterAuthSessionProvider },
    { provide: ACTOR_PROFILE_READER, useClass: DrizzleActorProfileReader },
    SessionGuard,
    RolesGuard,
  ],
  exports: [SESSION_PROVIDER, ACTOR_PROFILE_READER, SessionGuard, RolesGuard],
})
export class AuthModule {}
