import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TRIPWIRE_MARK } from '../../test/support/db-tripwire';
import { ReconcileProviderFeesUseCase } from '../modules/payments/application/use-cases/reconcile-provider-fees.use-case';
import { assertFeeReconciliationAllowed, FeeReconciliationCliError, formatFeeReconciliation, parseLimit } from './payments-reconcile-fees';
import { PaymentsCliModule } from './payments-retry-webhooks';

// H-2/H-3 (sin ejecutar el CLI): salvaguardas, argumentos, resumen y contexto sin conexiones.
const attempts = () => (globalThis as Record<symbol, number>)[TRIPWIRE_MARK] ?? 0;

describe('CLI payments-reconcile-fees', () => {
  afterEach(() => jest.restoreAllMocks());

  it('[H2-CLI-01] solo con Stripe TEST y nunca con NODE_ENV=production (sin backfill en producción)', () => {
    expect(() => assertFeeReconciliationAllowed({ STRIPE_ENV: 'test' })).not.toThrow();
    for (const env of [{}, { STRIPE_ENV: 'live' }, { STRIPE_ENV: '' }, { STRIPE_ENV: 'test', NODE_ENV: 'production' }]) {
      expect(() => assertFeeReconciliationAllowed(env)).toThrow(FeeReconciliationCliError);
    }
  });

  it('[H2-CLI-02] --limit de 1 a 1000; el resumen solo tiene conteos y sale con 1 si algún pago falló', () => {
    expect(parseLimit([])).toBeUndefined();
    expect(parseLimit(['--limit', '25'])).toBe(25);
    for (const bad of [['--limit'], ['--limit', '0'], ['--limit', '1001'], ['--limit', 'x']]) expect(() => parseLimit(bad)).toThrow(FeeReconciliationCliError);
    expect(formatFeeReconciliation({ examined: 3, reconciled: 2, pending: 1, failed: 0 })).toEqual({
      line: 'Pagos examinados: 3; conciliados: 2; pendientes de balance_transaction: 1; con error: 0', exitCode: 0,
    });
    expect(formatFeeReconciliation({ examined: 1, reconciled: 0, pending: 0, failed: 1 }).exitCode).toBe(1);
  });

  it('[H2-CLI-03] el contexto resuelve el caso de uso sin abrir conexiones', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const before = attempts();
    const app = await Test.createTestingModule({ imports: [PaymentsCliModule] }).compile();
    try {
      expect(app.get(ReconcileProviderFeesUseCase, { strict: false })).toBeInstanceOf(ReconcileProviderFeesUseCase);
    } finally {
      await app.close();
    }
    expect(attempts()).toBe(before);
  });
});
