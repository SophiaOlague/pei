import type { OutcomeRecordedCursor, OutcomeRecordedFeed } from '../../../appointments/application/integration/outcome-recorded-feed';
import { noticeFromOutcomeFeed, type AppointmentNoShowRefundHandler, type NoShowRefundOutcome } from './appointment-no-show-refund.handler';
import { RECONCILE_MAX_PAGES, RECONCILE_PAGE_SIZE, RECONCILE_SAMPLE_SIZE } from './reconcile-canceled-appointment-refunds.use-case';

// Videoconsulta · garantía de durabilidad del reembolso por inasistencia: recorre TODA la historia de resultados de M08
// (OutcomeRecordedFeedService, paginación por clave estable, sin cursor persistente) y entrega cada aviso full_refund al
// MISMO manejador idempotente que la ruta en memoria. Repetirlo nunca duplica operaciones financieras. Mismo patrón y
// mismos límites que el barrido de cancelaciones (A.25), que no cambia.

export type ReconcileNoShowOutcomeKey = NoShowRefundOutcome['outcome'] | 'error';

export interface ReconcileNoShowsSummary {
  pages: number;
  examined: number;
  byOutcome: Partial<Record<ReconcileNoShowOutcomeKey, number>>;
  awaitingApproval: number;
  anomalies: number;
  anomalySample: { eventId: string; reason: string }[];
  errorSample: string[];
  complete: boolean;
}

export class OutcomeFeedStalledError extends Error {
  constructor() {
    super('El cursor de resultados no avanzó');
    this.name = 'OutcomeFeedStalledError';
  }
}

export interface ReconcileNoShowRefundsDeps {
  feed: OutcomeRecordedFeed;
  handler: Pick<AppointmentNoShowRefundHandler, 'handle'>;
}

export class ReconcileNoShowRefundsUseCase {
  constructor(private readonly d: ReconcileNoShowRefundsDeps) {}

  async execute(options: { pageSize?: number; maxPages?: number } = {}): Promise<ReconcileNoShowsSummary> {
    const pageSize = options.pageSize ?? RECONCILE_PAGE_SIZE;
    const maxPages = options.maxPages ?? RECONCILE_MAX_PAGES;
    const s: ReconcileNoShowsSummary = { pages: 0, examined: 0, byOutcome: {}, awaitingApproval: 0, anomalies: 0, anomalySample: [], errorSample: [], complete: false };
    let after: OutcomeRecordedCursor | null = null;
    do {
      if (s.pages >= maxPages) return s;
      const page = await this.d.feed.listOutcomes({ after, limit: pageSize });
      s.pages += 1;
      for (const a of page.anomalies) {
        s.anomalies += 1;
        if (s.anomalySample.length < RECONCILE_SAMPLE_SIZE) s.anomalySample.push({ eventId: a.eventId, reason: a.reason });
      }
      for (const n of page.items) {
        s.examined += 1;
        let key: ReconcileNoShowOutcomeKey;
        if (n.refundOutcome !== 'full_refund') {
          key = 'no_refund';
        } else {
          try {
            const r = await this.d.handler.handle(noticeFromOutcomeFeed(n));
            key = r.outcome;
            if ('action' in r && r.action === 'awaiting_approval') s.awaitingApproval += 1;
          } catch (error) {
            key = 'error';
            if (s.errorSample.length < RECONCILE_SAMPLE_SIZE) s.errorSample.push(`${n.eventId} (${(error as { name?: string })?.name ?? 'internal'})`);
          }
        }
        s.byOutcome[key] = (s.byOutcome[key] ?? 0) + 1;
      }
      if (page.next && after && page.next.position === after.position && page.next.auditId === after.auditId) throw new OutcomeFeedStalledError();
      after = page.next;
    } while (after);
    s.complete = true;
    return s;
  }
}
