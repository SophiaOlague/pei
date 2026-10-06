import { Global, Module } from '@nestjs/common';
import { UNIT_OF_WORK } from './application/ports/unit-of-work';
import { CLOCK } from './application/ports/clock';
import { DrizzleUnitOfWork } from './infrastructure/drizzle-unit-of-work';
import { SystemClock } from './infrastructure/system-clock';

// Puertos transversales disponibles para todos los módulos de dominio.
@Global()
@Module({
  providers: [
    { provide: UNIT_OF_WORK, useClass: DrizzleUnitOfWork },
    { provide: CLOCK, useClass: SystemClock },
  ],
  exports: [UNIT_OF_WORK, CLOCK],
})
export class CommonModule {}
