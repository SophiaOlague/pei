import { Logger } from '@nestjs/common';
import { money } from '../../domain/money';
import { buildPaymentRequest } from '../../domain/payment-request';
import { PaymentProviderError } from '../../application/ports/payment-provider.port';
import {
  collectorFee,
  describeProviderFailure,
  redactProviderText,
  MERCADO_PAGO_STATUS_MAP,
  mapMercadoPagoStatus,
  MercadoPagoPaymentProvider,
  normalizeMercadoPagoPayment,
  normalizeMercadoPagoRefund,
} from './mercadopago-payment-provider';

// Adaptador de Mercado Pago con un `fetch` FALSO: ninguna prueba sale a la red ni usa credenciales reales.
const TOKEN = 'TEST-token-sintetico-no-real';
const PAYMENT_ID = '0b9d8f5e-1c2a-4e3b-9f4d-5a6b7c8d9e0f';
const REQUEST = buildPaymentRequest({
  paymentId: PAYMENT_ID,
  type: 'consultation',
  gross: money(100_000),
  peiFee: { configurationId: 'fee-1', fixedFee: money(20_000) },
  processorFee: { scheduleId: 'sch-1', percentageRate: '0.0319', fixedFee: money(400), vatRate: '0.16' },
  card: { token: 'tok_brick_abc', paymentMethodId: 'visa', issuerId: '310', installments: 1, payerEmail: 'paciente@example.com' },
});

const mpPayment = (over: Record<string, unknown> = {}) => ({
  id: 123456789,
  status: 'approved',
  status_detail: 'accredited',
  currency_id: 'MXN',
  external_reference: PAYMENT_ID,
  transaction_amount: 1000,
  transaction_amount_refunded: 0,
  fee_details: [{ type: 'mercadopago_fee', amount: 40.64, fee_payer: 'collector' }],
  transaction_details: { net_received_amount: 959.36, total_paid_amount: 1000 },
  money_release_date: '2026-11-25T10:00:00.000-06:00',
  card: { last_four_digits: '1111' },
  ...over,
});

interface Call { url: string; init: RequestInit }
function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error('sin respuesta preparada');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { fn, calls };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const provider = (f: typeof fetch, timeoutMs?: number) => new MercadoPagoPaymentProvider({ accessToken: TOKEN, fetch: f, timeoutMs });
const providerError = async (p: Promise<unknown>) => p.then(() => { throw new Error('se esperaba un error'); }, (e: unknown) => e as PaymentProviderError);

