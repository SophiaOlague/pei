import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, numeric, boolean, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { userProfile } from './identity';

// Política de citas versionada: plazo de reembolso, reagendamientos y ventanas de espera.
export const cancellationPolicy = pgTable(
  'cancellation_policy',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    refundDeadlineHours: integer('refund_deadline_hours').notNull(),
    maxReschedules: integer('max_reschedules').notNull(),
    doctorWaitMinutes: integer('doctor_wait_minutes').notNull(),
    patientToleranceMinutes: integer('patient_tolerance_minutes').notNull(),
    // M-1 (0013, C-26, AP-22). Sin DEFAULT desde 0016 (M-1c): cada versión los indica (60 y 5 iniciales, en código).
    maxProtectedWaitMinutes: integer('max_protected_wait_minutes').notNull(),
    reconnectGraceMinutes: integer('reconnect_grace_minutes').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => userProfile.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cancellation_policy_effective_from_idx').on(t.effectiveFrom),
    check(
      'cancellation_policy_windows_chk',
      sql`${t.refundDeadlineHours} > 0 and ${t.maxReschedules} >= 0 and ${t.patientToleranceMinutes} > 0 and ${t.patientToleranceMinutes} <= ${t.doctorWaitMinutes} and ${t.doctorWaitMinutes} <= ${t.maxProtectedWaitMinutes} and ${t.reconnectGraceMinutes} > 0 and ${t.reconnectGraceMinutes} < ${t.patientToleranceMinutes}`,
    ),
  ],
);

// [PROPUESTO] Estructura pendiente de aprobación del líder técnico.
// Precio global de consulta, versionado.
export const consultationPriceConfiguration = pgTable(
  'consultation_price_configuration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('MXN'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => userProfile.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('consultation_price_effective_from_idx').on(t.effectiveFrom)],
);

export const pickupConfiguration = pgTable(
  'pickup_configuration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pickupExpirationDays: integer('pickup_expiration_days').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => userProfile.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('pickup_config_effective_from_idx').on(t.effectiveFrom)],
);

export const appointmentReminderConfiguration = pgTable(
  'appointment_reminder_configuration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    minutesBefore: integer('minutes_before').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdBy: uuid('created_by').notNull().references(() => userProfile.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('appointment_reminder_minutes_uq').on(t.minutesBefore)],
);
