import { describeMercadoPagoWebhookConfig, loadMercadoPagoWebhookConfig, MercadoPagoWebhookConfigError } from './mercadopago-webhook.config';

const SECRET = 'clave-secreta-sintetica-0002';

describe('loadMercadoPagoWebhookConfig', () => {
  it('sin variables: no configurado (los webhooks se rechazan)', () => {
    expect(loadMercadoPagoWebhookConfig({})).toBeNull();
    expect(describeMercadoPagoWebhookConfig(null)).toMatch(/sin clave secreta/);
  });

  it('clave válida, con y sin tolerancia', () => {
    expect(loadMercadoPagoWebhookConfig({ MERCADO_PAGO_WEBHOOK_SECRET: ` ${SECRET} ` })).toEqual({ secret: SECRET, toleranceMs: null });
    expect(loadMercadoPagoWebhookConfig({ MERCADO_PAGO_WEBHOOK_SECRET: SECRET, MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS: '300' })).toEqual({ secret: SECRET, toleranceMs: 300_000 });
  });

  it.each([
    ['tolerancia sin clave', { MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS: '300' }],
    ['clave con espacios', { MERCADO_PAGO_WEBHOOK_SECRET: 'clave con espacios 12345' }],
    ['clave corta', { MERCADO_PAGO_WEBHOOK_SECRET: 'corta' }],
    ['tolerancia no entera', { MERCADO_PAGO_WEBHOOK_SECRET: SECRET, MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS: '1.5' }],
    ['tolerancia cero', { MERCADO_PAGO_WEBHOOK_SECRET: SECRET, MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS: '0' }],
  ])('%s: error sin la clave', (_n, env) => {
    let error: unknown;
    try {
      loadMercadoPagoWebhookConfig(env);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MercadoPagoWebhookConfigError);
    expect((error as Error).message).not.toContain(SECRET);
  });

  it('la descripción nunca incluye la clave', () => {
    expect(describeMercadoPagoWebhookConfig({ secret: SECRET, toleranceMs: 300_000 })).not.toContain(SECRET);
  });
});
