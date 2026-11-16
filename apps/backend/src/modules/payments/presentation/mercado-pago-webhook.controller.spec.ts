import { Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { WebhookAuthenticationError, type RawWebhookRequest } from '../application/ports/provider-webhook.port';
import type { ReceiveProviderWebhookUseCase } from '../application/use-cases/provider-webhook.use-cases';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';

// Unitarias del controlador (sin servidor HTTP): mapeo de resultados y errores.
function controller(execute: (r: RawWebhookRequest) => Promise<unknown>) {
  const calls: RawWebhookRequest[] = [];
  const c = new MercadoPagoWebhookController({ execute: async (r: RawWebhookRequest) => (calls.push(r), execute(r)) } as unknown as ReceiveProviderWebhookUseCase);
  return { c, calls };
}

describe('MercadoPagoWebhookController', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('ruta pública (sin SessionGuard): la autenticidad la da la firma', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MercadoPagoWebhookController)).toBeUndefined();
    const handler = Object.getOwnPropertyDescriptor(MercadoPagoWebhookController.prototype, 'receive')!.value as object;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
  });

  it.each(['accepted', 'duplicate', 'ignored'])('%s → 200 sin ids internos ni estados', async (outcome) => {
    const { c, calls } = controller(async () => ({ outcome, eventId: 'evt-1' }));
    const body = { data: { id: '1' } };
    const res = await c.receive({ originalUrl: '/webhooks/mercado-pago?data.id=1&type=payment' }, { 'x-request-id': 'r' }, body);
    expect(res).toEqual({ received: true });
    expect(calls).toEqual([{ url: '/webhooks/mercado-pago?data.id=1&type=payment', headers: { 'x-request-id': 'r' }, body }]);
  });

  it('firma inválida → 401 genérico', async () => {
    const { c } = controller(async () => {
      throw new WebhookAuthenticationError('invalid_signature');
    });
    const error = await c.receive({ originalUrl: '/x' }, {}, {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as Error).message).not.toMatch(/invalid_signature/);
  });

  it('sin clave secreta → 503 (falla cerrada)', async () => {
    const { c } = controller(async () => {
      throw new WebhookAuthenticationError('not_configured');
    });
    await expect(c.receive({ url: '/x' }, {}, {})).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('otros errores (p. ej. la base de datos) se propagan → 5xx y Mercado Pago reintenta', async () => {
    const { c } = controller(async () => {
      throw new Error('db caída');
    });
    await expect(c.receive({}, {}, {})).rejects.toThrow('db caída');
  });
});
