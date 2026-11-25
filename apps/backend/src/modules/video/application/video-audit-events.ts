import { AuditActor } from '../../audit/domain/audit-actor';
import { AuditEvent } from '../../audit/domain/audit-event';

// Acciones sensibles de videoconsulta (RF-52). Las entradas, salidas y latidos quedan en meeting_session_event
// (RN-031, solo inserción desde 0019); el resultado de la cita lo audita M08 (appointment.outcome.recorded).
export const VIDEO_AUDIT_ACTIONS = {
  admitted: 'video.session.admitted',
  ended: 'video.session.ended',
} as const;

const appt = (id: string) => ({ type: 'appointment', id });

export const VideoAuditEvents = {
  admitted: (actor: AuditActor, appointmentId: string, meetingId: string) =>
    AuditEvent.create({ actor, action: VIDEO_AUDIT_ACTIONS.admitted, entity: appt(appointmentId), metadata: { meetingId } }),
  // doctorCanOperate=false marca el uso de la excepción de RN-140 (decisión 11): finalizar una consulta ya activa.
  ended: (actor: AuditActor, appointmentId: string, m: { meetingId: string; durationSeconds: number; doctorCanOperate: boolean; outcomeRecorded: boolean }) =>
    AuditEvent.create({ actor, action: VIDEO_AUDIT_ACTIONS.ended, entity: appt(appointmentId), metadata: m }),
};

export { AuditActor };
