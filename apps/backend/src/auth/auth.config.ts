// src/auth/auth.config.ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db';
import * as schema from '../db/schema';
import { userProfile, patientProfile } from '../db/schema';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    'http://localhost:3000', // backend mismo (pruebas)
    'http://localhost:3001', // ajusta al puerto real de tu Next.js cuando lo tengas
    // agrega aquí el esquema de tu app Expo cuando lo conectes, ej. 'exp://192.168.x.x:8081'
  ],
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
   databaseHooks: {
    user: {
      create: {
        after: async (user, ctx) => {
          // El rol viene en el body original del sign-up, no en el objeto `user` creado por Better Auth
          const role = (ctx?.body as any)?.role ?? 'patient';

          const [profile] = await db
            .insert(userProfile)
            .values({
              userId: user.id,
              role: role as 'patient' | 'doctor' | 'admin' | 'organization',
            })
            .returning();

          if (role === 'patient') {
            await db.insert(patientProfile).values({
              userProfileId: profile.id,
            });
          }
        },
      },
    },
  },
  // Para RNF-07 (2FA) lo agregamos más adelante con el plugin twoFactor de Better Auth
});