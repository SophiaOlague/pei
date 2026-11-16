import { describeStripeConfig, describeStripeWebhookConfig, loadStripeConfig, loadStripeWebhookConfig, StripeConfigError } from './stripe.config';

// Configuración de Stripe: separación prueba/real y ausencia de secretos. Claves SINTÉTICAS, armadas por partes (no son
// credenciales de ninguna cuenta).
const TEST_KEY = ['sk', 'test', 'sintetica1111111111'].join('_');
const RESTRICTED_TEST_KEY = ['rk', 'test', 'sintetica1111111111'].join('_');
const LIVE_KEY = ['sk', 'live', 'sintetica2222222222'].join('_');
const PUBLISHABLE_KEY = ['pk', 'test', 'sintetica3333333333'].join('_');
const WEBHOOK_SECRET = ['whsec', 'sintetico4444444444'].join('_');

const error = (load: () => unknown) => {
  try {
    load();
  } catch (e) {
    return e as Error;
  }
  return null;
};

describe('Configuración de Stripe · cobro', () => {
  it('sin ninguna variable: no configurado (null)', () => {
    expect(loadStripeConfig({})).toBeNull();
    expect(loadStripeConfig({ STRIPE_ENV: '', STRIPE_SECRET_KEY: '  ' })).toBeNull();
  });

  it('modo de prueba con clave secreta o restringida de prueba', () => {
    expect(loadStripeConfig({ STRIPE_ENV: 'test', STRIPE_SECRET_KEY: TEST_KEY })).toEqual({ environment: 'test', secretKey: TEST_KEY });
    expect(loadStripeConfig({ STRIPE_ENV: 'test', STRIPE_SECRET_KEY: RESTRICTED_TEST_KEY, STRIPE_ALLOW_LIVE: 'false' })).toEqual({ environment: 'test', secretKey: RESTRICTED_TEST_KEY });
  });

  it.each([
    ['clave sin modo', { STRIPE_SECRET_KEY: TEST_KEY }, /falta STRIPE_ENV/],
    ['modo sin clave', { STRIPE_ENV: 'test' }, /falta STRIPE_SECRET_KEY/],
    ['modo desconocido', { STRIPE_ENV: 'sandbox', STRIPE_SECRET_KEY: TEST_KEY }, /test o live/],
    ['solo STRIPE_ALLOW_LIVE', { STRIPE_ALLOW_LIVE: 'true' }, /falta STRIPE_ENV/],
    ['clave con espacios', { STRIPE_ENV: 'test', STRIPE_SECRET_KEY: `${TEST_KEY} x` }, /espacios/],
    ['clave publicable en lugar de la secreta', { STRIPE_ENV: 'test', STRIPE_SECRET_KEY: PUBLISHABLE_KEY }, /publicable/],
    ['clave sin formato de Stripe', { STRIPE_ENV: 'test', STRIPE_SECRET_KEY: 'TEST-1111111111111111-111111' }, /formato/],
    ['clave REAL con STRIPE_ENV=test', { STRIPE_ENV: 'test', STRIPE_SECRET_KEY: LIVE_KEY }, /no es una clave del modo test/],
    ['clave de prueba con STRIPE_ENV=live', { STRIPE_ENV: 'live', STRIPE_SECRET_KEY: TEST_KEY, STRIPE_ALLOW_LIVE: 'true' }, /no es una clave del modo live/],
    ['STRIPE_ALLOW_LIVE con otro valor', { STRIPE_ENV: 'test', STRIPE_SECRET_KEY: TEST_KEY, STRIPE_ALLOW_LIVE: 'True' }, /true o false/],
    ['STRIPE_ALLOW_LIVE=true en modo de prueba', { STRIPE_ENV: 'test', STRIPE_SECRET_KEY: TEST_KEY, STRIPE_ALLOW_LIVE: 'true' }, /no es compatible con test/],
    ['modo real sin permiso explícito', { STRIPE_ENV: 'live', STRIPE_SECRET_KEY: LIVE_KEY, NODE_ENV: 'production' }, /requiere STRIPE_ALLOW_LIVE=true/],
    ['modo real con NODE_ENV=test', { STRIPE_ENV: 'live', STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_ALLOW_LIVE: 'true', NODE_ENV: 'test' }, /NODE_ENV=test/],
  ])('rechaza %s', (_name, env, message) => {
    const e = error(() => loadStripeConfig(env as NodeJS.ProcessEnv));
    expect(e).toBeInstanceOf(StripeConfigError);
    expect(e!.message).toMatch(message);
    // Ningún mensaje contiene una clave ni parte de ella.
    expect(e!.message).not.toMatch(/sintetica|1111111111|2222222222|3333333333/);
  });

  it('el modo real solo se admite con permiso explícito y fuera de las pruebas', () => {
    expect(loadStripeConfig({ STRIPE_ENV: 'live', STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_ALLOW_LIVE: 'true', NODE_ENV: 'production' })).toEqual({ environment: 'live', secretKey: LIVE_KEY });
  });

  it('las descripciones para registros no contienen la clave', () => {
    expect(describeStripeConfig({ environment: 'test', secretKey: TEST_KEY })).toBe('Stripe configurado (test)');
    expect(describeStripeConfig(null)).toMatch(/no configurado/);
  });
});

describe('Configuración de Stripe · webhooks', () => {
  it('sin secreto de firma: null (todo webhook se rechazará)', () => {
    expect(loadStripeWebhookConfig({})).toBeNull();
    // Una tolerancia sin secreto (el valor del ejemplo de entorno) no es un error: sigue sin configurar.
    expect(loadStripeWebhookConfig({ STRIPE_WEBHOOK_TOLERANCE_SECONDS: '300' })).toBeNull();
    expect(describeStripeWebhookConfig(null)).toMatch(/sin secreto de firma/);
  });

  it('con secreto: tolerancia de 300 s por defecto y el modo esperado de STRIPE_ENV', () => {
    expect(loadStripeWebhookConfig({ STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET })).toEqual({ secret: WEBHOOK_SECRET, toleranceMs: 300_000, environment: null });
    expect(loadStripeWebhookConfig({ STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_WEBHOOK_TOLERANCE_SECONDS: '60', STRIPE_ENV: 'test' }))
      .toEqual({ secret: WEBHOOK_SECRET, toleranceMs: 60_000, environment: 'test' });
    expect(describeStripeWebhookConfig({ secret: WEBHOOK_SECRET, toleranceMs: 300_000, environment: 'test' })).not.toContain(WEBHOOK_SECRET);
  });

  it.each([
    ['secreto sin el prefijo whsec_', { STRIPE_WEBHOOK_SECRET: 'clave-secreta-cualquiera-5555' }, /whsec_/],
    ['la clave secreta de la API como secreto de firma', { STRIPE_WEBHOOK_SECRET: TEST_KEY }, /whsec_/],
    ['secreto con espacios', { STRIPE_WEBHOOK_SECRET: `${WEBHOOK_SECRET} x` }, /espacios/],
    ['tolerancia no numérica', { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_WEBHOOK_TOLERANCE_SECONDS: 'cinco' }, /entero positivo/],
    ['tolerancia cero', { STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_WEBHOOK_TOLERANCE_SECONDS: '0' }, /entero positivo/],
  ])('rechaza %s', (_name, env, message) => {
    const e = error(() => loadStripeWebhookConfig(env as NodeJS.ProcessEnv));
    expect(e).toBeInstanceOf(StripeConfigError);
    expect(e!.message).toMatch(message);
    expect(e!.message).not.toMatch(/sintetic|4444444444|5555/);
  });
});
