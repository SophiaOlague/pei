import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, numeric, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import {
  payoutFrequencyEnum,
  payoutStatusEnum,
  doctorPayoutItemEligibilityEnum,
  doctorPayoutAdjustmentTypeEnum,
  auditActorTypeEnum,
} from './enums';
import { userProfile } from './identity';
import { doctorProfile } from './doctor';
import { appointment } from './appointment';
import { payment } from './payment';

export const consultationCommissionConfiguration = pgTable(
  'consultation_commission_configuration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorPercentage: numeric('doctor_percentage', { precision: 5, scale: 2 }).notNull(),
    platformPercentage: numeric('platform_percentage', { precision: 5, scale: 2 }).notNull(),
    payoutFrequency: payoutFrequencyEnum('payout_frequency').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => userProfile.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('commission_config_effective_from_idx').on(t.effectiveFrom),
    check(
      'commission_percentages_range_chk',
      sql`${t.doctorPercentage} between 0 and 100 and ${t.platformPercentage} between 0 and 100`,
    ),
    check('commission_percentages_sum_chk', sql`${t.doctorPercentage} + ${t.platformPercentage} = 100`),
  ],
);

// No se modifica después de una transferencia; los ajustes posteriores afectan payouts posteriores.
export const doctorPayout = pgTable(
  'doctor_payout',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    grossAmount: numeric('gross_amount', { precision: 10, scale: 2 }).notNull(),
    adjustmentAmount: numeric('adjustment_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    netAmount: numeric('net_amount', { precision: 10, scale: 2 }).notNull(),
    transferredAmount: numeric('transferred_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    status: payoutStatusEnum('status').notNull().default('pending'),
    stripeTransferId: varchar('stripe_transfer_id').unique(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('doctor_payout_doctor_idx').on(t.doctorId),
    index('doctor_payout_status_idx').on(t.status),
    index('doctor_payout_period_start_idx').on(t.periodStart),
    uniqueIndex('doctor_payout_period_uq').on(t.doctorId, t.periodStart, t.periodEnd),
    check('doctor_payout_period_chk', sql`${t.periodEnd} > ${t.periodStart}`),
    check('doctor_payout_net_chk', sql`${t.netAmount} = ${t.grossAmount} + ${t.adjustmentAmount}`),
  ],
);

// Se crea cuando el importe se vuelve elegible; payout_id es NULL hasta que entra a un payout.
// amount es el importe bruto del médico. La elegibilidad se revoca sin eliminar el registro.
export const doctorPayoutItem = pgTable(
  'doctor_payout_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    payoutId: uuid('payout_id').references(() => doctorPayout.id),
    paymentId: uuid('payment_id').notNull().unique().references(() => payment.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    eligibleAt: timestamp('eligible_at', { withTimezone: true }).notNull(),
    eligibilityStatus: doctorPayoutItemEligibilityEnum('eligibility_status').notNull().default('eligible'),
    eligibilityRevokedAt: timestamp('eligibility_revoked_at', { withTimezone: true }),
    eligibilityRevokedReason: text('eligibility_revoked_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('doctor_payout_item_payout_idx').on(t.payoutId),
    index('doctor_payout_item_payment_idx').on(t.paymentId),
    index('doctor_payout_item_eligible_at_idx').on(t.eligibleAt),
    index('doctor_payout_item_eligibility_idx').on(t.eligibilityStatus),
    check(
      'doctor_payout_item_revoked_chk',
      sql`${t.eligibilityStatus} <> 'revoked' or ${t.eligibilityRevokedAt} is not null`,
    ),
  ],
);

// Ajuste original. amount lleva signo: positivo aumenta lo que se debe al médico; negativo lo disminuye.
// Nunca modifica ni elimina el historial financiero original.
export const doctorPayoutAdjustment = pgTable(
  'doctor_payout_adjustment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    sourcePayoutId: uuid('source_payout_id').notNull().references(() => doctorPayout.id),
    doctorPayoutItemId: uuid('doctor_payout_item_id').references(() => doctorPayoutItem.id),
    appointmentId: uuid('appointment_id').references(() => appointment.id),
    paymentId: uuid('payment_id').references(() => payment.id),
    type: doctorPayoutAdjustmentTypeEnum('type').notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    reason: text('reason').notNull(),
    createdByType: auditActorTypeEnum('created_by_type').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => userProfile.id),
    externalReference: varchar('external_reference'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('doctor_payout_adjustment_doctor_idx').on(t.doctorId),
    index('doctor_payout_adjustment_source_idx').on(t.sourcePayoutId),
    index('doctor_payout_adjustment_payment_idx').on(t.paymentId),
    check('doctor_payout_adjustment_amount_chk', sql`${t.amount} <> 0`),
    check(
      'doctor_payout_adjustment_creator_chk',
      sql`(${t.createdByType} = 'user' and ${t.createdByUserId} is not null) or (${t.createdByType} = 'system' and ${t.createdByUserId} is null)`,
    ),
  ],
);

// Aplicaciones de un ajuste en uno o varios payouts.
// Saldo pendiente = amount del ajuste menos la suma de sus aplicaciones.
export const doctorPayoutAdjustmentApplication = pgTable(
  'doctor_payout_adjustment_application',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adjustmentId: uuid('adjustment_id').notNull().references(() => doctorPayoutAdjustment.id),
    appliedPayoutId: uuid('applied_payout_id').notNull().references(() => doctorPayout.id),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('doctor_payout_adjustment_application_adjustment_idx').on(t.adjustmentId),
    index('doctor_payout_adjustment_application_payout_idx').on(t.appliedPayoutId),
    check('doctor_payout_adjustment_application_amount_chk', sql`${t.amount} <> 0`),
  ],
);
