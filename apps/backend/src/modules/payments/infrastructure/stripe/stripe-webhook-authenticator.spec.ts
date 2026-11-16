import { createHmac } from 'crypto';
import { FakeStripe, stripeSignature } from '../../../../../test/support/stripe-fake';
import { WebhookAuthenticationError, type RawWebhookRequest } from '../../application/ports/provider-webhook.port';
import {
  computeStripeSignature, parseStripeSignatureHeader, STRIPE_PAYMENT_EVENT_TYPES, StripeWebhookAuthenticator, UnconfiguredStripeWebhookAuthenticator,
} from './stripe-webhook-authenticator';

// Firma real (HMAC-SHA256 con un secreto SINTÉTICO, armado por partes) sobre los bytes del cuerpo. Sin red.
const SECRET = ['whsec', 'sintetico8888888888'].join('_');
const NOW = new Date('2026-11-15T12:00:00Z');
const T = Math.floor(NOW.getTime() / 1000);
const PI = 'pi_sintetico000001';
const stripe = new FakeStripe();

const authenticator = (over: Partial<ConstructorParameters<typeof StripeWebhookAuthenticator>[0]> = {}) =>
  new StripeWebhookAuthenticator({ secret: SECRET, toleranceMs: 300_000, environment: 'test', now: () => NOW, ...over });
const request = (rawBody: Buffer | undefined, signature: string | undefined, body?: unknown): RawWebhookRequest => ({
  url: '/webhooks/stripe', headers: signature === undefined ? {} : { 'stripe-signature': signature }, body, rawBody,
});
const intentEvent = (type = 'payment_intent.succeeded', over: { id?: string; livemode?: boolean } = {}) =>
  stripe.event(type, { id: PI, object: 'payment_intent', status: 'succeeded', amount: 20_000 }, { id: 'evt_sintetico000001', ...over });
const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(WebhookAuthenticationError);
    return (e as WebhookAuthenticationError).reason;
  }
  return 'sin error';
};

