import { add, fromDecimalString, fromProviderNumber, MAX_CENTS, money, subtract, toDecimalString, toProviderNumber } from './money';
import { consultationSplit, estimateProcessorFee, medicationSplit, rateToMicros, type ProcessorFeeSnapshot } from './payment-amounts';
import { buildPaymentRequest, GENERIC_DESCRIPTIONS, type PaymentRequestInput } from './payment-request';
import { CAPTURED_STATUSES, isCaptured, PAYMENT_STATUSES } from './payment-status';
import { InvalidAmountError, InvalidPaymentRequestError, NegativeDoctorNetError } from './payments.errors';

// Dominio de pagos (F2): importes, reparto, estimación de la comisión del procesador y solicitud de pago. Sin E/S.
// Las tarifas y comisiones de estas pruebas son ilustrativas: no son valores comerciales de PEI ni de Mercado Pago.
const PAYMENT_ID = '0b9d8f5e-1c2a-4e3b-9f4d-5a6b7c8d9e0f';
const SCHEDULE: ProcessorFeeSnapshot = { scheduleId: 'sch-1', percentageRate: '0.031900', fixedFee: money(400), vatRate: '0.160000' };
const input = (over: Partial<PaymentRequestInput> = {}): PaymentRequestInput => ({
  paymentId: PAYMENT_ID,
  type: 'consultation',
  gross: money(100_000),
  peiFee: { configurationId: 'fee-1', fixedFee: money(20_000) },
  processorFee: SCHEDULE,
  card: { token: 'tok_brick_abc', paymentMethodId: 'visa', installments: 1, payerEmail: 'paciente@example.com' },
  ...over,
});

describe('Money (centavos, numeric(12,2))', () => {
  it('convierte texto decimal sin perder precisión y rechaza más de dos decimales', () => {
    expect(fromDecimalString('1000').cents).toBe(100_000);
    expect(fromDecimalString('1000.5').cents).toBe(100_050);
    expect(fromDecimalString('0.07').cents).toBe(7);
    expect(fromDecimalString('9999999999.99').cents).toBe(MAX_CENTS);
    for (const bad of ['1.234', '1e3', 'abc', '', '1,00', '10000000000.00']) expect(() => fromDecimalString(bad)).toThrow(InvalidAmountError);
  });

  it('convierte números del proveedor y rechaza más de dos decimales o valores no finitos', () => {
    expect(fromProviderNumber(40.64).cents).toBe(4064);
    expect(fromProviderNumber(0.1 + 0.2).cents).toBe(30);
    for (const bad of [1.005, Number.NaN, Number.POSITIVE_INFINITY, '10', null]) expect(() => fromProviderNumber(bad)).toThrow(InvalidAmountError);
  });

  it('formatea y opera en centavos; solo MXN', () => {
    expect(toDecimalString(money(4064))).toBe('40.64');
    expect(toDecimalString(money(-5))).toBe('-0.05');
    expect(toProviderNumber(money(100_050))).toBe(1000.5);
    expect(add(money(1), money(2)).cents).toBe(3);
    expect(subtract(money(1), money(2)).cents).toBe(-1);
    expect(() => money(1, 'USD')).toThrow('moneda no admitida');
    expect(() => money(1.5)).toThrow(InvalidAmountError);
    expect(() => money(MAX_CENTS + 1)).toThrow('numeric(12,2)');
  });
});

describe('Reparto (Payments-decisiones §2)', () => {
  it('consulta: neto del médico = bruto − comisión fija de PEI; la comisión del procesador no interviene', () => {
    const s = consultationSplit(money(100_000), { configurationId: 'fee-1', fixedFee: money(20_000) });
    expect(s).toEqual({ gross: money(100_000), peiFixedFee: money(20_000), peiFeeConfigurationId: 'fee-1', doctorNet: money(80_000) });
  });

  it('consulta: comisión igual al precio da neto 0; mayor que el precio es PAY-10', () => {
    expect(consultationSplit(money(500), { configurationId: 'f', fixedFee: money(500) }).doctorNet.cents).toBe(0);
    expect(() => consultationSplit(money(500), { configurationId: 'f', fixedFee: money(501) })).toThrow(NegativeDoctorNetError);
    expect(() => consultationSplit(money(0), { configurationId: 'f', fixedFee: money(0) })).toThrow(InvalidAmountError);
  });

  it('medicamento: 100 % PEI, sin comisión fija ni neto del médico', () => {
    expect(medicationSplit(money(30_000))).toEqual({ gross: money(30_000), peiFixedFee: null, peiFeeConfigurationId: null, doctorNet: money(0) });
  });
});

