import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { specialty } from '../../../../db/schema';
import type { SpecialtyRecord, SpecialtyRepository } from '../../application/ports/specialty.repository';

const COLUMNS = {
  id: specialty.id,
  code: specialty.code,
  name: specialty.name,
  isActive: specialty.isActive,
  deactivatedAt: specialty.deactivatedAt,
  createdAt: specialty.createdAt,
  updatedAt: specialty.updatedAt,
};

@Injectable()
export class DrizzleSpecialtyRepository implements SpecialtyRepository {
  async listActive(): Promise<SpecialtyRecord[]> {
    return getDbContext().select(COLUMNS).from(specialty).where(eq(specialty.isActive, true)).orderBy(asc(specialty.name));
  }

  async listAll(): Promise<SpecialtyRecord[]> {
    return getDbContext().select(COLUMNS).from(specialty).orderBy(asc(specialty.name));
  }

  async lockById(id: string): Promise<SpecialtyRecord | null> {
    const [row] = await getDbContext().select(COLUMNS).from(specialty).where(eq(specialty.id, id)).for('update').limit(1);
    return row ?? null;
  }

  async findById(id: string): Promise<SpecialtyRecord | null> {
    const [row] = await getDbContext().select(COLUMNS).from(specialty).where(eq(specialty.id, id)).limit(1);
    return row ?? null;
  }

  async lockForShare(id: string): Promise<SpecialtyRecord | null> {
    const [row] = await getDbContext().select(COLUMNS).from(specialty).where(eq(specialty.id, id)).for('share').limit(1);
    return row ?? null;
  }

  async create(input: { code: string; name: string }): Promise<SpecialtyRecord> {
    const [row] = await getDbContext().insert(specialty).values(input).returning(COLUMNS);
    return row;
  }

  async updateName(id: string, name: string): Promise<SpecialtyRecord | null> {
    const [row] = await getDbContext()
      .update(specialty)
      .set({ name, updatedAt: sql`now()` })
      .where(eq(specialty.id, id))
      .returning(COLUMNS);
    return row ?? null;
  }

  async setActive(id: string, active: boolean): Promise<SpecialtyRecord | null> {
    const [row] = await getDbContext()
      .update(specialty)
      .set({ isActive: active, deactivatedAt: active ? null : sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(specialty.id, id), eq(specialty.isActive, !active)))
      .returning(COLUMNS);
    return row ?? null;
  }
}