describe('StripeWebhookAuthenticator · firma', () => {
  it('firma válida sobre el cuerpo original: evento de pago con el PaymentIntent como data_id y el evento como request_id', () => {
    const raw = intentEvent();
    expect(authenticator().authenticate(request(raw, stripeSignature(SECRET, raw, T)))).toEqual({
      provider: 'stripe', topic: 'payment', action: 'payment_intent.succeeded', dataId: PI, requestId: 'evt_sintetico000001',
      payload: { id: 'evt_sintetico000001', type: 'payment_intent.succeeded', livemode: false, created: 1794790000, api_version: '2024-06-20', data: { object: { id: PI, object: 'payment_intent', payment_intent: PI } } },
    });
  });

  it('el evento se interpreta de los bytes firmados, no del cuerpo ya procesado por otro middleware', () => {
    const raw = intentEvent();
    const forged = { id: 'evt_falso00000001', object: 'event', type: 'payment_intent.succeeded', livemode: false, data: { object: { id: 'pi_otropago000009', object: 'payment_intent' } } };
    const n = authenticator().authenticate(request(raw, stripeSignature(SECRET, raw, T), forged));
    expect([n.dataId, n.requestId]).toEqual([PI, 'evt_sintetico000001']);
  });

  it('del evento solo se guardan campos permitidos: ni importes, ni estado, ni datos del pagador', () => {
    const raw = stripe.event('payment_intent.succeeded', { id: PI, object: 'payment_intent', status: 'succeeded', amount: 20_000, receipt_email: 'persona@correo.mx', client_secret: 'pi_x_secret_y' }, { id: 'evt_sintetico000002' });
    const text = JSON.stringify(authenticator().authenticate(request(raw, stripeSignature(SECRET, raw, T))).payload);
    expect(text).not.toMatch(/20000|"status"|"amount"|persona@correo|client_secret|_secret_/);
  });

  it.each([
    ['sin cabecera Stripe-Signature', (raw: Buffer) => request(raw, undefined), 'missing_signature'],
    ['cabecera sin marca de tiempo', (raw: Buffer) => request(raw, `v1=${'a'.repeat(64)}`), 'malformed_signature'],
    ['cabecera sin v1', (raw: Buffer) => request(raw, `t=${T},v0=${'a'.repeat(64)}`), 'malformed_signature'],
    ['v1 que no es un HMAC en hexadecimal', (raw: Buffer) => request(raw, `t=${T},v1=no-es-hex`), 'malformed_signature'],
    ['firma de otro secreto', (raw: Buffer) => request(raw, stripeSignature(['whsec', 'otrosecreto0000000'].join('_'), raw, T)), 'invalid_signature'],
    ['firma en ceros', (raw: Buffer) => request(raw, `t=${T},v1=${'0'.repeat(64)}`), 'invalid_signature'],
    ['cuerpo alterado después de firmar', (raw: Buffer) => request(Buffer.from(raw.toString('utf8').replace(PI, 'pi_otropago000009')), stripeSignature(SECRET, raw, T)), 'invalid_signature'],
    ['un espacio añadido al cuerpo (la firma cubre los bytes exactos)', (raw: Buffer) => request(Buffer.concat([raw, Buffer.from(' ')]), stripeSignature(SECRET, raw, T)), 'invalid_signature'],
    ['marca de tiempo cambiada (la firma la cubre)', (raw: Buffer) => request(raw, stripeSignature(SECRET, raw, T).replace(`t=${T}`, `t=${T + 1}`)), 'invalid_signature'],
    ['sin el cuerpo original (solo el JSON ya interpretado)', (raw: Buffer) => request(undefined, stripeSignature(SECRET, raw, T), JSON.parse(raw.toString('utf8'))), 'missing_raw_body'],
    ['cuerpo vacío', (_raw: Buffer) => request(Buffer.alloc(0), stripeSignature(SECRET, Buffer.alloc(0), T)), 'missing_raw_body'],
  ])('rechaza %s', (_name, build, expected) => {
    expect(reason(() => authenticator().authenticate(build(intentEvent())))).toBe(expected);
  });

  it('rechaza una notificación válida pero antigua o futura (repetición de una captura), con tolerancia configurable', () => {
    const raw = intentEvent();
    expect(reason(() => authenticator().authenticate(request(raw, stripeSignature(SECRET, raw, T - 301))))).toBe('stale_timestamp');
    expect(reason(() => authenticator().authenticate(request(raw, stripeSignature(SECRET, raw, T + 301))))).toBe('stale_timestamp');
    expect(authenticator().authenticate(request(raw, stripeSignature(SECRET, raw, T - 299))).dataId).toBe(PI);
    expect(reason(() => authenticator({ toleranceMs: 60_000 }).authenticate(request(raw, stripeSignature(SECRET, raw, T - 61))))).toBe('stale_timestamp');
  });

  it('con varias v1 (rotación del secreto) basta con que una coincida', () => {
    const raw = intentEvent();
    const good = stripeSignature(SECRET, raw, T).split('v1=')[1];
    expect(authenticator().authenticate(request(raw, `t=${T},v1=${'1'.repeat(64)},v1=${good},v0=${'2'.repeat(64)}`)).dataId).toBe(PI);
    expect(parseStripeSignatureHeader(`t=${T}, v1=${good.toUpperCase()}`)).toEqual({ timestamp: String(T), signatures: [good] });
    expect(computeStripeSignature(SECRET, String(T), raw)).toBe(createHmac('sha256', SECRET).update(`${T}.${raw.toString('utf8')}`).digest('hex'));
  });

  it('un evento de modo real en el entorno de prueba (o al revés) se rechaza aunque la firma sea válida', () => {
    const live = intentEvent('payment_intent.succeeded', { livemode: true });
    expect(reason(() => authenticator().authenticate(request(live, stripeSignature(SECRET, live, T))))).toBe('environment_mismatch');
    const test = intentEvent();
    expect(reason(() => authenticator({ environment: 'live' }).authenticate(request(test, stripeSignature(SECRET, test, T))))).toBe('environment_mismatch');
    expect(authenticator({ environment: null }).authenticate(request(live, stripeSignature(SECRET, live, T))).dataId).toBe(PI);
  });

  it.each([
    ['no es JSON', Buffer.from('no es json'), 'malformed_payload'],
    ['no es un evento', Buffer.from(JSON.stringify({ id: PI, object: 'payment_intent' })), 'malformed_payload'],
    ['evento sin id', Buffer.from(JSON.stringify({ object: 'event', type: 'payment_intent.succeeded', livemode: false })), 'missing_request_id'],
    ['evento sin tipo', Buffer.from(JSON.stringify({ id: 'evt_sintetico000001', object: 'event', livemode: false })), 'missing_topic'],
    ['evento sin livemode', Buffer.from(JSON.stringify({ id: 'evt_sintetico000001', object: 'event', type: 'payment_intent.succeeded' })), 'malformed_payload'],
  ])('con firma válida pero el cuerpo %s, se rechaza', (_name, raw, expected) => {
    expect(reason(() => authenticator().authenticate(request(raw, stripeSignature(SECRET, raw, T))))).toBe(expected);
  });

  it('ningún error contiene el secreto, la firma recibida ni la calculada', () => {
    const raw = intentEvent();
    const received = `t=${T},v1=${'9'.repeat(64)}`;
    try {
      authenticator().authenticate(request(raw, received));
      throw new Error('se esperaba un error');
    } catch (e) {
      const text = `${(e as Error).message} ${JSON.stringify(e)}`;
      expect(text).not.toContain(SECRET);
      expect(text).not.toMatch(/9{64}/);
      expect(text).not.toContain(computeStripeSignature(SECRET, String(T), raw));
    }
  });

  it('sin secreto configurado se rechaza todo (falla cerrada); el autenticador exige secreto y tolerancia', () => {
    expect(reason(() => new UnconfiguredStripeWebhookAuthenticator().authenticate())).toBe('not_configured');
    expect(new UnconfiguredStripeWebhookAuthenticator().provider).toBe('stripe');
    expect(() => new StripeWebhookAuthenticator({ secret: ' ', toleranceMs: 1 })).toThrow(/secreto/);
    expect(() => new StripeWebhookAuthenticator({ secret: SECRET, toleranceMs: 0 })).toThrow(/tolerancia/);
  });
});

