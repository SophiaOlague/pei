import { Logger } from '@nestjs/common';
import { money, ZERO, type Money } from '../../domain/money';
import type { PaymentRequest } from '../../domain/payment-request';
import type { PaymentStatus } from '../../domain/payment-status';
import { PaymentProviderError, type PaymentProviderPort, type ProviderNextAction, type ProviderPaymentSnapshot } from '../../application/ports/payment-provider.port';
import type { CreateProviderRefund, ProviderRefundSnapshot, RefundProviderPort } from '../../application/ports/refunds.port';
import type { StripeEnvironment } from './stripe.config';

// Adaptador de Stripe (PaymentIntents, /v1/payment_intents y /v1/refunds). Sin SDK: HTTP con un `fetch` inyectado, igual
// que el adaptador de Mercado Pago. Es el ÚNICO archivo que conoce la API de Stripe (payments-architecture.spec.ts).
//
// Por qué PaymentIntents con confirmación en el servidor y no Checkout Sessions (Payments-decisiones.md §8.4):
// el puerto existente es síncrono (createPayment devuelve el estado del cobro), el pago de PEI se crea ANTES de cobrar
// y su id es la clave de idempotencia, y la interfaz ya incrusta el formulario de tarjeta. Con un PaymentIntent
// confirmado en el servidor todo eso se conserva: el cliente solo entrega el id de un PaymentMethod (pm_…) creado por
// Stripe.js/Elements y PEI nunca ve PAN ni CVV (PAY-12). Checkout Sessions obligaría a un flujo por redirección sin
// resultado síncrono y a decidir el pago solo por webhook.
//
// - El dinero entra a la cuenta de PEI (PAY-01): sin Connect, sin application_fee_amount, sin transfer_data ni
//   on_behalf_of. La distribución (comisión fija de PEI y neto del médico) vive en `payment`, no en Stripe.
// - Idempotency-Key = payment.id (PAY-14); metadata.pei_payment_id = payment.id (la referencia externa).
// - Importes en la unidad mínima de la moneda: para MXN, centavos enteros, los mismos de Money.cents. No hay
//   conversión con decimales ni coma flotante.
// - La comisión real, el neto recibido y la fecha de disponibilidad salen del balance_transaction del cargo, solo si
//   está en MXN (una cuenta que liquida en otra moneda no da un dato comparable: queda null y se concilia aparte).
// - Un intento rechazado (requires_payment_method con last_payment_error) es terminal para PEI (failed). El intento se
//   cancela en Stripe para que no pueda volver a confirmarse con el client_secret; el reintento usa un pago nuevo.

export const STRIPE_API = 'https://api.stripe.com';
// Versión fija del contrato (latest_charge existe desde 2022-11-15). No depende de la versión por defecto de la cuenta.
export const STRIPE_API_VERSION = '2024-06-20';
export const STRIPE_CURRENCY = 'mxn';
export const STRIPE_PAYMENT_METADATA_KEY = 'pei_payment_id';
export const STRIPE_REFUND_METADATA_KEY = 'pei_refund_id';

export interface StripeProviderConfig {
  secretKey: string;
  fetch: typeof fetch;
  // Modo esperado de los objetos (livemode). Un objeto del otro modo es una respuesta inesperada.
  environment: StripeEnvironment;
  baseUrl?: string;
  timeoutMs?: number;
}

const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9_]{6,250}$/;
const PAYMENT_METHOD_ID = /^pm_[A-Za-z0-9_]{4,250}$/;
const REFUND_ID = /^[a-z]{2,6}_[A-Za-z0-9_]{6,250}$/;
const SAFE_CODE = /^[A-Za-z0-9_.-]{1,64}$/;
const safeCode = (v: unknown): string | undefined => (typeof v === 'string' && SAFE_CODE.test(v) ? v : undefined);
const unexpected = (reason: string): PaymentProviderError => new PaymentProviderError('unexpected_response', reason);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function centsOrThrow(value: unknown, field: string): Money {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw unexpected(`importe inválido en ${field}`);
  try {
    return money(value);
  } catch {
    throw unexpected(`importe fuera de rango en ${field}`);
  }
}

