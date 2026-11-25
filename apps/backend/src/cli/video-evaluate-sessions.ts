// Videoconsulta: barrido de evaluación de inasistencias (RF-21; sin planificador). Evalúa las citas confirmed cuya hora ya
// pasó con el mismo motor que la sala: registra en M08 lo que una regla determina, informa los casos pendientes (huecos
// A y B y combinaciones sin regla, sin cerrarlos) y lista las consultas activas con su hora de inicio, sin plazo
// (decisión 12). Repetirlo no duplica nada. Solo imprime conteos e ids técnicos (sin datos personales).
//
//   npx ts-node --transpile-only src/cli/video-evaluate-sessions.ts
//
// Escribe en la BD configurada y requiere 0019 aplicada: ejecutarlo requiere autorización. Este contexto no monta pagos:
// los reembolsos de las inasistencias que registre los aplica después src/cli/payments-reconcile-no-shows.ts (barrido
// duradero e idempotente). La periodicidad es una decisión operativa separada.
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../modules/audit/audit.module';
import { PrivateStorageModule } from '../modules/private-storage/private-storage.module';
import { VideoModule } from '../modules/video/video.module';
import { EvaluateSessionsUseCase, type EvaluationSweepSummary } from '../modules/video/application/use-cases/evaluate-sessions.use-case';
import { db } from '../db';

// Contexto propio: los módulos globales que AppModule aporta a AppointmentsModule y DoctorsModule, y videoconsulta.
@Module({ imports: [CommonModule, AuthModule, AuditModule, PrivateStorageModule, VideoModule] })
export class VideoCliModule {}

// Código 1 si hubo errores (para que el planificador lo registre). Los casos pendientes y las consultas activas se
// informan, pero no son un error: esperan una decisión o la finalización del médico.
export function formatEvaluationSummary(s: EvaluationSweepSummary): { lines: string[]; exitCode: number } {
  const determined = Object.entries(s.determined).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}: ${n}`);
  const lines = [
    `Citas examinadas: ${s.examined}; inasistencias registradas: ${determined.length ? determined.join(', ') : 0}; en espera: ${s.waiting}; con consulta iniciada: ${s.started}; pendientes de definición: ${s.pending.length}; con error: ${s.errors.length}`,
  ];
  if (s.pending.length) lines.push(`Pendientes (sin regla en el Maestro; la cita sigue confirmed): ${s.pending.map((p) => `${p.appointmentId}=${p.reason} desde ${p.since}`).join(', ')}`);
  if (s.activeConsultations.length) lines.push(`Consultas activas sin finalizar (no se cierran solas): ${s.activeConsultations.map((a) => `${a.appointmentId} desde ${a.startedAt}`).join(', ')}`);
  if (s.errors.length) lines.push(`Errores (ids): ${s.errors.join(', ')}`);
  return { lines, exitCode: s.errors.length > 0 ? 1 : 0 };
}

async function main(): Promise<number> {
  const app = await NestFactory.createApplicationContext(VideoCliModule, { logger: ['error', 'warn'] });
  try {
    const { lines, exitCode } = formatEvaluationSummary(await app.get(EvaluateSessionsUseCase, { strict: false }).execute());
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
