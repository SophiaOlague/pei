import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, numeric, timestamp, index, uniqueIndex, unique, check } from 'drizzle-orm/pg-core';
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
import { doctorLedgerEntry } from './ledger';

// Payments F1 (0017). Exclusión de solapamientos, versionado e invariantes de liquidación: SQL de 0017 (Drizzle no
// rastrea triggers ni EXCLUDE).

// Comisión fija de PEI por consulta (PAY-04, PAY-06): sin importe predeterminado; vigencias sin solapamiento.
export const peiFeeConfiguration = pgTable(
  'pei_fee_configuration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fixedFee: numeric('fixed_fee', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => userProfile.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pei_fee_configuration_effective_from_idx').on(t.effectiveFrom),
    check('pei_fee_configuration_fee_chk', sql`${t.fixedFee} >= 0`),
    check('pei_fee_configuration_currency_chk', sql`${t.currency} = 'MXN'`),
    check('pei_fee_configuration_period_chk', sql`${t.effectiveUntil} is null or ${t.effectiveUntil} > ${t.effectiveFrom}`),
  ],
);

// Periodicidad de liquidación, separada de la comisión (T-5).
export const payoutScheduleConfiguration = pgTable(
  'payout_schedule_configuration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    payoutFrequency: payoutFrequencyEnum('payout_frequency').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => userProfile.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payout_schedule_configuration_effective_from_idx').on(t.effectiveFrom),
    check('payout_schedule_configuration_period_chk', sql`${t.effectiveUntil} is null or ${t.effectiveUntil} > ${t.effectiveFrom}`),
  ],
);

