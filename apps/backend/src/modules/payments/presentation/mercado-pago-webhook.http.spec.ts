import { createHmac } from 'crypto';
import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bodyParser from 'body-parser';
import request from 'supertest';
import { DomainExceptionFilter } from '../../../common/filters/domain-exception.filter';
import { createValidationPipe } from '../../../common/validation/create-validation-pipe';
import type { NewWebhookEvent, WebhookEventRepository } from '../application/ports/provider-webhook.port';
import { ReceiveProviderWebhookUseCase } from '../application/use-cases/provider-webhook.use-cases';
import { MercadoPagoWebhookAuthenticator } from '../infrastructure/mercadopago/mercadopago-webhook-authenticator';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';

// HTTP real de Nest (body parser JSON, ValidationPipe global y filtro de errores como en main.ts/AppModule) con la
// recepción real y una clave sintética. Sin BD (repositorio en memoria), sin red y sin Mercado Pago.
const SECRET = 'clave-secreta-sintetica-http-0004';
const TS = String(Date.parse('2026-11-14T12:00:00Z'));

describe('POST /webhooks/mercado-pago (pipeline HTTP)', () => {
  let app: INestApplication;
  const stored: NewWebhookEvent[] = [];
  const dispatched: string[] = [];

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const events: WebhookEventRepository = {
      insert: async (e) => (stored.push(e), `evt-${stored.length}`),
      findByKey: async () => null,
      claim: async () => null,
      finish: async () => undefined,
      findRetryable: async () => [],
    };
    const receiver = new ReceiveProviderWebhookUseCase({
      clock: { now: () => new Date(Number(TS)) },
      authenticator: new MercadoPagoWebhookAuthenticator({ secret: SECRET }),
      events,
      dispatcher: { dispatch: (id) => dispatched.push(id) },
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [MercadoPagoWebhookController],
      providers: [{ provide: ReceiveProviderWebhookUseCase, useValue: receiver }],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    app.use(bodyParser.json());
    app.useGlobalFilters(new DomainExceptionFilter());
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  const sign = (dataId: string, requestId: string) => `ts=${TS},v1=${createHmac('sha256', SECRET).update(`id:${dataId};request-id:${requestId};ts:${TS};`).digest('hex')}`;
  const body = { action: 'payment.updated', api_version: 'v1', data: { id: '123456789' }, date_created: '2026-11-14T12:00:00Z', id: 98765, live_mode: false, type: 'payment', user_id: 1 };

  it('notificación firmada → 200; la query data.id se lee tal cual y el cuerpo con campos extra no lo rechaza la validación global', async () => {
    const res = await request(app.getHttpServer())
      .post('/webhooks/mercado-pago?data.id=123456789&type=payment')
      .set('x-signature', sign('123456789', 'req-http-1'))
      .set('x-request-id', 'req-http-1')
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ topic: 'payment', dataId: '123456789', requestId: 'req-http-1', status: 'received' });
    expect(dispatched).toEqual(['evt-1']);
  });

  it('firma inválida → 401 sin detalles y sin registrar', async () => {
    const res = await request(app.getHttpServer())
      .post('/webhooks/mercado-pago?data.id=123456789&type=payment')
      .set('x-signature', `ts=${TS},v1=${'0'.repeat(64)}`)
      .set('x-request-id', 'req-http-2')
      .send(body);
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toMatch(/invalid_signature|v1=|0{64}/);
    expect(stored).toHaveLength(1);
  });

  it('formato IPN sin firma (topic/id) → 401', async () => {
    const res = await request(app.getHttpServer()).post('/webhooks/mercado-pago?topic=payment&id=123456789').send({});
    expect(res.status).toBe(401);
  });
});
