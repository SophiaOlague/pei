import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { cancellationPolicy, medication, user, userProfile } from '../../src/db/schema';
import type { Role } from '../../src/common/domain/role';
import { TEST_EMAIL_DOMAIN, testTag, type Tx } from './with-rollback';

// Datos controlados para pruebas de integración. Solo deben usarse dentro de withRollback.

// Fechas para versiones de prueba de cancellation_policy que no se solapan con ninguna política real.
// Se toman del año anterior a la vigencia más antigua existente: una política real con vigencia abierta
// (effective_until nulo) cubre todo lo posterior a su inicio, pero nada anterior. Solo lectura.
export async function policyDatesBeforeExisting(): Promise<(day: number) => Date> {
  const [row] = await db
    .select({ earliest: sql<string | null>`min(${cancellationPolicy.effectiveFrom})` })
    .from(cancellationPolicy);
  const limit = row?.earliest ? new Date(row.earliest) : new Date();
  const start = Date.UTC(limit.getUTCFullYear() - 1, 0, 1);
  return (day) => new Date(start + (day - 1) * 86_400_000);
}

export async function insertMedication(tx: Tx, name = testTag()) {
  const [row] = await tx.insert(medication).values({ name }).returning();
  return row;
}

export async function insertUserWithProfile(tx: Tx, role: Role) {
  const tag = testTag();
  const [authUser] = await tx
    .insert(user)
    .values({ id: tag, name: 'Usuario de prueba M00', email: `${tag}@${TEST_EMAIL_DOMAIN}` })
    .returning();
  const [profile] = await tx
    .insert(userProfile)
    .values({ userId: authUser.id, role, firstName: 'Prueba', lastName: 'M00' })
    .returning();
  return { user: authUser, profile };
}
