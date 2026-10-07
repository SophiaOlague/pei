import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { TEST_EMAIL_DOMAIN, TEST_PREFIX } from './with-rollback';

// Cuenta, con consultas de solo lectura, los registros que las pruebas de M00 pudieron haber dejado.
// Cada archivo compara los conteos antes y después: las pruebas solo escriben dentro de transacciones que se revierten.
export async function countM00Residue(): Promise<Record<string, number>> {
  const prefix = `${TEST_PREFIX}%`;
  const { rows } = await db.execute<Record<string, string>>(sql`
    select
      (select count(*) from medication where name like ${prefix}) as medication,
      (select count(*) from "user" where email like ${'%@' + TEST_EMAIL_DOMAIN}) as "user",
      (select count(*) from legal_document where version like ${prefix}) as legal_document,
      (select count(*) from audit_log where action like ${prefix}) as audit_log,
      (select count(*) from cancellation_policy cp
         join user_profile up on up.id = cp.created_by
         join "user" u on u.id = up.user_id
        where u.email like ${'%@' + TEST_EMAIL_DOMAIN}) as cancellation_policy
  `);
  return Object.fromEntries(Object.entries(rows[0]).map(([table, count]) => [table, Number(count)]));
}

// M02: conteos totales (solo lectura) de las tablas de Identity, para comparar antes y después de cada archivo.
export async function countM02Residue(): Promise<Record<string, number>> {
  const { rows } = await db.execute<Record<string, string>>(sql`
    select
      (select count(*) from user_profile) as user_profile,
      (select count(*) from user_profile where role = 'admin') as admins,
      (select count(*) from patient_profile) as patient_profile,
      (select count(*) from patient_identity_verification) as patient_identity_verification,
      (select count(*) from legal_document) as legal_document,
      (select count(*) from user_legal_acceptance) as user_legal_acceptance,
      (select count(*) from audit_log where action like 'identity.%') as identity_audit_log
  `);
  return Object.fromEntries(Object.entries(rows[0]).map(([table, count]) => [table, Number(count)]));
}
