import { readFileSync } from 'fs';
import { join } from 'path';
import { RootResolvingPaymentLedger } from '../../../appointments/application/integration/appointment-chain.services';
import { CAPTURED_STATUSES } from '../../domain/payment-status';
import { pickRootPayment, RootPaymentIntegrityError } from './drizzle-root-payment-lookup';

// AP-27a sin base de datos: la regla de selección (pura) y la composición con la raíz de M08. La consulta SQL real se
// verificará en C2 cuando se autorice.
describe('RootPaymentLookup (AP-27a)', () => {
  it('sin pagos capturados → null', () => {
    expect(pickRootPayment([], 'root-1')).toBeNull();
  });

  it('un pago → su referencia ligada a la raíz', () => {
    expect(pickRootPayment([{ id: 'pay-1' }], 'root-1')).toEqual({ paymentId: 'pay-1', rootAppointmentId: 'root-1' });
  });

  it('varios pagos → error de integridad, sin elegir uno', () => {
    expect(() => pickRootPayment([{ id: 'a' }, { id: 'b' }], 'root-1')).toThrow(RootPaymentIntegrityError);
    expect(() => pickRootPayment([{ id: 'a' }, { id: 'b' }], 'root-1')).toThrow(/al menos 2 pagos capturados/);
  });

  it('el filtro usa el conjunto capturado de AP-27a y solo consultas de la raíz recibida', () => {
    expect([...CAPTURED_STATUSES].sort()).toEqual(['charged_back', 'in_dispute', 'partially_refunded', 'refunded', 'succeeded']);
    const source = readFileSync(join(__dirname, 'drizzle-root-payment-lookup.ts'), 'utf8');
    expect(source).toMatch(/payment\.appointmentId, rootAppointmentId/);
    expect(source).toMatch(/payment\.type, 'consultation'/);
    expect(source).toMatch(/inArray\(payment\.status, \[\.\.\.CAPTURED_STATUSES\]\)/);
    expect(source).toMatch(/limit\(2\)/);
  });
});

describe('RootResolvingPaymentLedger con el lookup de pagos (citas raíz)', () => {
  // Cadena sintética: derived-2 → derived-1 → root (reagendamientos). M08 resuelve la raíz; pagos busca solo por ella.
  const roots: Record<string, string> = { root: 'root', 'derived-1': 'root', 'derived-2': 'root', otra: 'otra' };
  const chain = { rootOf: async (id: string) => roots[id] };

  it('el pago de cualquier cita de la cadena es el de su raíz, y la búsqueda se hace solo por la raíz', async () => {
    const asked: string[] = [];
    const lookup = { paymentForRootAppointment: async (rootId: string) => { asked.push(rootId); return pickRootPayment(rootId === 'root' ? [{ id: 'pay-1' }] : [], rootId); } };
    const ledger = new RootResolvingPaymentLedger(chain, lookup);
    for (const id of ['root', 'derived-1', 'derived-2']) {
      expect(await ledger.paymentForAppointment(id)).toEqual({ paymentId: 'pay-1', rootAppointmentId: 'root' });
    }
    expect(asked).toEqual(['root', 'root', 'root']);
    expect(await ledger.paymentForAppointment('otra')).toBeNull();
  });

  it('la integridad se propaga también desde una cita derivada', async () => {
    const ledger = new RootResolvingPaymentLedger(chain, { paymentForRootAppointment: async (r: string) => pickRootPayment([{ id: 'a' }, { id: 'b' }], r) });
    await expect(ledger.paymentForAppointment('derived-2')).rejects.toThrow(RootPaymentIntegrityError);
  });
});
