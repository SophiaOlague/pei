import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, integer, numeric, boolean, timestamp, jsonb, index, check } from 'drizzle-orm/pg-core';
import {
  paymentTypeEnum,
  paymentStatusEnum,
  refundStatusEnum,
  refundReasonEnum,
  cancellationActorTypeEnum,
  stripeConnectStatusEnum,
  stripePaymentMethodStatusEnum,
} from './enums';
import { userProfile } from './identity';
import { patientProfile } from './patient';
import { doctorProfile } from './doctor';
import { appointment } from './appointment';
import { medicationOrder } from './order';

export const stripeConnectAccount = pgTable('stripe_connect_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  doctorId: uuid('doctor_id').notNull().unique().references(() => doctorProfile.id),
  stripeAccountId: varchar('stripe_account_id').notNull().unique(),
  status: stripeConnectStatusEnum('status').notNull().default('pending'),
  chargesEnabled: boolean('charges_enabled').notNull().default(false),
  payoutsEnabled: boolean('payouts_enabled').notNull().default(false),
  detailsSubmitted: boolean('details_submitted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stripePaymentMethod = pgTable(
  'stripe_payment_method',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id').notNull().references(() => patientProfile.id),
    stripeCustomerId: varchar('stripe_customer_id').notNull(),
    stripePaymentMethodId: varchar('stripe_payment_method_id').notNull().unique(),
    type: varchar('type').notNull().default('card'),
    brand: varchar('brand'),
    last4: varchar('last4', { length: 4 }),
    expMonth: integer('exp_month'),
    expYear: integer('exp_year'),
    status: stripePaymentMethodStatusEnum('status').notNull().default('active'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stripe_payment_method_patient_idx').on(t.patientId),
    index('stripe_payment_method_customer_idx').on(t.stripeCustomerId),
  ],
);

export const payment = pgTable(
  'payment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').references(() => doctorProfile.id),
    patientId: uuid('patient_id').notNull().references(() => patientProfile.id),
    appointmentId: uuid('appointment_id').references(() => appointment.id),
    medicationOrderId: uuid('medication_order_id').references(() => medicationOrder.id),
    type: paymentTypeEnum('type').notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    stripePaymentIntentId: varchar('stripe_payment_intent_id').notNull().unique(),
    stripeChargeId: varchar('stripe_charge_id'),
    status: paymentStatusEnum('status').notNull().default('pending'),
    doctorPercentage: numeric('doctor_percentage', { precision: 5, scale: 2 }),
    platformPercentage: numeric('platform_percentage', { precision: 5, scale: 2 }),
    doctorAmount: numeric('doctor_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    platformAmount: numeric('platform_amount', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payment_doctor_idx').on(t.doctorId),
    index('payment_patient_idx').on(t.patientId),
    index('payment_appointment_idx').on(t.appointmentId),
    index('payment_medication_order_idx').on(t.medicationOrderId),
    index('payment_type_idx').on(t.type),
    index('payment_status_idx').on(t.status),
    index('payment_created_at_idx').on(t.createdAt),
    check('payment_amount_chk', sql`${t.amount} > 0`),
    check(
      'payment_medication_split_chk',
      sql`${t.type} <> 'medication' or (${t.platformPercentage} = 100 and ${t.doctorAmount} = 0)`,
    ),
    check(
      'payment_type_reference_chk',
      sql`(${t.type} = 'consultation' and ${t.appointmentId} is not null) or (${t.type} = 'medication' and ${t.medicationOrderId} is not null)`,
    ),
  ],
);

export const refund = pgTable(
  'refund',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id').notNull().references(() => payment.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    reason: refundReasonEnum('reason').notNull(),
    status: refundStatusEnum('status').notNull().default('requested'),
    stripeRefundId: varchar('stripe_refund_id').unique(),
    requestedByType: cancellationActorTypeEnum('requested_by_type'),
    requestedByUserProfileId: uuid('requested_by_user_profile_id').references(() => userProfile.id),
    approvedBy: uuid('approved_by').references(() => userProfile.id),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('refund_payment_idx').on(t.paymentId),
    index('refund_status_idx').on(t.status),
    index('refund_created_at_idx').on(t.createdAt),
    check('refund_amount_chk', sql`${t.amount} > 0`),
  ],
);

export const stripeWebhookEvent = pgTable(
  'stripe_webhook_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeEventId: varchar('stripe_event_id').notNull().unique(),
    eventType: varchar('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: varchar('status').notNull().default('received'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingAttempts: integer('processing_attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [
    index('stripe_webhook_type_idx').on(t.eventType),
    index('stripe_webhook_status_idx').on(t.status),
    index('stripe_webhook_received_idx').on(t.receivedAt),
  ],
);
