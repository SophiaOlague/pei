// Configuración de Stripe (proveedor activo de ambos checkouts; Payments-decisiones.md §8). Se lee del entorno del
// proceso, igual que Mercado Pago, R2 y Resend (loadXConfig(env)). Ningún mensaje incluye una clave ni parte de ella.
//
// Variables (solo backend; nunca versionadas):
//   STRIPE_ENV                         test | live (obligatoria si hay clave secreta)
//   STRIPE_SECRET_KEY                  clave secreta o restringida del modo elegido (sk_test_… / rk_test_… en test)
//   STRIPE_ALLOW_LIVE                  solo "true" permite live (PAY-23: el periodo académico es solo modo de prueba)
//   STRIPE_WEBHOOK_SECRET              secreto de firma del endpoint de webhooks (whsec_…). Sin él, todo webhook se
//                                      rechaza (falla cerrada)
//   STRIPE_WEBHOOK_TOLERANCE_SECONDS   antigüedad máxima de la marca de tiempo firmada (entero > 0). Vacía: 300 s, el
//                                      valor que recomienda Stripe
//
// A diferencia de Mercado Pago, en Stripe el prefijo de la clave SÍ distingue el modo: una clave sk_live_ con
// STRIPE_ENV=test (o al revés) detiene el arranque. live solo con STRIPE_ALLOW_LIVE=true y NODE_ENV distinto de test.
// Sin ninguna variable de cobro, el módulo arranca sin proveedor (todo cobro falla de forma cerrada). La clave
// publicable (pk_test_…) es del frontend y no se configura aquí.

export type StripeEnvironment = 'test' | 'live';

export interface StripeSettings {
  environment: StripeEnvironment;
  secretKey: string;
}

export interface StripeWebhookSettings {
  secret: string;
  toleranceMs: number;
  // Modo esperado de los eventos (event.livemode), si el cobro está configurado; null: no se comprueba.
  environment: StripeEnvironment | null;
}

export const STRIPE_ENV_KEYS = ['STRIPE_ENV', 'STRIPE_SECRET_KEY', 'STRIPE_ALLOW_LIVE'] as const;
export const STRIPE_WEBHOOK_ENV_KEYS = ['STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_TOLERANCE_SECONDS'] as const;
export const STRIPE_WEBHOOK_DEFAULT_TOLERANCE_SECONDS = 300;

const SECRET_KEY_FORMAT = /^(sk|rk)_(test|live)_[A-Za-z0-9]{8,}$/;
const WEBHOOK_SECRET_FORMAT = /^whsec_[A-Za-z0-9+/=_-]{8,}$/;

export class StripeConfigError extends Error {
  constructor(reason: string) {
    super(`Configuración de Stripe inválida: ${reason}`);
    this.name = 'StripeConfigError';
  }
}

// null: Stripe no está configurado. Lanza StripeConfigError ante una configuración parcial o insegura.
export function loadStripeConfig(env: NodeJS.ProcessEnv = process.env): StripeSettings | null {
  const environment = (env.STRIPE_ENV ?? '').trim();
  const secretKey = (env.STRIPE_SECRET_KEY ?? '').trim();
  const allowLive = (env.STRIPE_ALLOW_LIVE ?? '').trim();

  if (!environment && !secretKey && !allowLive) return null;
  if (!environment) throw new StripeConfigError('falta STRIPE_ENV (test o live)');
  if (environment !== 'test' && environment !== 'live') throw new StripeConfigError('STRIPE_ENV debe ser test o live');
  if (!secretKey) throw new StripeConfigError('falta STRIPE_SECRET_KEY');
  if (/\s/.test(secretKey)) throw new StripeConfigError('STRIPE_SECRET_KEY contiene espacios');
  if (secretKey.startsWith('pk_')) throw new StripeConfigError('STRIPE_SECRET_KEY es una clave publicable (pk_); se requiere la secreta');
  const format = SECRET_KEY_FORMAT.exec(secretKey);
  if (!format) throw new StripeConfigError('STRIPE_SECRET_KEY no tiene el formato de una clave secreta de Stripe');
  if (allowLive !== '' && allowLive !== 'true' && allowLive !== 'false') throw new StripeConfigError('STRIPE_ALLOW_LIVE solo admite true o false');
  if (format[2] !== environment) throw new StripeConfigError(`STRIPE_SECRET_KEY no es una clave del modo ${environment}`);

  if (environment === 'test') {
    if (allowLive === 'true') throw new StripeConfigError('STRIPE_ALLOW_LIVE=true no es compatible con test');
    return { environment, secretKey };
  }
  if (env.NODE_ENV === 'test') throw new StripeConfigError('live no se admite con NODE_ENV=test');
  if (allowLive !== 'true') throw new StripeConfigError('live requiere STRIPE_ALLOW_LIVE=true');
  return { environment, secretKey };
}

// null: sin secreto de firma (todo webhook se rechaza). El modo esperado sale de STRIPE_ENV, si es válido.
export function loadStripeWebhookConfig(env: NodeJS.ProcessEnv = process.env): StripeWebhookSettings | null {
  const secret = (env.STRIPE_WEBHOOK_SECRET ?? '').trim();
  const tolerance = (env.STRIPE_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  // Sin secreto no hay nada que configurar: una tolerancia suelta (p. ej. el valor del ejemplo) no impide el arranque.
  if (!secret) return null;
  if (/\s/.test(secret)) throw new StripeConfigError('STRIPE_WEBHOOK_SECRET contiene espacios');
  if (!WEBHOOK_SECRET_FORMAT.test(secret)) throw new StripeConfigError('STRIPE_WEBHOOK_SECRET no tiene el formato de un secreto de firma (whsec_)');
  if (tolerance && !/^[1-9]\d{0,5}$/.test(tolerance)) throw new StripeConfigError('STRIPE_WEBHOOK_TOLERANCE_SECONDS debe ser un entero positivo');
  const environment = (env.STRIPE_ENV ?? '').trim();
  return {
    secret,
    toleranceMs: (tolerance ? Number(tolerance) : STRIPE_WEBHOOK_DEFAULT_TOLERANCE_SECONDS) * 1000,
    environment: environment === 'test' || environment === 'live' ? environment : null,
  };
}

// Descripciones para registros: nunca incluyen una clave ni parte de ella.
export const describeStripeConfig = (s: StripeSettings | null): string =>
  s ? `Stripe configurado (${s.environment})` : 'Stripe no configurado: los cobros fallarán hasta configurarlo';

export const describeStripeWebhookConfig = (s: StripeWebhookSettings | null): string =>
  s ? `Webhooks de Stripe configurados (tolerancia: ${s.toleranceMs / 1000} s)` : 'Webhooks de Stripe sin secreto de firma: se rechazarán todos';
