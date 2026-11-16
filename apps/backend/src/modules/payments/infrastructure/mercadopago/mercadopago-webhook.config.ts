// Configuración de los webhooks de Mercado Pago (F3.3). Separada de mercadopago.config.ts: el cobro y la recepción de
// notificaciones se configuran por separado y ninguna ausencia impide el arranque.
//
// Variables:
//   MERCADO_PAGO_WEBHOOK_SECRET             clave secreta de la aplicación para validar x-signature (solo backend;
//                                           nunca versionada). Sin ella, todo webhook se rechaza (falla cerrada).
//   MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS  antigüedad máxima de `ts` (entero > 0). Vacía: no se comprueba.
// Ningún mensaje incluye la clave.

export interface MercadoPagoWebhookSettings {
  secret: string;
  toleranceMs: number | null;
}

export class MercadoPagoWebhookConfigError extends Error {
  constructor(reason: string) {
    super(`Configuración de webhooks de Mercado Pago inválida: ${reason}`);
    this.name = 'MercadoPagoWebhookConfigError';
  }
}

export function loadMercadoPagoWebhookConfig(env: NodeJS.ProcessEnv = process.env): MercadoPagoWebhookSettings | null {
  const secret = (env.MERCADO_PAGO_WEBHOOK_SECRET ?? '').trim();
  const tolerance = (env.MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS ?? '').trim();
  if (!secret) {
    if (tolerance) throw new MercadoPagoWebhookConfigError('MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS sin MERCADO_PAGO_WEBHOOK_SECRET');
    return null;
  }
  if (/\s/.test(secret)) throw new MercadoPagoWebhookConfigError('MERCADO_PAGO_WEBHOOK_SECRET contiene espacios');
  if (secret.length < 16) throw new MercadoPagoWebhookConfigError('MERCADO_PAGO_WEBHOOK_SECRET es demasiado corta');
  if (tolerance && !/^[1-9]\d{0,5}$/.test(tolerance)) {
    throw new MercadoPagoWebhookConfigError('MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS debe ser un entero positivo');
  }
  return { secret, toleranceMs: tolerance ? Number(tolerance) * 1000 : null };
}

export const describeMercadoPagoWebhookConfig = (s: MercadoPagoWebhookSettings | null): string =>
  s
    ? `Webhooks de Mercado Pago configurados (tolerancia de ts: ${s.toleranceMs === null ? 'sin comprobar' : `${s.toleranceMs / 1000} s`})`
    : 'Webhooks de Mercado Pago sin clave secreta: se rechazarán todos';
