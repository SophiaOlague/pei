import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, numeric, timestamp, index, uniqueIndex, unique, check, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { doctorLedgerEntryTypeEnum, doctorLedgerSourceTypeEnum, auditActorTypeEnum } from './enums';
import { userProfile } from './identity';
import { doctorProfile } from './doctor';
import { payment, refund } from './payment';

const UUID_RE = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Diario financiero del médico (PAY-09; Payments-decisiones.md §3.5). Es de solo inserción, con signo. Cada asiento
// tiene exactamente una unidad de liquidación (I-2): un doctor_payout_item (origen o revocación) o un
// doctor_payout_adjustment. Los triggers de 0017 (ledger_entry_insert, ledger_entry_has_unit y otros) aplican
// I-1 a I-10. En F1 no hay correcciones administrativas (§3.5.2).
export const doctorLedgerEntry = pgTable(
  'doctor_ledger_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    paymentId: uuid('payment_id').notNull().references(() => payment.id),
    entryType: doctorLedgerEntryTypeEnum('entry_type').notNull(),
    sourceType: doctorLedgerSourceTypeEnum('source_type').notNull(),
    sourceRef: text('source_ref').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    refundId: uuid('refund_id').references(() => refund.id),
    reversesEntryId: uuid('reverses_entry_id').references((): AnyPgColumn => doctorLedgerEntry.id),
    createdByType: auditActorTypeEnum('created_by_type').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => userProfile.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('doctor_ledger_entry_doctor_idx').on(t.doctorId),
    index('doctor_ledger_entry_payment_idx').on(t.paymentId),
    index('doctor_ledger_entry_refund_idx').on(t.refundId),
    uniqueIndex('doctor_ledger_entry_earning_uq').on(t.paymentId).where(sql`${t.entryType} = 'consultation_earning'`),
    uniqueIndex('doctor_ledger_entry_reverses_uq').on(t.reversesEntryId).where(sql`${t.reversesEntryId} is not null`),
    unique('doctor_ledger_entry_key_uq').on(t.entryType, t.sourceType, t.sourceRef),
    check('doctor_ledger_entry_source_ref_chk', sql`length(${t.sourceRef}) > 0`),
    check(
      'doctor_ledger_entry_sign_chk',
      sql`(${t.entryType} = 'consultation_earning' and ${t.amount} > 0) or (${t.entryType} in ('refund_reversal', 'chargeback') and ${t.amount} < 0)`,
    ),
    check(
      'doctor_ledger_entry_source_chk',
      sql`(${t.entryType} = 'consultation_earning' and ${t.sourceType} = 'payment') or (${t.entryType} = 'refund_reversal' and ${t.sourceType} in ('refund_adjustment', 'item_revocation')) or (${t.entryType} = 'chargeback' and ${t.sourceType} = 'dispute')`,
    ),
    check('doctor_ledger_entry_refund_chk', sql`(${t.sourceType} in ('refund_adjustment', 'item_revocation')) = (${t.refundId} is not null)`),
    check('doctor_ledger_entry_reverses_chk', sql`(${t.sourceType} = 'item_revocation') = (${t.reversesEntryId} is not null)`),
    check(
      'doctor_ledger_entry_source_ref_format_chk',
      sql`(${t.sourceType} = 'payment' and ${t.sourceRef} = ${t.paymentId}::text) or (${t.sourceType} = 'item_revocation' and ${t.sourceRef} ~ ${sql.raw(`'${UUID_RE}$'`)}) or (${t.sourceType} = 'refund_adjustment' and ${t.sourceRef} ~ ${sql.raw(`'${UUID_RE}:'`)} and split_part(${t.sourceRef}, ':', 2) = ${t.refundId}::text) or (${t.sourceType} = 'dispute' and ${t.sourceRef} ~ ${sql.raw(`'${UUID_RE}:.+$'`)})`,
    ),
    check(
      'doctor_ledger_entry_creator_chk',
      sql`(${t.createdByType} = 'user' and ${t.createdByUserId} is not null) or (${t.createdByType} = 'system' and ${t.createdByUserId} is null)`,
    ),
  ],
);
