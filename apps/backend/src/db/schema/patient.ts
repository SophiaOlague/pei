import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, numeric, integer, timestamp, check, index, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  riskLevelEnum,
  identityVerificationStatusEnum,
  smokingStatusEnum,
  alcoholConsumptionEnum,
  physicalActivityEnum,
} from './enums';
import { userProfile } from './identity';

// La CURP vive en user_profile (M03 R-12): una sola fuente de verdad, única entre roles (D-20, D-35).
export const patientProfile = pgTable(
  'patient_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userProfileId: uuid('user_profile_id').notNull().unique().references(() => userProfile.id),
    address: text('address'),
    riskLevel: riskLevelEnum('risk_level'),
    // Clave del objeto en el bucket privado (DT-3, DT-7); nunca una URL.
    photoObjectKey: text('photo_object_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

// Un registro por envío del INE (DT-2): historial de intentos, a lo más uno 'pending' por paciente.
// Las claves de los objetos existen mientras el envío está 'pending'; al aprobar o rechazar se eliminan
// del bucket, las claves quedan en NULL y documents_deleted_at registra cuándo (DT-5).
export const patientIdentityVerification = pgTable(
  'patient_identity_verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id').notNull().references(() => patientProfile.id),
    attempt: integer('attempt').notNull().default(1),
    ineFrontObjectKey: text('ine_front_object_key'),
    ineBackObjectKey: text('ine_back_object_key'),
    status: identityVerificationStatusEnum('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => userProfile.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    documentsDeletedAt: timestamp('documents_deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('patient_identity_verification_patient_attempt_uq').on(t.patientId, t.attempt),
    uniqueIndex('patient_identity_verification_one_pending_uq').on(t.patientId).where(sql`${t.status} = 'pending'`),
    index('patient_identity_verification_status_created_idx').on(t.status, t.createdAt),
    // Un envío pendiente conserva sus dos documentos.
    check(
      'patient_identity_verification_pending_keys_chk',
      sql`${t.status} <> 'pending' or (${t.ineFrontObjectKey} is not null and ${t.ineBackObjectKey} is not null)`,
    ),
    // Documentos eliminados: no quedan claves.
    check(
      'patient_identity_verification_deleted_keys_chk',
      sql`${t.documentsDeletedAt} is null or (${t.ineFrontObjectKey} is null and ${t.ineBackObjectKey} is null)`,
    ),
  ],
);

export const patientHealthSummary = pgTable('patient_health_summary', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().unique().references(() => patientProfile.id),
  bloodType: varchar('blood_type'),
  allergies: text('allergies'),
  medicalConditions: text('medical_conditions'),
  smokingStatus: smokingStatusEnum('smoking_status'),
  alcoholConsumption: alcoholConsumptionEnum('alcohol_consumption'),
  physicalActivity: physicalActivityEnum('physical_activity'),
  weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
  heightM: numeric('height_m', { precision: 4, scale: 2 }),
  systolicPressure: integer('systolic_pressure'),
  diastolicPressure: integer('diastolic_pressure'),
  heartRateBpm: integer('heart_rate_bpm'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
