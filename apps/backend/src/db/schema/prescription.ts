import { pgTable, uuid, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { deliveryMethodEnum, redemptionStatusEnum, dispensationStatusEnum } from './enums';
import { medicalRecord } from './clinical-record';
import { doctorProfile } from './doctor';
import { appointment } from './appointment';
import { medication, organization } from './organization';
import { userProfile } from './identity';

export const prescription = pgTable('prescription', {
  id: uuid('id').primaryKey().defaultRandom(),
  medicalRecordId: uuid('medical_record_id').notNull().references(() => medicalRecord.id),
  doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
  appointmentId: uuid('appointment_id').references(() => appointment.id),
  medicationId: uuid('medication_id').notNull().references(() => medication.id),
  dosage: varchar('dosage').notNull(),
  instructions: text('instructions'),
  enablesPrepPurchase: boolean('enables_prep_purchase').notNull().default(false),
  issuedAt: timestamp('issued_at').notNull().defaultNow(),
  nextRefillAt: timestamp('next_refill_at'),
});

export const treatmentDispensation = pgTable('treatment_dispensation', {
  id: uuid('id').primaryKey().defaultRandom(),
  prescriptionId: uuid('prescription_id').notNull().references(() => prescription.id),
  organizationId: uuid('organization_id').references(() => organization.id),
  deliveryMethod: deliveryMethodEnum('delivery_method').notNull(),
  shippingAddress: text('shipping_address'),
  redemptionCode: varchar('redemption_code').unique(),
  redemptionStatus: redemptionStatusEnum('redemption_status').notNull().default('not_applicable'),
  redeemedByOrgId: uuid('redeemed_by_org_id').references(() => organization.id),
  redeemedAt: timestamp('redeemed_at'),
  expiresAt: timestamp('expires_at'),
  packedBy: uuid('packed_by').references(() => userProfile.id),
  shippedAt: timestamp('shipped_at'),
  trackingNumber: varchar('tracking_number'),
  dispensedAt: timestamp('dispensed_at'),
  status: dispensationStatusEnum('status').notNull().default('pending'),
});