function assertMode(livemode: unknown, environment: StripeEnvironment): void {
  if (typeof livemode !== 'boolean') throw unexpected('falta livemode');
  if (livemode !== (environment === 'live')) throw unexpected(`objeto de Stripe de otro modo (se esperaba ${environment})`);
}

interface ChargeFacts { refunded: Money; disputed: boolean; fee: Money | null; net: Money | null; availableOn: Date | null; feeVerified: boolean }

// H-2/H-3: tipos de balance_transaction que corresponden al cobro de un cargo (charge en cargos directos; payment en
// algunos métodos de pago). Cualquier otro tipo no es la comisión del cobro.
export const STRIPE_CHARGE_BALANCE_TYPES: ReadonlySet<string> = new Set(['charge', 'payment']);

// latest_charge puede venir sin expandir (id), expandido (objeto) o nulo (aún no hay cargo).
function chargeFacts(latestCharge: unknown, expectedAmount: Money | null = null): ChargeFacts {
  const none: ChargeFacts = { refunded: ZERO, disputed: false, fee: null, net: null, availableOn: null, feeVerified: false };
  if (!isObject(latestCharge)) return none;
  const refunded = latestCharge.amount_refunded === undefined || latestCharge.amount_refunded === null
    ? ZERO
    : centsOrThrow(latestCharge.amount_refunded, 'latest_charge.amount_refunded');
  const bt = latestCharge.balance_transaction;
  let fee: Money | null = null;
  let net: Money | null = null;
  let availableOn: Date | null = null;
  // H-2/H-3: solo un balance_transaction VÁLIDO da la comisión real (bt.fee, IVA incluido, decisión del 2026-11-16):
  // objeto expandido, del cobro (tipo charge o payment), en MXN, con el mismo importe que el cargo y con
  // neto = importe − comisión. Si falta o algo no cuadra, comisión, neto y fecha quedan null (nunca se infieren ni se
  // estiman) y el pago NO se concilia; se volverá a consultar más tarde.
  if (isObject(bt) && bt.currency === STRIPE_CURRENCY) {
    // Un valor malformado es una respuesta inesperada (como antes); uno bien formado pero incoherente solo no concilia.
    const btFee = centsOrThrow(bt.fee, 'balance_transaction.fee');
    const btNet = centsOrThrow(bt.net, 'balance_transaction.net');
    const btAmount = bt.amount === undefined || bt.amount === null ? null : centsOrThrow(bt.amount, 'balance_transaction.amount');
    const valid = expectedAmount !== null && btAmount !== null
      && (bt.object === undefined || bt.object === 'balance_transaction')
      && typeof bt.type === 'string' && STRIPE_CHARGE_BALANCE_TYPES.has(bt.type)
      && btAmount.cents === expectedAmount.cents
      && btNet.cents === btAmount.cents - btFee.cents;
    if (valid) {
      fee = btFee;
      net = btNet;
      if (bt.available_on !== undefined && bt.available_on !== null) {
        if (typeof bt.available_on !== 'number' || !Number.isSafeInteger(bt.available_on) || bt.available_on <= 0) throw unexpected('fecha inválida en balance_transaction.available_on');
        availableOn = new Date(bt.available_on * 1000);
      }
    }
  }
  return { refunded, disputed: latestCharge.disputed === true, fee, net, availableOn, feeVerified: fee !== null && net !== null };
}