describe('Mercado Pago · creación de pagos', () => {
  it('envía POST /v1/payments con token del Brick, importe, external_reference y X-Idempotency-Key = payment.id', async () => {
    const f = fakeFetch([json(201, mpPayment())]);
    const snapshot = await provider(f.fn).createPayment(REQUEST);
    expect(f.calls).toHaveLength(1);
    const { url, init } = f.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/payments');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers['X-Idempotency-Key']).toBe(PAYMENT_ID);
    expect(JSON.parse(init.body as string)).toEqual({
      transaction_amount: 1000,
      token: 'tok_brick_abc',
      description: 'Consulta PEI',
      installments: 1,
      payment_method_id: 'visa',
      issuer_id: '310',
      payer: { email: 'paciente@example.com' },
      external_reference: PAYMENT_ID,
    });
    expect(snapshot).toMatchObject({ provider: 'mercado_pago', providerPaymentId: '123456789', providerStatus: 'approved/accredited', status: 'succeeded' });
  });

  it('PEI recibe el dinero: sin split, cuentas vinculadas ni datos de tarjeta en la solicitud', async () => {
    const f = fakeFetch([json(201, mpPayment())]);
    await provider(f.fn).createPayment(REQUEST);
    const body = f.calls[0].init.body as string;
    for (const forbidden of ['marketplace_fee', 'application_fee', 'collector_id', 'card_number', 'security_code', 'cvv', 'Consulta médica']) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('idempotencia: repetir la misma solicitud reutiliza la misma clave', async () => {
    const f = fakeFetch([json(201, mpPayment()), json(200, mpPayment())]);
    const p = provider(f.fn);
    const a = await p.createPayment(REQUEST);
    const b = await p.createPayment(REQUEST);
    expect(f.calls.map((c) => (c.init.headers as Record<string, string>)['X-Idempotency-Key'])).toEqual([PAYMENT_ID, PAYMENT_ID]);
    expect(a.providerPaymentId).toBe(b.providerPaymentId);
  });

  it('rechaza una respuesta que no corresponde a la solicitud (otra referencia u otro importe)', async () => {
    expect((await providerError(provider(fakeFetch([json(201, mpPayment({ external_reference: 'otro' }))]).fn).createPayment(REQUEST))).kind)
      .toBe('unexpected_response');
    expect((await providerError(provider(fakeFetch([json(201, mpPayment({ transaction_amount: 999.99 }))]).fn).createPayment(REQUEST))).message)
      .toMatch(/no coincide con el solicitado/);
  });
});

describe('Mercado Pago · consulta de pagos', () => {
  it('GET /v1/payments/{id} sin clave de idempotencia ni cuerpo', async () => {
    const f = fakeFetch([json(200, mpPayment())]);
    const s = await provider(f.fn).getPayment('123456789');
    expect(f.calls[0].url).toBe('https://api.mercadopago.com/v1/payments/123456789');
    expect(f.calls[0].init.method).toBe('GET');
    expect((f.calls[0].init.headers as Record<string, string>)['X-Idempotency-Key']).toBeUndefined();
    expect(f.calls[0].init.body).toBeUndefined();
    expect(s.status).toBe('succeeded');
  });

  it('rechaza un id inválido sin llamar al proveedor y un pago distinto del pedido', async () => {
    const f = fakeFetch([]);
    expect((await providerError(provider(f.fn).getPayment('../v1/otra'))).kind).toBe('rejected_request');
    expect(f.calls).toEqual([]);
    expect((await providerError(provider(fakeFetch([json(200, mpPayment({ id: 999 }))]).fn).getPayment('123456789'))).message).toMatch(/otro pago/);
  });
});

describe('Mercado Pago · estados', () => {
  it.each([
    ['pending', 'pending'], ['in_process', 'processing'], ['authorized', 'processing'], ['approved', 'succeeded'],
    ['in_mediation', 'in_dispute'], ['rejected', 'failed'], ['cancelled', 'canceled'], ['refunded', 'refunded'], ['charged_back', 'charged_back'],
  ])('%s → %s', (mp, internal) => {
    expect(mapMercadoPagoStatus(mp, money(1000), money(0))).toBe(internal);
  });

  it('approved con reembolso parcial → partially_refunded; con reembolso total → refunded', () => {
    expect(mapMercadoPagoStatus('approved', money(100_000), money(33_333))).toBe('partially_refunded');
    expect(mapMercadoPagoStatus('approved', money(100_000), money(100_000))).toBe('refunded');
  });

  it('un estado desconocido es respuesta inesperada (no se convierte)', () => {
    expect(() => mapMercadoPagoStatus('approved_v2', money(1), money(0))).toThrow(PaymentProviderError);
    expect(Object.keys(MERCADO_PAGO_STATUS_MAP).sort()).toEqual(
      ['approved', 'authorized', 'cancelled', 'charged_back', 'in_mediation', 'in_process', 'pending', 'refunded', 'rejected'],
    );
  });

  it('conserva el estado original con su detalle, separado del interno', () => {
    const s = normalizeMercadoPagoPayment(mpPayment({ status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' }));
    expect(s.providerStatus).toBe('rejected/cc_rejected_insufficient_amount');
    expect(s.status).toBe('failed');
  });
});

describe('Mercado Pago · importes y comisiones', () => {
  it('normaliza importe, reembolsado, comisión real, neto recibido y fecha de liberación', () => {
    const s = normalizeMercadoPagoPayment(mpPayment());
    expect(s.amount.cents).toBe(100_000);
    expect(s.refunded.cents).toBe(0);
    expect(s.providerFeeActual?.cents).toBe(4064);
    expect(s.netReceived?.cents).toBe(95_936);
    expect(s.moneyReleaseDate?.toISOString()).toBe('2026-11-25T16:00:00.000Z');
  });

  it('la comisión real solo suma lo que paga el cobrador (PEI); sin detalle aún, null', () => {
    expect(collectorFee([{ amount: 40.64, fee_payer: 'collector' }, { amount: 5, fee_payer: 'collector' }, { amount: 99, fee_payer: 'payer' }])?.cents).toBe(4564);
    expect(collectorFee([])).toBeNull();
    expect(collectorFee(undefined)).toBeNull();
    expect(normalizeMercadoPagoPayment(mpPayment({ status: 'pending', fee_details: [], transaction_details: null, money_release_date: null })))
      .toMatchObject({ providerFeeActual: null, netReceived: null, moneyReleaseDate: null, status: 'pending' });
  });

  it('el snapshot no incluye datos de la tarjeta', () => {
    expect(JSON.stringify(normalizeMercadoPagoPayment(mpPayment()))).not.toMatch(/1111|last_four|card/);
  });

  it.each([
    ['sin id', { id: undefined }],
    ['id no numérico', { id: 'abc' }],
    ['sin estado', { status: '' }],
    ['otra moneda', { currency_id: 'USD' }],
    ['sin external_reference', { external_reference: null }],
    ['importe con tres decimales', { transaction_amount: 10.005 }],
    ['importe no numérico', { transaction_amount: '1000' }],
    ['reembolsado mayor que el importe', { transaction_amount_refunded: 2000 }],
    ['fee_details no es lista', { fee_details: {} }],
    ['comisión inválida', { fee_details: [{ amount: 'x', fee_payer: 'collector' }] }],
    ['fecha inválida', { money_release_date: 'mañana' }],
  ])('respuesta inesperada: %s', (_n, over) => {
    const error = (() => {
      try {
        normalizeMercadoPagoPayment(mpPayment(over));
      } catch (e) {
        return e as PaymentProviderError;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(PaymentProviderError);
    expect(error?.kind).toBe('unexpected_response');
  });
});

describe('Mercado Pago · errores del proveedor', () => {
  it.each([
    [400, 'rejected_request', false],
    [422, 'rejected_request', false],
    [401, 'unauthorized', false],
    [403, 'unauthorized', false],
    [404, 'not_found', false],
    [429, 'unavailable', true],
    [500, 'unavailable', true],
    [503, 'unavailable', true],
  ] as const)('HTTP %s → %s (reintentable: %s)', async (status, kind, retryable) => {
    const e = await providerError(provider(fakeFetch([json(status, { error: 'bad_request', cause: [{ code: 2034, description: 'detalle' }] })]).fn).createPayment(REQUEST));
    expect(e.kind).toBe(kind);
    expect(e.httpStatus).toBe(status);
    expect(e.retryable).toBe(retryable);
    expect(e.providerCode).toBe('2034');
  });

  it('red caída → unavailable; tiempo agotado → timeout (con la misma clave se puede reintentar)', async () => {
    expect((await providerError(provider(fakeFetch([new TypeError('fetch failed')]).fn).createPayment(REQUEST))).kind).toBe('unavailable');
    const hanging = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as unknown as typeof fetch;
    const e = await providerError(provider(hanging, 10).createPayment(REQUEST));
    expect(e.kind).toBe('timeout');
    expect(e.retryable).toBe(true);
  });

  it('respuesta 2xx no JSON → unexpected_response', async () => {
    const e = await providerError(provider(fakeFetch([new Response('<html>', { status: 200 })]).fn).getPayment('1'));
    expect(e.kind).toBe('unexpected_response');
  });

  it('los errores nunca incluyen el access token, el token de la tarjeta ni el cuerpo de la respuesta', async () => {
    const cases = [json(400, { message: `token ${TOKEN} tok_brick_abc` }), new TypeError(`fallo ${TOKEN}`), json(500, { message: 'tok_brick_abc' })];
    for (const r of cases) {
      const e = await providerError(provider(fakeFetch([r]).fn).createPayment(REQUEST));
      expect(e.message).not.toContain(TOKEN);
      expect(e.message).not.toContain('tok_brick_abc');
      expect(JSON.stringify(e)).not.toContain(TOKEN);
    }
  });

  // Hallazgo de la revisión (2026-11-14): el diagnóstico temporal copiaba `message` del proveedor y registró
  // «token TEST-token-sintetico-no-real tok_brick_abc». Ahora se registra solo lo redactado.
  describe('registro de diagnóstico (logs)', () => {
    let logs: string[];
    beforeEach(() => {
      logs = [];
      jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => void logs.push(String(m)));
    });
    afterEach(() => jest.restoreAllMocks());

    const SECRET_REQUEST = buildPaymentRequest({
      paymentId: PAYMENT_ID, type: 'consultation', gross: money(100_000),
      peiFee: { configurationId: 'fee-1', fixedFee: money(20_000) },
      processorFee: { scheduleId: 'sch-1', percentageRate: '0.0319', fixedFee: money(400), vatRate: '0.16' },
      // Token corto y sin prefijo: solo la redacción por valor exacto lo detecta.
      card: { token: 'a1b2c3d4e5', paymentMethodId: 'visa', installments: 1, payerEmail: 'persona.real@correo.mx' },
    });
    const LEAKS = [TOKEN, 'tok_brick_abc', 'a1b2c3d4e5', 'persona.real@correo.mx', PAYMENT_ID, '4509953566233704', 'APP_USR-1234-otra-credencial', 'x'.repeat(30)];

    it.each([
      ['mensaje que repite la solicitud', json(400, { message: `token ${TOKEN} tok_brick_abc a1b2c3d4e5 persona.real@correo.mx`, error: 'bad_request', cause: [{ code: 2034, description: `tarjeta 4509953566233704 ref ${PAYMENT_ID}` }] })],
      ['credencial ajena y cadena larga', json(401, { message: `APP_USR-1234-otra-credencial ${'x'.repeat(30)}`, error: 'unauthorized' })],
      ['campo error con texto libre (no es un código)', json(500, { error: `fallo con ${TOKEN}`, cause: [{ code: 'código con espacios a1b2c3d4e5' }] })],
    ])('%s: el log no contiene tokens, correos, tarjetas ni ids', async (_n, response) => {
      const idempotencyKey = SECRET_REQUEST.idempotencyKey;
      await providerError(provider(fakeFetch([response]).fn).createPayment(SECRET_REQUEST));
      expect(logs).toHaveLength(1);
      for (const leak of [...LEAKS, idempotencyKey]) expect(logs[0]).not.toContain(leak);
    });

    it('conserva lo útil para el diagnóstico: método, ruta sin id, HTTP, códigos y el texto no sensible', async () => {
      await providerError(provider(fakeFetch([json(403, { message: 'Unauthorized use of live credentials', error: 'forbidden', cause: [{ code: 7, description: 'Invalid users involved' }] })]).fn).getPayment('123456789'));
      expect(logs[0]).toBe('Mercado Pago GET /v1/payments/:id → HTTP 403 · causa=7 · error=forbidden · mensaje=Unauthorized use of live credentials · descripción=Invalid users involved');
    });

    it('redactProviderText y describeProviderFailure: valores exactos y patrones', () => {
      expect(redactProviderText('abc clave abc', ['abc'])).toBe('[redactado] clave [redactado]');
      expect(redactProviderText(`x ${'9'.repeat(16)} y`, [])).toBe('x [redactado] y');
      expect(redactProviderText('t'.repeat(300), []).length).toBeLessThanOrEqual(120);
      expect(describeProviderFailure('POST', '/v1/payments', 400, 'no json', [])).toBe('Mercado Pago POST /v1/payments → HTTP 400 · causa=— · error=— · mensaje=— · descripción=—');
    });

    it('un estado desconocido con formato extraño no se copia al error', () => {
      expect(() => mapMercadoPagoStatus(`raro ${TOKEN}`, money(1), money(0))).toThrow('(formato no válido)');
      expect(() => mapMercadoPagoStatus(`raro ${TOKEN}`, money(1), money(0))).not.toThrow(TOKEN);
    });
  });

  it('exige access token y fetch', () => {
    expect(() => new MercadoPagoPaymentProvider({ accessToken: '', fetch: fakeFetch([]).fn })).toThrow('access token');
    expect(() => new MercadoPagoPaymentProvider({ accessToken: TOKEN, fetch: undefined as unknown as typeof fetch })).toThrow('fetch');
  });
});

// F5: reembolsos con `fetch` falso (sin red ni credenciales reales).
describe('Mercado Pago · reembolsos', () => {
  const REFUND_ID = '0b9d8f5e-1c2a-4e3b-9f4d-5a6b7c8d9e10';
  const mpRefund = (over: Record<string, unknown> = {}) => ({ id: 1009042015, payment_id: 123456789, amount: 650, status: 'approved', source: [{ type: 'collector' }], ...over });

  it('total: POST /v1/payments/{id}/refunds sin importe, X-Idempotency-Key = id del reembolso y X-Render-In-Process-Refunds', async () => {
    const f = fakeFetch([json(201, mpRefund())]);
    const s = await provider(f.fn).createRefund({ providerPaymentId: '123456789', idempotencyKey: REFUND_ID, amount: null });
    const { url, init } = f.calls[0];
    expect(url).toBe('https://api.mercadopago.com/v1/payments/123456789/refunds');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({});
    expect(init.headers).toMatchObject({ 'X-Idempotency-Key': REFUND_ID, 'X-Render-In-Process-Refunds': 'true', Authorization: `Bearer ${TOKEN}` });
    expect(s).toEqual({ provider: 'mercado_pago', providerRefundId: '1009042015', providerPaymentId: '123456789', providerStatus: 'approved', status: 'succeeded', amount: money(65_000) });
  });

  it('parcial: envía el importe exacto y exige que la respuesta lo respete', async () => {
    const f = fakeFetch([json(201, mpRefund({ amount: 100.5, status: 'in_process' }))]);
    const s = await provider(f.fn).createRefund({ providerPaymentId: '123456789', idempotencyKey: REFUND_ID, amount: money(10_050) });
    expect(JSON.parse(f.calls[0].init.body as string)).toEqual({ amount: 100.5 });
    expect(s).toMatchObject({ status: 'processing', providerStatus: 'in_process', amount: money(10_050) });
    const e = await providerError(provider(fakeFetch([json(201, mpRefund({ amount: 99 }))]).fn).createRefund({ providerPaymentId: '123456789', idempotencyKey: REFUND_ID, amount: money(10_050) }));
    expect(e.kind).toBe('unexpected_response');
  });

  it.each([
    ['approved', 'succeeded'], ['in_process', 'processing'], ['pending', 'processing'], ['authorized', 'processing'], ['rejected', 'failed'], ['cancelled', 'failed'],
  ] as const)('estado %s → %s', (status, expected) => {
    expect(normalizeMercadoPagoRefund(mpRefund({ status })).status).toBe(expected);
  });

  it('estado desconocido, ids inválidos o importe no positivo: respuesta inesperada (nunca succeeded)', () => {
    for (const over of [{ status: 'refunded_maybe' }, { id: 'abc' }, { payment_id: undefined }, { amount: 0 }, { amount: '650' }, { status: '' }]) {
      expect(() => normalizeMercadoPagoRefund(mpRefund(over))).toThrow(PaymentProviderError);
    }
  });

  it.each([
    [409, 'unavailable', true], [428, 'unavailable', true], [400, 'rejected_request', false], [404, 'not_found', false], [500, 'unavailable', true], [401, 'unauthorized', false],
  ] as const)('creación HTTP %s → %s (reintentable: %s)', async (status, kind, retryable) => {
    const e = await providerError(provider(fakeFetch([json(status, { error: 'x', cause: [{ code: 2063 }] })]).fn).createRefund({ providerPaymentId: '123456789', idempotencyKey: REFUND_ID, amount: null }));
    expect(e.kind).toBe(kind);
    expect(e.retryable).toBe(retryable);
  });

  it('409 y 428 solo son transitorios en reembolsos: en la creación de pagos siguen siendo rechazos', async () => {
    expect((await providerError(provider(fakeFetch([json(409, {})]).fn).createPayment(REQUEST))).kind).toBe('rejected_request');
  });

  it('consulta: GET /v1/payments/{id}/refunds/{refund_id} y valida que sea el mismo reembolso', async () => {
    const f = fakeFetch([json(200, mpRefund())]);
    expect((await provider(f.fn).getRefund('123456789', '1009042015')).status).toBe('succeeded');
    expect(f.calls[0].url).toBe('https://api.mercadopago.com/v1/payments/123456789/refunds/1009042015');
    expect(f.calls[0].init.method).toBe('GET');
    expect((await providerError(provider(fakeFetch([json(200, mpRefund({ id: 1 }))]).fn).getRefund('123456789', '1009042015'))).kind).toBe('unexpected_response');
    expect((await providerError(provider(fakeFetch([]).fn).getRefund('12a', '1'))).kind).toBe('rejected_request');
  });

  it('el log de un error de reembolso no incluye los ids de la ruta ni la clave de idempotencia', async () => {
    const logs: string[] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => void logs.push(String(m)));
    await providerError(provider(fakeFetch([json(400, { message: `clave ${REFUND_ID}` })]).fn).createRefund({ providerPaymentId: '123456789', idempotencyKey: REFUND_ID, amount: null }));
    expect(logs[0]).toContain('POST /v1/payments/:id/refunds → HTTP 400');
    expect(logs[0]).not.toContain('123456789');
    expect(logs[0]).not.toContain(REFUND_ID);
    jest.restoreAllMocks();
  });
});
