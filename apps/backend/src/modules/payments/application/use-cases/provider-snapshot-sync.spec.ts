import { money } from '../../domain/money';
import { PAYMENT_STATUSES, type PaymentStatus } from '../../domain/payment-status';
import { ALLOWED_PAYMENT_TRANSITIONS, isReachable } from '../../domain/payment-transitions';
import type { ProviderPaymentSnapshot } from '../ports/payment-provider.port';
import type { PaymentRecord } from '../ports/payments.repositories';
import { ProviderStateConflictError } from '../payments-use-case.errors';
import { decideSnapshot } from './provider-snapshot-sync';
import { providerUpdateFor } from './payments.use-cases';

// Unitarias: decisión sobre un snapshot del proveedor (sin dobles de puertos).
const ID = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-11-14T12:00:00Z');
const record = (status: PaymentStatus, over: Partial<PaymentRecord> = {}): PaymentRecord => ({
  id: ID, type: 'consultation', provider: 'mercado_pago', providerPaymentId: '987', providerStatus: 'x', status, patientId: 'p', doctorId: 'd', appointmentId: 'a',
  medicationOrderId: null, gross: money(65_000), peiFeeConfigurationId: 'f', peiFixedFee: money(10_000), doctorNet: money(55_000), processorFeeScheduleId: 's',
  providerFeeEstimated: money(2_869), providerFeeActual: null, netReceived: null, moneyReleaseDate: null, feeReconciledAt: null, createdAt: NOW, updatedAt: NOW, ...over,
});
const snap = (status: PaymentStatus, over: Partial<ProviderPaymentSnapshot> = {}): ProviderPaymentSnapshot => ({
  provider: 'mercado_pago', providerPaymentId: '987', providerStatus: 'x', status, externalReference: ID, amount: money(65_000), refunded: money(0),
  providerFeeActual: null, netReceived: null, moneyReleaseDate: null, ...over,
});

describe('decideSnapshot', () => {
  it('apply: transición nueva o datos aún no fijados', () => {
    expect(decideSnapshot(record('processing'), snap('succeeded'), NOW)).toMatchObject({ kind: 'apply', update: { status: 'succeeded' } });
    expect(decideSnapshot(record('succeeded'), snap('succeeded', { providerFeeActual: money(1) }), NOW)).toMatchObject({ kind: 'apply', update: { providerFeeActual: money(1) } });
    expect(decideSnapshot(record('processing'), snap('processing', { providerStatus: 'y' }), NOW)).toMatchObject({ kind: 'apply', update: { providerStatus: 'y' } });
    expect(decideSnapshot(record('pending', { providerPaymentId: null }), snap('pending'), NOW)).toMatchObject({ kind: 'apply', update: { providerPaymentId: '987' } });
  });

  it('unchanged: el pago ya refleja el snapshot (duplicado)', () => {
    expect(decideSnapshot(record('succeeded', { providerFeeActual: money(1) }), snap('succeeded', { providerFeeActual: money(1) }), NOW)).toEqual({ kind: 'unchanged' });
  });

  it('stale: snapshot anterior a lo registrado, incluso a varias transiciones', () => {
    expect(decideSnapshot(record('succeeded'), snap('processing'), NOW)).toEqual({ kind: 'stale' });
    expect(decideSnapshot(record('partially_refunded'), snap('processing'), NOW)).toEqual({ kind: 'stale' });
    expect(decideSnapshot(record('refunded'), snap('pending'), NOW)).toEqual({ kind: 'stale' });
  });

  it('conflicto: identidad distinta o transición imposible en ambos sentidos', () => {
    expect(() => decideSnapshot(record('processing'), snap('succeeded', { amount: money(1) }), NOW)).toThrow(ProviderStateConflictError);
    expect(() => decideSnapshot(record('processing'), snap('succeeded', { externalReference: 'otro' }), NOW)).toThrow(/external_reference/);
    expect(() => decideSnapshot(record('processing'), snap('succeeded', { providerPaymentId: '1' }), NOW)).toThrow(/otro pago/);
    expect(() => decideSnapshot(record('failed'), snap('succeeded'), NOW)).toThrow(/failed → succeeded/);
    expect(() => decideSnapshot(record('canceled'), snap('failed'), NOW)).toThrow(/no permitida/);
    // Un dato de conciliación distinto del ya fijado.
    expect(() => decideSnapshot(record('succeeded', { providerFeeActual: money(1) }), snap('succeeded', { providerFeeActual: money(2) }), NOW)).toThrow(/comisión real/);
  });

  it('isReachable coincide con la matriz de transiciones (y la incluye)', () => {
    for (const from of PAYMENT_STATUSES) for (const to of ALLOWED_PAYMENT_TRANSITIONS[from]) expect(isReachable(from, to)).toBe(true);
    for (const terminal of ['failed', 'canceled', 'refunded', 'charged_back'] as const) {
      for (const to of PAYMENT_STATUSES) expect(isReachable(terminal, to)).toBe(false);
    }
    expect(isReachable('pending', 'charged_back')).toBe(true);
    expect(isReachable('succeeded', 'pending')).toBe(false);
  });
});

