import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, timestamp, time, integer, numeric, index, check } from 'drizzle-orm/pg-core';
import { specialtyEnum, doctorVerificationStatusEnum } from './enums';
import { userProfile } from './identity';

export const doctorProfile = pgTable('doctor_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  userProfileId: uuid('user_profile_id').notNull().unique().references(() => userProfile.id),
  specialty: specialtyEnum('specialty').notNull(),
  licenseNumber: varchar('license_number').notNull().unique(),
  licenseDocumentUrl: text('license_document_url'),
  bio: text('bio'),
  photoUrl: text('photo_url'),
  verificationStatus: doctorVerificationStatusEnum('verification_status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => userProfile.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  appointmentDurationMinutes: integer('appointment_duration_minutes').notNull().default(30),
  ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const doctorAvailability = pgTable(
  'doctor_availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    weekday: integer('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [
    index('doctor_availability_doctor_idx').on(t.doctorId),
    index('doctor_availability_doctor_weekday_idx').on(t.doctorId, t.weekday),
    check('doctor_availability_range_chk', sql`${t.endTime} > ${t.startTime}`),
  ],
);

export const doctorTimeOff = pgTable(
  'doctor_time_off',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    reason: varchar('reason'),
  },
  (t) => [
    index('doctor_time_off_doctor_idx').on(t.doctorId),
    index('doctor_time_off_start_idx').on(t.startsAt),
    check('doctor_time_off_range_chk', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
