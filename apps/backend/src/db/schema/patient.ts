import { pgTable, uuid, varchar, text } from 'drizzle-orm/pg-core';
import { riskLevelEnum } from './enums';
import { userProfile } from './identity';

export const patientProfile = pgTable('patient_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  userProfileId: uuid('user_profile_id').notNull().unique().references(() => userProfile.id),
  curp: varchar('curp').unique(),
  address: text('address'),
  riskLevel: riskLevelEnum('risk_level'),
  photoUrl: text('photo_url'),
  ineFrontUrl: text('ine_front_url'), // foto del INE, lado frontal
  ineBackUrl: text('ine_back_url'),   // foto del INE, lado reverso
});