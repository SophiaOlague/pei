// Videoconsulta: barrido duradero de reembolsos por inasistencia (no_show_doctor y no_show_both). Recorre toda la
// historia de resultados de M08 (OutcomeRecordedFeedService) y registra, de forma idempotente, el reembolso total que la
// ruta en memoria no llegó a procesar. Reejecutarlo no duplica reembolsos. Solo imprime conteos e ids técnicos.
//
//   npx ts-node --transpile-only src/cli/payments-reconcile-no-shows.ts
//
// Escribe en la BD configurada y puede llamar al proveedor de pagos (Stripe): ejecutarlo requiere autorización (y 0019
// aplicada). No toca el barrido de cancelaciones (payments-reconcile-cancellations.ts).
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ReconcileNoShowRefundsUseCase, type ReconcileNoShowsSummary } from '../modules/payments/application/use-cases/reconcile-no-show-refunds.use-case';
import { db } from '../db';
import { disablePeriodicWebhookWorker, PaymentsCliModule } from './payments-retry-webhooks';

// Código 1 si hay anomalías, errores o el barrido no terminó. Los reembolsos que esperan aprobación se informan, pero no
// son un error.
export function formatNoShowReconcileSummary(s: ReconcileNoShowsSummary): { lines: string[]; exitCode: number } {
  const outcomes = Object.entries(s.byOutcome).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}: ${n}`);
  const lines = [
    `Resultados examinados: ${s.examined} en ${s.pages} página(s)${outcomes.length ? `; ${outcomes.join('; ')}` : ''}; esperan aprobación: ${s.awaitingApproval}; anomalías: ${s.anomalies}${s.complete ? '' : '; INCOMPLETO'}`,
  ];
  if (s.anomalySample.length) lines.push(`Anomalías (muestra): ${s.anomalySample.map((a) => `${a.eventId}=${a.reason}`).join(', ')}`);
  if (s.errorSample.length) lines.push(`Errores (muestra): ${s.errorSample.join(', ')}`);
  return { lines, exitCode: s.anomalies > 0 || (s.byOutcome.error ?? 0) > 0 || !s.complete ? 1 : 0 };
}

async function main(): Promise<number> {
  disablePeriodicWebhookWorker();
  const app = await NestFactory.createApplicationContext(PaymentsCliModule, { logger: ['error', 'warn'] });
  try {
    const { lines, exitCode } = formatNoShowReconcileSummary(await app.get(ReconcileNoShowRefundsUseCase, { strict: false }).execute());
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
