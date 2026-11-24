import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { getDbContext } from '../../../../db/transaction-context';
import { appointment, appointmentStatusHistory, auditLog } from '../../../../db/schema';
import {
  OUTCOME_AUDIT_ACTION,
  type OutcomeRecordedAuditReader,
  type OutcomeRecordedAuditRow,
  type OutcomeRecordedCursor,
} from '../../application/integration/outcome-recorded-feed';
import { AUDIT_POSITION } from './drizzle-canceled-appointment-audit.reader';

// M08: lector de SOLO LECTURA de resultados de videoconsulta. Parte de la fila de auditoría
// `appointment.outcome.recorded` y une la cita con LEFT JOIN (una auditoría sin cita llega igual y se informa como
// anomalía). Mismo orden, posición con microsegundos y paginación que el lector de cancelaciones (A.25).

const POSITION_FORMAT = sql.raw(`'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'`);
const H = appointmentStatusHistory;
// Filas del historial con el estado AUDITADO (metadata.status). Subconsultas correlacionadas: no multiplican filas.
const STATUS_HISTORY_COUNT: SQL<number> = sql<number>`(select count(*)::int from ${H} where ${H.appointmentId} = ${auditLog.entityId} and ${H.status}::text = (${auditLog.metadata} ->> 'status'))`;
const STATUS_HISTORY_POSITION: SQL<string | null> = sql<string | null>`(select to_char(min(${H.createdAt}) at time zone 'UTC', ${POSITION_FORMAT}) from ${H} where ${H.appointmentId} = ${auditLog.entityId} and ${H.status}::text = (${auditLog.metadata} ->> 'status'))`;

function outcomeAuditWhere(after: OutcomeRecordedCursor | null): SQL {
  const base = and(eq(auditLog.action, OUTCOME_AUDIT_ACTION), eq(auditLog.entityType, 'appointment'))!;
  if (!after) return base;
  return and(base, sql`(${auditLog.createdAt}, ${auditLog.id}) > (${after.position}::timestamptz, ${after.auditId}::uuid)`)!;
}

function outcomeAuditQuery(after: OutcomeRecordedCursor | null, limit: number) {
  return getDbContext()
    .select({
      auditId: auditLog.id,
      position: AUDIT_POSITION,
      auditCreatedAt: auditLog.createdAt,
      appointmentId: auditLog.entityId,
      metadata: auditLog.metadata,
      historyCount: STATUS_HISTORY_COUNT,
      historyPosition: STATUS_HISTORY_POSITION,
      status: appointment.status,
      rescheduledFromAppointmentId: appointment.rescheduledFromAppointmentId,
    })
    .from(auditLog)
    .leftJoin(appointment, eq(appointment.id, auditLog.entityId))
    .where(outcomeAuditWhere(after))
    .orderBy(asc(auditLog.createdAt), asc(auditLog.id))
    .limit(limit);
}

type Row = Awaited<ReturnType<typeof outcomeAuditQuery>>[number];

export function toOutcomeAuditRow(r: Row): OutcomeRecordedAuditRow {
  return {
    auditId: r.auditId,
    position: r.position,
    auditCreatedAt: r.auditCreatedAt,
    appointmentId: r.appointmentId,
    metadata: r.metadata,
    statusHistory: { count: Number(r.historyCount ?? 0), position: r.historyPosition ?? null },
    appointment: r.status === null ? null : { status: r.status, rescheduledFromAppointmentId: r.rescheduledFromAppointmentId },
  };
}

@Injectable()
export class DrizzleOutcomeRecordedAuditReader implements OutcomeRecordedAuditReader {
  async listAfter(after: OutcomeRecordedCursor | null, limit: number): Promise<OutcomeRecordedAuditRow[]> {
    return (await outcomeAuditQuery(after, limit)).map(toOutcomeAuditRow);
  }
}
