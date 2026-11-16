// Configuración de Mercado Pago (F2). Se lee del entorno del proceso, igual que R2 y Resend (loadXConfig(env)); el
// ConfigModule global de Nest ya carga apps/backend/.env en process.env. Ningún mensaje incluye el token.
//
// Variables:
//   MERCADO_PAGO_ENV               sandbox | production (obligatoria si hay token)
//   MERCADO_PAGO_ACCESS_TOKEN      access token del entorno elegido (solo backend; nunca versionado)
//   MERCADO_PAGO_ALLOW_PRODUCTION  solo "true" permite production (PAY-23: el periodo académico es solo sandbox)
//
// El prefijo del token NO distingue prueba de producción: en Mercado Pago México los access tokens de prueba también
// empiezan por APP_USR-, igual que los de producción (y existen tokens TEST- en otros casos). Por eso aquí solo se
// valida el formato general (TEST- o APP_USR-); que el token sea de PRUEBA debe verificarse en el panel de Mercado
// Pago (Tus integraciones → la aplicación → Credenciales de prueba) antes de configurarlo como sandbox.
//
// Producción solo con MERCADO_PAGO_ALLOW_PRODUCTION=true y NODE_ENV distinto de test. Sin ninguna variable de Mercado
// Pago, el módulo arranca sin proveedor configurado (todo cobro falla de forma cerrada); con una configuración parcial o
// inconsistente, el arranque se detiene. La clave pública es del frontend y no se configura aquí.

export type MercadoPagoEnvironment = 'sandbox' | 'production';

export interface MercadoPagoSettings {
  environment: MercadoPagoEnvironment;
  accessToken: string;
}

export const MERCADO_PAGO_ENV_KEYS = ['MERCADO_PAGO_ENV', 'MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_ALLOW_PRODUCTION'] as const;

// Formato general de un access token de Mercado Pago. No indica el entorno.
const ACCESS_TOKEN_FORMAT = /^(TEST|APP_USR)-[A-Za-z0-9-]+$/;

export class MercadoPagoConfigError extends Error {
  constructor(reason: string) {
    super(`Configuración de Mercado Pago inválida: ${reason}`);
    this.name = 'MercadoPagoConfigError';
  }
}

// null: Mercado Pago no está configurado. Lanza MercadoPagoConfigError ante una configuración parcial o insegura.
export function loadMercadoPagoConfig(env: NodeJS.ProcessEnv = process.env): MercadoPagoSettings | null {
  const environment = (env.MERCADO_PAGO_ENV ?? '').trim();
  const accessToken = (env.MERCADO_PAGO_ACCESS_TOKEN ?? '').trim();
  const allowProduction = (env.MERCADO_PAGO_ALLOW_PRODUCTION ?? '').trim();

  if (!environment && !accessToken && !allowProduction) return null;
  if (!environment) throw new MercadoPagoConfigError('falta MERCADO_PAGO_ENV (sandbox o production)');
  if (environment !== 'sandbox' && environment !== 'production') throw new MercadoPagoConfigError('MERCADO_PAGO_ENV debe ser sandbox o production');
  if (!accessToken) throw new MercadoPagoConfigError('falta MERCADO_PAGO_ACCESS_TOKEN');
  if (/\s/.test(accessToken)) throw new MercadoPagoConfigError('MERCADO_PAGO_ACCESS_TOKEN contiene espacios');
  if (!ACCESS_TOKEN_FORMAT.test(accessToken)) throw new MercadoPagoConfigError('MERCADO_PAGO_ACCESS_TOKEN no tiene el formato de un access token de Mercado Pago');
  if (allowProduction !== '' && allowProduction !== 'true' && allowProduction !== 'false') {
    throw new MercadoPagoConfigError('MERCADO_PAGO_ALLOW_PRODUCTION solo admite true o false');
  }

  if (environment === 'sandbox') {
    if (allowProduction === 'true') throw new MercadoPagoConfigError('MERCADO_PAGO_ALLOW_PRODUCTION=true no es compatible con sandbox');
    return { environment, accessToken };
  }

  if (env.NODE_ENV === 'test') throw new MercadoPagoConfigError('production no se admite con NODE_ENV=test');
  if (allowProduction !== 'true') throw new MercadoPagoConfigError('production requiere MERCADO_PAGO_ALLOW_PRODUCTION=true');
  return { environment, accessToken };
}

// Descripción para registros: nunca incluye el token ni parte de él.
export const describeMercadoPagoConfig = (s: MercadoPagoSettings | null): string =>
  s ? `Mercado Pago configurado (${s.environment})` : 'Mercado Pago no configurado: los cobros fallarán hasta configurarlo';
