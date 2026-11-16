// M08: punto de entrada de la carga inicial de configuración de citas (ver appointments-config-seed.run.ts).
// Escribe solo con --apply y --target-branch autorizado (hoy, solo desarrollo, con --confirm-main-db). NO ejecutado (AP-11).
// Todas las lecturas y escrituras usan getDbContext(): dentro de inTransaction comparten la transacción (los servicios
// de publicación abren SAVEPOINT sobre ella mediante DrizzleUnitOfWork; la auditoría exige esa misma transacción).
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { getDbContext, transactionStorage } from '../db/transaction-context';
import { cancellationPolicy, consultationPriceConfiguration, userProfile } from '../db/schema';
import { CommonModule } from '../common/common.module';
import { AuditModule } from '../modules/audit/audit.module';
import { CancellationPolicyService, ConsultationPriceService } from '../modules/appointments/application/use-cases/configuration.use-cases';
import { CANCELLATION_POLICY_REPOSITORY, CONSULTATION_PRICE_REPOSITORY } from '../modules/appointments/application/ports/appointments.ports';
import { DrizzleCancellationPolicyRepository, DrizzleConsultationPriceRepository } from '../modules/appointments/infrastructure/persistence/drizzle-configuration.repositories';
import { INITIAL_CONSULTATION_PRICE } from '../modules/appointments/domain/consultation-price';
import { INITIAL_POLICY } from '../modules/appointments/domain/cancellation-policy';
import { runAppointmentsConfigSeed } from './appointments-config-seed.run';

@Module({
  imports: [CommonModule, AuditModule],
  providers: [
    ConsultationPriceService,
    CancellationPolicyService,
    { provide: CONSULTATION_PRICE_REPOSITORY, useClass: DrizzleConsultationPriceRepository },
    { provide: CANCELLATION_POLICY_REPOSITORY, useClass: DrizzleCancellationPolicyRepository },
  ],
})
class AppointmentsSeedModule {}

if (require.main === module) {
  void (async () => {
    const app = await NestFactory.createApplicationContext(AppointmentsSeedModule, { logger: ['error', 'warn'], abortOnError: false });
    const prices = app.get(ConsultationPriceService);
    const policies = app.get(CancellationPolicyService);
    const adminActor = (a: { userId: string; userProfileId: string }) => ({ ...a, role: 'admin' as const, ipAddress: null, userAgent: 'appointments:seed-config' });
    const code = await runAppointmentsConfigSeed(process.argv.slice(2), {
      identity: async () => {
        const { rows } = await getDbContext().execute(sql`select current_setting('neon.project_id', true) as project,
          current_setting('neon.branch_id', true) as branch, current_setting('neon.endpoint_id', true) as endpoint`);
        const r = rows[0] as { project: string | null; branch: string | null; endpoint: string | null } | undefined;
        return r ? { project: r.project ?? null, branch: r.branch ?? null, endpoint: r.endpoint ?? null } : null;
      },
      inTransaction: (work) => db.transaction((tx) => transactionStorage.run(tx as any, work)),
      isAdmin: async (id) => {
        const [row] = await getDbContext().select({ userId: userProfile.userId }).from(userProfile).where(and(eq(userProfile.id, id), eq(userProfile.role, 'admin'))).limit(1);
        return row ?? null;
      },
      hasPriceVersion: async () => (await getDbContext().select({ id: consultationPriceConfiguration.id }).from(consultationPriceConfiguration).limit(1)).length > 0,
      hasPolicyVersion: async () => (await getDbContext().select({ id: cancellationPolicy.id }).from(cancellationPolicy).limit(1)).length > 0,
      publishPrice: async (a) => void (await prices.publish(adminActor(a), INITIAL_CONSULTATION_PRICE, 'initial_setup')),
      publishPolicy: async (a) => void (await policies.publish(adminActor(a), { ...INITIAL_POLICY }, 'initial_setup')),
    }, console.log, console.error);
    await app.close();
    await db.$client.end();
    process.exit(code);
  })();
}