// No se modifica después de una transferencia; los ajustes posteriores afectan payouts posteriores. La transferencia
// es manual en F1 (PAY-05): un payout paid exige método, referencia, responsable, fecha y transferred = net.
export const doctorPayout = pgTable(
  'doctor_payout',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    grossAmount: numeric('gross_amount', { precision: 12, scale: 2 }).notNull(),
    adjustmentAmount: numeric('adjustment_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    netAmount: numeric('net_amount', { precision: 12, scale: 2 }).notNull(),
    transferredAmount: numeric('transferred_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    status: payoutStatusEnum('status').notNull().default('pending'),
    providerTransferId: varchar('provider_transfer_id'),
    transferMethod: varchar('transfer_method'),
    transferReference: varchar('transfer_reference'),
    transferredByUserId: uuid('transferred_by_user_id').references(() => userProfile.id),
    transferEvidenceRef: text('transfer_evidence_ref'),
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
    unique('doctor_payout_provider_transfer_id_unique').on(t.providerTransferId),
    check('doctor_payout_period_chk', sql`${t.periodEnd} > ${t.periodStart}`),
    check('doctor_payout_net_chk', sql`${t.netAmount} = ${t.grossAmount} + ${t.adjustmentAmount}`),
    check('doctor_payout_currency_chk', sql`${t.currency} = 'MXN'`),
    check('doctor_payout_transfer_method_chk', sql`${t.transferMethod} is null or ${t.transferMethod} = 'manual'`),
    check(
      'doctor_payout_paid_chk',
      sql`${t.status} <> 'paid' or (${t.paidAt} is not null and ${t.transferMethod} is not null and ${t.transferReference} is not null and length(trim(${t.transferReference})) > 0 and ${t.transferredByUserId} is not null and ${t.transferredAmount} = ${t.netAmount})`,
    ),
  ],
);

// Unidad de liquidación de un pago de consulta: amount = neto del médico (bruto − comisión fija de PEI). Apunta a su
// asiento consultation_earning (I-2); si se revoca, a su asiento item_revocation (I-7). payout_id es NULL hasta que
// entra a un payout. La elegibilidad se revoca sin eliminar el registro; un importe con ajustes no se revoca.
export const doctorPayoutItem = pgTable(
  'doctor_payout_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    payoutId: uuid('payout_id').references(() => doctorPayout.id),
    paymentId: uuid('payment_id').notNull().references(() => payment.id),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    eligibleAt: timestamp('eligible_at', { withTimezone: true }).notNull(),
    eligibilityStatus: doctorPayoutItemEligibilityEnum('eligibility_status').notNull().default('eligible'),
    eligibilityRevokedAt: timestamp('eligibility_revoked_at', { withTimezone: true }),
    eligibilityRevokedReason: text('eligibility_revoked_reason'),
    ledgerEntryId: uuid('ledger_entry_id').notNull().references(() => doctorLedgerEntry.id),
    revocationLedgerEntryId: uuid('revocation_ledger_entry_id').references(() => doctorLedgerEntry.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('doctor_payout_item_payout_idx').on(t.payoutId),
    index('doctor_payout_item_payment_idx').on(t.paymentId),
    index('doctor_payout_item_eligible_at_idx').on(t.eligibleAt),
    index('doctor_payout_item_eligibility_idx').on(t.eligibilityStatus),
    unique('doctor_payout_item_payment_id_unique').on(t.paymentId),
    unique('doctor_payout_item_ledger_entry_id_unique').on(t.ledgerEntryId),
    unique('doctor_payout_item_revocation_ledger_entry_id_unique').on(t.revocationLedgerEntryId),
    check('doctor_payout_item_amount_chk', sql`${t.amount} > 0`),
    check('doctor_payout_item_revoked_chk', sql`${t.eligibilityStatus} <> 'revoked' or ${t.eligibilityRevokedAt} is not null`),
    check('doctor_payout_item_revocation_chk', sql`(${t.eligibilityStatus} = 'revoked') = (${t.revocationLedgerEntryId} is not null)`),
  ],
);

// Ajuste original (C-4, alternativa B). amount lleva signo; en F1 solo refund_reversal y chargeback (negativos),
// siempre ligados a su item y a su asiento. source_payout_id es NULL mientras el item no se ha liquidado; si el item
// está en un payout paid, es ese payout (I-4). Nunca modifica ni elimina el historial financiero original.
export const doctorPayoutAdjustment = pgTable(
  'doctor_payout_adjustment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    sourcePayoutId: uuid('source_payout_id').references(() => doctorPayout.id),
    doctorPayoutItemId: uuid('doctor_payout_item_id').references(() => doctorPayoutItem.id),
    appointmentId: uuid('appointment_id').references(() => appointment.id),
    paymentId: uuid('payment_id').references(() => payment.id),
    type: doctorPayoutAdjustmentTypeEnum('type').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    reason: text('reason').notNull(),
    createdByType: auditActorTypeEnum('created_by_type').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => userProfile.id),
    externalReference: varchar('external_reference'),
    ledgerEntryId: uuid('ledger_entry_id').notNull().references(() => doctorLedgerEntry.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('doctor_payout_adjustment_doctor_idx').on(t.doctorId),
    index('doctor_payout_adjustment_source_idx').on(t.sourcePayoutId),
    index('doctor_payout_adjustment_payment_idx').on(t.paymentId),
    index('doctor_payout_adjustment_item_idx').on(t.doctorPayoutItemId),
    unique('doctor_payout_adjustment_ledger_entry_id_unique').on(t.ledgerEntryId),
    check('doctor_payout_adjustment_amount_chk', sql`${t.amount} <> 0`),
    check(
      'doctor_payout_adjustment_creator_chk',
      sql`(${t.createdByType} = 'user' and ${t.createdByUserId} is not null) or (${t.createdByType} = 'system' and ${t.createdByUserId} is null)`,
    ),
    check('doctor_payout_adjustment_type_f1_chk', sql`${t.type} in ('refund_reversal', 'chargeback')`),
    check(
      'doctor_payout_adjustment_item_required_chk',
      sql`${t.type} not in ('refund_reversal', 'chargeback') or (${t.doctorPayoutItemId} is not null and ${t.paymentId} is not null)`,
    ),
    check('doctor_payout_adjustment_sign_chk', sql`${t.type} not in ('refund_reversal', 'chargeback') or ${t.amount} < 0`),
    check('doctor_payout_adjustment_origin_chk', sql`${t.sourcePayoutId} is not null or ${t.doctorPayoutItemId} is not null`),
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
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('doctor_payout_adjustment_application_adjustment_idx').on(t.adjustmentId),
    index('doctor_payout_adjustment_application_payout_idx').on(t.appliedPayoutId),
    check('doctor_payout_adjustment_application_amount_chk', sql`${t.amount} <> 0`),
  ],
);
