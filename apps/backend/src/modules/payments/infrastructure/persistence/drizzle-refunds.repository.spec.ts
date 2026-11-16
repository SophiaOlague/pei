import { money } from '../../domain/money';
import { toRefundInsert, toRefundRecord, toRefundSet } from './drizzle-refunds.repository';

// Sin base de datos: mapeo de filas de `refund` (numeric como texto, sin coma flotante). El comportamiento frente a
// refund_guard y refund_within_payment requiere PostgreSQL (0017 no está aplicada en ningún destino).
const AT = new Date('2026-11-20T12:00:00Z');

describe('DrizzleRefundRepository · mapeo', () => {
  it('alta: nace en requested, con la prorrata y la moneda del importe', () => {
    expect(toRefundInsert({
      id: 'r', paymentId: 'p', amount: money(10_050), reason: 'exceptional_refund', provider: 'mercado_pago', peiFeeShare: money(1_546), doctorShare: money(8_504),
      requestedByType: 'admin', requestedByUserProfileId: 'u', approvedBy: 'u', notes: null, requestedAt: AT,
    })).toEqual({
      id: 'r', paymentId: 'p', amount: '100.50', currency: 'MXN', reason: 'exceptional_refund', status: 'requested', provider: 'mercado_pago', peiFeeShare: '15.46',
      doctorShare: '85.04', requestedByType: 'admin', requestedByUserProfileId: 'u', approvedBy: 'u', notes: null, requestedAt: AT, createdAt: AT, updatedAt: AT,
    });
  });

  it('fila → registro, con la conciliación nula como null (no 0)', () => {
    const r = toRefundRecord({
      id: 'r', paymentId: 'p', amount: '650.00', currency: 'MXN', reason: 'payment_error', status: 'processing', provider: 'mercado_pago', providerRefundId: '1',
      providerStatus: 'in_process', peiFeeShare: '100.00', doctorShare: '550.00', providerFeeReturned: null, unrecoveredProviderFee: null, requestedByType: 'system',
      requestedByUserProfileId: null, approvedBy: null, requestedAt: AT, processedAt: null, failureReason: null, notes: null, createdAt: AT, updatedAt: AT,
    });
    expect(r).toMatchObject({ amount: money(65_000), peiFeeShare: money(10_000), providerFeeReturned: null, status: 'processing' });
  });

  it('actualización: solo los campos indicados', () => {
    expect(toRefundSet({ status: 'succeeded', processedAt: AT, providerStatus: 'approved', updatedAt: AT })).toEqual({ status: 'succeeded', processedAt: AT, providerStatus: 'approved', updatedAt: AT });
    expect(toRefundSet({ providerFeeReturned: money(390), updatedAt: AT })).toEqual({ providerFeeReturned: '3.90', updatedAt: AT });
  });
});
