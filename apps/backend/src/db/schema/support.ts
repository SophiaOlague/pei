import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { cancellationActorTypeEnum, supportRequestStatusEnum, supportIncidentCauseEnum } from './enums';
import { userProfile } from './identity';
import { appointment } from './appointment';
import { medicationOrder } from './order';

// [PROPUESTO] Estructura pendiente de aprobación del líder técnico.
// Se relaciona con un pedido o con una cita; la inicia el paciente, el médico o el sistema.
export const supportRequest = pgTable(
  'support_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    medicationOrderId: uuid('medication_order_id').references(() => medicationOrder.id),
    appointmentId: uuid('appointment_id').references(() => appointment.id),
    openedByType: cancellationActorTypeEnum('opened_by_type').notNull(),
    openedByUserProfileId: uuid('opened_by_user_profile_id').references(() => userProfile.id),
    status: supportRequestStatusEnum('status').notNull().default('open'),
    reason: varchar('reason').notNull(),
    description: text('description'),
    response: text('response'),
    resolution: text('resolution'),
    incidentCause: supportIncidentCauseEnum('incident_cause'),
    resolvedBy: uuid('resolved_by').references(() => userProfile.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('support_request_order_idx').on(t.medicationOrderId),
    index('support_request_appointment_idx').on(t.appointmentId),
    index('support_request_status_idx').on(t.status),
    index('support_request_created_idx').on(t.createdAt),
    uniqueIndex('support_request_open_per_order_uq')
      .on(t.medicationOrderId)
      .where(sql`${t.medicationOrderId} is not null and ${t.status} in ('open', 'in_review')`),
    check('support_request_reference_chk', sql`${t.medicationOrderId} is not null or ${t.appointmentId} is not null`),
  ],
);
