// `pnpm db:migrate` ya no ejecuta migraciones (R-1): solo muestra cómo usar los ejecutores controlados.
import { MIGRATE_INSTRUCTIONS } from './drizzle-kit-guard';

console.error(MIGRATE_INSTRUCTIONS);
process.exitCode = 1;
