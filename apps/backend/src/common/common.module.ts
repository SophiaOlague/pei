import { Global, Module } from '@nestjs/common';
import { UNIT_OF_WORK } from './application/ports/unit-of-work';
import { AFTER_COMMIT } from './application/ports/after-commit';
import { CLOCK } from './application/ports/clock';
import { DrizzleUnitOfWork } from './infrastructure/drizzle-unit-of-work';
import { SystemClock } from './infrastructure/system-clock';

// Puertos transversales disponibles para todos los módulos de dominio.
@Global()
@Module({
  providers: [
    { provide: UNIT_OF_WORK, useClass: DrizzleUnitOfWork },
    // La misma instancia: las acciones se atan a la unidad de trabajo en curso.
    { provide: AFTER_COMMIT, useExisting: UNIT_OF_WORK },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [UNIT_OF_WORK, AFTER_COMMIT, CLOCK],
})
export class CommonModule {}
