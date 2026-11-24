import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RetryProviderWebhookEventsUseCase } from '../modules/payments/application/use-cases/provider-webhook.use-cases';
import { TRIPWIRE_MARK } from '../../test/support/db-tripwire';
import { disablePeriodicWebhookWorker, formatRetrySummary, PaymentsCliModule } from './payments-retry-webhooks';
import { WebhookRetryWorker } from '../modules/payments/infrastructure/webhook-retry.worker';
import { formatRefundRecovery } from './payments-recover-refunds';
import { RefundsUseCases } from '../modules/payments/application/use-cases/refunds.use-cases';
import { formatReconcileSummary } from './payments-reconcile-cancellations';
import { ReconcileCanceledAppointmentRefundsUseCase } from '../modules/payments/application/use-cases/reconcile-canceled-appointment-refunds.use-case';

// Sin ejecutar el CLI: el contexto compila sin conectar (db-tripwire cuenta cualquier intento) y el resumen solo tiene
// conteos. Ejecutarlo de verdad escribe en la BD y requiere autorización.
const attempts = () => (globalThis as Record<symbol, number>)[TRIPWIRE_MARK] ?? 0;

describe('CLI payments-retry-webhooks', () => {
  it('[H6-CLI-01] el CLI nunca arranca el worker periódico, aunque el entorno lo active', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const saved = process.env.PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED;
    process.env.PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED = 'true';
    const before = attempts();
    try {
      disablePeriodicWebhookWorker();
      expect(process.env.PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED).toBe('false');
      const app = await Test.createTestingModule({ imports: [PaymentsCliModule] }).compile();
      await app.init();
      expect(app.get(WebhookRetryWorker, { strict: false }).running).toBe(false);
      await app.close();
    } finally {
      if (saved === undefined) delete process.env.PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED;
      else process.env.PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED = saved;
    }
    expect(attempts()).toBe(before);
  });

  it('[H6-CLI-02] los CLI de pagos desactivan el worker antes de crear su contexto', () => {
    const { readFileSync } = require('fs') as typeof import('fs');
    for (const file of ['payments-retry-webhooks.ts', 'payments-recover-refunds.ts', 'payments-reconcile-cancellations.ts', 'payments-reconcile-fees.ts', 'payments-reconcile-no-shows.ts']) {
      const source = readFileSync(require('path').join(__dirname, file), 'utf8') as string;
      const disable = source.indexOf('disablePeriodicWebhookWorker();');
      const context = source.indexOf('NestFactory.createApplicationContext(PaymentsCliModule');
      expect({ file, ok: disable > -1 && context > disable }).toEqual({ file, ok: true });
    }
  });

  afterEach(() => jest.restoreAllMocks());

  it('el contexto propio resuelve el caso de uso de reintento sin abrir conexiones ni salir a la red', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const before = attempts();
    const app = await Test.createTestingModule({ imports: [PaymentsCliModule] }).compile();
    try {
      expect(app.get(RetryProviderWebhookEventsUseCase, { strict: false })).toBeInstanceOf(RetryProviderWebhookEventsUseCase);
      expect(app.get(RefundsUseCases, { strict: false })).toBeInstanceOf(RefundsUseCases);
      expect(app.get(ReconcileCanceledAppointmentRefundsUseCase, { strict: false })).toBeInstanceOf(ReconcileCanceledAppointmentRefundsUseCase);
    } finally {
      await app.close();
    }
    expect(attempts()).toBe(before);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resumen: solo conteos; código 1 si algún evento volvió a fallar', () => {
    expect(formatRetrySummary({ examined: 3, processed: 2, failed: 0, ignored: 1, skipped: 0 })).toEqual({
      line: 'Eventos de webhook examinados: 3; procesados: 2; ignorados: 1; omitidos: 0; con error: 0', exitCode: 0,
    });
    expect(formatRetrySummary({ examined: 1, processed: 0, failed: 1, ignored: 0, skipped: 0 }).exitCode).toBe(1);
  });

  it('F5 · resumen de recuperación de reembolsos: solo conteos; código 1 con revisión manual o errores', () => {
    expect(formatRefundRecovery({ examined: 3, byAction: { synced: 2, submitted: 1 } })).toEqual({ line: 'Reembolsos examinados: 3; submitted: 1; synced: 2', exitCode: 0 });
    expect(formatRefundRecovery({ examined: 0, byAction: {} })).toEqual({ line: 'Reembolsos examinados: 0', exitCode: 0 });
    expect(formatRefundRecovery({ examined: 2, byAction: { manual_review: 1, error: 1 } }).exitCode).toBe(1);
  });

  it('A.25 · resumen del barrido de cancelaciones: conteos e ids técnicos; código 1 con anomalías, errores o barrido incompleto', () => {
    const base = { pages: 2, examined: 3, byOutcome: { requested: 1, already_covered: 2 }, awaitingApproval: 1, anomalies: 0, anomalySample: [], errorSample: [], complete: true };
    expect(formatReconcileSummary(base)).toEqual({
      lines: ['Cancelaciones examinadas: 3 en 2 página(s); already_covered: 2; requested: 1; esperan aprobación: 1; anomalías: 0'], exitCode: 0,
    });
    const bad = formatReconcileSummary({ ...base, anomalies: 1, anomalySample: [{ eventId: 'appointment-canceled:a', reason: 'outcome_mismatch' }], complete: false });
    expect(bad.exitCode).toBe(1);
    expect(bad.lines).toEqual([expect.stringContaining('BARRIDO INCOMPLETO'), 'Anomalías (muestra): appointment-canceled:a=outcome_mismatch']);
    expect(formatReconcileSummary({ ...base, byOutcome: { error: 1 }, errorSample: ['appointment-canceled:b (Error)'] }).exitCode).toBe(1);
  });
});
