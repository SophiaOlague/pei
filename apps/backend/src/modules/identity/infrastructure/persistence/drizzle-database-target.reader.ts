import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import type { DatabaseTargetReader } from '../../application/ports/legal-document.repository';
import type { ObservedDatabaseTarget } from '../../domain/legal-publication';

const GUCS: Record<string, 'branch' | 'endpoint' | 'project'> = { 'neon.branch_id': 'branch', 'neon.endpoint_id': 'endpoint', 'neon.project_id': 'project' };

function urlEndpoint(): string | null {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname.split('.')[0].replace(/-pooler$/, '') || null;
  } catch {
    return null;
  }
}

// La identidad sale de pg_settings (la BD conectada), como en C2, y se contrasta con el host de DATABASE_URL.
@Injectable()
export class DrizzleDatabaseTargetReader implements DatabaseTargetReader {
  async read(): Promise<ObservedDatabaseTarget> {
    const { rows } = await getDbContext().execute<{ name: string; setting: string }>(sql`
      select name, setting from pg_settings where name in ('neon.branch_id', 'neon.endpoint_id', 'neon.project_id')`);
    const observed: ObservedDatabaseTarget = { branch: null, endpoint: null, project: null, urlEndpoint: urlEndpoint() };
    for (const row of rows) observed[GUCS[row.name]] = row.setting;
    return observed;
  }
}
