import { pgTable, uuid, varchar, text, timestamp, numeric, integer, index } from 'drizzle-orm/pg-core';
import { appointmentTypeEnum, appointmentStatusEnum, meetingStatusEnum } from './enums';
import { patientProfile } from './patient';
import { doctorProfile } from './doctor';

export const appointment = pgTable(
  'appointment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id').notNull().references(() => patientProfile.id),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    type: appointmentTypeEnum('type').notNull(),
    status: appointmentStatusEnum('status').notNull(),
    scheduledAt: timestamp('scheduled_at').notNull(),
    reason: varchar('reason').notNull(),
    notes: text('notes'),
    cancellationReason: text('cancellation_reason'),
    price: numeric('price').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    doctorIdx: index('appointment_doctor_idx').on(table.doctorId),
    patientIdx: index('appointment_patient_idx').on(table.patientId),
    scheduledAtIdx: index('appointment_scheduled_at_idx').on(table.scheduledAt),
  }),
);

export const meeting = pgTable('meeting', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().unique().references(() => appointment.id),
  roomId: varchar('room_id').notNull().unique(),
  status: meetingStatusEnum('status').notNull().default('scheduled'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  recordingUrl: text('recording_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const review = pgTable('review', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().unique().references(() => appointment.id),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});