// Estado del PaymentIntent → estado interno. Un estado no listado es una respuesta inesperada: nunca se convierte de
// forma arbitraria.
//   requires_payment_method  sin error previo: aún no se intentó (pending); con last_payment_error: intento rechazado (failed)
//   requires_confirmation    pending
//   requires_action          processing (3-D Secure pendiente del cliente)
//   processing               processing
//   requires_capture         processing (PEI no usa captura manual; nunca se trata como capturado)
//   succeeded                succeeded; con reembolsos del cargo, partially_refunded/refunded; con disputa, in_dispute
//   canceled                 canceled; si se canceló tras un rechazo, failed
export function mapStripeStatus(status: string, hasPaymentError: boolean, amount: Money, charge: Pick<ChargeFacts, 'refunded' | 'disputed'>): PaymentStatus {
  switch (status) {
    case 'requires_payment_method':
      return hasPaymentError ? 'failed' : 'pending';
    case 'requires_confirmation':
      return 'pending';
    case 'requires_action':
    case 'processing':
    case 'requires_capture':
      return 'processing';
    case 'canceled':
      return hasPaymentError ? 'failed' : 'canceled';
    case 'succeeded':
      // Una disputa retiene el pago (in_dispute). Su resolución (ganada o perdida) no se deduce del cargo: es F6 (PAY-19).
      if (charge.disputed) return 'in_dispute';
      if (charge.refunded.cents > 0) return charge.refunded.cents >= amount.cents ? 'refunded' : 'partially_refunded';
      return 'succeeded';
    default:
      throw unexpected(`estado de Stripe desconocido: ${/^[a-z_]{1,40}$/.test(status) ? status : '(formato no válido)'}`);
  }
}

// PaymentIntent → snapshot normalizado. Valida el contrato mínimo; nunca copia el cuerpo a los errores.
export function normalizeStripePaymentIntent(body: unknown, environment: StripeEnvironment): ProviderPaymentSnapshot {
  if (!isObject(body)) throw unexpected('respuesta vacía o no JSON');
  if (body.object !== 'payment_intent') throw unexpected('el objeto no es un payment_intent');
  if (typeof body.id !== 'string' || !PAYMENT_INTENT_ID.test(body.id)) throw unexpected('id de payment_intent inválido');
  assertMode(body.livemode, environment);
  if (typeof body.status !== 'string' || !body.status) throw unexpected('falta el estado');
  if (body.currency !== STRIPE_CURRENCY) throw unexpected('moneda distinta de MXN');
  const amount = centsOrThrow(body.amount, 'amount');
  if (amount.cents <= 0) throw unexpected('importe no positivo');
  // El importe del balance_transaction debe ser el del cargo, y el del cargo, el del PaymentIntent.
  const chargeAmount = isObject(body.latest_charge) && body.latest_charge.amount !== undefined ? centsOrThrow(body.latest_charge.amount, 'latest_charge.amount') : null;
  const charge = chargeFacts(body.latest_charge, chargeAmount !== null && chargeAmount.cents === amount.cents ? chargeAmount : null);
  if (charge.refunded.cents > amount.cents) throw unexpected('importe reembolsado fuera de rango');

  const error = isObject(body.last_payment_error) ? body.last_payment_error : null;
  const errorCode = error ? safeCode(error.decline_code) ?? safeCode(error.code) : undefined;
  // Un intento cancelado por este adaptador tras un rechazo (cancellation_reason = abandoned, ver releaseIfRejected)
  // sigue siendo un rechazo aunque Stripe ya no informe last_payment_error. Nada más en PEI cancela intentos.
  const rejected = error !== null || (body.status === 'canceled' && body.cancellation_reason === 'abandoned');
  const status = mapStripeStatus(body.status, rejected, amount, charge);
  // metadata.pei_payment_id lo fija este adaptador al crear. Sin él, el intento no es de PEI: referencia vacía (el
  // procesamiento de webhooks lo ignora como pago ajeno).
  const metadata = isObject(body.metadata) ? body.metadata : {};
  const reference = metadata[STRIPE_PAYMENT_METADATA_KEY];

  let nextAction: ProviderNextAction | null = null;
  if (body.status === 'requires_action') {
    if (typeof body.client_secret !== 'string' || !body.client_secret) throw unexpected('requires_action sin client_secret');
    nextAction = { type: 'stripe_sdk', clientSecret: body.client_secret };
  }
  return {
    provider: 'stripe',
    providerPaymentId: body.id,
    providerStatus: `${body.status}${errorCode ? `/${errorCode}` : ''}`,
    status,
    externalReference: typeof reference === 'string' ? reference : '',
    amount,
    refunded: charge.refunded,
    // Solo un cobro capturado tiene comisión y neto que conciliar.
    providerFeeActual: body.status === 'succeeded' ? charge.fee : null,
    netReceived: body.status === 'succeeded' ? charge.net : null,
    moneyReleaseDate: body.status === 'succeeded' ? charge.availableOn : null,
    // H-3: la comisión real procede de un balance_transaction verificado (requisito para conciliar).
    providerFeeVerified: body.status === 'succeeded' && charge.feeVerified,
    nextAction,
  };
}

