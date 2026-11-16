import { money } from '../../domain/money';
import { PaymentProviderError, type ProviderPaymentSnapshot } from '../ports/payment-provider.port';
import type { FeeReconciliationQuery, PaymentProviderUpdate, PaymentRecord } from '../ports/payments.repositories';
import { FEE_RECONCILIATION_MIN_AGE_MS, ReconcileProviderFeesUseCase } from './reconcile-provider-fees.use-case';

// H-2/H-3 (sin BD): conciliación de la comisión real con repositorio, candado y proveedor en memoria.
const NOW = new Date('2026-11-16T12:00:00Z');
const FEE = money(1_299);
const NET = money(18_701);

function record(id: string, over: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id, type: 'consultation', provider: 'stripe', providerPaymentId: `pi_${id}`, providerStatus: 'succeeded', status: 'succeeded', patientId: 'p', doctorId: 'd',
    appointmentId: 'a', medicationOrderId: null, gross: money(20_000), peiFeeConfigurationId: 'f', peiFixedFee: money(2_000), doctorNet: money(18_000),
    processorFeeScheduleId: 's', providerFeeEstimated: money(1_204), providerFeeActual: null, netReceived: null, moneyReleaseDate: null, feeReconciledAt: null,
    createdAt: new Date(NOW.getTime() - 3_600_000), updatedAt: NOW, ...over,
  };
}

function world(records: PaymentRecord[], snapshots: Record<string, () => ProviderPaymentSnapshot>) {
  const store = new Map(records.map((r) => [r.id, { ...r }]));
  const locked: string[] = [];
  const writes: { id: string; update: PaymentProviderUpdate }[] = [];
  const queries: FeeReconciliationQuery[] = [];
  const warnings: string[] = [];
  const uc = new ReconcileProviderFeesUseCase({
    uow: { runInTransaction: async <T>(work: () => Promise<T>) => work() } as never,
    clock: { now: () => NOW },
    locks: { lockById: async (id: string) => { locked.push(id); return store.get(id) ? { ...store.get(id)! } : null; } },
    payments: {
      findById: async (id) => (store.get(id) ? { ...store.get(id)! } : null),
      update: async (id, update) => {
        writes.push({ id, update });
        const r = store.get(id)!;
        Object.assign(r, { ...update, feeReconciledAt: update.feeReconciledAt ?? r.feeReconciledAt });
      },
    },
    provider: {
      name: 'stripe',
      getPayment: async (pi: string) => {
        const id = pi.replace(/^pi_/, '');
        if (!snapshots[id]) throw new PaymentProviderError('not_found', 'no existe');
        return snapshots[id]();
      },
    },
    pending: { findPendingFeeReconciliation: async (q) => { queries.push(q); return [...store.values()].filter((r) => r.feeReconciledAt === null).map((r) => r.id); } },
    warn: (m) => warnings.push(m),
  });
  return { uc, store, locked, writes, queries, warnings };
}

const snap = (id: string, over: Partial<ProviderPaymentSnapshot> = {}): ProviderPaymentSnapshot => ({
  provider: 'stripe', providerPaymentId: `pi_${id}`, providerStatus: 'succeeded', status: 'succeeded', externalReference: id, amount: money(20_000), refunded: money(0),
  providerFeeActual: FEE, netReceived: NET, moneyReleaseDate: new Date('2026-11-23T00:00:00Z'), providerFeeVerified: true, ...over,
});

describe('ReconcileProviderFeesUseCase', () => {
  it('[H2-UC-01] concilia un pago sin comisión real y hace backfill de uno con comisión guardada sin marca, por el flujo bloqueado', async () => {
    const w = world(
      [record('a1'), record('a2', { providerFeeActual: FEE, netReceived: NET })],
      { a1: () => snap('a1'), a2: () => snap('a2') },
    );
    expect(await w.uc.execute()).toEqual({ examined: 2, reconciled: 2, pending: 0, failed: 0 });
    expect(w.locked).toEqual(['a1', 'a2']);
    expect(w.store.get('a1')).toMatchObject({ providerFeeActual: FEE, netReceived: NET, feeReconciledAt: NOW });
    expect(w.store.get('a2')).toMatchObject({ providerFeeActual: FEE, feeReconciledAt: NOW });
    // Backfill: solo la marca (no reescribe importes ya fijados).
    expect(w.writes.find((x) => x.id === 'a2')!.update).not.toHaveProperty('providerFeeActual');
    expect(w.queries[0]).toEqual({ provider: 'stripe', createdBefore: new Date(NOW.getTime() - FEE_RECONCILIATION_MIN_AGE_MS), limit: 100 });
  });

  it('[H2-UC-02] Stripe aún sin balance_transaction válido: queda pendiente, sin marca ni importes inventados', async () => {
    const w = world([record('b1')], { b1: () => snap('b1', { providerFeeActual: null, netReceived: null, moneyReleaseDate: null, providerFeeVerified: false }) });
    expect(await w.uc.execute()).toEqual({ examined: 1, reconciled: 0, pending: 1, failed: 0 });
    expect(w.store.get('b1')).toMatchObject({ providerFeeActual: null, feeReconciledAt: null });
  });

  it('[H2-UC-03] un fallo (proveedor o conflicto) no detiene los siguientes y no sobrescribe importes', async () => {
    const w = world(
      [record('c1'), record('c2', { providerFeeActual: money(1_000), netReceived: money(19_000) }), record('c3')],
      { c2: () => snap('c2'), c3: () => snap('c3') },
    );
    expect(await w.uc.execute()).toEqual({ examined: 3, reconciled: 1, pending: 0, failed: 2 });
    expect(w.store.get('c2')).toMatchObject({ providerFeeActual: money(1_000), feeReconciledAt: null });
    expect(w.store.get('c3')).toMatchObject({ feeReconciledAt: NOW });
    expect(w.warnings).toEqual([
      expect.stringMatching(/pago c1 fallida \(provider:not_found\)/),
      expect.stringMatching(/pago c2 fallida \(conflict:valor distinto del ya registrado \(la comisión real\)\)/),
    ]);
  });

  it('[H2-UC-04] idempotente: una segunda ejecución no encuentra nada que conciliar', async () => {
    const w = world([record('d1')], { d1: () => snap('d1') });
    await w.uc.execute();
    expect(await w.uc.execute({ limit: 5 })).toEqual({ examined: 0, reconciled: 0, pending: 0, failed: 0 });
    expect(w.queries[1].limit).toBe(5);
  });
});
