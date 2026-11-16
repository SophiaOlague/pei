import { Logger } from '@nestjs/common';
import { fromProviderNumber, money, toProviderNumber, ZERO, type Money } from '../../domain/money';
import type { PaymentRequest } from '../../domain/payment-request';
import type { PaymentStatus } from '../../domain/payment-status';
import { PaymentProviderError, type PaymentProviderPort, type ProviderPaymentSnapshot } from '../../application/ports/payment-provider.port';
import type { CreateProviderRefund, ProviderRefundSnapshot, RefundProviderPort } from '../../application/ports/refunds.port';

// Adaptador de Mercado Pago (API de pagos, /v1/payments). Sin SDK: HTTP con un `fetch` inyectado (en Node 24 es
// global). Es el ÚNICO archivo que conoce la API de Mercado Pago (prueba de arquitectura en payments-architecture.spec.ts).
//
// - El dinero entra a la cuenta de PEI (PAY-01): no hay cuentas vinculadas de médicos ni split (sin marketplace_fee,
//   sin application_fee y sin collector_id de terceros).
// - La tarjeta llega como token de Card Payment Brick; PEI nunca envía ni recibe PAN/CVV (PAY-12).
// - X-Idempotency-Key = payment.id (PAY-14); external_reference = payment.id.
// - La comisión real es la suma de fee_details pagados por el cobrador (PEI). Si el proveedor aún no la informa, null.

export const MERCADO_PAGO_API = 'https://api.mercadopago.com';

export interface MercadoPagoConfig {
  accessToken: string;
  fetch: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

// Estado original de Mercado Pago → estado interno. Un estado no listado es una respuesta inesperada: nunca se
// convierte de forma arbitraria.
export const MERCADO_PAGO_STATUS_MAP: Readonly<Record<string, PaymentStatus>> = Object.freeze({
  pending: 'pending',
  in_process: 'processing',
  authorized: 'processing',
  approved: 'succeeded',
  in_mediation: 'in_dispute',
  rejected: 'failed',
  cancelled: 'canceled',
  refunded: 'refunded',
  charged_back: 'charged_back',
});

export function mapMercadoPagoStatus(status: string, amount: Money, refunded: Money): PaymentStatus {
  const internal = MERCADO_PAGO_STATUS_MAP[status];
  if (!internal) throw new PaymentProviderError('unexpected_response', `estado de Mercado Pago desconocido: ${/^[a-z_]{1,32}$/.test(status) ? status : '(formato no válido)'}`);
  // Mercado Pago mantiene "approved" en un reembolso parcial: se distingue por transaction_amount_refunded.
  if (internal === 'succeeded' && refunded.cents > 0) return refunded.cents >= amount.cents ? 'refunded' : 'partially_refunded';
  return internal;
}

interface MercadoPagoFeeDetail { type?: unknown; amount?: unknown; fee_payer?: unknown }

export function collectorFee(feeDetails: unknown): Money | null {
  if (feeDetails === undefined || feeDetails === null) return null;
  if (!Array.isArray(feeDetails)) throw new PaymentProviderError('unexpected_response', 'fee_details no es una lista');
  if (feeDetails.length === 0) return null;
  let cents = 0;
  for (const raw of feeDetails as MercadoPagoFeeDetail[]) {
    if (typeof raw !== 'object' || raw === null) throw new PaymentProviderError('unexpected_response', 'fee_details con un elemento inválido');
    // Solo lo que paga el cobrador (PEI) es costo de PEI; lo que paga el comprador (p. ej. financiamiento) no lo es.
    if (raw.fee_payer !== 'collector') continue;
    cents += amountOrThrow(raw.amount, 'fee_details.amount').cents;
  }
  return fromCents(cents);
}

const fromCents = (cents: number): Money => money(cents);

function amountOrThrow(value: unknown, field: string): Money {
  try {
    return fromProviderNumber(value);
  } catch {
    throw new PaymentProviderError('unexpected_response', `importe inválido en ${field}`);
  }
}

function dateOrNull(value: unknown, field: string): Date | null {
  if (value === undefined || value === null) return null;
  const d = typeof value === 'string' ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) throw new PaymentProviderError('unexpected_response', `fecha inválida en ${field}`);
  return d;
}

