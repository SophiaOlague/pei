import { Inject, Injectable } from '@nestjs/common';
import { resolveChain } from '../../domain/appointment-chain';
import { AppointmentChainBrokenError } from '../../domain/appointments.errors';
import { DOCTOR_CANCELLATION_OUTCOME, hoursUntil, patientCancellationOutcome, type RefundOutcome } from '../../domain/cancellation-rules';
import { APPOINTMENT_AUDIT_ACTIONS } from '../appointments-audit-events';
import { APPOINTMENT_REPOSITORY, type AppointmentRepository } from '../ports/appointments.ports';

// M08 · A.25 (propuesto como «A.21» en la propuesta de durabilidad; ese número ya era RF-51): consulta DURADERA de
// cancelaciones para pagos. Complementa AppointmentCanceled (entrega en memoria después del COMMIT, no durable): si el
// proceso cae entre el COMMIT de la cancelación y el manejador de pagos, la cancelación sigue disponible aquí.
//
// - Solo lectura y sin ruta HTTP (AP-16). M08 no depende de pagos (RT-M08-03) y no expone importes ni comisiones.
// - Fuente de verdad (D-1): el `refundOutcome` LITERAL de la fila `appointment.status.canceled` de audit_log, escrita en
//   la MISMA transacción que la cancelación (D6 de auditoría) y protegida contra UPDATE/DELETE. Se verifica contra las
//   reglas de M08 (patientCancellationOutcome / DOCTOR_CANCELLATION_OUTCOME con la versión de política de la cita); si no
//   coincide, el aviso se excluye y se informa como anomalía. Pagos nunca recalcula reglas.
// - Referencia temporal (D-5), verificación EXACTA y sin tolerancia (revisión del 2026-11-14):
//   1. audit_log.created_at = appointment_status_history.created_at de la fila `canceled`. Los dos son now() de
//      PostgreSQL (trigger de audit_log y DEFAULT del historial) en la MISMA transacción de cancelación: mismo reloj y
//      mismo instante, al microsegundo; ambas tablas son de solo inserción. Se compara la posición exacta (texto con
//      microsegundos), no el Date de JavaScript (milisegundos).
//   2. Integridad de appointment.cancelled_at: la auditoría guarda hoursBefore = round(hoursUntil(scheduled_at, now), 2)
//      con el MISMO `now` que se guarda como cancelled_at (reloj de la aplicación). Recalcularlo con cancelled_at debe dar
//      exactamente el mismo número. No compara relojes distintos, así que no depende del desfase entre la aplicación y la
//      BD ni de las esperas de candados.
//   cancelled_at, ya verificado, alimenta la regla de la política (refundOutcome).
// - Paginación (D-2): por clave estable (created_at con microsegundos, id de auditoría), desde el principio de la
//   historia en cada barrido. No hay cursor persistente: una transacción que confirme tarde con un created_at anterior
//   aparece en el siguiente barrido completo, nunca queda fuera para siempre.

export const CANCELED_APPOINTMENT_NOTICE_VERSION = 1 as const;
export const MAX_FEED_PAGE_SIZE = 500;

// hoursBefore tal como lo audita la cancelación: misma regla que `round(hoursUntil(a.scheduledAt, now))` de
// cancellation.use-cases.ts (sin cambios desde 7a730ba; una prueba de contrato ejecuta los casos de uso reales).
export const auditedHoursBefore = (scheduledAt: Date, cancelledAt: Date): number => Math.round(hoursUntil(scheduledAt, cancelledAt) * 100) / 100;

export interface CanceledAppointmentNotice {
  version: typeof CANCELED_APPOINTMENT_NOTICE_VERSION;
  // Determinista: una cita se cancela una sola vez (canceled es terminal). El evento en memoria deriva el mismo id.
  eventId: `appointment-canceled:${string}`;
  appointmentId: string;
  // Raíz de la cadena (DA-6, resolveChain). El reembolso se hace sobre el pago de la raíz (RN-018).
  rootAppointmentId: string;
  canceledBy: 'patient' | 'doctor';
  // Literal de la auditoría, ya verificado contra las reglas de M08.
  refundOutcome: RefundOutcome;
  // audit_log.created_at (ISO 8601, milisegundos).
  occurredAt: string;
}