// Estado del reembolso de Stripe → estado del reembolso. pending y requires_action: aceptado, sin confirmar.
export const STRIPE_REFUND_STATUS_MAP: Readonly<Record<string, ProviderRefundSnapshot['status']>> = Object.freeze({
  succeeded: 'succeeded',
  pending: 'processing',
  requires_action: 'processing',
  failed: 'failed',
  canceled: 'failed',
});

export function normalizeStripeRefund(body: unknown, environment: StripeEnvironment): ProviderRefundSnapshot {
  if (!isObject(body)) throw unexpected('respuesta vacía o no JSON');
  if (body.object !== 'refund') throw unexpected('el objeto no es un refund');
  if (typeof body.id !== 'string' || !REFUND_ID.test(body.id)) throw unexpected('id de reembolso inválido');
  if (typeof body.payment_intent !== 'string' || !PAYMENT_INTENT_ID.test(body.payment_intent)) throw unexpected('falta el payment_intent del reembolso');
  if (typeof body.status !== 'string' || !body.status) throw unexpected('falta el estado del reembolso');
  const status = STRIPE_REFUND_STATUS_MAP[body.status];
  if (!status) throw unexpected(`estado de reembolso desconocido: ${/^[a-z_]{1,40}$/.test(body.status) ? body.status : '(formato no válido)'}`);
  if (body.currency !== STRIPE_CURRENCY) throw unexpected('moneda del reembolso distinta de MXN');
  const amount = centsOrThrow(body.amount, 'amount');
  if (amount.cents <= 0) throw unexpected('importe de reembolso no positivo');
  // livemode no forma parte del objeto refund: el modo lo garantiza la clave con la que se consulta.
  void environment;
  return { provider: 'stripe', providerRefundId: body.id, providerPaymentId: body.payment_intent, providerStatus: body.status, status, amount };
}

interface StripeResponse { ok: boolean; status: number; body: unknown }

const providerLogger = new Logger('StripeProvider');

// Línea de diagnóstico de un error: método, ruta sin ids, HTTP y los códigos de Stripe (con formato de código). Nunca
// el mensaje, el cuerpo, la clave, el PaymentMethod, el importe ni la clave de idempotencia.
export function describeStripeFailure(method: string, path: string, status: number, body: unknown): string {
  const error = isObject(body) && isObject(body.error) ? body.error : {};
  const route = path.split('?')[0].replace(/\/(pi|re|pm|ch|pyr)_[A-Za-z0-9_]+/g, '/:id');
  return `Stripe ${method} ${route} → HTTP ${status} · tipo=${safeCode(error.type) ?? '—'} · código=${safeCode(error.code) ?? '—'} · rechazo=${safeCode(error.decline_code) ?? '—'}`;
}