// Respuesta de /v1/payments → snapshot normalizado. Valida el contrato mínimo; nunca copia el cuerpo a los errores.
export function normalizeMercadoPagoPayment(body: unknown): ProviderPaymentSnapshot {
  if (typeof body !== 'object' || body === null) throw new PaymentProviderError('unexpected_response', 'respuesta vacía o no JSON');
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'number' && typeof b.id !== 'string') throw new PaymentProviderError('unexpected_response', 'falta el id del pago');
  const id = String(b.id);
  if (!/^\d+$/.test(id)) throw new PaymentProviderError('unexpected_response', 'id de pago inválido');
  if (typeof b.status !== 'string' || !b.status) throw new PaymentProviderError('unexpected_response', 'falta el estado');
  if (b.currency_id !== 'MXN') throw new PaymentProviderError('unexpected_response', 'moneda distinta de MXN');
  if (typeof b.external_reference !== 'string' || !b.external_reference) throw new PaymentProviderError('unexpected_response', 'falta external_reference');
  const amount = amountOrThrow(b.transaction_amount, 'transaction_amount');
  const refunded = b.transaction_amount_refunded === undefined || b.transaction_amount_refunded === null
    ? ZERO
    : amountOrThrow(b.transaction_amount_refunded, 'transaction_amount_refunded');
  if (refunded.cents < 0 || refunded.cents > amount.cents) throw new PaymentProviderError('unexpected_response', 'importe reembolsado fuera de rango');
  const details = (b.transaction_details ?? null) as Record<string, unknown> | null;
  const net = details && details.net_received_amount !== undefined && details.net_received_amount !== null
    ? amountOrThrow(details.net_received_amount, 'transaction_details.net_received_amount')
    : null;
  const detail = typeof b.status_detail === 'string' && b.status_detail ? `/${b.status_detail}` : '';
  return {
    provider: 'mercado_pago',
    providerPaymentId: id,
    providerStatus: `${b.status}${detail}`,
    status: mapMercadoPagoStatus(b.status, amount, refunded),
    externalReference: b.external_reference,
    amount,
    refunded,
    providerFeeActual: collectorFee(b.fee_details),
    netReceived: net,
    moneyReleaseDate: dateOrNull(b.money_release_date, 'money_release_date'),
  };
}

// F5: reembolsos (/v1/payments/{id}/refunds). Estado original → estado del reembolso. Documentado: approved (ejemplo
// de la referencia) e in_process (con X-Render-In-Process-Refunds). pending/authorized/rejected/cancelled se tratan como
// supuestos a confirmar en sandbox; un estado no listado es una respuesta inesperada (nunca se marca succeeded).
export const MERCADO_PAGO_REFUND_STATUS_MAP: Readonly<Record<string, ProviderRefundSnapshot['status']>> = Object.freeze({
  approved: 'succeeded',
  in_process: 'processing',
  pending: 'processing',
  authorized: 'processing',
  rejected: 'failed',
  cancelled: 'failed',
});

const digitsId = (v: unknown, field: string): string => {
  if (typeof v !== 'number' && typeof v !== 'string') throw new PaymentProviderError('unexpected_response', `falta ${field}`);
  const id = String(v);
  if (!/^\d+$/.test(id)) throw new PaymentProviderError('unexpected_response', `${field} inválido`);
  return id;
};

// Respuesta de un reembolso → snapshot normalizado. Nunca copia el cuerpo a los errores.
export function normalizeMercadoPagoRefund(body: unknown): ProviderRefundSnapshot {
  if (typeof body !== 'object' || body === null) throw new PaymentProviderError('unexpected_response', 'respuesta vacía o no JSON');
  const b = body as Record<string, unknown>;
  const providerRefundId = digitsId(b.id, 'el id del reembolso');
  const providerPaymentId = digitsId(b.payment_id, 'el id del pago del reembolso');
  if (typeof b.status !== 'string' || !b.status) throw new PaymentProviderError('unexpected_response', 'falta el estado del reembolso');
  const status = MERCADO_PAGO_REFUND_STATUS_MAP[b.status];
  if (!status) throw new PaymentProviderError('unexpected_response', `estado de reembolso desconocido: ${/^[a-z_]{1,32}$/.test(b.status) ? b.status : '(formato no válido)'}`);
  const amount = amountOrThrow(b.amount, 'amount');
  if (amount.cents <= 0) throw new PaymentProviderError('unexpected_response', 'importe de reembolso no positivo');
  return { provider: 'mercado_pago', providerRefundId, providerPaymentId, providerStatus: b.status, status, amount };
}

