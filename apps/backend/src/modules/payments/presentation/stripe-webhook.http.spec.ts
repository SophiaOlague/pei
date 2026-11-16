import type { INestApplication } from '@nestjs/common';
import { Controller, Logger, Post, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bodyParser from 'body-parser';
import request from 'supertest';
import { FakeStripe, stripeSignature } from '../../../../test/support/stripe-fake';
import { DomainExceptionFilter } from '../../../common/filters/domain-exception.filter';
import { createValidationPipe } from '../../../common/validation/create-validation-pipe';
import { UniqueConstraintViolationError } from '../../../common/domain/persistence.errors';
import type { NewWebhookEvent, WebhookEventRepository } from '../application/ports/provider-webhook.port';
import { ReceiveProviderWebhookUseCase } from '../application/use-cases/provider-webhook.use-cases';
import { StripeWebhookAuthenticator, UnconfiguredStripeWebhookAuthenticator } from '../infrastructure/stripe/stripe-webhook-authenticator';
import { captureStripeRawBody, StripeWebhookController } from './stripe-webhook.controller';

// HTTP real de Nest con el MISMO body parser que AppModule (JSON con verify: captureStripeRawBody), ValidationPipe global
// y filtro de errores. Recepción real con un secreto SINTÉTICO. Sin BD (repositorio en memoria), sin red y sin Stripe.
const SECRET = ['whsec', 'sintetico6666666666'].join('_');
const NOW = new Date('2026-11-15T12:00:00Z');
const T = Math.floor(NOW.getTime() / 1000);
const PI = 'pi_sintetico000001';

// Ruta de control: comprueba que el cuerpo original NO se conserva fuera del webhook de Stripe.
@Controller('otra-ruta')
class ProbeController {
  @Post()
  probe(@Req() req: { rawBody?: Buffer }) {
    return { hasRawBody: req.rawBody !== undefined };
  }
}

describe('POST /webhooks/stripe (pipeline HTTP)', () => {
  let app: INestApplication;
  const stripe = new FakeStripe();
  const stored: NewWebhookEvent[] = [];
  const dispatched: string[] = [];
  const key = (e: { provider: string; topic: string; dataId: string; requestId: string }) => `${e.provider}|${e.topic}|${e.dataId}|${e.requestId}`;

  async function build(configured: boolean) {
    const events: WebhookEventRepository = {
      insert: async (e) => {
        if (stored.some((s) => key(s) === key(e))) throw new UniqueConstraintViolationError({ code: '23505', constraint: 'provider_webhook_event_uq', table: 'provider_webhook_event' });
        stored.push(e);
        return `evt-${stored.length}`;
      },
      findByKey: async (k) => {
        const i = stored.findIndex((s) => key(s) === key(k));
        return i < 0 ? null : { ...stored[i], id: `evt-${i + 1}`, status: 'processed', paymentId: null, processedAt: NOW, processingAttempts: 1, lastError: null };
      },
      claim: async () => null,
      finish: async () => undefined,
      findRetryable: async () => [],
    };
    const receiver = new ReceiveProviderWebhookUseCase({
      clock: { now: () => NOW },
      authenticator: configured ? new StripeWebhookAuthenticator({ secret: SECRET, toleranceMs: 300_000, environment: 'test', now: () => NOW }) : new UnconfiguredStripeWebhookAuthenticator(),
      events,
      dispatcher: { dispatch: (id) => dispatched.push(id) },
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [StripeWebhookController, ProbeController],
      providers: [{ provide: ReceiveProviderWebhookUseCase, useValue: receiver }],
    }).compile();
    const nest = moduleRef.createNestApplication({ bodyParser: false });
    nest.use(bodyParser.json({ verify: captureStripeRawBody }));
    nest.useGlobalFilters(new DomainExceptionFilter());
    nest.useGlobalPipes(createValidationPipe());
    await nest.init();
    return nest;
  }

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    app = await build(true);
  });
  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  // El cuerpo se envía como texto ya serializado: son exactamente los bytes que se firmaron.
  const post = (raw: Buffer, signature?: string, path = '/webhooks/stripe') => {
    const r = request(app.getHttpServer()).post(path).set('content-type', 'application/json; charset=utf-8');
    return (signature ? r.set('stripe-signature', signature) : r).send(raw.toString('utf8'));
  };
  const event = (id: string, type = 'payment_intent.succeeded') => stripe.event(type, { id: PI, object: 'payment_intent', status: 'succeeded', amount: 20_000 }, { id });

  it('evento firmado → 200; la firma se verifica sobre el cuerpo original conservado por el body parser', async () => {
    const raw = event('evt_http00000001');
    const res = await post(raw, stripeSignature(SECRET, raw, T));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ provider: 'stripe', topic: 'payment', action: 'payment_intent.succeeded', dataId: PI, requestId: 'evt_http00000001', status: 'received' });
    expect(dispatched).toEqual(['evt-1']);
  });

  it('el mismo evento otra vez (reentrega de Stripe) → 200, sin registrarlo ni despacharlo de nuevo', async () => {
    const raw = event('evt_http00000001');
    const res = await post(raw, stripeSignature(SECRET, raw, T));
    expect(res.status).toBe(200);
    expect(stored).toHaveLength(1);
    expect(dispatched).toEqual(['evt-1']);
  });

  it('firma inválida → 401 sin detalles y sin registrar', async () => {
    const raw = event('evt_http00000002');
    const res = await post(raw, `t=${T},v1=${'0'.repeat(64)}`);
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/invalid_signature|v1=|0{64}|whsec/);
    expect(stored).toHaveLength(1);
  });

  it('sin firma → 401; cuerpo alterado tras firmar → 401', async () => {
    const raw = event('evt_http00000003');
    expect((await post(raw)).status).toBe(401);
    const tampered = Buffer.from(raw.toString('utf8').replace('"amount":20000', '"amount":1'));
    expect((await post(tampered, stripeSignature(SECRET, raw, T))).status).toBe(401);
    expect(stored).toHaveLength(1);
  });

  it('un evento firmado de un tipo que no se procesa → 200 y queda registrado como ignorado, sin despacharse', async () => {
    const raw = stripe.event('customer.created', { id: 'cus_sintetico00001', object: 'customer' }, { id: 'evt_http00000004' });
    const res = await post(raw, stripeSignature(SECRET, raw, T));
    expect(res.status).toBe(200);
    expect(stored.at(-1)).toMatchObject({ topic: 'customer.created', status: 'ignored' });
    expect(dispatched).toEqual(['evt-1']);
  });

  it('el cuerpo original solo se conserva en la ruta del webhook de Stripe', async () => {
    const res = await request(app.getHttpServer()).post('/otra-ruta').send({ a: 1 });
    expect(res.body).toEqual({ hasRawBody: false });
    const req = { originalUrl: '/webhooks/stripe?x=1' } as { originalUrl: string; rawBody?: Buffer };
    captureStripeRawBody(req, null, Buffer.from('{}'));
    expect(req.rawBody?.toString()).toBe('{}');
    const other = { originalUrl: '/webhooks/stripe/otra' } as { originalUrl: string; rawBody?: Buffer };
    captureStripeRawBody(other, null, Buffer.from('{}'));
    expect(other.rawBody).toBeUndefined();
  });

  it('sin secreto de firma configurado → 503 (falla cerrada) y nada se registra', async () => {
    const unconfigured = await build(false);
    try {
      const raw = event('evt_http00000005');
      const res = await request(unconfigured.getHttpServer()).post('/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', stripeSignature(SECRET, raw, T)).send(raw.toString('utf8'));
      expect(res.status).toBe(503);
      expect(stored.some((s) => s.requestId === 'evt_http00000005')).toBe(false);
    } finally {
      await unconfigured.close();
    }
  });
});
