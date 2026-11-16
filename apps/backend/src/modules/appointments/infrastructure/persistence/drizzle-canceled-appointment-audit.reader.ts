import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { appointment, appointmentStatusHistory, auditLog, cancellationPolicy } from '../../../../db/schema';
import {
  CANCELED_AUDIT_ACTION,
  type CanceledAppointmentAuditReader,
  type CanceledAppointmentAuditRow,
  type CanceledAppointmentCursor,
} from '../../application/integration/canceled-appointment-feed';

// M08 · A.25: lector de SOLO LECTURA de cancelaciones. Parte de la fila de auditoría `appointment.status.canceled`
// (misma transacción que la cancelación; audit_log solo admite INSERT) y une, con LEFT JOIN, la cita y la versión de su
// política: una fila de auditoría sin cita o sin política llega igualmente (el servicio la informa como anomalía), nunca
// se pierde.
//
// Orden y paginación por clave estable (created_at, id). La posición se lee en UTC con MICROSEGUNDOS
// (to_char … .US): un cursor con milisegundos podría repetir indefinidamente una página llena de filas del mismo
// milisegundo o compararse de forma inexacta.
//
// Verificación temporal (D-5): devuelve también las filas `canceled` de appointment_status_history (cuántas y la posición
// exacta de la primera) para que el servicio compare now() de la auditoría y del historial sin tolerancia.
//
// Rendimiento: usa audit_action_idx (action) y audit_created_at_idx; cada barrido recorre toda la historia. Índice
// opcional (no creado, D-2): audit_log (action, created_at, id) para una búsqueda por rango sin ordenar.

const POSITION_FORMAT = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);
export const AUDIT_POSITION: SQL<string> = sql<string>`to_char(${auditLog.createdAt} at time zone 'UTC', ${POSITION_FORMAT})`;

// Filas `canceled` del historial de la cita (subconsultas correlacionadas: nunca multiplican las filas de auditoría,
// así que no afectan a la paginación). Usan appointment_status_history_appointment_idx. La posición del historial se
// formatea igual que la de la auditoría para compararlas exactamente (microsegundos).
const H = appointmentStatusHistory;
export const CANCELED_HISTORY_COUNT: SQL<number> = sql<number>`(select count(*)::int from ${H} where ${H.appointmentId} = ${auditLog.entityId} and ${H.status} = 'canceled')`;
export const CANCELED_HISTORY_POSITION: SQL<string | null> = sql<string | null>`(select to_char(min(${H.createdAt}) at time zone 'UTC', ${POSITION_FORMAT}) from ${H} where ${H.appointmentId} = ${auditLog.entityId} and ${H.status} = 'canceled')`;

export function canceledAuditWhere(after: CanceledAppointmentCursor | null): SQL {
  const base = and(eq(auditLog.action, CANCELED_AUDIT_ACTION), eq(auditLog.entityType, 'appointment'))!;
  if (!after) return base;
  return and(base, sql`(${auditLog.createdAt}, ${auditLog.id}) > (${after.position}::timestamptz, ${after.auditId}::uuid)`)!;
}

export function canceledAuditQuery(after: CanceledAppointmentCursor | null, limit: number) {
  return getDbContext()
    .select({
      auditId: auditLog.id,
      position: AUDIT_POSITION,
      auditCreatedAt: auditLog.createdAt,
      appointmentId: auditLog.entityId,
      metadata: auditLog.metadata,
      historyCount: CANCELED_HISTORY_COUNT,
      historyPosition: CANCELED_HISTORY_POSITION,
      status: appointment.status,
      scheduledAt: appointment.scheduledAt,
      cancelledAt: appointment.cancelledAt,
      cancelledByType: appointment.cancelledByType,
      rescheduledFromAppointmentId: appointment.rescheduledFromAppointmentId,
      refundDeadlineHours: cancellationPolicy.refundDeadlineHours,
    })
    .from(auditLog)
    .leftJoin(appointment, eq(appointment.id, auditLog.entityId))
    .leftJoin(cancellationPolicy, eq(cancellationPolicy.id, appointment.cancellationPolicyId))
    .where(canceledAuditWhere(after))
    .orderBy(asc(auditLog.createdAt), asc(auditLog.id))
    .limit(limit);
}

type Row = Awaited<ReturnType<typeof canceledAuditQuery>>[number];

export function toCanceledAuditRow(r: Row): CanceledAppointmentAuditRow {
  return {
    auditId: r.auditId,
    position: r.position,
    auditCreatedAt: r.auditCreatedAt,
    appointmentId: r.appointmentId,
    metadata: r.metadata,
    canceledHistory: { count: Number(r.historyCount ?? 0), position: r.historyPosition ?? null },
    appointment: r.status === null || r.scheduledAt === null
      ? null
      : {
          status: r.status,
          scheduledAt: r.scheduledAt,
          cancelledAt: r.cancelledAt,
          cancelledByType: r.cancelledByType,
          rescheduledFromAppointmentId: r.rescheduledFromAppointmentId,
          refundDeadlineHours: r.refundDeadlineHours,
        },
  };
}

@Injectable()
export class DrizzleCanceledAppointmentAuditReader implements CanceledAppointmentAuditReader {
  async listAfter(after: CanceledAppointmentCursor | null, limit: number): Promise<CanceledAppointmentAuditRow[]> {
    return (await canceledAuditQuery(after, limit)).map(toCanceledAuditRow);
  }
}
