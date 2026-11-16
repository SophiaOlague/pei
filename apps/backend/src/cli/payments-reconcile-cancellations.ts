// A.25: barrido duradero de cancelaciones con reembolso. Recorre toda la historia de cancelaciones de M08
// (CanceledAppointmentFeed) y registra, de forma idempotente, el reembolso de las full_refund que la ruta en memoria no
// llegó a procesar (p. ej. el proceso cayó entre el COMMIT de M08 y el listener). Reejecutarlo no duplica reembolsos.
// Solo imprime conteos e ids técnicos de anomalías (sin datos personales).
//
//   npx ts-node --transpile-only src/cli/payments-reconcile-cancellations.ts
//
// Escribe en la BD configurada y puede llamar al proveedor de pagos (Stripe): ejecutarlo requiere autorización (y 0017 aplicada).
// La periodicidad es una decisión operativa separada (no hay planificador).
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ReconcileCanceledAppointmentRefundsUseCase, type ReconcileCancellationsSummary } from '../modules/payments/application/use-cases/reconcile-canceled-appointment-refunds.use-case';
import { db } from '../db';
import { disablePeriodicWebhookWorker, PaymentsCliModule } from './payments-retry-webhooks';

// Código 1 si hay anomalías, errores o el barrido no terminó (para que el planificador lo registre). Los reembolsos que
// esperan aprobación se informan, pero no son un error.
export function formatReconcileSummary(s: ReconcileCancellationsSummary): { lines: string[]; exitCode: number } {
  const outcomes = Object.entries(s.byOutcome).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}: ${n}`);
  const lines = [
    `Cancelaciones examinadas: ${s.examined} en ${s.pages} página(s)${outcomes.length ? `; ${outcomes.join('; ')}` : ''}; esperan aprobación: ${s.awaitingApproval}; anomalías: ${s.anomalies}${s.complete ? '' : '; BARRIDO INCOMPLETO'}`,
  ];
  if (s.anomalySample.length) lines.push(`Anomalías (muestra): ${s.anomalySample.map((a) => `${a.eventId}=${a.reason}`).join(', ')}`);
  if (s.errorSample.length) lines.push(`Errores (muestra): ${s.errorSample.join(', ')}`);
  return { lines, exitCode: s.anomalies > 0 || (s.byOutcome.error ?? 0) > 0 || !s.complete ? 1 : 0 };
}

async function main(): Promise<number> {
  disablePeriodicWebhookWorker();
  const app = await NestFactory.createApplicationContext(PaymentsCliModule, { logger: ['error', 'warn'] });
  try {
    const { lines, exitCode } = formatReconcileSummary(await app.get(ReconcileCanceledAppointmentRefundsUseCase, { strict: false }).execute());
    for (const line of lines) console.log(line);
    return exitCode;
  } finally {
    await app.close();
    await db.$client.end();
  }
}

if (require.main === module) {
  void main().then((code) => process.exit(code));
}