export type CanceledAppointmentAnomalyReason =
  | 'invalid_audit_metadata' // metadata sin refundOutcome/actorType válidos
  | 'appointment_missing'
  | 'status_mismatch' // la cita no está canceled
  | 'actor_mismatch' // cancelled_by_type distinto del actorType auditado
  | 'cancelled_at_missing'
  | 'history_missing' // no hay fila `canceled` en appointment_status_history
  | 'history_ambiguous' // hay más de una fila `canceled` (canceled es terminal: no debería ocurrir)
  | 'history_time_mismatch' // audit_log.created_at ≠ created_at del historial: no son la misma transacción
  | 'hours_before_mismatch' // hoursBefore auditado ≠ el recalculado con cancelled_at (cancelled_at o hoursBefore alterados)
  | 'policy_missing'
  | 'outcome_mismatch' // el literal auditado no es el que dan las reglas de M08
  | 'chain_broken'; // la raíz no se puede resolver (AppointmentChainBrokenError)

// Aviso excluido del procesamiento automático. Solo identificadores técnicos (sin motivo ni datos personales).
export interface CanceledAppointmentAnomaly {
  eventId: string;
  appointmentId: string | null;
  auditId: string;
  occurredAt: string;
  reason: CanceledAppointmentAnomalyReason;
}

// Cursor opaco para el consumidor: posición exacta (UTC con microsegundos, tal como la ordena PostgreSQL) + id.
export interface CanceledAppointmentCursor {
  position: string;
  auditId: string;
}

export interface CanceledAppointmentPage {
  items: CanceledAppointmentNotice[];
  anomalies: CanceledAppointmentAnomaly[];
  // null: no hay más filas. Una página puede tener menos avisos que `limit` (anomalías incluidas en el conteo).
  next: CanceledAppointmentCursor | null;
}

export interface CanceledAppointmentQuery {
  after?: CanceledAppointmentCursor | null;
  limit: number;
}

export interface CanceledAppointmentFeed {
  listCanceled(query: CanceledAppointmentQuery): Promise<CanceledAppointmentPage>;
}

// --- Puerto de lectura (solo infraestructura conoce las tablas) -----------------------------------------------------

export interface CanceledAppointmentAuditRow {
  auditId: string;
  // Posición exacta de la fila (created_at en UTC con microsegundos), para el cursor.
  position: string;
  auditCreatedAt: Date;
  appointmentId: string | null;
  metadata: unknown;
  // Filas `canceled` de appointment_status_history de la cita: cuántas hay y la posición exacta (UTC, microsegundos) de
  // la primera. Sin historial: { count: 0, position: null }.
  canceledHistory: { count: number; position: string | null };
  appointment: {
    status: string;
    scheduledAt: Date;
    cancelledAt: Date | null;
    cancelledByType: string | null;
    rescheduledFromAppointmentId: string | null;
    // refund_deadline_hours de la versión de política aplicada a la cita (null si la versión no existe).
    refundDeadlineHours: number | null;
  } | null;
}

export interface CanceledAppointmentAuditReader {
  // Filas `appointment.status.canceled` en orden (created_at, id), estrictamente después de `after`.
  listAfter(after: CanceledAppointmentCursor | null, limit: number): Promise<CanceledAppointmentAuditRow[]>;
}
export const CANCELED_APPOINTMENT_AUDIT_READER = Symbol('CANCELED_APPOINTMENT_AUDIT_READER');

export const CANCELED_AUDIT_ACTION = APPOINTMENT_AUDIT_ACTIONS.canceled;
const CURSOR_POSITION = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidCanceledAppointmentCursorError extends Error {
  constructor() {
    super('Cursor de cancelaciones inválido');
    this.name = 'InvalidCanceledAppointmentCursorError';
  }
}

export const canceledEventId = (appointmentId: string) => `appointment-canceled:${appointmentId}` as const;

@Injectable()
export class CanceledAppointmentFeedService implements CanceledAppointmentFeed {
  constructor(
    @Inject(CANCELED_APPOINTMENT_AUDIT_READER) private readonly reader: CanceledAppointmentAuditReader,
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointments: Pick<AppointmentRepository, 'findById'>,
  ) {}

