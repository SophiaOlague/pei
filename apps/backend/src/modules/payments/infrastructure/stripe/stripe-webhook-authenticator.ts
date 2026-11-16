import { createHmac, timingSafeEqual } from 'crypto';
import {
  WebhookAuthenticationError,
  type AuthenticatedWebhookNotification,
  type ProviderWebhookAuthenticator,
  type RawWebhookRequest,
} from '../../application/ports/provider-webhook.port';
import type { StripeEnvironment } from './stripe.config';

// Autenticación de los webhooks de Stripe (PAY-15). Es el único lugar que conoce su formato.
//
// Firma (cabecera Stripe-Signature = "t=<segundos>,v1=<hmac>[,v1=<hmac>…]"): HMAC-SHA256, en hexadecimal, con el secreto
// del endpoint (whsec_…) sobre
//     <t>.<cuerpo original, byte a byte>
// La firma SÍ cubre el cuerpo, así que se verifica sobre los bytes recibidos (rawBody) y el evento se interpreta a
// partir de ESOS MISMOS bytes, nunca del cuerpo ya procesado por otro middleware. Puede haber varias v1 (rotación del
// secreto): basta con que una coincida. La marca de tiempo se comprueba siempre (tolerancia configurable, 300 s por
// defecto) para rechazar repeticiones de una notificación capturada.
//
// Aun con la firma válida, el evento solo AVISA: el estado del pago se consulta siempre en la API con el id del
// PaymentIntent. De cada evento se conservan únicamente el id del evento, su tipo y el PaymentIntent al que se refiere.
//
// Correspondencia con provider_webhook_event (0017), cuya clave única es (provider, topic, data_id, request_id):
//   topic       'payment' para los tipos que afectan a un PaymentIntent (lista abajo); para el resto, el tipo del
//               evento (se registra como ignorado)
//   action      el tipo del evento de Stripe (p. ej. payment_intent.succeeded)
//   data_id     el id del PaymentIntent (pi_…), tomado del objeto del evento o de su campo payment_intent
//   request_id  el id del evento (evt_…): una reentrega del mismo evento choca con la clave única y no se procesa dos veces

export const STRIPE_PAYMENT_TOPIC = 'payment';

// Eventos necesarios para el flujo de PaymentIntents con tarjeta. Todos llevan a la misma acción: volver a consultar el
// PaymentIntent. El objeto del evento es el PaymentIntent o un cargo, reembolso o disputa con su campo payment_intent.
export const STRIPE_PAYMENT_EVENT_TYPES: ReadonlySet<string> = new Set([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.processing',
  'payment_intent.requires_action',
  'payment_intent.canceled',
  'charge.refunded',
  'charge.refund.updated',
  'refund.updated',
  'refund.failed',
  'charge.dispute.created',
  'charge.dispute.closed',
]);

export interface StripeWebhookAuthenticatorConfig {
  secret: string;
  toleranceMs: number;
  // Modo esperado de los eventos; null: no se comprueba.
  environment?: StripeEnvironment | null;
  now?: () => Date;
}

const TIMESTAMP = /^\d{1,12}$/;
const V1 = /^[0-9a-f]{64}$/;
const EVENT_ID = /^evt_[A-Za-z0-9_]{6,250}$/;
const EVENT_TYPE = /^[a-z][a-z0-9_.]{0,99}$/;
const OBJECT_ID = /^[A-Za-z0-9_]{3,255}$/;
const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9_]{6,250}$/;
// Stripe limita sus eventos muy por debajo de esto; un cuerpo mayor no es un evento legítimo.
const MAX_BODY_BYTES = 512 * 1024;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function parseStripeSignatureHeader(value: string): { timestamp: string; signatures: string[] } {
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of value.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (key === 't') timestamp = v;
    // v0 (firmas de prueba) y cualquier otro esquema se ignoran.
    else if (key === 'v1' && V1.test(v.toLowerCase())) signatures.push(v.toLowerCase());
  }
  if (!timestamp || !TIMESTAMP.test(timestamp) || signatures.length === 0) throw new WebhookAuthenticationError('malformed_signature');
  return { timestamp, signatures };
}

export function computeStripeSignature(secret: string, timestamp: string, rawBody: Buffer): string {
  return createHmac('sha256', secret).update(`${timestamp}.`, 'utf8').update(rawBody).digest('hex');
}

