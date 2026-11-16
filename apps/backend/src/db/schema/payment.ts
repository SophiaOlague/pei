import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, integer, numeric, boolean, timestamp, jsonb, index, uniqueIndex, unique, check } from 'drizzle-orm/pg-core';
import {
  paymentTypeEnum,
  paymentStatusEnum,
  paymentProviderEnum,
  providerWebhookEventStatusEnum,
  refundStatusEnum,
  refundReasonEnum,
  cancellationActorTypeEnum,
} from './enums';
import { userProfile } from './identity';
import { patientProfile } from './patient';
import { doctorProfile } from './doctor';
import { appointment } from './appointment';
import { medicationOrder } from './order';
import { peiFeeConfiguration } from './payout';

// Payments F1 (migración 0017, docs/arquitectura/Payments-decisiones.md). Los triggers y la exclusión de solapamientos
// viven en el SQL de 0017; Drizzle no los rastrea (igual que en 0001).

// Tarifa del procesador, versionada (PAY-08). La referencia inicial de Mercado Pago NO se siembra: la registra un
// administrador con su fuente. El solapamiento por proveedor lo impide el trigger processor_fee_schedule_no_overlap.
export const processorFeeSchedule = pgTable(
  'processor_fee_schedule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: paymentProviderEnum('provider').notNull(),
    percentageRate: numeric('percentage_rate', { precision: 7, scale: 6 }).notNull(),
    fixedFee: numeric('fixed_fee', { precision: 12, scale: 2 }).notNull(),
    vatRate: numeric('vat_rate', { precision: 7, scale: 6 }).notNull(),
    releaseDays: integer('release_days').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    source: text('source').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => userProfile.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('processor_fee_schedule_provider_from_idx').on(t.provider, t.effectiveFrom),
    check('processor_fee_schedule_rates_chk', sql`${t.percentageRate} >= 0 and ${t.percentageRate} < 1 and ${t.vatRate} >= 0 and ${t.vatRate} < 1`),
    check('processor_fee_schedule_fee_chk', sql`${t.fixedFee} >= 0 and ${t.releaseDays} >= 0`),
    check('processor_fee_schedule_currency_chk', sql`${t.currency} = 'MXN'`),
    check('processor_fee_schedule_source_chk', sql`length(trim(${t.source})) > 0`),
    check('processor_fee_schedule_period_chk', sql`${t.effectiveUntil} is null or ${t.effectiveUntil} > ${t.effectiveFrom}`),
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
    provider: paymentProviderEnum('provider').notNull(),
    providerPaymentId: varchar('provider_payment_id'),
    providerStatus: varchar('provider_status'),
    status: paymentStatusEnum('status').notNull().default('pending'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    peiFeeConfigurationId: uuid('pei_fee_configuration_id').references(() => peiFeeConfiguration.id),
    peiFixedFee: numeric('pei_fixed_fee', { precision: 12, scale: 2 }),
    doctorNetAmount: numeric('doctor_net_amount', { precision: 12, scale: 2 }).notNull(),
    processorFeeScheduleId: uuid('processor_fee_schedule_id').notNull().references(() => processorFeeSchedule.id),
    providerFeeEstimated: numeric('provider_fee_estimated', { precision: 12, scale: 2 }).notNull(),
    providerFeeActual: numeric('provider_fee_actual', { precision: 12, scale: 2 }),
    netReceivedAmount: numeric('net_received_amount', { precision: 12, scale: 2 }),
    moneyReleaseDate: timestamp('money_release_date', { withTimezone: true }),
    feeReconciledAt: timestamp('fee_reconciled_at', { withTimezone: true }),
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
    // PAY-14 / AP-27a: un solo pago activo (pendiente, en proceso o capturado) por cita raíz y por pedido.
    uniqueIndex('payment_active_appointment_uq').on(t.appointmentId).where(sql`${t.type} = 'consultation' and ${t.status} not in ('failed', 'canceled')`),
    uniqueIndex('payment_active_medication_order_uq').on(t.medicationOrderId).where(sql`${t.type} = 'medication' and ${t.status} not in ('failed', 'canceled')`),
    unique('payment_provider_payment_uq').on(t.provider, t.providerPaymentId),
    check('payment_amount_chk', sql`${t.amount} > 0`),
    check('payment_currency_chk', sql`${t.currency} = 'MXN'`),
    check(
      'payment_type_reference_chk',
      sql`(${t.type} = 'consultation' and ${t.appointmentId} is not null and ${t.medicationOrderId} is null) or (${t.type} = 'medication' and ${t.medicationOrderId} is not null and ${t.appointmentId} is null)`,
    ),
    check('payment_doctor_net_nonnegative_chk', sql`${t.doctorNetAmount} >= 0`),
    check(
      'payment_consultation_split_chk',
      sql`${t.type} <> 'consultation' or (${t.doctorId} is not null and ${t.peiFeeConfigurationId} is not null and ${t.peiFixedFee} is not null and ${t.peiFixedFee} >= 0 and ${t.doctorNetAmount} = ${t.amount} - ${t.peiFixedFee})`,
    ),
    check(
      'payment_medication_split_chk',
      sql`${t.type} <> 'medication' or (${t.peiFeeConfigurationId} is null and ${t.peiFixedFee} is null and ${t.doctorNetAmount} = 0)`,
    ),
    check(
      'payment_provider_fee_chk',
      sql`${t.providerFeeEstimated} >= 0 and (${t.providerFeeActual} is null or ${t.providerFeeActual} >= 0) and (${t.netReceivedAmount} is null or ${t.netReceivedAmount} >= 0)`,
    ),
    check('payment_fee_reconciled_chk', sql`${t.feeReconciledAt} is null or ${t.providerFeeActual} is not null`),
    check('payment_provider_payment_id_chk', sql`${t.providerPaymentId} is null or length(trim(${t.providerPaymentId})) > 0`),
    check('payment_provider_reference_chk', sql`${t.status} in ('pending', 'failed', 'canceled') or ${t.providerPaymentId} is not null`),
  ],
);

