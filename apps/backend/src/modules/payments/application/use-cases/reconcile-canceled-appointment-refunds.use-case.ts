import type { CanceledAppointmentCursor, CanceledAppointmentFeed } from '../../../appointments/application/integration/canceled-appointment-feed';
import { noticeFromFeed, type AppointmentCanceledRefundHandler, type CancellationRefundOutcome } from './appointment-canceled-refund.handler';

// A.25 (garantía de durabilidad de F5): recorre TODA la historia de cancelaciones de M08 (CanceledAppointmentFeed,
// paginación por clave estable, sin horizonte ni cursor persistente) y entrega cada aviso full_refund al MISMO manejador
// idempotente que la ruta en memoria. Repetirlo nunca duplica operaciones financieras: el reembolso es idempotente por
// pago (refund.appointment_canceled + payment.id) con el pago bloqueado, y refund_within_payment lo vuelve a comprobar.
// - no_refund no llama al manejador.
// - Las anomalías de M08 (discrepancias auditoría ↔ reglas, datos inconsistentes) no se procesan: se cuentan y se
//   devuelve una muestra de ids técnicos.
// - Un error en un aviso no detiene el barrido; el siguiente lo reintenta. Un error de la consulta (lectura) sí lo detiene:
//   no se avanza el cursor más allá de una página que no se pudo leer.
// - Sin avisos caso por caso (D-3): solo el resumen. La reevaluación de casos ya cubiertos es esperada y sin efectos.

export const RECONCILE_PAGE_SIZE = 200;
export const RECONCILE_SAMPLE_SIZE = 20;
// Defensa ante un cursor que no avanza (datos o lector incorrectos): nunca un bucle infinito.
export const RECONCILE_MAX_PAGES = 100_000;

export type ReconcileOutcomeKey = CancellationRefundOutcome['outcome'] | 'error';

export interface ReconcileCancellationsSummary {
  pages: number;
  examined: number;
  byOutcome: Partial<Record<ReconcileOutcomeKey, number>>;
  // Reembolsos registrados que esperan aprobación administrativa (parcial previo, PAY-17).
  awaitingApproval: number;
  anomalies: number;
  anomalySample: { eventId: string; reason: string }[];
  errorSample: string[];
  // false si el barrido se detuvo antes de terminar (error de lectura o límite de páginas).
  complete: boolean;
}

export class CancellationFeedStalledError extends Error {
  constructor() {
    super('El cursor de cancelaciones no avanzó');
    this.name = 'CancellationFeedStalledError';
  }
}

export interface ReconcileCanceledAppointmentRefundsDeps {
  feed: CanceledAppointmentFeed;
  handler: Pick<AppointmentCanceledRefundHandler, 'handle'>;
}

export class ReconcileCanceledAppointmentRefundsUseCase {
  constructor(private readonly d: ReconcileCanceledAppointmentRefundsDeps) {}

  async execute(options: { pageSize?: number; maxPages?: number } = {}): Promise<ReconcileCancellationsSummary> {
    const pageSize = options.pageSize ?? RECONCILE_PAGE_SIZE;
    const maxPages = options.maxPages ?? RECONCILE_MAX_PAGES;
    const s: ReconcileCancellationsSummary = { pages: 0, examined: 0, byOutcome: {}, awaitingApproval: 0, anomalies: 0, anomalySample: [], errorSample: [], complete: false };
    let after: CanceledAppointmentCursor | null = null;
    do {
      if (s.pages >= maxPages) return s;
      const page = await this.d.feed.listCanceled({ after, limit: pageSize });
      s.pages += 1;
      for (const a of page.anomalies) {
        s.anomalies += 1;
        if (s.anomalySample.length < RECONCILE_SAMPLE_SIZE) s.anomalySample.push({ eventId: a.eventId, reason: a.reason });
      }
      for (const n of page.items) {
        s.examined += 1;
        let key: ReconcileOutcomeKey;
        if (n.refundOutcome !== 'full_refund') {
          key = 'no_refund';
        } else {
          try {
            const r = await this.d.handler.handle(noticeFromFeed(n));
            key = r.outcome;
            if ('action' in r && r.action === 'awaiting_approval') s.awaitingApproval += 1;
          } catch (error) {
            key = 'error';
            if (s.errorSample.length < RECONCILE_SAMPLE_SIZE) s.errorSample.push(`${n.eventId} (${(error as { name?: string })?.name ?? 'internal'})`);
          }
        }
        s.byOutcome[key] = (s.byOutcome[key] ?? 0) + 1;
      }
      if (page.next && after && page.next.position === after.position && page.next.auditId === after.auditId) throw new CancellationFeedStalledError();
      after = page.next;
    } while (after);
    s.complete = true;
    return s;
  }
}