describe('Estimación de la comisión del procesador', () => {
  it('(bruto · tasa + fijo) · (1 + IVA), redondeo al centavo mitad hacia arriba', () => {
    // (1000 · 0.0319 + 4) · 1.16 = 41.644 → 41.64
    expect(estimateProcessorFee(money(100_000), SCHEDULE).cents).toBe(4164);
    // (1 · 0.0319 + 4) · 1.16 = 4.677004 → 4.68
    expect(estimateProcessorFee(money(100), SCHEDULE).cents).toBe(468);
    // Mitad exacta hacia arriba: (0.25 · 0.5 + 0) · 1 = 0.125 → 0.13
    expect(estimateProcessorFee(money(25), { scheduleId: 's', percentageRate: '0.5', fixedFee: money(0), vatRate: '0' }).cents).toBe(13);
  });

  it('valida las tasas (hasta 6 decimales, en [0, 1))', () => {
    expect(rateToMicros('0.0319')).toBe(31_900n);
    expect(rateToMicros('0')).toBe(0n);
    for (const bad of ['1', '1.5', '0.1234567', '-0.1', 'x']) expect(() => rateToMicros(bad)).toThrow(InvalidAmountError);
  });
});

describe('Solicitud de pago', () => {
  it('consulta: snapshot completo, clave de idempotencia = payment.id y descripción genérica', () => {
    const r = buildPaymentRequest(input());
    expect(r.idempotencyKey).toBe(PAYMENT_ID);
    expect(r.split.doctorNet.cents).toBe(80_000);
    expect(r.providerFeeEstimated.cents).toBe(4164);
    expect(r.processorFeeScheduleId).toBe('sch-1');
    expect(r.description).toBe(GENERIC_DESCRIPTIONS.consultation);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('medicamento: sin comisión de PEI y descripción sin datos clínicos', () => {
    const r = buildPaymentRequest(input({ type: 'medication', peiFee: undefined }));
    expect(r.split.peiFixedFee).toBeNull();
    expect(r.split.doctorNet.cents).toBe(0);
    expect(r.description).toBe('Pedido PEI');
    expect(() => buildPaymentRequest(input({ type: 'medication' }))).toThrow('no lleva comisión fija');
  });

  it.each([
    ['paymentId no UUID', { paymentId: 'abc' }],
    ['consulta sin comisión de PEI', { peiFee: undefined }],
    ['sin token', { card: { token: '', paymentMethodId: 'visa', installments: 1, payerEmail: 'a@b.mx' } }],
    ['token con forma de PAN', { card: { token: '4111 1111 1111 1111', paymentMethodId: 'visa', installments: 1, payerEmail: 'a@b.mx' } }],
    ['sin medio de pago', { card: { token: 't', paymentMethodId: '', installments: 1, payerEmail: 'a@b.mx' } }],
    ['mensualidades inválidas', { card: { token: 't', paymentMethodId: 'visa', installments: 0, payerEmail: 'a@b.mx' } }],
    ['correo inválido', { card: { token: 't', paymentMethodId: 'visa', installments: 1, payerEmail: 'no-es-correo' } }],
  ])('rechaza %s', (_n, over) => {
    expect(() => buildPaymentRequest(input(over as Partial<PaymentRequestInput>))).toThrow(InvalidPaymentRequestError);
  });

  it('PAY-10 también se aplica al construir la solicitud', () => {
    expect(() => buildPaymentRequest(input({ gross: money(100) }))).toThrow(NegativeDoctorNetError);
  });
});

describe('Estados internos', () => {
  it('son los nueve de 0017 y el conjunto capturado es el de AP-27a', () => {
    expect(PAYMENT_STATUSES).toEqual(['pending', 'processing', 'succeeded', 'failed', 'canceled', 'refunded', 'partially_refunded', 'charged_back', 'in_dispute']);
    expect([...CAPTURED_STATUSES].sort()).toEqual(['charged_back', 'in_dispute', 'partially_refunded', 'refunded', 'succeeded']);
    expect(isCaptured('pending')).toBe(false);
  });
});