export const refund = pgTable(
  'refund',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id').notNull().references(() => payment.id),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    reason: refundReasonEnum('reason').notNull(),
    status: refundStatusEnum('status').notNull().default('requested'),
    provider: paymentProviderEnum('provider').notNull(),
    providerRefundId: varchar('provider_refund_id'),
    providerStatus: varchar('provider_status'),
    // Prorrata acumulativa (§2.3, I-8), validada por el trigger refund_guard.
    peiFeeShare: numeric('pei_fee_share', { precision: 12, scale: 2 }).notNull(),
    doctorShare: numeric('doctor_share', { precision: 12, scale: 2 }).notNull(),
    providerFeeReturned: numeric('provider_fee_returned', { precision: 12, scale: 2 }),
    unrecoveredProviderFee: numeric('unrecovered_provider_fee', { precision: 12, scale: 2 }),
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
    uniqueIndex('refund_payment_error_uq').on(t.paymentId).where(sql`${t.reason} = 'payment_error' and ${t.status} not in ('failed', 'canceled')`),
    unique('refund_provider_refund_uq').on(t.provider, t.providerRefundId),
    check('refund_amount_chk', sql`${t.amount} > 0`),
    check('refund_currency_chk', sql`${t.currency} = 'MXN'`),
    check('refund_shares_chk', sql`${t.peiFeeShare} >= 0 and ${t.doctorShare} >= 0 and ${t.peiFeeShare} + ${t.doctorShare} = ${t.amount}`),
    check(
      'refund_provider_fee_chk',
      sql`(${t.providerFeeReturned} is null or ${t.providerFeeReturned} >= 0) and (${t.unrecoveredProviderFee} is null or ${t.unrecoveredProviderFee} >= 0)`,
    ),
    check('refund_provider_refund_id_chk', sql`${t.providerRefundId} is null or length(trim(${t.providerRefundId})) > 0`),
    check('refund_succeeded_reference_chk', sql`${t.status} <> 'succeeded' or (${t.providerRefundId} is not null and ${t.processedAt} is not null)`),
  ],
);

// Webhooks del proveedor (PAY-15): se registran antes de procesarse; el webhook no prueba el pago.
export const providerWebhookEvent = pgTable(
  'provider_webhook_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: paymentProviderEnum('provider').notNull(),
    topic: varchar('topic').notNull(),
    action: varchar('action'),
    dataId: varchar('data_id').notNull(),
    requestId: varchar('request_id').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    payload: jsonb('payload').notNull(),
    status: providerWebhookEventStatusEnum('status').notNull().default('received'),
    paymentId: uuid('payment_id').references(() => payment.id),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    processingAttempts: integer('processing_attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [
    index('provider_webhook_event_status_idx').on(t.status),
    index('provider_webhook_event_received_idx').on(t.receivedAt),
    index('provider_webhook_event_payment_idx').on(t.paymentId),
    unique('provider_webhook_event_uq').on(t.provider, t.topic, t.dataId, t.requestId),
    check('provider_webhook_event_keys_chk', sql`length(trim(${t.topic})) > 0 and length(trim(${t.dataId})) > 0 and length(trim(${t.requestId})) > 0`),
    check('provider_webhook_event_attempts_chk', sql`${t.processingAttempts} >= 0`),
    check('provider_webhook_event_signature_chk', sql`${t.signatureValid} or ${t.status} in ('received', 'ignored')`),
    check('provider_webhook_event_processed_chk', sql`${t.status} <> 'processed' or ${t.processedAt} is not null`),
  ],
);

// Idempotencia de operaciones de creación (PAY-14).
export const idempotencyKey = pgTable(
  'idempotency_key',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    scope: varchar('scope').notNull(),
    key: varchar('key').notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    paymentId: uuid('payment_id').references(() => payment.id),
    refundId: uuid('refund_id').references(() => refund.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    unique('idempotency_key_uq').on(t.scope, t.key),
    check('idempotency_key_values_chk', sql`length(trim(${t.scope})) > 0 and length(trim(${t.key})) > 0`),
    check('idempotency_key_hash_chk', sql`${t.requestHash} ~ '^[0-9a-f]{64}$'`),
  ],
);
