// Ejecutor de migraciones EXCLUSIVO de C2 (rama br-shy-pond-b50a3m8f). Ver scripts/c2-migrate-core.ts.
//
//   npx ts-node --transpile-only scripts/c2-migrate.ts            verifica destino y plan (sin escribir)
//   npx ts-node --transpile-only scripts/c2-migrate.ts --apply    aplica SOLO la siguiente migración pendiente
//
// No carga ningún archivo de entorno del backend ni variables heredadas: la URL sale solo del archivo de C2. Una única
// conexión (Client, no Pool) sirve para verificar la identidad y para migrar, así que la sesión verificada es la que
// escribe. El migrador es el de drizzle-orm (el mismo que usa drizzle-kit migrate): journal, hashes y tabla
// drizzle.__drizzle_migrations del proyecto.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { C2MigrateError, runC2Migrate, type AppliedMigration, type JournalEntry, type RuntimeIdentity } from './c2-migrate-core';

const C2_ENV_FILE = 'C:\\pei-c2\\.env.c2';
const MIGRATIONS = join(__dirname, '..', 'src', 'db', 'migrations');

neonConfig.webSocketConstructor = ws;

async function main() {
  const apply = process.argv.slice(2).includes('--apply');
  const result = await runC2Migrate({
    readEnvFile: () => {
      try {
        return readFileSync(C2_ENV_FILE, 'utf8');
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
          if (!rows[0].present) throw new C2MigrateError('no existe drizzle.__drizzle_migrations');
          return (await client.query('select hash, created_at::text as created_at from drizzle.__drizzle_migrations order by created_at, id')).rows as AppliedMigration[];
        },
        // El migrador de Drizzle aplica TODO lo pendiente de su carpeta: se le entrega una carpeta temporal (fuera del
        // repositorio) cuyo journal termina en la siguiente migración, con copias exactas de sus SQL.
        migrate: async (entries) => {
          const dir = mkdtempSync(join(tmpdir(), 'pei-c2-migrate-'));
          try {
            const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8')) as { entries: JournalEntry[] };
            const limited = journal.entries.slice(0, entries.length);
            if (limited.length !== entries.length || limited.some((e, i) => e.tag !== entries[i].tag || e.when !== entries[i].when)) {
              throw new C2MigrateError('el journal cambió durante la ejecución');
            }
            mkdirSync(join(dir, 'meta'));
            writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify({ ...journal, entries: limited }, null, 2));
            for (const e of limited) copyFileSync(join(MIGRATIONS, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
            await migrate(drizzle({ client }), { migrationsFolder: dir });
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        },
        close: () => client.end(),
      };
    },
    log: (line) => console.log(line),
  }, apply);
  return result.applied || !apply ? 0 : 1;
}

main().then((code) => process.exit(code), (error: Error) => {
  // Nunca se imprime la URL: los mensajes del núcleo no la incluyen y aquí solo se muestra el mensaje.
  console.error(error instanceof C2MigrateError ? error.message : `c2-migrate falló: ${error.message}`);
  process.exit(1);
});
