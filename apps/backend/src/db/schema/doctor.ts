import { pgTable, uuid, varchar, text, timestamp, time, integer, numeric, index } from 'drizzle-orm/pg-core';
import { specialtyEnum, membershipStatusEnum, doctorVerificationStatusEnum } from './enums';
import { userProfile } from './identity';

export const doctorProfile = pgTable('doctor_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  userProfileId: uuid('user_profile_id').notNull().unique().references(() => userProfile.id),
  specialty: specialtyEnum('specialty').notNull(),
  licenseNumber: varchar('license_number').notNull().unique(),
  licenseDocumentUrl: text('license_document_url'),
  bio: text('bio'),
  photoUrl: text('photo_url'),
  membershipStatus: membershipStatusEnum('membership_status').notNull(),
  verificationStatus: doctorVerificationStatusEnum('verification_status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => userProfile.id),
  reviewedAt: timestamp('reviewed_at'),
  rejectionReason: text('rejection_reason'),
  ratingAvg: numeric('rating_avg').notNull().default('0'),
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
  (table) => ({
    doctorIdx: index('doctor_availability_doctor_idx').on(table.doctorId),
  }),
);

export const doctorTimeOff = pgTable('doctor_time_off', {
  id: uuid('id').primaryKey().defaultRandom(),
  doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at').notNull(),
  reason: varchar('reason'),
});