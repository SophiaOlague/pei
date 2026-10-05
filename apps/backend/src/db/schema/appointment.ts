import { pgTable, uuid, varchar, text, timestamp, numeric, integer, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  appointmentTypeEnum,
  appointmentStatusEnum,
  cancellationActorTypeEnum,
  meetingStatusEnum,
  meetingParticipantEnum,
  meetingSessionEventTypeEnum,
} from './enums';
import { userProfile } from './identity';
import { patientProfile } from './patient';
import { doctorProfile } from './doctor';
import { cancellationPolicy } from './configuration';

// pending_payment pasa a expired, nunca a canceled, cuando vence la retención sin pago.
// cancellation_policy_id: [PROPUESTO] Estructura pendiente de aprobación del líder técnico.
export const appointment = pgTable(
  'appointment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patientId: uuid('patient_id').notNull().references(() => patientProfile.id),
    doctorId: uuid('doctor_id').notNull().references(() => doctorProfile.id),
    type: appointmentTypeEnum('type').notNull(),
    status: appointmentStatusEnum('status').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    reason: varchar('reason').notNull(),
    notes: text('notes'),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    cancellationPolicyId: uuid('cancellation_policy_id')
      .notNull()
      .references(() => cancellationPolicy.id),
    paymentHoldExpiresAt: timestamp('payment_hold_expires_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    cancelledByType: cancellationActorTypeEnum('cancelled_by_type'),
    cancelledByUserProfileId: uuid('cancelled_by_user_profile_id').references(() => userProfile.id),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    rescheduledFromAppointmentId: uuid('rescheduled_from_appointment_id').references(
      (): AnyPgColumn => appointment.id,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('appointment_doctor_idx').on(t.doctorId),
    index('appointment_patient_idx').on(t.patientId),
    index('appointment_scheduled_at_idx').on(t.scheduledAt),
    index('appointment_doctor_schedule_idx').on(t.doctorId, t.scheduledAt),
    index('appointment_payment_hold_idx').on(t.paymentHoldExpiresAt),
  ],
);

export const appointmentStatusHistory = pgTable(
  'appointment_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    appointmentId: uuid('appointment_id').notNull().references(() => appointment.id),
    status: appointmentStatusEnum('status').notNull(),
    changedByType: cancellationActorTypeEnum('changed_by_type'),
    changedByUserProfileId: uuid('changed_by_user_profile_id').references(() => userProfile.id),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('appointment_status_history_appointment_idx').on(t.appointmentId),
    index('appointment_status_history_created_idx').on(t.createdAt),
  ],
);

// patient_joined_at y doctor_joined_at determinan la inasistencia.
export const meeting = pgTable('meeting', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().unique().references(() => appointment.id),
  roomId: varchar('room_id').notNull().unique(),
  status: meetingStatusEnum('status').notNull().default('scheduled'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  patientJoinedAt: timestamp('patient_joined_at', { withTimezone: true }),
  doctorJoinedAt: timestamp('doctor_joined_at', { withTimezone: true }),
  recordingUrl: text('recording_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// [PROPUESTO] Estructura pendiente de aprobación del líder técnico.
// Eventos de conexión y desconexión; se conservan para auditoría.
export const meetingSessionEvent = pgTable(
  'meeting_session_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id').notNull().references(() => meeting.id),
    participant: meetingParticipantEnum('participant').notNull(),
    eventType: meetingSessionEventTypeEnum('event_type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meeting_session_event_meeting_idx').on(t.meetingId),
    index('meeting_session_event_occurred_idx').on(t.occurredAt),
  ],
);

// Sin uso en esta versión: la calificación se pospone.
export const review = pgTable('review', {
  id: uuid('id').primaryKey().defaultRandom(),
  appointmentId: uuid('appointment_id').notNull().unique().references(() => appointment.id),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
