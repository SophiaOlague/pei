// F3.3: recuperación de webhooks del proveedor de pagos (Stripe). Reprocesa los eventos `failed` con intentos disponibles, los `received`
// que nunca se despacharon (p. ej. el servidor se reinició tras registrarlos) y los `processing` abandonados.
// Es idempotente: se puede ejecutar las veces que sea necesario (reclamo atómico del evento, bloqueo del pago y
// confirmPaid/markPaymentFailed idempotentes en M08). Solo imprime conteos; nunca ids de pago, payloads ni credenciales.
//
//   npx ts-node --transpile-only src/cli/payments-retry-webhooks.ts
//
// Escribe en la BD configurada y consulta al proveedor de pagos (Stripe): ejecutarlo requiere autorización (y 0017 aplicada).
// Quién lo ejecuta y cada cuánto (planificador externo) está pendiente de decisión.
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../modules/audit/audit.module';
import { PrivateStorageModule } from '../modules/private-storage/private-storage.module';
import { disablePeriodicWebhookWorker, PaymentsModule } from '../modules/payments/payments.module';
import { RetryProviderWebhookEventsUseCase, type RetryWebhookSummary } from '../modules/payments/application/use-cases/provider-webhook.use-cases';
import { db } from '../db';

// Contexto propio (sin tocar CliModule): los demás CLI no dependen de la configuración del proveedor de pagos. Incluye los
// módulos globales que AppModule aporta a AppointmentsModule (importado por PaymentsModule).
@Module({ imports: [CommonModule, AuthModule, AuditModule, PrivateStorageModule, PaymentsModule] })
export class PaymentsCliModule {}

// H-6: un CLI de pagos es una ejecución corta y puntual; nunca arranca el worker periódico de recuperación. Lo usan los
// tres CLI que montan PaymentsCliModule (este, payments-recover-refunds y payments-reconcile-cancellations).
export { disablePeriodicWebhookWorker };

// Código de salida 1 si algún evento volvió a fallar (para que el planificador lo registre).
export function formatRetrySummary(s: RetryWebhookSummary): { line: string; exitCode: number } {
  return {
    line: `Eventos de webhook examinados: ${s.examined}; procesados: ${s.processed}; ignorados: ${s.ignored}; omitidos: ${s.skipped}; con error: ${s.failed}`,
    exitCode: s.failed > 0 ? 1 : 0,
  };
}

async function main(): Promise<number> {
  disablePeriodicWebhookWorker();
  const app = await NestFactory.createApplicationContext(PaymentsCliModule, { logger: ['error', 'warn'] });
  try {
    const { line, exitCode } = formatRetrySummary(await app.get(RetryProviderWebhookEventsUseCase, { strict: false }).execute());
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
