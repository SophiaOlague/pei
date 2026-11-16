import { createHmac, timingSafeEqual } from 'crypto';
import {
  WebhookAuthenticationError,
  type AuthenticatedWebhookNotification,
  type ProviderWebhookAuthenticator,
  type RawWebhookRequest,
} from '../../application/ports/provider-webhook.port';

// Autenticación de los webhooks de Mercado Pago (F3.3, PAY-15). Es el único lugar que conoce su formato.
//
// Firma (cabecera x-signature = "ts=<ts>,v1=<hmac>"): HMAC-SHA256, en hexadecimal, con la clave secreta de la
// aplicación sobre el manifiesto
//     id:<data.id de la query, en minúsculas>;request-id:<cabecera x-request-id>;ts:<ts>;
// La firma NO cubre el cuerpo: por eso el data.id del cuerpo, si viene, debe ser el firmado, y del cuerpo solo se
// conservan campos permitidos y acotados para auditoría. El estado del pago nunca sale de aquí (se consulta la API).
//
// Las notificaciones IPN (query topic/id, sin x-signature) se rechazan: no están firmadas.
// La tolerancia de `ts` es opcional (null = sin comprobar) y está DESACTIVADA por defecto: la documentación no fija un
// valor y Mercado Pago reenvía a los 15 min y luego con plazos de horas o días; no hay evidencia de que el reenvío renueve
// `ts`. Activarla sin esa evidencia podría rechazar notificaciones legítimas. Repetir una notificación ya registrada no
// tiene efecto (clave única + consulta a la API).
// Desviación deliberada de la documentación: si falta data.id o x-request-id, la documentación indica omitirlos del
// manifiesto; aquí se rechaza la notificación, porque ambos forman la clave única del evento (provider_webhook_event).
// Revisado contra la documentación oficial el 2026-11-14; pendiente de confirmar con notificaciones reales de sandbox.

export interface MercadoPagoWebhookAuthenticatorConfig {
  secret: string;
  // Antigüedad máxima admitida de `ts` (ms); null o undefined: no se comprueba.
  toleranceMs?: number | null;
  now?: () => Date;
}

const DATA_ID = /^[A-Za-z0-9_-]{1,64}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;
const TOPIC = /^[a-z][a-z0-9_.]{0,63}$/;
const TS = /^\d{1,16}$/;
const V1 = /^[0-9a-f]{64}$/;

const header = (headers: RawWebhookRequest['headers'], name: string): string | undefined => {
  const raw = headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

export function parseSignatureHeader(value: string): { ts: string; v1: string } {
  const parts = new Map<string, string>();
  for (const part of value.split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    parts.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  const ts = parts.get('ts');
  const v1 = parts.get('v1')?.toLowerCase();
  if (!ts || !TS.test(ts) || !v1 || !V1.test(v1)) throw new WebhookAuthenticationError('malformed_signature');
  return { ts, v1 };
}

export const signatureManifest = (dataId: string, requestId: string, ts: string): string =>
  `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;

export function computeSignature(secret: string, manifest: string): string {
  return createHmac('sha256', secret).update(manifest, 'utf8').digest('hex');
}

// ts de Mercado Pago: en la documentación aparece en segundos y en la práctica también en milisegundos.
const tsToMs = (ts: string): number => (ts.length >= 13 ? Number(ts) : Number(ts) * 1000);

const shortString = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined);
const idLike = (v: unknown): string | undefined =>
  typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : typeof v === 'string' && DATA_ID.test(v) ? v : undefined;

// Del cuerpo solo se guardan estos campos (los datos del pago se consultan a la API, no se copian del webhook).
export function sanitizeWebhookPayload(body: unknown, dataId: string): Record<string, unknown> {
  const b = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { data: { id: dataId } };
  const id = idLike(b.id);
  if (id) out.id = id;
  for (const [field, max] of [['type', 64], ['action', 64], ['api_version', 16], ['date_created', 40]] as const) {
    const v = shortString(b[field], max);
    if (v !== undefined) out[field] = v;
  }
  if (typeof b.live_mode === 'boolean') out.live_mode = b.live_mode;
  return out;
}

export class MercadoPagoWebhookAuthenticator implements ProviderWebhookAuthenticator {
  readonly provider = 'mercado_pago' as const;
  private readonly secret: string;
  private readonly toleranceMs: number | null;
  private readonly now: () => Date;

  constructor(config: MercadoPagoWebhookAuthenticatorConfig) {
    if (!config.secret?.trim()) throw new Error('Mercado Pago: falta la clave secreta de webhooks');
    this.secret = config.secret;
    this.toleranceMs = config.toleranceMs ?? null;
    this.now = config.now ?? (() => new Date());
  }

  authenticate(request: RawWebhookRequest): AuthenticatedWebhookNotification {
    const signature = header(request.headers, 'x-signature');
    if (!signature) throw new WebhookAuthenticationError('missing_signature');
    const { ts, v1 } = parseSignatureHeader(signature);

    const requestId = header(request.headers, 'x-request-id');
    if (!requestId || !REQUEST_ID.test(requestId)) throw new WebhookAuthenticationError('missing_request_id');

    const query = new URL(request.url, 'http://localhost').searchParams;
    const dataId = query.get('data.id') ?? undefined;
    if (!dataId || !DATA_ID.test(dataId)) throw new WebhookAuthenticationError('missing_data_id');

    const expected = Buffer.from(computeSignature(this.secret, signatureManifest(dataId, requestId, ts)), 'hex');
    const received = Buffer.from(v1, 'hex');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new WebhookAuthenticationError('invalid_signature');

    if (this.toleranceMs !== null && Math.abs(this.now().getTime() - tsToMs(ts)) > this.toleranceMs) {
      throw new WebhookAuthenticationError('stale_timestamp');
    }

    const body = typeof request.body === 'object' && request.body !== null ? (request.body as Record<string, unknown>) : {};
    const bodyData = typeof body.data === 'object' && body.data !== null ? (body.data as Record<string, unknown>) : undefined;
    if (bodyData && bodyData.id !== undefined && idLike(bodyData.id) !== dataId) throw new WebhookAuthenticationError('data_id_mismatch');

    const topic = query.get('type') ?? (typeof body.type === 'string' ? body.type : undefined);
    if (!topic || !TOPIC.test(topic)) throw new WebhookAuthenticationError('missing_topic');
    const action = shortString(body.action, 64) ?? null;

    return { provider: this.provider, topic, action, dataId, requestId, payload: sanitizeWebhookPayload(request.body, dataId) };
  }
}

// Sin clave secreta configurada se rechaza todo webhook (falla cerrada).
export class UnconfiguredWebhookAuthenticator implements ProviderWebhookAuthenticator {
  readonly provider = 'mercado_pago' as const;

  authenticate(): AuthenticatedWebhookNotification {
    throw new WebhookAuthenticationError('not_configured');
  }
}
