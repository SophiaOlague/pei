import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { userProfile as userProfileTable } from '../../../../db/schema';
import type { UserProfileRepository } from '../../domain/repositories/user-profile.repository';
import { UserProfile } from '../../domain/entities/user-profile.entity';

@Injectable()
export class DrizzleUserProfileRepository implements UserProfileRepository {
  async create(input: {
    userId: string;
    role: 'patient' | 'doctor' | 'admin' | 'organization';
    firstName: string;
    lastName: string;
    phone?: string;
    birthDate?: string;
  }): Promise<UserProfile> {
    const [row] = await getDbContext()
      .insert(userProfileTable)
      .values(input)
      .returning();
    return new UserProfile(row.id, row.userId, row.role, row.firstName, row.lastName);
  }

  async existsByUserId(userId: string): Promise<boolean> {
    const [row] = await getDbContext()
      .select({ id: userProfileTable.id })
      .from(userProfileTable)
      .where(eq(userProfileTable.userId, userId))
      .limit(1);
    return !!row;
  }
}