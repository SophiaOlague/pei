import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, boolean, timestamp, index, uniqueIndex, unique, check } from 'drizzle-orm/pg-core';

// M03 D-5, D-26, D-33, D-34, R-4, Z-2: catálogo de especialidades que configura el admin.
// `code` es inmutable y `name` es único sin distinguir mayúsculas. Nunca se elimina: se desactiva (Z-2).
// Los triggers que bloquean DELETE y TRUNCATE y hacen `code` inmutable llegan con 0012 (fase B3).
export const specialty = pgTable(
  'specialty',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 50 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('specialty_code_unique').on(t.code),
    check('specialty_code_format_chk', sql`${t.code} ~ '^[a-z][a-z0-9_]{1,49}$'`),
    check('specialty_name_chk', sql`char_length(btrim(${t.name})) BETWEEN 1 AND 100`),
    check(
      'specialty_active_chk',
      sql`(${t.isActive} AND ${t.deactivatedAt} IS NULL) OR (NOT ${t.isActive} AND ${t.deactivatedAt} IS NOT NULL)`,
    ),
    uniqueIndex('specialty_name_lower_uq').using('btree', sql`lower(${t.name})`),
    index('specialty_active_idx').on(t.isActive),
  ],
);
