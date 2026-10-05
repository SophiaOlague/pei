import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core';
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
