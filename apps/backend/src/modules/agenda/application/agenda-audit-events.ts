import { AuditEvent } from '../../audit/domain/audit-event';
import type { UserAuditActor } from '../../audit/domain/audit-actor';

// M07: acciones auditadas de la agenda (convención dominio.entidad.accion). Sin datos personales en metadata.
export const AGENDA_AUDIT_ACTIONS = {
  availabilityReplaced: 'agenda.availability.replaced',
  durationChanged: 'agenda.duration.changed',
  timeOffCreated: 'agenda.time_off.created',
  timeOffRemoved: 'agenda.time_off.removed',
} as const;

export const AgendaAuditEvents = {
  availabilityReplaced: (actor: UserAuditActor, doctorProfileId: string, before: number, after: number) =>
    AuditEvent.create({ actor, action: AGENDA_AUDIT_ACTIONS.availabilityReplaced, entity: { type: 'doctor_profile', id: doctorProfileId }, metadata: { windowsBefore: before, windowsAfter: after } }),
  durationChanged: (actor: UserAuditActor, doctorProfileId: string, from: number, to: number) =>
    AuditEvent.create({ actor, action: AGENDA_AUDIT_ACTIONS.durationChanged, entity: { type: 'doctor_profile', id: doctorProfileId }, metadata: { from, to } }),
  timeOffCreated: (actor: UserAuditActor, timeOffId: string, doctorProfileId: string) =>
    AuditEvent.create({ actor, action: AGENDA_AUDIT_ACTIONS.timeOffCreated, entity: { type: 'doctor_time_off', id: timeOffId }, metadata: { doctorProfileId } }),
  timeOffRemoved: (actor: UserAuditActor, timeOffId: string, doctorProfileId: string) =>
    AuditEvent.create({ actor, action: AGENDA_AUDIT_ACTIONS.timeOffRemoved, entity: { type: 'doctor_time_off', id: timeOffId }, metadata: { doctorProfileId } }),
};
