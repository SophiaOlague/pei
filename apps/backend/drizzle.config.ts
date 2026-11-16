import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import { assertDrizzleKitCommandAllowed } from './scripts/drizzle-kit-guard';

// R-1: `drizzle-kit migrate` y `push` quedan bloqueados ANTES de leer el .env (generate, studio y check siguen igual).
assertDrizzleKitCommandAllowed(process.argv);

dotenv.config();

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});