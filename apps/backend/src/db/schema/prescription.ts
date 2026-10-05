import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, integer, boolean, timestamp, jsonb, index, check } from 'drizzle-orm/pg-core';
import {
  prescriptionStatusEnum,
  prescriptionSignatureStatusEnum,
  prescriptionFulfillmentStatusEnum,
} from './enums';
import { doctorProfile } from './doctor';
import { appointment } from './appointment';
import { medicalRecord } from './clinical-record';
import { medicationPresentation } from './inventory';
import { medicationOrderItem } from './order';

export const prescription = pgTable(
  'prescription',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicalRecordId: uuid('medical_record_id').notNull().references(() => medicalRecord.id),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    appointmentId: uuid('appointment_id').references(() => appointment.id),
    status: prescriptionStatusEnum('status').notNull().default('draft'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    instructions: text('instructions'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('prescription_record_idx').on(t.medicalRecordId),
    index('prescription_doctor_idx').on(t.doctorId),
    index('prescription_appointment_idx').on(t.appointmentId),
    index('prescription_status_idx').on(t.status),
    index('prescription_valid_until_idx').on(t.validUntil),
  ],
);

export const prescriptionItem = pgTable(
  'prescription_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prescriptionId: uuid('prescription_id').notNull().references(() => prescription.id),
    medicationPresentationId: uuid('medication_presentation_id')
      .notNull()
      .references(() => medicationPresentation.id),
    dosage: varchar('dosage').notNull(),
    frequency: varchar('frequency').notNull(),
    durationDays: integer('duration_days'),
    quantityPrescribed: integer('quantity_prescribed').notNull(),
    enablesPurchase: boolean('enables_purchase').notNull().default(false),
    instructions: text('instructions'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('prescription_item_prescription_idx').on(t.prescriptionId),
    index('prescription_item_presentation_idx').on(t.medicationPresentationId),
    index('prescription_item_prescription_presentation_idx').on(t.prescriptionId, t.medicationPresentationId),
    check('prescription_item_quantity_chk', sql`${t.quantityPrescribed} > 0`),
  ],
);

export const prescriptionSignature = pgTable('prescription_signature', {
  id: uuid('id').primaryKey().defaultRandom(),
  prescriptionId: uuid('prescription_id').notNull().unique().references(() => prescription.id),
  status: prescriptionSignatureStatusEnum('status').notNull().default('pending'),
  signatureMethod: varchar('signature_method').notNull(),
  signedByDoctorId: uuid('signed_by_doctor_id').notNull().references(() => doctorProfile.id),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  documentHash: varchar('document_hash'),
  signedDocumentUrl: text('signed_document_url'),
  certificateReference: text('certificate_reference'),
  signatureMetadata: jsonb('signature_metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// La cantidad restante de un renglón no se almacena: se deriva de estos registros.
export const prescriptionItemFulfillment = pgTable(
  'prescription_item_fulfillment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    prescriptionItemId: uuid('prescription_item_id').notNull().references(() => prescriptionItem.id),
    medicationOrderItemId: uuid('medication_order_item_id')
      .notNull()
      .references(() => medicationOrderItem.id),
    quantity: integer('quantity').notNull(),
    status: prescriptionFulfillmentStatusEnum('status').notNull().default('reserved'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('prescription_fulfillment_prescription_item_idx').on(t.prescriptionItemId),
    index('prescription_fulfillment_order_item_idx').on(t.medicationOrderItemId),
    check('prescription_fulfillment_quantity_chk', sql`${t.quantity} > 0`),
  ],
);
