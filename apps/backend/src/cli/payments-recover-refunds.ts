// F5: recuperación de reembolsos. Avanza los reembolsos que quedaron abiertos (requested listos para enviar, pending sin
// respuesta fiable del proveedor, processing sin confirmar): reenvía con la MISMA X-Idempotency-Key (= refund.id) dentro
// de la ventana segura y consulta el estado real del resto. Nunca marca succeeded sin confirmación del proveedor.
// Idempotente: se puede ejecutar las veces que sea necesario. Solo imprime conteos.
//
//   npx ts-node --transpile-only src/cli/payments-recover-refunds.ts
//
// Escribe en la BD configurada y llama al proveedor de pagos (Stripe): ejecutarlo requiere autorización (y 0017 aplicada).
// Quién lo ejecuta y cada cuánto está pendiente de decisión (igual que payments-retry-webhooks).
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { RefundsUseCases, type RecoverRefundsSummary } from '../modules/payments/application/use-cases/refunds.use-cases';
import { db } from '../db';
import { disablePeriodicWebhookWorker, PaymentsCliModule } from './payments-retry-webhooks';

// Código 1 si algún reembolso necesita revisión manual o dio error (para que el planificador lo registre).
export function formatRefundRecovery(s: RecoverRefundsSummary): { line: string; exitCode: number } {
  const parts = Object.entries(s.byAction).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}: ${n}`);
  return {
    line: `Reembolsos examinados: ${s.examined}${parts.length ? `; ${parts.join('; ')}` : ''}`,
    exitCode: (s.byAction.manual_review ?? 0) + (s.byAction.error ?? 0) > 0 ? 1 : 0,
  };
}

async function main(): Promise<number> {
  disablePeriodicWebhookWorker();
  const app = await NestFactory.createApplicationContext(PaymentsCliModule, { logger: ['error', 'warn'] });
  try {
    const { line, exitCode } = formatRefundRecovery(await app.get(RefundsUseCases, { strict: false }).recover());
    console.log(line);
    return exitCode;
  } finally {
    await app.close();
    await db.$client.end();
  }
}

if (require.main === module) {
  void main().then((code) => process.exit(code));
}
