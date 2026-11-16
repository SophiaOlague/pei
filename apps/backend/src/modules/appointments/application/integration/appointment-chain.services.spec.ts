import { randomUUID } from 'crypto';
import { InMemoryAppointmentsWorld } from '../../../../../test/support/appointments-in-memory';
import { AppointmentChainBrokenError, AppointmentNotFoundError } from '../../domain/appointments.errors';
import { MAX_CHAIN_LENGTH } from '../../domain/appointment-chain';
import { AppointmentChainService, RootResolvingPaymentLedger, type PaymentReference, type RootPaymentLookup } from './appointment-chain.services';

// DA-6: rootOf y PaymentLedgerPort.paymentForAppointment con el doble en memoria. Pagos no existe: RootPaymentLookup es
// un doble que conoce solo los pagos de las citas raíz.

function setup() {
  const world = new InMemoryAppointmentsWorld();
  const chain = new AppointmentChainService(world);
  const seed = (rescheduledFromAppointmentId: string | null = null, id: string = randomUUID()) => {
    world.seedAppointment({
      id, patientId: 'p', doctorId: 'd', scheduledAt: new Date('2026-11-12T16:00:00Z'), cancellationPolicyId: 'pol',
      status: rescheduledFromAppointmentId ? 'confirmed' : 'rescheduled', rescheduledFromAppointmentId,
    });
    return id;
  };
  // Cadena raíz → … → hoja de n reagendamientos.
  const chainOf = (n: number) => {
    const ids = [seed()];
    for (let i = 0; i < n; i++) ids.push(seed(ids.at(-1)!));
    return ids;
  };
  return { world, chain, seed, chainOf };
}

class FakeRootPayments implements RootPaymentLookup {
  calls: string[] = [];
  constructor(private readonly byRoot: Record<string, string>) {}
  async paymentForRootAppointment(rootAppointmentId: string): Promise<PaymentReference | null> {
    this.calls.push(rootAppointmentId);
    const paymentId = this.byRoot[rootAppointmentId];
    return paymentId ? { paymentId, rootAppointmentId } : null;
  }
}

describe('Raíz de la cadena y pago de citas reagendadas (DA-6)', () => {
  it('[TC-M08-390][DA-6] una cita sin reagendamientos es su propia raíz', async () => {
    const env = setup();
    const id = env.seed();
    await expect(env.chain.rootOf(id)).resolves.toBe(id);
  });

  it('[TC-M08-391][DA-6] una cita reagendada una vez devuelve la original', async () => {
    const env = setup();
    const [root, leaf] = env.chainOf(1);
    await expect(env.chain.rootOf(leaf)).resolves.toBe(root);
  });

  it('[TC-M08-392][DA-6][DA-7] en una cadena de varios niveles, cualquier eslabón devuelve la misma raíz', async () => {
    const env = setup();
    const ids = env.chainOf(5);
    for (const id of ids) await expect(env.chain.rootOf(id)).resolves.toBe(ids[0]);
    // Una cadena del largo máximo todavía se resuelve.
    const longest = env.chainOf(MAX_CHAIN_LENGTH);
    await expect(env.chain.rootOf(longest.at(-1)!)).resolves.toBe(longest[0]);
  });

  it('[TC-M08-393][DA-6] cita inexistente: AppointmentNotFoundError; antecesor inexistente: AppointmentChainBrokenError', async () => {
    const env = setup();
    await expect(env.chain.rootOf(randomUUID())).rejects.toThrow(AppointmentNotFoundError);
    const orphan = env.seed(randomUUID());
    await expect(env.chain.rootOf(orphan)).rejects.toMatchObject({ constructor: AppointmentChainBrokenError, cause: 'missing_ancestor' });
  });

  it('[TC-M08-394][DA-6] ciclos y cadenas demasiado largas fallan de forma cerrada, sin recorrido infinito', async () => {
    const env = setup();
    // Autorreferencia.
    const self = randomUUID();
    env.seed(self, self);
    await expect(env.chain.rootOf(self)).rejects.toMatchObject({ cause: 'cycle' });
    // Ciclo de tres: a → b → c → a.
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    env.seed(c, a);
    env.seed(a, b);
    env.seed(b, c);
    for (const id of [a, b, c]) await expect(env.chain.rootOf(id)).rejects.toMatchObject({ constructor: AppointmentChainBrokenError, cause: 'cycle' });
    // Una cadena más larga que el máximo.
    const tooLong = env.chainOf(MAX_CHAIN_LENGTH + 1);
    await expect(env.chain.rootOf(tooLong.at(-1)!)).rejects.toMatchObject({ cause: 'too_long' });
  });

  it('[TC-M08-395][DA-6][RN-018] paymentForAppointment resuelve cualquier cita de la cadena al pago de su raíz', async () => {
    const env = setup();
    const ids = env.chainOf(2);
    const unpaid = env.seed();
    const payments = new FakeRootPayments({ [ids[0]]: 'pay-1' });
    const ledger = new RootResolvingPaymentLedger(env.chain, payments);
    for (const id of ids) await expect(ledger.paymentForAppointment(id)).resolves.toEqual({ paymentId: 'pay-1', rootAppointmentId: ids[0] });
    // Pagos solo recibe identificadores de raíces, nunca el de una cita reagendada.
    expect(new Set(payments.calls)).toEqual(new Set([ids[0]]));
    await expect(ledger.paymentForAppointment(unpaid)).resolves.toBeNull();
    // Una cadena inconsistente no llega a consultar pagos.
    payments.calls = [];
    await expect(ledger.paymentForAppointment(env.seed(randomUUID()))).rejects.toThrow(AppointmentChainBrokenError);
    expect(payments.calls).toEqual([]);
  });
});
