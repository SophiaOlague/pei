// DT-5, DT-6: elimina del bucket privado los documentos de los envíos del INE ya aprobados o rechazados
// (M03 B6: también los del médico en approved, rejected o superseded, D-19) que aún conservan claves (por ejemplo, si la eliminación posterior a la revisión falló) y limpia sus claves.
// Es idempotente: se puede ejecutar las veces que sea necesario. No imprime claves de objetos.
//
//   pnpm identity:purge-documents
//
// Escribe en R2 y en la BD configurados: ejecutarlo requiere autorización.
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { CliModule } from './cli.module';
import { PurgeReviewedIdentityDocumentsUseCase } from '../modules/identity/application/use-cases/identity-verification-admin.use-cases';
import { PurgeTerminalDoctorIdentityDocumentsUseCase } from '../modules/doctors/application/use-cases/admin/doctor-review.use-cases';
import { db } from '../db';

async function main(): Promise<number> {
  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error', 'warn'] });
  try {
    const { found, purged, failed } = await app.get(PurgeReviewedIdentityDocumentsUseCase).execute();
    console.log(`Envíos revisados con documentos: ${found}; purgados: ${purged}; con error: ${failed}`);
    const doctors = await app.get(PurgeTerminalDoctorIdentityDocumentsUseCase).execute();
    console.log(`INE de médicos terminadas con documentos: ${doctors.found}; purgadas: ${doctors.purged}; con error: ${doctors.failed}`);
    return failed + doctors.failed > 0 ? 1 : 0;
  } finally {
    await app.close();
    await db.$client.end();
  }
}

if (require.main === module) {
  void main().then((code) => process.exit(code));
}
