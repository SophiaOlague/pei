import { pgTable, uuid, varchar, text, timestamp, numeric, boolean, index } from 'drizzle-orm/pg-core';
import { labStatusEnum } from './enums';
import { patientProfile } from './patient';
import { appointment } from './appointment';
import { doctorProfile } from './doctor';

export const medicalRecord = pgTable('medical_record', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().unique().references(() => patientProfile.id),
  bloodType: varchar('blood_type'),
  allergies: text('allergies'),
  diagnosisSummary: text('diagnosis_summary'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// La inmutabilidad real (RNF-02) se refuerza con un trigger de Postgres,
// agregado manualmente en la migración generada (ver paso siguiente).
export const medicalRecordEntry = pgTable(
  'medical_record_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicalRecordId: uuid('medical_record_id').notNull().references(() => medicalRecord.id),
    appointmentId: uuid('appointment_id').references(() => appointment.id),
    authoredBy: uuid('authored_by').notNull().references(() => doctorProfile.id),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    isLocked: boolean('is_locked').notNull().default(false),
  },
  (table) => ({
    recordIdx: index('medical_record_entry_record_idx').on(table.medicalRecordId),
  }),
);

export const labResult = pgTable('lab_result', {
  id: uuid('id').primaryKey().defaultRandom(),
  medicalRecordId: uuid('medical_record_id').notNull().references(() => medicalRecord.id),
  testName: varchar('test_name').notNull(),
  testDate: timestamp('test_date').notNull(),
  value: numeric('value'),
  unit: varchar('unit'),
  referenceRangeLow: numeric('reference_range_low'),
  referenceRangeHigh: numeric('reference_range_high'),
  status: labStatusEnum('status').notNull(),
  fileUrl: text('file_url'),
});