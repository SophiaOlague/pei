import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { userProfile } from './identity';
import { patientProfile } from './patient';
import { doctorProfile } from './doctor';
import { appointment } from './appointment';

export const medicalRecord = pgTable('medical_record', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().unique().references(() => patientProfile.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Inmutable cuando locked_at no es nulo (RNF-02); se refuerza con trigger en la migración.
export const medicalRecordEntry = pgTable(
  'medical_record_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicalRecordId: uuid('medical_record_id').notNull().references(() => medicalRecord.id),
    appointmentId: uuid('appointment_id').references(() => appointment.id),
    authoredBy: uuid('authored_by').notNull().references(() => doctorProfile.id),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
  },
  (t) => [
    index('medical_record_entry_record_idx').on(t.medicalRecordId),
    index('medical_record_entry_appointment_idx').on(t.appointmentId),
    index('medical_record_entry_author_idx').on(t.authoredBy),
  ],
);

export const labDocument = pgTable(
  'lab_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicalRecordId: uuid('medical_record_id').notNull().references(() => medicalRecord.id),
    fileUrl: text('file_url').notNull(),
    uploadedByUserProfileId: uuid('uploaded_by_user_profile_id').references(() => userProfile.id),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('lab_document_record_idx').on(t.medicalRecordId)],
);
