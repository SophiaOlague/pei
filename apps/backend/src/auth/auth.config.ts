// src/auth/auth.config.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { expo } from '@better-auth/expo';
import { db } from '../db';
import * as schema from '../db/schema';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: ['http://localhost:3000', 'gestinovo://'],
  plugins: [expo()],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.user,
      account: schema.account,
      session: schema.session,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  // Para RNF-07 (2FA) lo agregamos más adelante con el plugin twoFactor de Better Aut
});