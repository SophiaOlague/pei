import { AppointmentChainBrokenError } from './appointments.errors';

// DA-6 y DA-7: cadena de reagendamientos. Cada cita nueva apunta a la anterior con rescheduled_from_appointment_id; la
// raíz es la primera (la única que pasó por pending_payment → confirmed y la que tiene el pago). Recorrido iterativo,
// sin recursión: se detiene ante un antecesor inexistente, un ciclo o una longitud mayor que MAX_CHAIN_LENGTH.

// Defensa ante datos corruptos, muy por encima de cualquier max_reschedules razonable (la política admite hasta 10).
export const MAX_CHAIN_LENGTH = 100;

export interface ChainLink {
  id: string;
  rescheduledFromAppointmentId: string | null;
}

export interface ChainResolution {
  rootId: string;
  // Reagendamientos previos: número de antecesores de la cita de partida (0 en la raíz).
  depth: number;
}

export async function resolveChain(start: ChainLink, load: (id: string) => Promise<ChainLink | null>): Promise<ChainResolution> {
  const seen = new Set<string>([start.id]);
  let current = start;
  let depth = 0;
  while (current.rescheduledFromAppointmentId) {
    const previousId = current.rescheduledFromAppointmentId;
    if (seen.has(previousId)) throw new AppointmentChainBrokenError(start.id, 'cycle');
    if (depth >= MAX_CHAIN_LENGTH) throw new AppointmentChainBrokenError(start.id, 'too_long');
    const previous = await load(previousId);
    if (!previous) throw new AppointmentChainBrokenError(start.id, 'missing_ancestor');
    seen.add(previous.id);
    current = previous;
    depth++;
  }
  return { rootId: current.id, depth };
}
