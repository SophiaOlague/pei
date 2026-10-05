import { pgTable, uuid, varchar, text, numeric, integer, timestamp } from 'drizzle-orm/pg-core';
import {
  riskLevelEnum,
  identityVerificationStatusEnum,
  smokingStatusEnum,
  alcoholConsumptionEnum,
  physicalActivityEnum,
} from './enums';
import { userProfile } from './identity';

export const patientProfile = pgTable('patient_profile', {
  id: uuid('id').primaryKey().defaultRandom(),
  userProfileId: uuid('user_profile_id').notNull().unique().references(() => userProfile.id),
  curp: varchar('curp').unique(),
  address: text('address'),
  riskLevel: riskLevelEnum('risk_level'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Fotos del INE y su revisión por el administrador.
export const patientIdentityVerification = pgTable('patient_identity_verification', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().unique().references(() => patientProfile.id),
  ineFrontUrl: text('ine_front_url').notNull(),
  ineBackUrl: text('ine_back_url').notNull(),
  status: identityVerificationStatusEnum('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => userProfile.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const patientHealthSummary = pgTable('patient_health_summary', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().unique().references(() => patientProfile.id),
  bloodType: varchar('blood_type'),
  allergies: text('allergies'),
  medicalConditions: text('medical_conditions'),
  smokingStatus: smokingStatusEnum('smoking_status'),
  alcoholConsumption: alcoholConsumptionEnum('alcohol_consumption'),
  physicalActivity: physicalActivityEnum('physical_activity'),
  weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
  heightM: numeric('height_m', { precision: 4, scale: 2 }),
  systolicPressure: integer('systolic_pressure'),
  diastolicPressure: integer('diastolic_pressure'),
  heartRateBpm: integer('heart_rate_bpm'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
