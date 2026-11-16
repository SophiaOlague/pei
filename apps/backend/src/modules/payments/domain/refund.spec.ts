import { money } from './money';
import { canRefundTransition, isPartialRefund, reconcileRefunds, refundableAmount, refundShares, REFUND_STATUSES } from './refund';

// Unitarias: prorrata (idéntica a refund_guard de 0017), disponible, parciales, transiciones y conciliación.
const PAYMENT = { type: 'consultation' as const, gross: money(65_000), peiFixedFee: money(10_000) };
const none = { amount: money(0), peiFeeShare: money(0) };

describe('refundShares (prorrata acumulativa, §2.3 / I-8)', () => {
  it('total: PEI recibe exactamente la comisión fija y el médico su neto', () => {
    expect(refundShares(PAYMENT, none, money(65_000))).toEqual({ peiFeeShare: money(10_000), doctorShare: money(55_000) });
  });

  it('parcial: round_half_up(R · F / G) y el residuo al médico', () => {
    // 100.00 · 100/650 = 15.3846… → 15.38
    expect(refundShares(PAYMENT, none, money(10_000))).toEqual({ peiFeeShare: money(1_538), doctorShare: money(8_462) });
    // mitad exacta hacia arriba: G=200.00, F=1.00, R=1.00 → 0.005 → 0.01
    expect(refundShares({ ...PAYMENT, gross: money(20_000), peiFixedFee: money(100) }, none, money(100))).toEqual({ peiFeeShare: money(1), doctorShare: money(99) });
  });

  it('acumulativo: varios parciales suman exactamente F y N, sin deriva', () => {
    let prev = none;
    let pei = 0;
    let doctor = 0;
    for (const cents of [3_333, 3_333, 3_333, 55_001]) {
      const s = refundShares(PAYMENT, prev, money(cents));
      expect(s.peiFeeShare.cents + s.doctorShare.cents).toBe(cents);
      pei += s.peiFeeShare.cents;
      doctor += s.doctorShare.cents;
      prev = { amount: money(prev.amount.cents + cents), peiFeeShare: money(prev.peiFeeShare.cents + s.peiFeeShare.cents) };
    }
    expect({ pei, doctor }).toEqual({ pei: 10_000, doctor: 55_000 });
  });

  it('importes grandes sin pérdida de precisión (BigInt)', () => {
    const big = { type: 'consultation' as const, gross: money(999_999_999_999), peiFixedFee: money(333_333_333_333) };
    expect(refundShares(big, none, money(999_999_999_999)).peiFeeShare).toEqual(money(333_333_333_333));
  });

  it('medicamento: 100 % de PEI; sin comisión registrada o importe no positivo: error', () => {
    expect(refundShares({ type: 'medication', gross: money(1_000), peiFixedFee: null }, none, money(500))).toEqual({ peiFeeShare: money(500), doctorShare: money(0) });
    expect(() => refundShares({ ...PAYMENT, peiFixedFee: null }, none, money(1))).toThrow();
    expect(() => refundShares(PAYMENT, none, money(0))).toThrow();
  });
});

describe('disponible, parciales y transiciones', () => {
  it('refundableAmount y isPartialRefund (el saldo tras un parcial también es parcial)', () => {
    expect(refundableAmount(money(65_000), money(10_000))).toEqual(money(55_000));
    expect(refundableAmount(money(65_000), money(70_000))).toEqual(money(0));
    expect(isPartialRefund(money(65_000), money(55_000))).toBe(true);
    expect(isPartialRefund(money(65_000), money(65_000))).toBe(false);
  });

  it('transiciones iguales a refund_guard', () => {
    const allowed = REFUND_STATUSES.flatMap((f) => REFUND_STATUSES.filter((t) => f !== t && canRefundTransition(f, t)).map((t) => `${f}→${t}`));
    expect(allowed.sort()).toEqual(['pending→canceled', 'pending→failed', 'pending→processing', 'processing→failed', 'processing→succeeded', 'requested→canceled', 'requested→pending'].sort());
  });
});

describe('reconcileRefunds (la comisión del proveedor no se supone devuelta)', () => {
  const pay = { gross: money(65_000), providerFeeActual: money(2_536), netReceived: money(62_464) };

  it('sin dato de comisión devuelta: el neto posterior queda desconocido (null), nunca 0', () => {
    const r = reconcileRefunds(pay, [{ status: 'succeeded', amount: money(65_000), providerFeeReturned: null }, { status: 'pending', amount: money(1), providerFeeReturned: null }]);
    expect(r).toMatchObject({ refundedSucceeded: money(65_000), refundedInFlight: money(1), providerFeeActual: money(2_536), providerFeeReturned: null, netAfterRefunds: null });
  });

  it('con dato real: neto = recibido − reembolsado + comisión devuelta', () => {
    const r = reconcileRefunds(pay, [{ status: 'succeeded', amount: money(10_000), providerFeeReturned: money(390) }, { status: 'failed', amount: money(5_000), providerFeeReturned: null }]);
    expect(r).toMatchObject({ refundedSucceeded: money(10_000), providerFeeReturned: money(390), netAfterRefunds: money(62_464 - 10_000 + 390) });
  });
});