  async listCanceled(query: CanceledAppointmentQuery): Promise<CanceledAppointmentPage> {
    const limit = Math.trunc(query.limit);
    if (!Number.isFinite(limit) || limit < 1 || limit > MAX_FEED_PAGE_SIZE) throw new RangeError(`limit debe estar entre 1 y ${MAX_FEED_PAGE_SIZE}`);
    const after = query.after ?? null;
    if (after && (!CURSOR_POSITION.test(after.position) || !UUID.test(after.auditId))) throw new InvalidCanceledAppointmentCursorError();

    const rows = await this.reader.listAfter(after, limit);
    const page: CanceledAppointmentPage = { items: [], anomalies: [], next: null };
    for (const row of rows) {
      const result = await this.verify(row);
      if ('reason' in result) page.anomalies.push(result);
      else page.items.push(result);
    }
    // Solo hay página siguiente si se llenó la actual; la última fila (aviso o anomalía) marca la posición.
    if (rows.length === limit) page.next = { position: rows[rows.length - 1].position, auditId: rows[rows.length - 1].auditId };
    return page;
  }

  private async verify(row: CanceledAppointmentAuditRow): Promise<CanceledAppointmentNotice | CanceledAppointmentAnomaly> {
    const anomaly = (reason: CanceledAppointmentAnomalyReason): CanceledAppointmentAnomaly => ({
      eventId: row.appointmentId ? canceledEventId(row.appointmentId) : `appointment-canceled:audit-${row.auditId}`,
      appointmentId: row.appointmentId,
      auditId: row.auditId,
      occurredAt: row.auditCreatedAt.toISOString(),
      reason,
    });
    const m = (typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {}) as { refundOutcome?: unknown; actorType?: unknown; hoursBefore?: unknown };
    const literal = m.refundOutcome;
    const actor = m.actorType;
    const hoursBefore = m.hoursBefore;
    if (
      (literal !== 'full_refund' && literal !== 'no_refund') || (actor !== 'patient' && actor !== 'doctor') || typeof hoursBefore !== 'number' ||
      !Number.isFinite(hoursBefore) || !row.appointmentId
    ) {
      return anomaly('invalid_audit_metadata');
    }
    const a = row.appointment;
    if (!a) return anomaly('appointment_missing');
    if (a.status !== 'canceled') return anomaly('status_mismatch');
    if (a.cancelledByType !== actor) return anomaly('actor_mismatch');
    if (!a.cancelledAt) return anomaly('cancelled_at_missing');
    // Misma transacción: igualdad exacta de now() (mismo reloj), sin tolerancia.
    if (row.canceledHistory.count === 0) return anomaly('history_missing');
    if (row.canceledHistory.count > 1) return anomaly('history_ambiguous');
    if (row.canceledHistory.position !== row.position) return anomaly('history_time_mismatch');
    // Integridad de cancelled_at frente al hoursBefore auditado con el mismo `now` (mismo reloj), sin tolerancia.
    if (auditedHoursBefore(a.scheduledAt, a.cancelledAt) !== hoursBefore) return anomaly('hours_before_mismatch');
    if (actor === 'patient' && a.refundDeadlineHours === null) return anomaly('policy_missing');
    const expected: RefundOutcome = actor === 'doctor' ? DOCTOR_CANCELLATION_OUTCOME : patientCancellationOutcome(a.scheduledAt, a.cancelledAt, a.refundDeadlineHours!);
    if (expected !== literal) return anomaly('outcome_mismatch');

    let rootAppointmentId: string;
    try {
      rootAppointmentId = (await resolveChain({ id: row.appointmentId, rescheduledFromAppointmentId: a.rescheduledFromAppointmentId }, (id) => this.appointments.findById(id))).rootId;
    } catch (error) {
      // Solo una cadena inconsistente es anomalía; un error de lectura se propaga (el barrido falla y se reintenta,
      // nunca se salta la fila).
      if (error instanceof AppointmentChainBrokenError) return anomaly('chain_broken');
      throw error;
    }
    return {
      version: CANCELED_APPOINTMENT_NOTICE_VERSION,
      eventId: canceledEventId(row.appointmentId),
      appointmentId: row.appointmentId,
      rootAppointmentId,
      canceledBy: actor,
      refundOutcome: literal,
      occurredAt: row.auditCreatedAt.toISOString(),
    };
  }
}
