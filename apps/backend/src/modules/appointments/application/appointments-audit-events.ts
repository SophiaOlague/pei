import { AuditEvent } from '../../audit/domain/audit-event';
import type { AuditActor } from '../../audit/domain/audit-actor';

// M08: acciones auditadas (convención dominio.entidad.accion). Sin datos personales ni el motivo de la consulta.
export const APPOINTMENT_AUDIT_ACTIONS = {
  holdCreated: 'appointment.hold.created',
  holdReleased: 'appointment.hold.released',
  holdExpired: 'appointment.hold.expired',
  confirmed: 'appointment.status.confirmed',
  paymentNotConfirmable: 'appointment.payment.not_confirmable',
  canceled: 'appointment.status.canceled',
  rescheduled: 'appointment.status.rescheduled',
  outcomeRecorded: 'appointment.outcome.recorded',
  pricePublished: 'consultation_price.version.published',
  policyPublished: 'appointment_policy.version.published',
} as const;

const appt = (id: string) => ({ type: 'appointment', id });

export const AppointmentAuditEvents = {
  holdCreated: (actor: AuditActor, id: string, m: { doctorProfileId: string; holdExpiresAt: string; cancellationPolicyId: string; price: string }) =>
    AuditEvent.create({ actor, action: APPOINTMENT_AUDIT_ACTIONS.holdCreated, entity: appt(id), metadata: m }),
  holdReleased: (actor: AuditActor, id: string) =>
    AuditEvent.create({ actor, action: APPOINTMENT_AUDIT_ACTIONS.holdReleased, entity: appt(id), metadata: {} }),
  holdExpired: (actor: AuditActor, id: string, cause: 'timeout' | 'payment_failed') =>
    AuditEvent.create({ actor, action: APPOINTMENT_AUDIT_ACTIONS.holdExpired, entity: appt(id), metadata: { cause } }),
  confirmed: (actor: AuditActor, id: string, paymentId: string) =>
    AuditEvent.create({ actor, action: APPOINTMENT_AUDIT_ACTIONS.confirmed, entity: appt(id), metadata: { origin: 'payment', paymentId } }),
  paymentNotConfirmable: (actor: AuditActor, id: string, paymentId: string, reason: string) =>
    AuditEvent.create({ actor, action: APPOINTMENT_AUDIT_ACTIONS.paymentNotConfirmable, entity: appt(id), metadata: { paymentId, reason } }),
  canceled: (actor: AuditActor, id: string, m: { actorType: 'patient' | 'doctor'; refundOutcome: string; hoursBefore: number; doctorCanOperate?: boolean }) =>
    AuditEvent.create({ actor, action: APPOINTMENT_AUDIT_ACTIONS.canceled, entity: appt(id), metadata: m }),
  // DA-6: se registra sobre la cita nueva; n = número de reagendamientos de la cadena tras esta operación.
  rescheduled: (actor: AuditActor, m: { fromId: string; toId: string; rootId: string; n: number }) =>
    AuditEvent.create({ actor, action: APPOINTMENT_AUDIT_ACTIONS.rescheduled, entity: appt(m.toId), metadata: m }),
  outcomeRecorded: (actor: AuditActor, id: string, status: string) =>
    AuditEvent.create({ actor, action: APPOINTMENT_AUDIT_ACTIONS.outcomeRecorded, entity: appt(id), metadata: { status } }),
  pricePublished: (actor: AuditActor, id: string, m: { previousVersionId: string | null; previousPrice: string | null; newPrice: string; currency: string; effectiveFrom: string; source: 'admin_panel' | 'initial_setup' }) =>
    AuditEvent.create({ actor, action: APPOINTMENT_AUDIT_ACTIONS.pricePublished, entity: { type: 'consultation_price_configuration', id }, metadata: m }),
  policyPublished: (actor: AuditActor, id: string, m: { previousVersionId: string | null; previous: Record<string, number> | null; next: Record<string, number>; effectiveFrom: string; source: 'admin_panel' | 'initial_setup' }) =>
    AuditEvent.create({ actor, action: APPOINTMENT_AUDIT_ACTIONS.policyPublished, entity: { type: 'cancellation_policy', id }, metadata: m }),
};
