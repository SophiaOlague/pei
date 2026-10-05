import { pgTable, uuid, varchar, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { riskLevelEnum } from './enums';
import { patientProfile } from './patient';
import { appointment } from './appointment';

// [PROPUESTO] Estructura pendiente de aprobación del líder técnico.
// El estado objetivo del modelo es no_show_patient.
export const appointmentNoShowPrediction = pgTable(
  'appointment_no_show_prediction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appointmentId: uuid('appointment_id').notNull().references(() => appointment.id),
    probability: numeric('probability', { precision: 5, scale: 4 }).notNull(),
    riskLevel: riskLevelEnum('risk_level').notNull(),
    modelVersion: varchar('model_version').notNull(),
    predictedAt: timestamp('predicted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('no_show_prediction_appointment_idx').on(t.appointmentId),
    index('no_show_prediction_predicted_idx').on(t.predictedAt),
  ],
);

// [PROPUESTO] Estructura pendiente de aprobación del líder técnico.
export const patientAdherenceSegment = pgTable(
  'patient_adherence_segment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id').notNull().references(() => patientProfile.id),
    segment: varchar('segment').notNull(),
    modelVersion: varchar('model_version').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('adherence_segment_patient_idx').on(t.patientId),
    index('adherence_segment_assigned_idx').on(t.assignedAt),
  ],
);