describe('StripeWebhookAuthenticator · eventos', () => {
  const authenticate = (raw: Buffer) => authenticator().authenticate(request(raw, stripeSignature(SECRET, raw, T)));

  it('eventos necesarios para el flujo de PaymentIntents', () => {
    expect([...STRIPE_PAYMENT_EVENT_TYPES].sort()).toEqual([
      'charge.dispute.closed', 'charge.dispute.created', 'charge.refund.updated', 'charge.refunded',
      'payment_intent.canceled', 'payment_intent.payment_failed', 'payment_intent.processing', 'payment_intent.requires_action', 'payment_intent.succeeded',
      'refund.failed', 'refund.updated',
    ]);
  });

  it.each(['payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.processing', 'payment_intent.requires_action', 'payment_intent.canceled'])(
    '%s → tema payment con el PaymentIntent del evento', (type) => {
      expect(authenticate(intentEvent(type))).toMatchObject({ topic: 'payment', action: type, dataId: PI });
    });

  it.each([
    ['charge.refunded', { id: 'ch_sintetico000001', object: 'charge', payment_intent: PI }],
    ['refund.updated', { id: 're_sintetico000001', object: 'refund', payment_intent: PI }],
    ['charge.dispute.created', { id: 'dp_sintetico000001', object: 'dispute', payment_intent: PI }],
  ])('%s → tema payment con el PaymentIntent del cargo, reembolso o disputa', (type, object) => {
    expect(authenticate(stripe.event(type, object, { id: 'evt_sintetico000003' }))).toMatchObject({ topic: 'payment', action: type, dataId: PI, requestId: 'evt_sintetico000003' });
  });

  it('un tipo de evento que no se procesa se registra con su propio tipo como tema (quedará ignorado)', () => {
    const n = authenticate(stripe.event('customer.created', { id: 'cus_sintetico00001', object: 'customer' }, { id: 'evt_sintetico000004' }));
    expect(n).toMatchObject({ topic: 'customer.created', action: 'customer.created', dataId: 'cus_sintetico00001', requestId: 'evt_sintetico000004' });
  });

  it('un evento de pago sin PaymentIntent reconocible no se procesa como pago', () => {
    const n = authenticate(stripe.event('charge.refunded', { id: 'ch_sintetico000001', object: 'charge', payment_intent: null }, { id: 'evt_sintetico000005' }));
    expect(n).toMatchObject({ topic: 'charge.refunded', dataId: 'ch_sintetico000001' });
    const odd = authenticate(stripe.event('payment_intent.succeeded', { id: '../../etc', object: 'payment_intent' }, { id: 'evt_sintetico000006' }));
    expect(odd).toMatchObject({ topic: 'payment_intent.succeeded', dataId: 'evt_sintetico000006' });
  });
});