const header = (headers: RawWebhookRequest['headers'], name: string): string | undefined => {
  const raw = headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

// PaymentIntent al que se refiere el objeto del evento, o undefined.
function paymentIntentOf(object: Record<string, unknown>): string | undefined {
  const candidate = object.object === 'payment_intent' ? object.id : object.payment_intent;
  return typeof candidate === 'string' && PAYMENT_INTENT_ID.test(candidate) ? candidate : undefined;
}

export class StripeWebhookAuthenticator implements ProviderWebhookAuthenticator {
  readonly provider = 'stripe' as const;
  private readonly secret: string;
  private readonly toleranceMs: number;
  private readonly environment: StripeEnvironment | null;
  private readonly now: () => Date;

  constructor(config: StripeWebhookAuthenticatorConfig) {
    if (!config.secret?.trim()) throw new Error('Stripe: falta el secreto de firma de webhooks');
    if (!Number.isFinite(config.toleranceMs) || config.toleranceMs <= 0) throw new Error('Stripe: tolerancia de webhooks inválida');
    this.secret = config.secret;
    this.toleranceMs = config.toleranceMs;
    this.environment = config.environment ?? null;
    this.now = config.now ?? (() => new Date());
  }

  authenticate(request: RawWebhookRequest): AuthenticatedWebhookNotification {
    const signature = header(request.headers, 'stripe-signature');
    if (!signature) throw new WebhookAuthenticationError('missing_signature');
    const { timestamp, signatures } = parseStripeSignatureHeader(signature);

    const raw = request.rawBody;
    if (!Buffer.isBuffer(raw) || raw.length === 0 || raw.length > MAX_BODY_BYTES) throw new WebhookAuthenticationError('missing_raw_body');

    const expected = Buffer.from(computeStripeSignature(this.secret, timestamp, raw), 'hex');
    // Se comparan todas (sin salir en la primera coincidencia) para no filtrar por tiempo cuál coincide.
    let valid = false;
    for (const candidate of signatures) {
      const received = Buffer.from(candidate, 'hex');
      if (received.length === expected.length && timingSafeEqual(received, expected)) valid = true;
    }
    if (!valid) throw new WebhookAuthenticationError('invalid_signature');
    if (Math.abs(this.now().getTime() - Number(timestamp) * 1000) > this.toleranceMs) throw new WebhookAuthenticationError('stale_timestamp');

    // A partir de aquí el contenido está autenticado: se interpreta de los mismos bytes firmados.
    let event: unknown;
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new WebhookAuthenticationError('malformed_payload');
    }
    if (!isObject(event) || event.object !== 'event') throw new WebhookAuthenticationError('malformed_payload');
    if (typeof event.id !== 'string' || !EVENT_ID.test(event.id)) throw new WebhookAuthenticationError('missing_request_id');
    if (typeof event.type !== 'string' || !EVENT_TYPE.test(event.type)) throw new WebhookAuthenticationError('missing_topic');
    if (typeof event.livemode !== 'boolean') throw new WebhookAuthenticationError('malformed_payload');
    if (this.environment !== null && event.livemode !== (this.environment === 'live')) throw new WebhookAuthenticationError('environment_mismatch');

    const object = isObject(event.data) && isObject(event.data.object) ? event.data.object : null;
    const objectId = object && typeof object.id === 'string' && OBJECT_ID.test(object.id) ? object.id : undefined;
    const objectType = object && typeof object.object === 'string' && /^[a-z_.]{1,64}$/.test(object.object) ? object.object : undefined;
    const paymentIntent = object ? paymentIntentOf(object) : undefined;
    const supported = STRIPE_PAYMENT_EVENT_TYPES.has(event.type) && paymentIntent !== undefined;

    // Solo campos permitidos y acotados (auditoría). Los datos del pago se consultan a la API; no se copian del evento.
    const payload: Record<string, unknown> = { id: event.id, type: event.type, livemode: event.livemode };
    if (typeof event.created === 'number' && Number.isSafeInteger(event.created)) payload.created = event.created;
    if (typeof event.api_version === 'string' && event.api_version.length <= 32) payload.api_version = event.api_version;
    payload.data = { object: { ...(objectId ? { id: objectId } : {}), ...(objectType ? { object: objectType } : {}), ...(paymentIntent ? { payment_intent: paymentIntent } : {}) } };

    return {
      provider: this.provider,
      // Un tipo que no se procesa se registra con su propio tipo como tema: queda `ignored`.
      topic: supported ? STRIPE_PAYMENT_TOPIC : event.type,
      action: event.type,
      dataId: paymentIntent ?? objectId ?? event.id,
      requestId: event.id,
      payload,
    };
  }
}

// Sin secreto de firma configurado se rechaza todo webhook (falla cerrada).
export class UnconfiguredStripeWebhookAuthenticator implements ProviderWebhookAuthenticator {
  readonly provider = 'stripe' as const;

  authenticate(): AuthenticatedWebhookNotification {
    throw new WebhookAuthenticationError('not_configured');
  }
}