export class StripePaymentProvider implements PaymentProviderPort, RefundProviderPort {
  readonly name = 'stripe' as const;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: StripeProviderConfig) {
    if (!config.secretKey?.trim()) throw new Error('Stripe: falta la clave secreta');
    if (typeof config.fetch !== 'function') throw new Error('Stripe: falta fetch');
    if (config.environment !== 'test' && config.environment !== 'live') throw new Error('Stripe: falta el modo (test o live)');
    this.baseUrl = (config.baseUrl ?? STRIPE_API).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  // Crea y confirma el PaymentIntent en una sola llamada. Repetirla con la misma Idempotency-Key (payment.id) devuelve
  // el mismo intento: no hay un segundo cobro.
  async createPayment(request: PaymentRequest): Promise<ProviderPaymentSnapshot> {
    if (!PAYMENT_METHOD_ID.test(request.card.token)) throw new PaymentProviderError('rejected_request', 'el medio de pago no es un PaymentMethod de Stripe');
    const form = new URLSearchParams();
    form.set('amount', String(request.split.gross.cents));
    form.set('currency', STRIPE_CURRENCY);
    form.set('payment_method', request.card.token);
    form.append('payment_method_types[]', 'card');
    form.set('confirm', 'true');
    form.set('description', request.description);
    form.set(`metadata[${STRIPE_PAYMENT_METADATA_KEY}]`, request.paymentId);
    form.set('metadata[pei_payment_type]', request.type);
    form.append('expand[]', 'latest_charge.balance_transaction');

    const response = await this.request('POST', '/v1/payment_intents', form, request.idempotencyKey);
    let raw = response.body;
    if (!response.ok) {
      // Tarjeta rechazada: HTTP 402 con el PaymentIntent dentro del error. Es un resultado del cobro (failed), no un
      // fallo de la solicitud. Cualquier otro error sigue la clasificación general.
      const error = isObject(raw) && isObject(raw.error) ? raw.error : null;
      if (response.status !== 402 || !error || !isObject(error.payment_intent)) throw this.failure('POST', '/v1/payment_intents', response);
      raw = error.payment_intent;
    }
    const snapshot = await this.releaseIfRejected(normalizeStripePaymentIntent(raw, this.config.environment), raw);
    // La respuesta debe corresponder exactamente a la solicitud.
    if (snapshot.externalReference !== request.paymentId) throw unexpected('la referencia del intento no corresponde al pago');
    if (snapshot.amount.cents !== request.split.gross.cents) throw unexpected('el importe del proveedor no coincide con el solicitado');
    return snapshot;
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPaymentSnapshot> {
    // Un id que no es de Stripe (p. ej. un pago histórico de Mercado Pago) nunca se consulta aquí.
    if (!PAYMENT_INTENT_ID.test(providerPaymentId)) throw new PaymentProviderError('rejected_request', 'id de pago del proveedor inválido');
    const path = `/v1/payment_intents/${providerPaymentId}?expand[]=latest_charge.balance_transaction`;
    const response = await this.request('GET', path);
    if (!response.ok) throw this.failure('GET', path, response);
    const snapshot = normalizeStripePaymentIntent(response.body, this.config.environment);
    if (snapshot.providerPaymentId !== providerPaymentId) throw unexpected('el proveedor devolvió otro pago');
    return this.releaseIfRejected(snapshot, response.body);
  }

  // Reembolso sobre el PaymentIntent. Sin `amount` es total (así lo define la API). Idempotency-Key = refund.id (estable).
  async createRefund(request: CreateProviderRefund): Promise<ProviderRefundSnapshot> {
    if (!PAYMENT_INTENT_ID.test(request.providerPaymentId)) throw new PaymentProviderError('rejected_request', 'id de pago del proveedor inválido');
    if (!request.idempotencyKey?.trim()) throw new PaymentProviderError('rejected_request', 'falta la clave de idempotencia del reembolso');
    const form = new URLSearchParams();
    form.set('payment_intent', request.providerPaymentId);
    if (request.amount) form.set('amount', String(request.amount.cents));
    form.set(`metadata[${STRIPE_REFUND_METADATA_KEY}]`, request.idempotencyKey);
    const response = await this.request('POST', '/v1/refunds', form, request.idempotencyKey);
    if (!response.ok) throw this.failure('POST', '/v1/refunds', response, ['balance_insufficient']);
    const snapshot = normalizeStripeRefund(response.body, this.config.environment);
    if (snapshot.providerPaymentId !== request.providerPaymentId) throw unexpected('el reembolso es de otro pago');
    if (request.amount && snapshot.amount.cents !== request.amount.cents) throw unexpected('el importe del reembolso no coincide con el solicitado');
    return snapshot;
  }

  async getRefund(providerPaymentId: string, providerRefundId: string): Promise<ProviderRefundSnapshot> {
    if (!PAYMENT_INTENT_ID.test(providerPaymentId) || !REFUND_ID.test(providerRefundId)) throw new PaymentProviderError('rejected_request', 'id del proveedor inválido');
    const path = `/v1/refunds/${providerRefundId}`;
    const response = await this.request('GET', path);
    if (!response.ok) throw this.failure('GET', path, response);
    const snapshot = normalizeStripeRefund(response.body, this.config.environment);
    if (snapshot.providerRefundId !== providerRefundId || snapshot.providerPaymentId !== providerPaymentId) throw unexpected('el proveedor devolvió otro reembolso');
    return snapshot;
  }

  // Un intento rechazado que sigue abierto (requires_payment_method) se cancela: así nadie puede volver a confirmarlo
  // con el client_secret mientras PEI ya lo registró como failed. Es un cierre de mejor esfuerzo: si la cancelación
  // falla, el resultado (failed) no cambia.
  private async releaseIfRejected(snapshot: ProviderPaymentSnapshot, raw: unknown): Promise<ProviderPaymentSnapshot> {
    if (snapshot.status !== 'failed' || !isObject(raw) || raw.status !== 'requires_payment_method') return snapshot;
    try {
      const path = `/v1/payment_intents/${snapshot.providerPaymentId}/cancel`;
      const response = await this.request('POST', path, new URLSearchParams({ cancellation_reason: 'abandoned' }));
      if (!response.ok) providerLogger.warn(describeStripeFailure('POST', path, response.status, response.body));
    } catch {
      providerLogger.warn('Stripe POST /v1/payment_intents/:id/cancel → sin respuesta');
    }
    return snapshot;
  }

  // `transientCodes`: códigos de Stripe que, en ESTA operación, significan «reintentar más tarde».
  private failure(method: string, path: string, response: StripeResponse, transientCodes: readonly string[] = []): PaymentProviderError {
    const error = isObject(response.body) && isObject(response.body.error) ? response.body.error : {};
    const code = safeCode(error.code) ?? safeCode(error.type);
    const s = response.status;
    providerLogger.warn(describeStripeFailure(method, path, s, response.body));
    if (s === 401 || s === 403) return new PaymentProviderError('unauthorized', 'Stripe rechazó las credenciales', s, code);
    if (s === 404) return new PaymentProviderError('not_found', 'el objeto no existe en Stripe', s, code);
    // 409: otra solicitud con la misma clave de idempotencia sigue en curso.
    if (s === 409 || s === 429 || s >= 500 || (typeof error.code === 'string' && transientCodes.includes(error.code))) {
      return new PaymentProviderError('unavailable', `Stripe no disponible (HTTP ${s})`, s, code);
    }
    // La misma clave de idempotencia con otros parámetros: PUDO existir un cobro anterior con esa clave. Nunca se
    // trata como un rechazo definitivo (que marcaría el pago como fallido): queda para conciliar.
    if (error.type === 'idempotency_error') return new PaymentProviderError('unexpected_response', 'la clave de idempotencia ya se usó con otra solicitud', s, code);
    return new PaymentProviderError('rejected_request', `Stripe rechazó la solicitud (HTTP ${s})`, s, code);
  }

  private async request(method: 'GET' | 'POST', path: string, form?: URLSearchParams, idempotencyKey?: string): Promise<StripeResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.config.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          Accept: 'application/json',
          'Stripe-Version': STRIPE_API_VERSION,
          ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: form ? form.toString() : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') throw new PaymentProviderError('timeout', `Stripe no respondió en ${this.timeoutMs} ms`);
      throw new PaymentProviderError('unavailable', 'no se pudo contactar a Stripe');
    } finally {
      clearTimeout(timer);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    if (response.ok && body === undefined) throw new PaymentProviderError('unexpected_response', 'respuesta no JSON', response.status);
    return { ok: response.ok, status: response.status, body };
  }
}
