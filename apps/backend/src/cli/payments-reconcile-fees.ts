// H-2/H-3: conciliación de la comisión real del procesador (Stripe). Recorre los pagos con cobro capturado y sin
// fee_reconciled_at (los que aún no tienen la comisión real y, como backfill, los que la tienen guardada sin marca),
// consulta cada PaymentIntent y marca la comisión como conciliada solo con un balance_transaction verificado. Nunca
// usa la tarifa estimada, nunca sobrescribe importes y un fallo no detiene los siguientes. Solo imprime conteos.
//
//   npx ts-node --transpile-only src/cli/payments-reconcile-fees.ts [--limit N]
//
// Escribe en la BD configurada y CONSULTA Stripe (solo GET). Por decisión del 2026-11-16 solo se ejecuta contra Stripe
// TEST (desarrollo y C2): con STRIPE_ENV distinto de test o NODE_ENV=production se niega a arrancar. Ejecutarlo requiere
// autorización. No hay ejecución periódica: no arranca el worker de webhooks.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ReconcileProviderFeesUseCase, type ReconcileFeesSummary } from '../modules/payments/application/use-cases/reconcile-provider-fees.use-case';
import { db } from '../db';
import { disablePeriodicWebhookWorker, PaymentsCliModule } from './payments-retry-webhooks';

export class FeeReconciliationCliError extends Error {
  constructor(reason: string) {
    super(`payments-reconcile-fees: ${reason}`);
    this.name = 'FeeReconciliationCliError';
  }
}

// Solo Stripe TEST y nunca NODE_ENV=production (no hay backfill en producción).
export function assertFeeReconciliationAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if ((env.STRIPE_ENV ?? '').trim() !== 'test') throw new FeeReconciliationCliError('solo se ejecuta con STRIPE_ENV=test (desarrollo y C2)');
  if ((env.NODE_ENV ?? '').trim() === 'production') throw new FeeReconciliationCliError('no se ejecuta con NODE_ENV=production');
}

export function parseLimit(argv: string[]): number | undefined {
  const i = argv.indexOf('--limit');
  if (i < 0) return undefined;
  const value = argv[i + 1] ?? '';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 1000) throw new FeeReconciliationCliError('--limit debe ser un entero de 1 a 1000');
  return Number(value);
}

// Código 1 si algún pago falló (para que quien lo ejecute lo registre). Los pendientes no son un error.
export function formatFeeReconciliation(s: ReconcileFeesSummary): { line: string; exitCode: number } {
  return {
    line: `Pagos examinados: ${s.examined}; conciliados: ${s.reconciled}; pendientes de balance_transaction: ${s.pending}; con error: ${s.failed}`,
    exitCode: s.failed > 0 ? 1 : 0,
  };
}

async function main(argv: string[]): Promise<number> {
  assertFeeReconciliationAllowed();
  const limit = parseLimit(argv);
  disablePeriodicWebhookWorker();
  const app = await NestFactory.createApplicationContext(PaymentsCliModule, { logger: ['error', 'warn'] });
  try {
    const { line, exitCode } = formatFeeReconciliation(await app.get(ReconcileProviderFeesUseCase, { strict: false }).execute({ limit }));
    console.log(line);
    return exitCode;
  } finally {
    await app.close();
    await db.$client.end();
  }
}

if (require.main === module) {
  void main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof FeeReconciliationCliError ? error.message : `error (${error instanceof Error ? error.name : 'desconocido'})`);
      process.exit(1);
    });
}