export class MercadoPagoPaymentProvider implements PaymentProviderPort, RefundProviderPort {
  readonly name = 'mercado_pago' as const;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: MercadoPagoConfig) {
    if (!config.accessToken?.trim()) throw new Error('Mercado Pago: falta el access token');
    if (typeof config.fetch !== 'function') throw new Error('Mercado Pago: falta fetch');
    this.baseUrl = (config.baseUrl ?? MERCADO_PAGO_API).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async createPayment(request: PaymentRequest): Promise<ProviderPaymentSnapshot> {
    const body = {
      transaction_amount: toProviderNumber(request.split.gross),
      token: request.card.token,
      description: request.description,
      installments: request.card.installments,
      payment_method_id: request.card.paymentMethodId,
      ...(request.card.issuerId ? { issuer_id: request.card.issuerId } : {}),
      payer: { email: request.card.payerEmail },
      external_reference: request.paymentId,
    };
    const snapshot = normalizeMercadoPagoPayment(await this.call('POST', '/v1/payments', body, request.idempotencyKey, [request.card.token, request.card.payerEmail ?? '', request.idempotencyKey]));
    // La respuesta debe corresponder exactamente a la solicitud.
    if (snapshot.externalReference !== request.paymentId) throw new PaymentProviderError('unexpected_response', 'external_reference no corresponde al pago');
    if (snapshot.amount.cents !== request.split.gross.cents) throw new PaymentProviderError('unexpected_response', 'el importe del proveedor no coincide con el solicitado');
    return snapshot;
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPaymentSnapshot> {
    if (!/^\d+$/.test(providerPaymentId)) throw new PaymentProviderError('rejected_request', 'id de pago del proveedor inválido');
    const snapshot = normalizeMercadoPagoPayment(await this.call('GET', `/v1/payments/${providerPaymentId}`));
    if (snapshot.providerPaymentId !== providerPaymentId) throw new PaymentProviderError('unexpected_response', 'el proveedor devolvió otro pago');
    return snapshot;
  }

  // F5: crea el reembolso. Sin `amount` es total (así lo define la API); X-Idempotency-Key = refund.id (estable).
  // X-Render-In-Process-Refunds: un reembolso en proceso se devuelve como in_process en lugar de un error.
  // 409 (reembolso en curso) y 428 (saldo insuficiente) son transitorios: se reintenta con la misma clave.
  async createRefund(request: CreateProviderRefund): Promise<ProviderRefundSnapshot> {
    if (!/^\d+$/.test(request.providerPaymentId)) throw new PaymentProviderError('rejected_request', 'id de pago del proveedor inválido');
    if (!request.idempotencyKey?.trim()) throw new PaymentProviderError('rejected_request', 'falta la clave de idempotencia del reembolso');
    const body = request.amount ? { amount: toProviderNumber(request.amount) } : {};
    const snapshot = normalizeMercadoPagoRefund(
      await this.call('POST', `/v1/payments/${request.providerPaymentId}/refunds`, body, request.idempotencyKey, [request.idempotencyKey], {
        headers: { 'X-Render-In-Process-Refunds': 'true' },
        transient: [409, 428],
      }),
    );
    if (snapshot.providerPaymentId !== request.providerPaymentId) throw new PaymentProviderError('unexpected_response', 'el reembolso es de otro pago');
    if (request.amount && snapshot.amount.cents !== request.amount.cents) throw new PaymentProviderError('unexpected_response', 'el importe del reembolso no coincide con el solicitado');
    return snapshot;
  }

  async getRefund(providerPaymentId: string, providerRefundId: string): Promise<ProviderRefundSnapshot> {
    if (!/^\d+$/.test(providerPaymentId) || !/^\d+$/.test(providerRefundId)) throw new PaymentProviderError('rejected_request', 'id del proveedor inválido');
    const snapshot = normalizeMercadoPagoRefund(await this.call('GET', `/v1/payments/${providerPaymentId}/refunds/${providerRefundId}`));
    if (snapshot.providerRefundId !== providerRefundId || snapshot.providerPaymentId !== providerPaymentId) {
      throw new PaymentProviderError('unexpected_response', 'el proveedor devolvió otro reembolso');
    }
    return snapshot;
  }

  // `sensitive`: valores de ESTA solicitud que nunca deben aparecer en un registro (token del Brick, correo del pagador,
  // clave de idempotencia). El access token se añade siempre.
  // `options.transient`: códigos HTTP que, en ESTA operación, significan «reintentar más tarde» (unavailable).
  private async call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    idempotencyKey?: string,
    sensitive: readonly string[] = [],
    options: { headers?: Record<string, string>; transient?: readonly number[] } = {},
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.config.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
          ...options.headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') throw new PaymentProviderError('timeout', `Mercado Pago no respondió en ${this.timeoutMs} ms`);
      throw new PaymentProviderError('unavailable', 'no se pudo contactar a Mercado Pago');
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = undefined;
    }
    if (response.ok) {
      if (parsed === undefined) throw new PaymentProviderError('unexpected_response', 'respuesta no JSON', response.status);
      return parsed;
    }
    const code = providerErrorCode(parsed);
    const s = response.status;
    // TEMPORAL (diagnóstico sandbox, 2026-11-14): método, ruta sin ids, HTTP, códigos del proveedor y su mensaje
    // REDACTADO (describeProviderFailure). Nunca el cuerpo, el access token, el token del Brick, el importe, el pagador ni
    // la clave de idempotencia. Retirar tras el diagnóstico.
    providerLogger.warn(describeProviderFailure(method, path, s, parsed, [this.config.accessToken, ...sensitive]));
    if (s === 401 || s === 403) throw new PaymentProviderError('unauthorized', 'Mercado Pago rechazó las credenciales', s, code);
    if (s === 404) throw new PaymentProviderError('not_found', 'el pago no existe en Mercado Pago', s, code);
    if (s === 429 || s >= 500 || options.transient?.includes(s)) throw new PaymentProviderError('unavailable', `Mercado Pago no disponible (HTTP ${s})`, s, code);
    throw new PaymentProviderError('rejected_request', `Mercado Pago rechazó la solicitud (HTTP ${s})`, s, code);
  }
}

