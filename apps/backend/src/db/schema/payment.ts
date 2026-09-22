import { pgTable, uuid, varchar, numeric, timestamp } from 'drizzle-orm/pg-core';
import { paymentTypeEnum, paymentStatusEnum } from './enums';
import { doctorProfile } from './doctor';
import { patientProfile } from './patient';
import { appointment } from './appointment';

export const payment = pgTable('payment', {
  id: uuid('id').primaryKey().defaultRandom(),
  doctorId: uuid('doctor_id').references(() => doctorProfile.id),
  patientId: uuid('patient_id').references(() => patientProfile.id),
  appointmentId: uuid('appointment_id').references(() => appointment.id),
  type: paymentTypeEnum('type').notNull(),
  amount: numeric('amount').notNull(),
  currency: varchar('currency').notNull(),
  stripePaymentId: varchar('stripe_payment_id').unique(),
  status: paymentStatusEnum('status').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});