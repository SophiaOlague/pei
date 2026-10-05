import { pgTable, uuid, text, varchar, date, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { roleEnum, auditActorTypeEnum } from './enums';
import { user } from './auth';

export const userProfile = pgTable('user_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique().references(() => user.id),
  role: roleEnum('role').notNull(),
  firstName: varchar('first_name').notNull(),
  lastName: varchar('last_name').notNull(),
  phone: varchar('phone'),
  birthDate: date('birth_date'),
  emergencyContactName: varchar('emergency_contact_name'),
  emergencyContactPhone: varchar('emergency_contact_phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Append-only desde la aplicación; proteger contra UPDATE/DELETE en la base de datos.
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: auditActorTypeEnum('actor_type').notNull(),
    actorUserProfileId: uuid('actor_user_profile_id').references(() => userProfile.id),
    action: varchar('action').notNull(),
    entityType: varchar('entity_type'),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_actor_idx').on(t.actorUserProfileId),
    index('audit_entity_idx').on(t.entityId),
    index('audit_created_at_idx').on(t.createdAt),
    index('audit_action_idx').on(t.action),
  ],
);
