import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { userProfile } from '../../../../db/schema';
import type { UserProfileRecord, UserProfileRepository } from '../../application/ports/user-profile.repository';

// Clave del bloqueo consultivo que serializa los bootstraps de administrador (DT-12).
const ADMIN_BOOTSTRAP_LOCK = 'pei.identity.admin_bootstrap';

@Injectable()
export class DrizzleUserProfileRepository implements UserProfileRepository {
  async findByUserId(userId: string): Promise<UserProfileRecord | null> {
    const [row] = await getDbContext()
      .select({ id: userProfile.id, role: userProfile.role })
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async existsByCurp(curp: string): Promise<boolean> {
    const [row] = await getDbContext()
      .select({ id: userProfile.id })
      .from(userProfile)
      .where(eq(userProfile.curp, curp))
      .limit(1);
    return !!row;
  }

  async createPatient(input: {
    userId: string;
    firstName: string;
    lastName: string;
    curp: string;
    birthDate: string;
    phone: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  }): Promise<string> {
    const [row] = await getDbContext()
      .insert(userProfile)
      .values({ ...input, role: 'patient' })
      .returning({ id: userProfile.id });
    return row.id;
  }

  async createAdmin(input: { userId: string; firstName: string; lastName: string }): Promise<string> {
    const [row] = await getDbContext()
      .insert(userProfile)
      .values({ ...input, role: 'admin' })
      .returning({ id: userProfile.id });
    return row.id;
  }

  // Se libera al terminar la transacción (commit o rollback).
  async lockAdminBootstrap(): Promise<void> {
    await getDbContext().execute(sql`select pg_advisory_xact_lock(hashtext(${ADMIN_BOOTSTRAP_LOCK}))`);
  }

  async adminExists(): Promise<boolean> {
    const [row] = await getDbContext()
      .select({ id: userProfile.id })
      .from(userProfile)
      .where(eq(userProfile.role, 'admin'))
      .limit(1);
    return !!row;
  }
}
