import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { getDbContext } from '../db/transaction-context';
import { userProfile } from '../db/schema';
import type { ActorProfile, ActorProfileReader } from './ports/actor-profile-reader';

@Injectable()
export class DrizzleActorProfileReader implements ActorProfileReader {
  async findByUserId(userId: string): Promise<ActorProfile | null> {
    const [row] = await getDbContext()
      .select({ userProfileId: userProfile.id, role: userProfile.role })
      .from(userProfile)
      .where(eq(userProfile.userId, userId))
      .limit(1);
    return row ?? null;
  }
}
