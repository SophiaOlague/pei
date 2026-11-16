// Ejecutor de migraciones EXCLUSIVO de DESARROLLO (rama br-royal-recipe-b54s5hnn). Ver scripts/dev-migrate-core.ts.
//
//   npx ts-node --transpile-only scripts/dev-migrate.ts            verifica destino y plan (sin escribir)
//   npx ts-node --transpile-only scripts/dev-migrate.ts --apply    aplica SOLO la siguiente migración pendiente
//
// Lee DATABASE_URL solo del contenido de apps/backend/.env (sin dotenv ni process.env; nunca .env.c2) y no la imprime.
// Una única conexión (Client, no Pool) sirve para verificar la identidad y para migrar, así que la sesión verificada es
// la que escribe. El migrador es el de drizzle-orm, sobre una carpeta temporal con el journal hasta la siguiente.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { readConnectionFingerprint } from './migration-authorization';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import type { AppliedMigration, JournalEntry, RuntimeIdentity } from './c2-migrate-core';
import { DevMigrateError, runDevMigrate } from './dev-migrate-core';

const DEV_ENV_FILE = join(__dirname, '..', '.env');
const MIGRATIONS = join(__dirname, '..', 'src', 'db', 'migrations');

neonConfig.webSocketConstructor = ws;

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const result = await runDevMigrate({
    readEnvFile: () => {
      try {
        return readFileSync(DEV_ENV_FILE, 'utf8');
      } catch {
        return null;
      }
    },
    readJournal: () => (JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] }).entries,
    readSql: (tag) => readFileSync(join(MIGRATIONS, `${tag}.sql`), 'utf8'),
    connect: async (url) => {
      const client = new Client({ connectionString: url });
      await client.connect();
      return {
        identity: async () => {
          await client.query('begin transaction read only');
          try {
            const { rows } = await client.query(`select current_setting('neon.project_id', true) as project,
              current_setting('neon.branch_id', true) as branch, current_setting('neon.endpoint_id', true) as endpoint`);
            return rows[0] as RuntimeIdentity;
          } finally {
            await client.query('rollback');
          }
        },
        applied: async () => {
          const { rows } = await client.query(`select to_regclass('drizzle.__drizzle_migrations') is not null as present`);
          if (!rows[0].present) throw new DevMigrateError('no existe drizzle.__drizzle_migrations');
          return (await client.query('select hash, created_at::text as created_at from drizzle.__drizzle_migrations order by created_at, id')).rows as AppliedMigration[];
        },
        // El migrador de Drizzle aplica TODO lo pendiente de su carpeta: se le entrega una carpeta temporal (fuera del
        // repositorio) cuyo journal termina en la siguiente migración, con copias exactas de sus SQL.
        migrate: async (entries) => {
          const dir = mkdtempSync(join(tmpdir(), 'pei-dev-migrate-'));
          try {
            const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] };
            const limited = journal.entries.slice(0, entries.length);
            if (limited.length !== entries.length || limited.some((e, i) => e.tag !== entries[i].tag || e.when !== entries[i].when)) {
              throw new DevMigrateError('el journal cambió durante la ejecución');
            }
            mkdirSync(join(dir, 'meta'));
            writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: limited }, null, 2));
            for (const e of limited) copyFileSync(join(MIGRATIONS, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
            await migrate(drizzle({ client }), { migrationsFolder: dir });
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        },
        // R-1: huella de 8 componentes en ESTA conexión (solo lectura) y consultas de la autorización de sesión.
        fingerprint: async (u) => {
          await client.query('begin transaction read only');
          try {
            return await readConnectionFingerprint(async (t) => (await client.query(t)).rows as Record<string, unknown>[], u);
          } finally {
            await client.query('rollback');
          }
        },
        query: async (t) => (await client.query(t)).rows as Record<string, unknown>[],
        close: () => client.end(),
      };
    },
    log: (line) => console.log(line),
  }, apply);
  return result.applied || !apply ? 0 : 1;
}

main().then((code) => process.exit(code), (error: Error) => {
  // Nunca se imprime la URL: los mensajes del núcleo no la incluyen y aquí solo se muestra el mensaje.
  console.error(error instanceof DevMigrateError ? error.message : `dev-migrate falló: ${error.message}`);
  process.exit(1);
});
