import { Logger } from '@nestjs/common';
import { FAKE_AVAILABLE_ON, FakeStripe, type FakeIntent } from '../../../../../test/support/stripe-fake';
import { money } from '../../domain/money';
import { buildPaymentRequest, type PaymentRequest } from '../../domain/payment-request';
import { PaymentProviderError } from '../../application/ports/payment-provider.port';
import {
  describeStripeFailure, mapStripeStatus, normalizeStripePaymentIntent, normalizeStripeRefund, STRIPE_API, STRIPE_API_VERSION, StripePaymentProvider,
} from './stripe-payment-provider';

// Adaptador de Stripe con un doble en memoria de su API (sin red). Clave SINTÉTICA, armada por partes. Importes y
// comisiones ilustrativos: no son una tarifa de Stripe.
const SECRET_KEY = ['sk', 'test', 'sintetica7777777777'].join('_');
const PAYMENT_ID = '00000000-0000-4000-8000-000000000001';
const SCHEDULE = { scheduleId: 'sch-1', percentageRate: '0.036000', fixedFee: money(300), vatRate: '0.160000' };

const consultation = (token = 'pm_card_visa', paymentId = PAYMENT_ID): PaymentRequest =>
  buildPaymentRequest({
    paymentId, type: 'consultation', gross: money(20_000), peiFee: { configurationId: 'fee-1', fixedFee: money(2_000) }, processorFee: SCHEDULE,
    card: { token, paymentMethodId: 'card', installments: 1 },
  });
const medication = (token = 'pm_card_visa'): PaymentRequest =>
  buildPaymentRequest({ paymentId: PAYMENT_ID, type: 'medication', gross: money(123_456), processorFee: SCHEDULE, card: { token, paymentMethodId: 'card', installments: 1 } });

function setup(environment: 'test' | 'live' = 'test') {
  const stripe = new FakeStripe();
  const provider = new StripePaymentProvider({ secretKey: SECRET_KEY, fetch: stripe.fetch, environment });
  return { stripe, provider };
}
const rejection = async (p: Promise<unknown>): Promise<PaymentProviderError> => p.then(() => { throw new Error('se esperaba un error'); }, (e: unknown) => e as PaymentProviderError);

