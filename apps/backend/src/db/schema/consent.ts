import { pgTable, pgEnum, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { userProfile } from './identity';
import { appointment } from './appointment';

export const legalDocumentTypeEnum = pgEnum('legal_document_type_enum', [
  'privacy_notice',
  'terms_and_conditions',
]);

// Versiona el aviso de privacidad y los T&C; cada cambio crea una fila nueva, nunca se sobrescribe
export const legalDocument = pgTable('legal_document', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: legalDocumentTypeEnum('type').notNull(),
  version: varchar('version').notNull(),
  content: text('content').notNull(),
  publishedAt: timestamp('published_at').notNull().defaultNow(),
});

// RF-24 / RF-25 / RF-26: bitácora de qué versión aceptó cada usuario y cuándo
export const userLegalAcceptance = pgTable('user_legal_acceptance', {
  id: uuid('id').primaryKey().defaultRandom(),
  userProfileId: uuid('user_profile_id').notNull().references(() => userProfile.id),
  legalDocumentId: uuid('legal_document_id').notNull().references(() => legalDocument.id),
  acceptedAt: timestamp('accepted_at').notNull().defaultNow(),
});

// RF-23: consentimiento de acceso al expediente clínico, uno por cita
export const clinicalRecordConsent = pgTable('clinical_record_consent', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().unique().references(() => appointment.id),
  granted: boolean('granted').notNull(),
  grantedAt: timestamp('granted_at').notNull().defaultNow(),
});