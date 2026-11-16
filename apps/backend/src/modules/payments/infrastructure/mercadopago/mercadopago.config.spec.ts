import { describeMercadoPagoConfig, loadMercadoPagoConfig, MercadoPagoConfigError } from './mercadopago.config';

// Configuración de Mercado Pago: separación sandbox/producción y ausencia de secretos. Tokens sintéticos.
const SANDBOX_TOKEN = 'TEST-1111111111111111-111111-sintetico';
const PROD_TOKEN = 'APP_USR-2222222222222222-222222-sintetico';

const error = (env: NodeJS.ProcessEnv) => {
  try {
    loadMercadoPagoConfig(env);
  } catch (e) {
    return e as Error;
  }
  return null;
};

describe('Configuración de Mercado Pago', () => {
  it('sin ninguna variable: no configurado (null)', () => {
    expect(loadMercadoPagoConfig({})).toBeNull();
    expect(loadMercadoPagoConfig({ MERCADO_PAGO_ENV: '', MERCADO_PAGO_ACCESS_TOKEN: '  ' })).toBeNull();
  });

  it('sandbox con token de prueba', () => {
    expect(loadMercadoPagoConfig({ MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: SANDBOX_TOKEN })).toEqual({ environment: 'sandbox', accessToken: SANDBOX_TOKEN });
  });

  it.each([
    ['token sin entorno', { MERCADO_PAGO_ACCESS_TOKEN: SANDBOX_TOKEN }, /falta MERCADO_PAGO_ENV/],
    ['entorno sin token', { MERCADO_PAGO_ENV: 'sandbox' }, /falta MERCADO_PAGO_ACCESS_TOKEN/],
    ['entorno desconocido', { MERCADO_PAGO_ENV: 'staging', MERCADO_PAGO_ACCESS_TOKEN: SANDBOX_TOKEN }, /sandbox o production/],
    ['solo ALLOW_PRODUCTION', { MERCADO_PAGO_ALLOW_PRODUCTION: 'true' }, /falta MERCADO_PAGO_ENV/],
    ['token con espacios', { MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: 'TEST-a b' }, /espacios/],
    ['ALLOW_PRODUCTION inválido', { MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: SANDBOX_TOKEN, MERCADO_PAGO_ALLOW_PRODUCTION: 'si' }, /true o false/],
  ])('configuración incompleta o inválida: %s', (_n, env, message) => {
    const e = error(env);
    expect(e).toBeInstanceOf(MercadoPagoConfigError);
    expect(e!.message).toMatch(message);
  });

  it('sandbox acepta tokens APP_USR- (los de prueba en México también lo usan) y TEST-; el prefijo no decide el entorno', () => {
    expect(loadMercadoPagoConfig({ MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: PROD_TOKEN })).toEqual({ environment: 'sandbox', accessToken: PROD_TOKEN });
    expect(loadMercadoPagoConfig({ MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: SANDBOX_TOKEN })).toEqual({ environment: 'sandbox', accessToken: SANDBOX_TOKEN });
  });

  it('rechaza un token sin el formato de Mercado Pago', () => {
    expect(error({ MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: 'otro-token' })!.message).toMatch(/formato de un access token/);
  });

  it('sandbox rechaza ALLOW_PRODUCTION=true', () => {
    expect(error({ MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: SANDBOX_TOKEN, MERCADO_PAGO_ALLOW_PRODUCTION: 'true' })!.message).toMatch(/no es compatible con sandbox/);
  });

  it('production exige permiso explícito y nunca NODE_ENV=test', () => {
    expect(error({ MERCADO_PAGO_ENV: 'production', MERCADO_PAGO_ACCESS_TOKEN: PROD_TOKEN, NODE_ENV: 'development' })!.message).toMatch(/requiere MERCADO_PAGO_ALLOW_PRODUCTION=true/);
    expect(error({ MERCADO_PAGO_ENV: 'production', MERCADO_PAGO_ACCESS_TOKEN: PROD_TOKEN, MERCADO_PAGO_ALLOW_PRODUCTION: 'true', NODE_ENV: 'test' })!.message).toMatch(/NODE_ENV=test/);
    // Producción tampoco se decide por el prefijo: solo por MERCADO_PAGO_ENV=production con permiso explícito.
    expect(loadMercadoPagoConfig({ MERCADO_PAGO_ENV: 'production', MERCADO_PAGO_ACCESS_TOKEN: SANDBOX_TOKEN, MERCADO_PAGO_ALLOW_PRODUCTION: 'true', NODE_ENV: 'production' })?.environment).toBe('production');
    expect(loadMercadoPagoConfig({ MERCADO_PAGO_ENV: 'production', MERCADO_PAGO_ACCESS_TOKEN: PROD_TOKEN, MERCADO_PAGO_ALLOW_PRODUCTION: 'true', NODE_ENV: 'production' }))
      .toEqual({ environment: 'production', accessToken: PROD_TOKEN });
  });

  it('el proceso de pruebas actual no puede cargar una credencial de producción', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(error({ ...process.env, MERCADO_PAGO_ENV: 'production', MERCADO_PAGO_ACCESS_TOKEN: PROD_TOKEN, MERCADO_PAGO_ALLOW_PRODUCTION: 'true' })).toBeInstanceOf(MercadoPagoConfigError);
  });

  it('ningún mensaje de error ni descripción incluye el token', () => {
    const cases: NodeJS.ProcessEnv[] = [
      { MERCADO_PAGO_ENV: 'production', MERCADO_PAGO_ACCESS_TOKEN: PROD_TOKEN, NODE_ENV: 'development' },
      { MERCADO_PAGO_ENV: 'production', MERCADO_PAGO_ACCESS_TOKEN: SANDBOX_TOKEN, MERCADO_PAGO_ALLOW_PRODUCTION: 'true', NODE_ENV: 'test' },
      { MERCADO_PAGO_ENV: 'otra', MERCADO_PAGO_ACCESS_TOKEN: SANDBOX_TOKEN },
      { MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: `${SANDBOX_TOKEN} x` },
    ];
    for (const env of cases) {
      const e = error(env)!;
      expect(e.message).not.toContain(SANDBOX_TOKEN);
      expect(e.message).not.toContain(PROD_TOKEN);
      expect(e.message).not.toMatch(/1111111111|2222222222/);
    }
    const settings = loadMercadoPagoConfig({ MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: SANDBOX_TOKEN });
    expect(describeMercadoPagoConfig(settings)).toBe('Mercado Pago configurado (sandbox)');
    expect(describeMercadoPagoConfig(null)).toMatch(/no configurado/);
  });
});