// H-2/H-3: fee_reconciled_at solo con la comisión real verificada y persistida, y solo en el flujo bloqueado.
describe('Conciliación de la comisión (fee_reconciled_at)', () => {
  const FEE = money(1_299);
  const NET = money(63_701);
  const RELEASE = new Date('2026-11-23T00:00:00Z');
  const verified = (over: Partial<ProviderPaymentSnapshot> = {}) =>
    snap('succeeded', { providerFeeActual: FEE, netReceived: NET, moneyReleaseDate: RELEASE, providerFeeVerified: true, ...over });

  it('[H3-R-01] comisión y neto verificados que se fijan ahora: la marca va en la MISMA actualización', () => {
    const d = decideSnapshot(record('processing'), verified(), NOW);
    expect(d).toEqual({ kind: 'apply', update: expect.objectContaining({ status: 'succeeded', providerFeeActual: FEE, netReceived: NET, feeReconciledAt: NOW }) });
  });

  it('[H3-R-02] backfill: comisión ya persistida sin marca y Stripe la confirma igual → solo la marca', () => {
    const d = decideSnapshot(record('succeeded', { providerFeeActual: FEE, netReceived: NET, moneyReleaseDate: RELEASE }), verified(), NOW);
    expect(d).toEqual({ kind: 'apply', update: { updatedAt: NOW, providerStatus: 'x', status: 'succeeded', feeReconciledAt: NOW } });
  });

  it('[H3-R-03] ya conciliado: sin cambios (idempotente)', () => {
    expect(decideSnapshot(record('succeeded', { providerFeeActual: FEE, netReceived: NET, moneyReleaseDate: RELEASE, feeReconciledAt: new Date('2026-11-01T00:00:00Z') }), verified(), NOW)).toEqual({ kind: 'unchanged' });
  });

  it('[H3-R-04] sin balance_transaction verificado no se marca (aunque el pago sea succeeded o traiga comisión)', () => {
    expect(decideSnapshot(record('processing'), snap('succeeded'), NOW)).toMatchObject({ kind: 'apply', update: { status: 'succeeded' } });
    expect((decideSnapshot(record('processing'), snap('succeeded'), NOW) as { update: object }).update).not.toHaveProperty('feeReconciledAt');
    const unverified = decideSnapshot(record('processing'), verified({ providerFeeVerified: false }), NOW) as { update: object };
    expect(unverified.update).not.toHaveProperty('feeReconciledAt');
    const absent = decideSnapshot(record('processing'), verified({ providerFeeVerified: undefined }), NOW) as { update: object };
    expect(absent.update).not.toHaveProperty('feeReconciledAt');
  });

  it('[H3-R-05] nunca por la tarifa estimada: provider_fee_estimated no interviene', () => {
    const r = record('succeeded', { providerFeeEstimated: FEE });
    expect((decideSnapshot(r, snap('succeeded', { providerFeeVerified: true }), NOW) as { kind: string; update?: object }).update ?? {}).not.toHaveProperty('feeReconciledAt');
  });

  it('[H3-R-06] la fecha de disponibilidad no decide: sin ella se concilia; solo con ella, no', () => {
    expect(decideSnapshot(record('processing'), verified({ moneyReleaseDate: null }), NOW)).toMatchObject({ kind: 'apply', update: { feeReconciledAt: NOW } });
    const onlyDate = decideSnapshot(record('succeeded'), snap('succeeded', { moneyReleaseDate: RELEASE, providerFeeVerified: false }), NOW) as { update: object };
    expect(onlyDate.update).not.toHaveProperty('feeReconciledAt');
  });

  it('[H3-R-07] comisión o neto distintos de los persistidos: conflicto, nunca se sobrescriben ni se marcan', () => {
    expect(() => decideSnapshot(record('succeeded', { providerFeeActual: money(1_204), netReceived: NET }), verified(), NOW)).toThrow(/valor distinto del ya registrado \(la comisión real\)/);
    expect(() => decideSnapshot(record('succeeded', { providerFeeActual: FEE, netReceived: money(1) }), verified(), NOW)).toThrow(/el neto recibido/);
  });

  it('[H3-R-08] las rutas sin bloqueo (creación y sincronización del paciente) persisten la comisión pero NO la marcan', () => {
    const update = providerUpdateFor(record('processing'), verified(), NOW);
    expect(update).toMatchObject({ providerFeeActual: FEE, netReceived: NET });
    expect(update).not.toHaveProperty('feeReconciledAt');
    expect(providerUpdateFor(record('processing'), verified(), NOW, { reconcile: true })).toMatchObject({ feeReconciledAt: NOW });
  });
});
