import { Injectable } from '@nestjs/common';
import type { Interval } from '../../domain/time-off';

// Punto de extensión para M08: intervalos ya ocupados por citas. M07 no conoce las citas; por omisión no hay ninguno.
// M08 sustituirá este proveedor (BUSY_INTERVALS_PROVIDER) sin cambiar la generación de horarios.
export const BUSY_INTERVALS_PROVIDER = Symbol('BUSY_INTERVALS_PROVIDER');

export interface BusyIntervalsProvider {
  busyIntervals(doctorProfileId: string, startsAt: Date, endsAt: Date): Promise<Interval[]>;
}

@Injectable()
export class NoBusyIntervalsProvider implements BusyIntervalsProvider {
  async busyIntervals(): Promise<Interval[]> {
    return [];
  }
}