// TEMPORAL (diagnóstico): registrador del adaptador.
const providerLogger = new Logger('MercadoPagoProvider');

// Valores que parecen credenciales o identificadores sensibles aunque no se conozcan de antemano.
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /(?:TEST|APP_USR)-[A-Za-z0-9-]+/g, // access tokens y claves públicas de Mercado Pago
  /(?:tok|card|ctok)_[A-Za-z0-9_-]+/gi, // tokens de tarjeta con prefijo
  /[^\s@]+@[^\s@]+/g, // correos
  /[A-Za-z0-9_-]{24,}/g, // cadenas largas (tokens, hashes, claves)
  /\d{6,}/g, // números largos (tarjetas, documentos, ids)
];

// Texto del proveedor apto para un registro: quita los valores conocidos de la solicitud (coincidencia exacta, sin
// importar su longitud) y lo que parezca una credencial, un correo o un número largo; recorta a 120 caracteres.
export function redactProviderText(raw: string, sensitive: readonly string[]): string {
  let text = raw;
  for (const value of sensitive) {
    if (value && value.length >= 3) text = text.split(value).join('[redactado]');
  }
  for (const pattern of CREDENTIAL_PATTERNS) text = text.replace(pattern, '[redactado]');
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

const SAFE_CODE = /^[A-Za-z0-9_.-]{1,64}$/;
const safeCode = (v: unknown): string | undefined =>
  (typeof v === 'string' || typeof v === 'number') && SAFE_CODE.test(String(v)) ? String(v) : undefined;

function providerText(body: unknown, field: 'message' | 'cause', sensitive: readonly string[]): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as { message?: unknown; cause?: unknown };
  const raw = field === 'message' ? b.message : Array.isArray(b.cause) ? (b.cause[0] as { description?: unknown } | undefined)?.description : undefined;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  return redactProviderText(raw, sensitive);
}

// Línea de diagnóstico de una respuesta de error. Solo códigos con formato de código; el texto libre, redactado.
export function describeProviderFailure(method: string, path: string, status: number, body: unknown, sensitive: readonly string[]): string {
  const errorField = typeof body === 'object' && body !== null ? safeCode((body as { error?: unknown }).error) : undefined;
  return `Mercado Pago ${method} ${path.replace(/\/\d+(?=\/|$)/g, '/:id')} → HTTP ${status} · causa=${providerErrorCode(body) ?? '—'} · error=${errorField ?? '—'}` +
    ` · mensaje=${providerText(body, 'message', sensitive) ?? '—'} · descripción=${providerText(body, 'cause', sensitive) ?? '—'}`;
}

// Código de error del proveedor (texto corto), sin copiar el mensaje ni el cuerpo.
function providerErrorCode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as { error?: unknown; cause?: unknown };
  const cause = Array.isArray(b.cause) ? (b.cause[0] as { code?: unknown } | undefined)?.code : undefined;
  return safeCode(cause ?? b.error);
}
