import { Inject, Injectable } from '@nestjs/common';
import { resolveChain } from '../../domain/appointment-chain';
import { AppointmentChainBrokenError } from '../../domain/appointments.errors';
import type { RefundOutcome } from '../../domain/cancellation-rules';
import { isOutcomeStatus, outcomeRefund, type OutcomeStatus } from '../../domain/outcome-rules';
import { APPOINTMENT_AUDIT_ACTIONS } from '../appointments-audit-events';
import { APPOINTMENT_REPOSITORY, type AppointmentRepository } from '../ports/appointments.ports';
import { MAX_FEED_PAGE_SIZE, type CanceledAppointmentCursor } from './canceled-appointment-feed';

// M08 · consulta DURADERA de resultados de videoconsulta (completed y las tres inasistencias) para pagos. Es el mismo
// patrón que A.25 (cancelaciones): complementa AppointmentOutcomeRecorded (en memoria después del COMMIT, no durable).
//
// - Solo lectura y sin ruta HTTP (AP-16). M08 no depende de pagos ni de videoconsulta (RT-M08-03).
// - Fuente de verdad: la fila `appointment.outcome.recorded` de audit_log, escrita en la MISMA transacción que el cambio
//   de estado. Se verifica que la cita tenga ese estado, que el historial tenga una sola fila de ese estado con la MISMA
//   posición (now() de la misma transacción) y que el refundOutcome auditado sea el de las reglas de M08
//   (outcome-rules.ts). Si algo no cuadra, el aviso se excluye y se informa como anomalía. Pagos nunca recalcula reglas.
// - Paginación por clave estable (created_at con microsegundos, id), desde el principio en cada barrido.

export const OUTCOME_RECORDED_NOTICE_VERSION = 1 as const;
export const OUTCOME_AUDIT_ACTION = APPOINTMENT_AUDIT_ACTIONS.outcomeRecorded;

export interface OutcomeRecordedNotice {
  version: typeof OUTCOME_RECORDED_NOTICE_VERSION;
  // Determinista: un resultado es terminal (una sola vez por cita). El evento en memoria deriva el mismo id.
  eventId: `appointment-outcome:${string}`;
  appointmentId: string;
  // Raíz de la cadena (DA-6): el reembolso se hace sobre el pago de la raíz (RN-018).
  rootAppointmentId: string;
  status: OutcomeStatus;
  refundOutcome: RefundOutcome;
  // audit_log.created_at (ISO 8601, milisegundos).
  occurredAt: string;
}

export type OutcomeRecordedAnomalyReason =
  | 'invalid_audit_metadata'
  | 'appointment_missing'
  | 'status_mismatch'
  | 'history_missing'
  | 'history_ambiguous'
  | 'history_time_mismatch'
  | 'outcome_mismatch'
  | 'chain_broken';

export interface OutcomeRecordedAnomaly {
  eventId: string;
  appointmentId: string | null;
  auditId: string;
  occurredAt: string;
  reason: OutcomeRecordedAnomalyReason;
}

// El cursor tiene la misma forma que el de cancelaciones (posición con microsegundos + id de auditoría).
export type OutcomeRecordedCursor = CanceledAppointmentCursor;

export interface OutcomeRecordedPage {
  items: OutcomeRecordedNotice[];
  anomalies: OutcomeRecordedAnomaly[];
  next: OutcomeRecordedCursor | null;
}

export interface OutcomeRecordedFeed {
  listOutcomes(query: { after?: OutcomeRecordedCursor | null; limit: number }): Promise<OutcomeRecordedPage>;
}

export interface OutcomeRecordedAuditRow {
  auditId: string;
  position: string;
  auditCreatedAt: Date;
  appointmentId: string | null;
  metadata: unknown;
  // Filas del historial de la cita con el estado auditado: cuántas hay y la posición exacta de la primera.
  statusHistory: { count: number; position: string | null };
  appointment: { status: string; rescheduledFromAppointmentId: string | null } | null;
}

