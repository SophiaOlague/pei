import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { legalDocumentTypeEnum } from './enums';
import { userProfile } from './identity';
import { appointment } from './appointment';

// Versiona el aviso de privacidad y los T&C; cada cambio crea una fila nueva, nunca se sobrescribe
export const legalDocument = pgTable(
  'legal_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: legalDocumentTypeEnum('type').notNull(),
    version: varchar('version').notNull(),
    content: text('content').notNull(),
    contentHash: varchar('content_hash'),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('legal_document_type_version_uq').on(t.type, t.version)],
);

// RF-24 / RF-25 / RF-26: bitácora de qué versión aceptó cada usuario y cuándo
export const userLegalAcceptance = pgTable(
  'user_legal_acceptance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userProfileId: uuid('user_profile_id').notNull().references(() => userProfile.id),
    legalDocumentId: uuid('legal_document_id').notNull().references(() => legalDocument.id),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => [
    uniqueIndex('user_legal_acceptance_uq').on(t.userProfileId, t.legalDocumentId),
    index('user_legal_acceptance_user_idx').on(t.userProfileId),
  ],
);

// RF-23: consentimiento de acceso al expediente clínico, uno por cita
export const clinicalRecordConsent = pgTable('clinical_record_consent', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().unique().references(() => appointment.id),
  granted: boolean('granted').notNull(),
  scope: jsonb('scope').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  consentTextVersion: varchar('consent_text_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