describe('StripePaymentProvider · crear el cobro', () => {
  let warnings: string[];
  beforeEach(() => {
    warnings = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((...a: unknown[]) => void warnings.push(String(a[0])));
  });
  afterEach(() => jest.restoreAllMocks());

  it('consulta: PaymentIntent confirmado en el servidor, en centavos de MXN, con payment.id como clave de idempotencia y referencia', async () => {
    const { stripe, provider } = setup();
    const snapshot = await provider.createPayment(consultation());

    expect(stripe.calls).toHaveLength(1);
    const call = stripe.calls[0];
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/v1/payment_intents');
    expect(call.headers).toMatchObject({
      authorization: `Bearer ${SECRET_KEY}`, 'idempotency-key': PAYMENT_ID, 'stripe-version': STRIPE_API_VERSION, 'content-type': 'application/x-www-form-urlencoded',
    });
    // 200.00 MXN viajan como 20000 (centavos enteros): sin decimales ni conversión con coma flotante.
    expect(Object.fromEntries(call.form!)).toEqual({
      amount: '20000', currency: 'mxn', payment_method: 'pm_card_visa', 'payment_method_types[]': 'card', confirm: 'true', description: 'Consulta PEI',
      'metadata[pei_payment_id]': PAYMENT_ID, 'metadata[pei_payment_type]': 'consultation', 'expand[]': 'latest_charge.balance_transaction',
    });
    expect(snapshot).toEqual({
      provider: 'stripe', providerPaymentId: expect.stringMatching(/^pi_/), providerStatus: 'succeeded', status: 'succeeded', externalReference: PAYMENT_ID,
      amount: money(20_000), refunded: money(0), providerFeeActual: money(800), netReceived: money(19_200), moneyReleaseDate: new Date(FAKE_AVAILABLE_ON * 1000), providerFeeVerified: true, nextAction: null,
    });
  });

  it('medicamentos: mismo flujo, con el total del pedido en centavos y sin datos clínicos en la descripción', async () => {
    const { stripe, provider } = setup();
    const snapshot = await provider.createPayment(medication());
    const form = Object.fromEntries(stripe.calls[0].form!);
    expect(form).toMatchObject({ amount: '123456', currency: 'mxn', description: 'Pedido PEI', 'metadata[pei_payment_type]': 'medication' });
    expect(snapshot).toMatchObject({ status: 'succeeded', amount: money(123_456) });
  });

  it('el dinero entra a la cuenta de PEI: sin Connect, sin comisión de aplicación y sin datos de tarjeta ni del pagador', async () => {
    const { stripe, provider } = setup();
    await provider.createPayment(consultation());
    const keys = [...stripe.calls[0].form!.keys()].join(' ');
    expect(keys).not.toMatch(/application_fee|transfer_data|on_behalf_of|transfer_group|customer|receipt_email|card\[|number|cvc|exp_/);
    expect(stripe.calls[0].headers['stripe-account']).toBeUndefined();
  });

  it('repetir la misma solicitud (misma clave) no crea otro intento: Stripe devuelve el mismo', async () => {
    const { stripe, provider } = setup();
    const first = await provider.createPayment(consultation());
    const second = await provider.createPayment(consultation());
    expect(second.providerPaymentId).toBe(first.providerPaymentId);
    expect(stripe.intents.size).toBe(1);
  });

  it('tarjeta rechazada (HTTP 402): es un resultado del cobro (failed), con el código del rechazo, y el intento se cancela', async () => {
    const { stripe, provider } = setup();
    const snapshot = await provider.createPayment(consultation('pm_card_chargeDeclined'));
    expect(snapshot).toMatchObject({ status: 'failed', providerStatus: 'requires_payment_method/generic_decline', providerFeeActual: null, netReceived: null, moneyReleaseDate: null, nextAction: null });
    // El intento rechazado no queda abierto para que alguien lo confirme después con el client_secret.
    expect(stripe.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /v1/payment_intents', `POST /v1/payment_intents/${snapshot.providerPaymentId}/cancel`]);
    expect(stripe.intents.get(snapshot.providerPaymentId)!.status).toBe('canceled');
    // Consultarlo después sigue dando failed (no canceled): el registro de PEI no entra en conflicto.
    expect((await provider.getPayment(snapshot.providerPaymentId)).status).toBe('failed');
  });

  it('si la cancelación del intento rechazado falla, el resultado sigue siendo failed', async () => {
    const { stripe, provider } = setup();
    const original = stripe.fetch;
    let n = 0;
    const flaky = (async (url: string, init: RequestInit) => {
      if (++n === 2) throw new TypeError('fetch failed');
      return original(url, init);
    }) as unknown as typeof fetch;
    const p = new StripePaymentProvider({ secretKey: SECRET_KEY, fetch: flaky, environment: 'test' });
    await expect(p.createPayment(consultation('pm_card_chargeDeclined'))).resolves.toMatchObject({ status: 'failed' });
    void provider;
  });

  it('3-D Secure pendiente: processing con la acción para el cliente; nunca succeeded', async () => {
    const { provider } = setup();
    const snapshot = await provider.createPayment(consultation('pm_card_threeDSecure2Required'));
    expect(snapshot).toMatchObject({ status: 'processing', providerStatus: 'requires_action', providerFeeActual: null });
    expect(snapshot.nextAction).toEqual({ type: 'stripe_sdk', clientSecret: expect.stringMatching(/_secret_/) });
  });

  it('cobro en proceso: processing, sin acción del cliente', async () => {
    const { provider } = setup();
    await expect(provider.createPayment(consultation('pm_card_processing'))).resolves.toMatchObject({ status: 'processing', providerStatus: 'processing', nextAction: null });
  });

  it.each([
    ['otro importe', (i: FakeIntent) => ({ ...i, amount: 100 }), /importe del proveedor no coincide/],
    ['otra moneda', (i: FakeIntent) => ({ ...i, currency: 'usd' }), /moneda distinta de MXN/],
    ['otra referencia', (i: FakeIntent) => ({ ...i, metadata: { pei_payment_id: '00000000-0000-4000-8000-000000000999' } }), /referencia del intento/],
    ['sin referencia', (i: FakeIntent) => ({ ...i, metadata: {} }), /referencia del intento/],
    ['un intento de modo real en el entorno de prueba', (i: FakeIntent) => ({ ...i, livemode: true }), /otro modo/],
    ['un estado desconocido', (i: FakeIntent) => ({ ...i, status: 'aprobado' }), /estado de Stripe desconocido/],
    ['un importe con decimales', (i: FakeIntent) => ({ ...i, amount: 200.5 }), /importe inválido/],
  ])('una respuesta con %s es inesperada: nunca se da el cobro por bueno', async (_name, tamper, message) => {
    const { stripe, provider } = setup();
    stripe.tamper = tamper;
    const e = await rejection(provider.createPayment(consultation()));
    expect(e).toBeInstanceOf(PaymentProviderError);
    expect(e.kind).toBe('unexpected_response');
    expect(e.message).toMatch(message);
  });

  it('un medio de pago que no es un PaymentMethod de Stripe se rechaza sin llamar a Stripe', async () => {
    const { stripe, provider } = setup();
    for (const token of ['tok_brick_abc', '4242424242424242', 'pm_']) {
      const request = { ...consultation(), card: { token, paymentMethodId: 'card', installments: 1 } } as PaymentRequest;
      expect((await rejection(provider.createPayment(request))).kind).toBe('rejected_request');
    }
    expect(stripe.calls).toEqual([]);
  });

  it.each([
    [401, { error: { type: 'invalid_request_error' } }, 'unauthorized'],
    [403, { error: { type: 'invalid_request_error' } }, 'unauthorized'],
    [429, { error: { type: 'rate_limit_error' } }, 'unavailable'],
    [500, { error: { type: 'api_error' } }, 'unavailable'],
    [409, { error: { type: 'idempotency_error', code: 'idempotency_key_in_use' } }, 'unavailable'],
    [400, { error: { type: 'invalid_request_error', code: 'parameter_invalid_integer' } }, 'rejected_request'],
    [402, { error: { type: 'card_error', code: 'card_declined' } }, 'rejected_request'],
    // La misma clave con otros parámetros: pudo existir un cobro anterior. Nunca es un rechazo definitivo.
    [400, { error: { type: 'idempotency_error' } }, 'unexpected_response'],
  ] as const)('HTTP %s %j → %s', async (status, body, kind) => {
    const { stripe, provider } = setup();
    stripe.failures.push({ status, body });
    const e = await rejection(provider.createPayment(consultation()));
    expect(e.kind).toBe(kind);
    expect(e.httpStatus).toBe(status);
  });

  it('red caída → unavailable; sin respuesta a tiempo → timeout (ambos reintentables con la misma clave)', async () => {
    const { stripe, provider } = setup();
    stripe.failures.push('network', 'timeout');
    const network = await rejection(provider.createPayment(consultation()));
    const timeout = await rejection(provider.createPayment(consultation()));
    expect([network.kind, network.retryable, timeout.kind, timeout.retryable]).toEqual(['unavailable', true, 'timeout', true]);
  });

  it('los errores y los registros no contienen la clave, el medio de pago, el importe ni la clave de idempotencia', async () => {
    const { stripe, provider } = setup();
    stripe.failures.push({ status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_missing', message: `No such payment_method: pm_card_visa (${SECRET_KEY})`, param: 'payment_method' } } });
    const e = await rejection(provider.createPayment(consultation()));
    const text = `${e.message} ${JSON.stringify(e)} ${warnings.join(' ')}`;
    expect(text).not.toContain(SECRET_KEY);
    expect(text).not.toMatch(/pm_card_visa|20000|00000000-0000-4000-8000-000000000001|No such/);
    expect(warnings).toEqual(['Stripe POST /v1/payment_intents → HTTP 400 · tipo=invalid_request_error · código=parameter_missing · rechazo=—']);
    expect(describeStripeFailure('GET', '/v1/payment_intents/pi_abc123456?expand[]=x', 404, { error: { code: 'resource_missing' } }))
      .toBe('Stripe GET /v1/payment_intents/:id → HTTP 404 · tipo=— · código=resource_missing · rechazo=—');
  });

  it('exige clave, fetch y modo al construirse; usa la API de Stripe por defecto', () => {
    expect(() => new StripePaymentProvider({ secretKey: ' ', fetch, environment: 'test' })).toThrow(/clave secreta/);
    expect(() => new StripePaymentProvider({ secretKey: SECRET_KEY, fetch: undefined as never, environment: 'test' })).toThrow(/fetch/);
    expect(() => new StripePaymentProvider({ secretKey: SECRET_KEY, fetch, environment: 'sandbox' as never })).toThrow(/modo/);
    expect(STRIPE_API).toBe('https://api.stripe.com');
  });
});

describe('StripePaymentProvider · consultar el pago', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('consulta el PaymentIntent con el cargo y su balance_transaction: comisión real, neto y fecha de disponibilidad', async () => {
    const { stripe, provider } = setup();
    const created = await provider.createPayment(consultation());
    const snapshot = await provider.getPayment(created.providerPaymentId);
    const call = stripe.calls.at(-1)!;
    expect(`${call.method} ${call.path}`).toBe(`GET /v1/payment_intents/${created.providerPaymentId}`);
    expect(snapshot).toEqual(created);
  });

  it('un id que no es un PaymentIntent (p. ej. un pago histórico de Mercado Pago) no se consulta', async () => {
    const { stripe, provider } = setup();
    for (const id of ['987654321', 'pi_', '../v1/charges', 'ch_abc123456']) expect((await rejection(provider.getPayment(id))).kind).toBe('rejected_request');
    expect(stripe.calls).toEqual([]);
  });

  it('un intento inexistente → not_found', async () => {
    const { provider } = setup();
    expect((await rejection(provider.getPayment('pi_noexiste000001'))).kind).toBe('not_found');
  });

  it('reembolsos del cargo: parcial → partially_refunded; total → refunded', async () => {
    const { stripe, provider } = setup();
    const created = await provider.createPayment(consultation());
    stripe.intents.get(created.providerPaymentId)!.latest_charge!.amount_refunded = 5_000;
    await expect(provider.getPayment(created.providerPaymentId)).resolves.toMatchObject({ status: 'partially_refunded', refunded: money(5_000), providerStatus: 'succeeded' });
    stripe.intents.get(created.providerPaymentId)!.latest_charge!.amount_refunded = 20_000;
    await expect(provider.getPayment(created.providerPaymentId)).resolves.toMatchObject({ status: 'refunded', refunded: money(20_000) });
  });

  it('un cargo disputado retiene el pago (in_dispute)', async () => {
    const { stripe, provider } = setup();
    const created = await provider.createPayment(consultation());
    stripe.intents.get(created.providerPaymentId)!.latest_charge!.disputed = true;
    await expect(provider.getPayment(created.providerPaymentId)).resolves.toMatchObject({ status: 'in_dispute' });
  });

  it('la comisión real solo se toma de un balance_transaction en MXN; si falta o está en otra moneda, queda sin conciliar (null)', () => {
    const base = { id: 'pi_sintetico000001', object: 'payment_intent', livemode: false, status: 'succeeded', currency: 'mxn', amount: 20_000, metadata: { pei_payment_id: PAYMENT_ID } };
    const withCharge = (latest_charge: unknown) => normalizeStripePaymentIntent({ ...base, latest_charge }, 'test');
    expect(withCharge({ amount_refunded: 0, balance_transaction: { fee: 55, net: 1_045, currency: 'usd', available_on: FAKE_AVAILABLE_ON } }))
      .toMatchObject({ status: 'succeeded', providerFeeActual: null, netReceived: null, moneyReleaseDate: null });
    expect(withCharge({ amount_refunded: 0, balance_transaction: 'txn_sin_expandir' })).toMatchObject({ providerFeeActual: null, netReceived: null });
    expect(withCharge('ch_sin_expandir')).toMatchObject({ status: 'succeeded', providerFeeActual: null, refunded: money(0) });
    expect(withCharge(null)).toMatchObject({ status: 'succeeded', providerFeeActual: null });
    expect(() => withCharge({ amount_refunded: 0, balance_transaction: { fee: 8.5, net: 1, currency: 'mxn' } })).toThrow(/balance_transaction.fee/);
    expect(() => withCharge({ amount_refunded: 30_000 })).toThrow(/fuera de rango/);
  });

  // H-2/H-3: solo un balance_transaction válido da la comisión real verificada (bt.fee, IVA incluido).
  describe('balance_transaction verificado (H-2/H-3)', () => {
    const base = { id: 'pi_sintetico000002', object: 'payment_intent', livemode: false, status: 'succeeded', currency: 'mxn', amount: 20_000, metadata: { pei_payment_id: PAYMENT_ID } };
    const bt = { object: 'balance_transaction', type: 'charge', amount: 20_000, fee: 1_299, net: 18_701, currency: 'mxn', available_on: FAKE_AVAILABLE_ON };
    const charge = (over: Record<string, unknown> = {}, btOver: Record<string, unknown> = {}) => ({ id: 'ch_x', amount: 20_000, amount_refunded: 0, balance_transaction: { ...bt, ...btOver }, ...over });
    const norm = (latest_charge: unknown, over: Record<string, unknown> = {}) => normalizeStripePaymentIntent({ ...base, ...over, latest_charge }, 'test');
    const NOT_VERIFIED = { providerFeeActual: null, netReceived: null, moneyReleaseDate: null, providerFeeVerified: false };

    it('[H2-A-01] válido (tipo charge, MXN, mismo importe y neto = importe − comisión): comisión con IVA y verificado', () => {
      expect(norm(charge())).toMatchObject({ providerFeeActual: money(1_299), netReceived: money(18_701), moneyReleaseDate: new Date(FAKE_AVAILABLE_ON * 1000), providerFeeVerified: true });
      expect(norm(charge({}, { type: 'payment' }))).toMatchObject({ providerFeeVerified: true });
    });

    it.each([
      ['importe del balance_transaction distinto del cargo', {}, { amount: 19_999 }],
      ['neto incoherente', {}, { net: 18_700 }],
      ['tipo que no es el cobro (refund)', {}, { type: 'refund' }],
      ['tipo que no es el cobro (adjustment)', {}, { type: 'adjustment' }],
      ['sin tipo', {}, { type: undefined }],
      ['otro objeto', {}, { object: 'payout' }],
      ['sin importe', {}, { amount: undefined }],
      ['cargo con otro importe que el PaymentIntent', { amount: 19_000 }, { amount: 19_000, net: 17_701 }],
      ['cargo sin importe', { amount: undefined }, {}],
      ['otra moneda', {}, { currency: 'usd' }],
    ])('[H2-A-02] no se verifica ni se toma la comisión: %s', (_label, chargeOver, btOver) => {
      expect(norm(charge(chargeOver, btOver))).toMatchObject(NOT_VERIFIED);
    });

    it('[H2-A-03] sin balance_transaction o sin expandir: no verificado; un PaymentIntent no capturado tampoco', () => {
      expect(norm({ id: 'ch_x', amount: 20_000, amount_refunded: 0, balance_transaction: null })).toMatchObject(NOT_VERIFIED);
      expect(norm({ id: 'ch_x', amount: 20_000, amount_refunded: 0, balance_transaction: 'txn_sin_expandir' })).toMatchObject(NOT_VERIFIED);
      expect(norm(charge(), { status: 'processing' })).toMatchObject({ providerFeeActual: null, providerFeeVerified: false });
    });

    it('[H2-A-04] un valor malformado sigue siendo una respuesta inesperada', () => {
      expect(() => norm(charge({}, { amount: 1.5 }))).toThrow(/balance_transaction.amount/);
      expect(() => norm(charge({ amount: 'x' }))).toThrow(/latest_charge.amount/);
    });
  });

  it('estados del PaymentIntent → estados internos', () => {
    const none = { refunded: money(0), disputed: false };
    const amount = money(20_000);
    expect([
      mapStripeStatus('requires_payment_method', false, amount, none), mapStripeStatus('requires_payment_method', true, amount, none),
      mapStripeStatus('requires_confirmation', false, amount, none), mapStripeStatus('requires_action', false, amount, none),
      mapStripeStatus('processing', false, amount, none), mapStripeStatus('requires_capture', false, amount, none),
      mapStripeStatus('succeeded', false, amount, none), mapStripeStatus('canceled', false, amount, none), mapStripeStatus('canceled', true, amount, none),
    ]).toEqual(['pending', 'failed', 'pending', 'processing', 'processing', 'processing', 'succeeded', 'canceled', 'failed']);
    expect(() => mapStripeStatus('otro', false, amount, none)).toThrow(PaymentProviderError);
  });

  it('un PaymentIntent que PEI no creó (sin metadata.pei_payment_id) da una referencia vacía', () => {
    const snapshot = normalizeStripePaymentIntent({ id: 'pi_ajeno00000001', object: 'payment_intent', livemode: false, status: 'succeeded', currency: 'mxn', amount: 100, metadata: {}, latest_charge: null }, 'test');
    expect(snapshot.externalReference).toBe('');
  });
});

describe('StripePaymentProvider · reembolsos', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('reembolso total y parcial sobre el PaymentIntent, en centavos, con refund.id como clave de idempotencia', async () => {
    const { stripe, provider } = setup();
    const paid = await provider.createPayment(consultation());
    const partial = await provider.createRefund({ providerPaymentId: paid.providerPaymentId, idempotencyKey: 'refund-1', amount: money(5_000) });
    expect(partial).toEqual({ provider: 'stripe', providerRefundId: expect.stringMatching(/^re_/), providerPaymentId: paid.providerPaymentId, providerStatus: 'succeeded', status: 'succeeded', amount: money(5_000) });
    const call = stripe.calls.at(-1)!;
    expect(call.headers['idempotency-key']).toBe('refund-1');
    expect(Object.fromEntries(call.form!)).toEqual({ payment_intent: paid.providerPaymentId, amount: '5000', 'metadata[pei_refund_id]': 'refund-1' });

    const rest = await provider.createRefund({ providerPaymentId: paid.providerPaymentId, idempotencyKey: 'refund-2', amount: null });
    expect(rest.amount).toEqual(money(15_000));
    expect(stripe.calls.at(-1)!.form!.has('amount')).toBe(false);
    await expect(provider.getRefund(paid.providerPaymentId, partial.providerRefundId)).resolves.toEqual(partial);
    // Repetir el mismo reembolso con la misma clave no devuelve dinero dos veces.
    await provider.createRefund({ providerPaymentId: paid.providerPaymentId, idempotencyKey: 'refund-1', amount: money(5_000) });
    expect(stripe.refunds.size).toBe(2);
  });

  it('valida los ids, la clave y la correspondencia del reembolso con el pago', async () => {
    const { stripe, provider } = setup();
    expect((await rejection(provider.createRefund({ providerPaymentId: '123', idempotencyKey: 'k', amount: null }))).kind).toBe('rejected_request');
    expect((await rejection(provider.createRefund({ providerPaymentId: 'pi_sintetico000001', idempotencyKey: ' ', amount: null }))).kind).toBe('rejected_request');
    expect((await rejection(provider.getRefund('pi_sintetico000001', '../x'))).kind).toBe('rejected_request');
    expect(stripe.calls).toEqual([]);
    const paid = await provider.createPayment(consultation());
    const other = await provider.createPayment(consultation('pm_card_visa', '00000000-0000-4000-8000-000000000002'));
    const refund = await provider.createRefund({ providerPaymentId: paid.providerPaymentId, idempotencyKey: 'refund-9', amount: null });
    expect((await rejection(provider.getRefund(other.providerPaymentId, refund.providerRefundId))).kind).toBe('unexpected_response');
  });

  it('saldo insuficiente es transitorio (se reintenta con la misma clave); otro rechazo es definitivo', async () => {
    const { stripe, provider } = setup();
    stripe.failures.push({ status: 400, body: { error: { type: 'invalid_request_error', code: 'balance_insufficient' } } }, { status: 400, body: { error: { type: 'invalid_request_error', code: 'charge_already_refunded' } } });
    const request = { providerPaymentId: 'pi_sintetico000001', idempotencyKey: 'refund-1', amount: null };
    expect((await rejection(provider.createRefund(request))).kind).toBe('unavailable');
    expect((await rejection(provider.createRefund(request))).kind).toBe('rejected_request');
  });

  it('estados del reembolso y contrato mínimo', () => {
    const base = { id: 're_sintetico000001', object: 'refund', payment_intent: 'pi_sintetico000001', currency: 'mxn', amount: 500 };
    expect(['succeeded', 'pending', 'requires_action', 'failed', 'canceled'].map((status) => normalizeStripeRefund({ ...base, status }, 'test').status))
      .toEqual(['succeeded', 'processing', 'processing', 'failed', 'failed']);
    for (const bad of [{ ...base, status: 'otro' }, { ...base, status: 'succeeded', currency: 'usd' }, { ...base, status: 'succeeded', amount: 0 }, { ...base, status: 'succeeded', payment_intent: null }, null]) {
      expect(() => normalizeStripeRefund(bad, 'test')).toThrow(PaymentProviderError);
    }
  });
});
