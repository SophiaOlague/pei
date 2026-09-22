import { pgTable, uuid, varchar, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { organizationTypeEnum } from './enums';
import { userProfile } from './identity';

export const organization = pgTable('organization', {
  id: uuid('id').primaryKey().defaultRandom(),
  userProfileId: uuid('user_profile_id').notNull().unique().references(() => userProfile.id),
  name: varchar('name').notNull(),
  type: organizationTypeEnum('type').notNull(),
  address: text('address'),
  contactEmail: varchar('contact_email'),
  contactPhone: varchar('contact_phone'),
  photoUrl: text('photo_url'),
});

export const medication = pgTable('medication', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name').notNull().unique(),
  photoUrl: text('photo_url'),
});

export const organizationInventory = pgTable(
  'organization_inventory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').notNull().references(() => organization.id),
    medicationId: uuid('medication_id').notNull().references(() => medication.id),
    quantityAvailable: integer('quantity_available').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('org_inventory_org_idx').on(table.organizationId),
  }),
);