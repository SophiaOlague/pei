import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, timestamp, time, integer, numeric, index, uniqueIndex, unique, check } from 'drizzle-orm/pg-core';
import { doctorLicenseReviewReasonEnum, doctorReviewStatusEnum } from './enums';
import { userProfile } from './identity';
import { specialty } from './specialty';

// M03 R-6: número de cédula, de 1 a 20 caracteres [0-9A-Za-z-]; validación solo sintáctica.
export const LICENSE_NUMBER_PATTERN = '^[0-9A-Za-z-]{1,20}$';

// M03 (plan v2 §7bis.2): el estado del médico se deriva de sus revisiones (N3, R-7); no se guarda aquí.
// identity_revision y professional_revision versionan las líneas de INE y cédula; cada cambio sensible las incrementa.
// license_number es la proyección del número vigente y admite NULL hasta el primer envío de cédula.
// Las reglas de versión e inmutabilidad las impondrán los triggers de 0012 (B3).
export const doctorProfile = pgTable(
  'doctor_profile',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userProfileId: uuid('user_profile_id').notNull().unique().references(() => userProfile.id),
    licenseNumber: varchar('license_number').unique(),
    bio: text('bio'),
    appointmentDurationMinutes: integer('appointment_duration_minutes').notNull().default(30),
    ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    specialtyId: uuid('specialty_id').notNull().references(() => specialty.id, { onDelete: 'restrict' }),
    photoObjectKey: text('photo_object_key'),
    identityRevision: integer('identity_revision').notNull().default(1),
    professionalRevision: integer('professional_revision').notNull().default(1),
  },
  (t) => [
    check('doctor_profile_revisions_chk', sql`${t.identityRevision} > 0 AND ${t.professionalRevision} > 0`),
    check(
      'doctor_profile_license_number_format_chk',
      sql`${t.licenseNumber} IS NULL OR ${t.licenseNumber} ~ ${sql.raw(`'${LICENSE_NUMBER_PATTERN}'`)}`,
    ),
    index('doctor_profile_specialty_idx').on(t.specialtyId),
  ],
);

// Estados de revisión comunes a INE y cédula: reviewed_by/at solo en approved/rejected; motivo de 10 a 500 solo en rejected.
const reviewChecks = (
  table: string,
  t: { status: any; reviewedBy: any; reviewedAt: any; rejectionReason: any },
) => [
  check(
    `${table}_reviewed_chk`,
    sql`(${t.status} IN ('approved','rejected') AND ${t.reviewedBy} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL)
        OR (${t.status} IN ('pending','superseded') AND ${t.reviewedBy} IS NULL AND ${t.reviewedAt} IS NULL)`,
  ),
  check(
    `${table}_reason_chk`,
    sql`(${t.status} = 'rejected' AND char_length(${t.rejectionReason}) BETWEEN 10 AND 500)
        OR (${t.status} <> 'rejected' AND ${t.rejectionReason} IS NULL)`,
  ),
];

// M03 D-19, D-27 (plan v2 §7): revisiones de la INE del médico. Cada envío es una fila nueva (historial);
// un solo pendiente por médico. Las claves R2 se purgan después de la revisión, nunca a medias ni en pending.
export const doctorIdentityVerification = pgTable(
  'doctor_identity_verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    attempt: integer('attempt').notNull(),
    identityRevision: integer('identity_revision').notNull(),
    ineFrontObjectKey: text('ine_front_object_key'),
    ineBackObjectKey: text('ine_back_object_key'),
    status: doctorReviewStatusEnum('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => userProfile.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    documentsDeletedAt: timestamp('documents_deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('doctor_identity_verification_doctor_attempt_uq').on(t.doctorId, t.attempt),
    check('doctor_identity_verification_attempt_chk', sql`${t.attempt} > 0 AND ${t.identityRevision} > 0`),
    check(
      'doctor_identity_verification_keys_chk',
      sql`(${t.documentsDeletedAt} IS NULL AND ${t.ineFrontObjectKey} IS NOT NULL AND ${t.ineBackObjectKey} IS NOT NULL)
        OR (${t.documentsDeletedAt} IS NOT NULL AND ${t.ineFrontObjectKey} IS NULL AND ${t.ineBackObjectKey} IS NULL)`,
    ),
    check('doctor_identity_verification_no_pending_purge_chk', sql`${t.documentsDeletedAt} IS NULL OR ${t.status} <> 'pending'`),
    ...reviewChecks('doctor_identity_verification', t),
    uniqueIndex('doctor_identity_verification_one_pending_uq').on(t.doctorId).where(sql`status = 'pending'`),
    index('doctor_identity_verification_status_created_idx').on(t.status, t.createdAt),
    index('doctor_identity_verification_doctor_idx').on(t.doctorId, t.attempt),
  ],
);

// M03 D-1, D-4, D-16, D-27 (plan v2 §8, §7bis): revisiones de la cédula. Cada fila conserva el número, la especialidad
// y la versión profesional del momento (C-4). El documento se conserva (sin purga) y su clave puede repetirse entre
// filas cuando una revisión automática lo reutiliza (specialty_changed, legal_name_changed).
export const doctorLicenseVerification = pgTable(
  'doctor_license_verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    attempt: integer('attempt').notNull(),
    professionalRevision: integer('professional_revision').notNull(),
    reason: doctorLicenseReviewReasonEnum('reason').notNull(),
    licenseNumber: varchar('license_number', { length: 20 }).notNull(),
    specialtyId: uuid('specialty_id').notNull().references(() => specialty.id, { onDelete: 'restrict' }),
    documentObjectKey: text('document_object_key').notNull(),
    status: doctorReviewStatusEnum('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by').references(() => userProfile.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('doctor_license_verification_doctor_attempt_uq').on(t.doctorId, t.attempt),
    check('doctor_license_verification_attempt_chk', sql`${t.attempt} > 0 AND ${t.professionalRevision} > 0`),
    check('doctor_license_verification_number_chk', sql`${t.licenseNumber} ~ ${sql.raw(`'${LICENSE_NUMBER_PATTERN}'`)}`),
    ...reviewChecks('doctor_license_verification', t),
    uniqueIndex('doctor_license_verification_one_pending_uq').on(t.doctorId).where(sql`status = 'pending'`),
    index('doctor_license_verification_status_created_idx').on(t.status, t.createdAt),
    index('doctor_license_verification_doctor_idx').on(t.doctorId, t.attempt),
  ],
);

export const doctorAvailability = pgTable(
  'doctor_availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    weekday: integer('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [
    index('doctor_availability_doctor_idx').on(t.doctorId),
    index('doctor_availability_doctor_weekday_idx').on(t.doctorId, t.weekday),
    check('doctor_availability_range_chk', sql`${t.endTime} > ${t.startTime}`),
  ],
);

export const doctorTimeOff = pgTable(
  'doctor_time_off',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    reason: varchar('reason'),
  },
  (t) => [
    index('doctor_time_off_doctor_idx').on(t.doctorId),
    index('doctor_time_off_start_idx').on(t.startsAt),
    check('doctor_time_off_range_chk', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