export interface OutcomeRecordedAuditReader {
  listAfter(after: OutcomeRecordedCursor | null, limit: number): Promise<OutcomeRecordedAuditRow[]>;
}
export const OUTCOME_RECORDED_AUDIT_READER = Symbol('OUTCOME_RECORDED_AUDIT_READER');

const CURSOR_POSITION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidOutcomeRecordedCursorError extends Error {
  constructor() {
    super('Cursor de resultados inválido');
    this.name = 'InvalidOutcomeRecordedCursorError';
  }
}

export const outcomeEventId = (appointmentId: string) => `appointment-outcome:${appointmentId}` as const;

@Injectable()
export class OutcomeRecordedFeedService implements OutcomeRecordedFeed {
  constructor(
    @Inject(OUTCOME_RECORDED_AUDIT_READER) private readonly reader: OutcomeRecordedAuditReader,
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: Pick<AppointmentRepository, 'findById'>,
  ) {}

  async listOutcomes(query: { after?: OutcomeRecordedCursor | null; limit: number }): Promise<OutcomeRecordedPage> {
    const limit = Math.trunc(query.limit);
    if (!Number.isFinite(limit) || limit < 1 || limit > MAX_FEED_PAGE_SIZE) throw new RangeError(`limit debe estar entre 1 y ${MAX_FEED_PAGE_SIZE}`);
    const after = query.after ?? null;
    if (after && (!CURSOR_POSITION.test(after.position) || !UUID.test(after.auditId))) throw new InvalidOutcomeRecordedCursorError();

    const rows = await this.reader.listAfter(after, limit);
    const page: OutcomeRecordedPage = { items: [], anomalies: [], next: null };
    for (const row of rows) {
      const result = await this.verify(row);
      if ('reason' in result) page.anomalies.push(result);
      else page.items.push(result);
    }
    if (rows.length === limit) page.next = { position: rows[rows.length - 1].position, auditId: rows[rows.length - 1].auditId };
    return page;
  }

  private async verify(row: OutcomeRecordedAuditRow): Promise<OutcomeRecordedNotice | OutcomeRecordedAnomaly> {
    const anomaly = (reason: OutcomeRecordedAnomalyReason): OutcomeRecordedAnomaly => ({
      eventId: row.appointmentId ? outcomeEventId(row.appointmentId) : `appointment-outcome:audit-${row.auditId}`,
      appointmentId: row.appointmentId,
      auditId: row.auditId,
      occurredAt: row.auditCreatedAt.toISOString(),
      reason,
    });
    const m = (typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {}) as { status?: unknown; refundOutcome?: unknown };
    const status = m.status;
    const literal = m.refundOutcome;
    if (typeof status !== 'string' || !isOutcomeStatus(status) || (literal !== 'full_refund' && literal !== 'no_refund') || !row.appointmentId) {
      return anomaly('invalid_audit_metadata');
    }
    const a = row.appointment;
    if (!a) return anomaly('appointment_missing');
    if (a.status !== status) return anomaly('status_mismatch');
    if (row.statusHistory.count === 0) return anomaly('history_missing');
    if (row.statusHistory.count > 1) return anomaly('history_ambiguous');
    if (row.statusHistory.position !== row.position) return anomaly('history_time_mismatch');
    if (outcomeRefund(status) !== literal) return anomaly('outcome_mismatch');

    let rootAppointmentId: string;
    try {
      rootAppointmentId = (await resolveChain({ id: row.appointmentId, rescheduledFromAppointmentId: a.rescheduledFromAppointmentId }, (id) => this.appointments.findById(id))).rootId;
    } catch (error) {
      if (error instanceof AppointmentChainBrokenError) return anomaly('chain_broken');
      throw error;
    }
    return {
      version: OUTCOME_RECORDED_NOTICE_VERSION,
      eventId: outcomeEventId(row.appointmentId),
      appointmentId: row.appointmentId,
      rootAppointmentId,
      status,
      refundOutcome: literal,
      occurredAt: row.auditCreatedAt.toISOString(),
    };
  }
}
