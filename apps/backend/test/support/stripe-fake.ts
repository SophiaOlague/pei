// Doble en memoria de la API de Stripe para las pruebas unitarias (sin red). Reproduce SOLO lo que el adaptador de PEI
// usa: PaymentIntents confirmados en el servidor, su consulta, su cancelación y los reembolsos, con la idempotencia de
// Stripe (misma Idempotency-Key → misma respuesta; mismos datos distintos → idempotency_error).
//
// Los medios de pago imitan los de prueba de Stripe por su nombre; aquí son solo cadenas:
//   pm_card_visa                      cobro aprobado
//   pm_card_chargeDeclined            tarjeta rechazada (HTTP 402 con el PaymentIntent en el error)
//   pm_card_threeDSecure2Required     requiere autenticación del cliente (requires_action)
//   pm_card_processing                queda en processing
// Las comisiones del doble son ILUSTRATIVAS: no son una tarifa de Stripe.
import { createHmac } from 'crypto';

export interface FakeStripeCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  form: URLSearchParams | null;
}

export interface FakeIntent {
  id: string;
  object: 'payment_intent';
  livemode: boolean;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  client_secret: string;
  last_payment_error: { code: string; decline_code?: string } | null;
  cancellation_reason: string | null;
  latest_charge: null | {
    id: string; amount: number; amount_refunded: number; disputed: boolean;
    // Como Stripe: el balance_transaction del cobro (type charge) con su importe, comisión y neto.
    balance_transaction: null | { object?: string; type?: string; amount?: number; fee: number; net: number; currency: string; available_on: number };
  };
}

export const FAKE_FEE_CENTS = (amount: number) => Math.round(amount * 0.04);
export const FAKE_AVAILABLE_ON = 1795000000;

export class FakeStripe {
  calls: FakeStripeCall[] = [];
  intents = new Map<string, FakeIntent>();
  refunds = new Map<string, { id: string; object: 'refund'; payment_intent: string; amount: number; currency: string; status: string }>();
  private idempotency = new Map<string, { body: string; status: number; json: unknown }>();
  private seq = 0;
  livemode = false;
  // Fallos forzados para la SIGUIENTE llamada (se consumen en orden): un estado HTTP con su cuerpo, o un error de red.
  failures: ({ status: number; body: unknown } | 'network' | 'timeout')[] = [];
  // Altera el PaymentIntent que se devuelve al crear (para simular respuestas incoherentes del proveedor).
  tamper: ((intent: FakeIntent) => FakeIntent) | null = null;

  get created(): FakeStripeCall[] {
    return this.calls.filter((c) => c.method === 'POST' && c.path === '/v1/payment_intents');
  }

  readonly fetch = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const form = typeof init.body === 'string' ? new URLSearchParams(init.body) : null;
    const method = init.method ?? 'GET';
    this.calls.push({ method, path: u.pathname, headers, form });

    const failure = this.failures.shift();
    if (failure === 'network') throw new TypeError('fetch failed');
    if (failure === 'timeout') throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (failure) return this.respond(failure.status, failure.body);

    const key = headers['idempotency-key'];
    if (method === 'POST' && key) {
      const seen = this.idempotency.get(key);
      if (seen) {
        if (seen.body !== (init.body as string)) return this.respond(400, { error: { type: 'idempotency_error', message: 'Keys for idempotent requests can only be used with the same parameters' } });
        return this.respond(seen.status, seen.json);
      }
    }
    const { status, json } = this.route(method, u.pathname, form);
    if (method === 'POST' && key) this.idempotency.set(key, { body: init.body as string, status, json });
    return this.respond(status, json);
  }) as unknown as typeof fetch;

  private respond(status: number, json: unknown): Response {
    return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
  }

  private route(method: string, path: string, form: URLSearchParams | null): { status: number; json: unknown } {
    const intentPath = /^\/v1\/payment_intents\/(pi_[A-Za-z0-9_]+)(\/cancel)?$/.exec(path);
    if (method === 'POST' && path === '/v1/payment_intents') return this.createIntent(form!);
    if (intentPath) {
      const intent = this.intents.get(intentPath[1]);
      if (!intent) return { status: 404, json: { error: { type: 'invalid_request_error', code: 'resource_missing' } } };
      if (method === 'GET' && !intentPath[2]) return { status: 200, json: intent };
      if (method === 'POST' && intentPath[2]) {
        if (['succeeded', 'canceled'].includes(intent.status)) return { status: 400, json: { error: { type: 'invalid_request_error', code: 'payment_intent_unexpected_state' } } };
        intent.status = 'canceled';
        intent.cancellation_reason = form?.get('cancellation_reason') ?? null;
        return { status: 200, json: intent };
      }
    }
    if (method === 'POST' && path === '/v1/refunds') return this.createRefund(form!);
    const refundPath = /^\/v1\/refunds\/([A-Za-z0-9_]+)$/.exec(path);
    if (method === 'GET' && refundPath) {
      const refund = this.refunds.get(refundPath[1]);
      return refund ? { status: 200, json: refund } : { status: 404, json: { error: { type: 'invalid_request_error', code: 'resource_missing' } } };
    }
    return { status: 404, json: { error: { type: 'invalid_request_error', code: 'url_invalid' } } };
  }

  private charge(amount: number): NonNullable<FakeIntent['latest_charge']> {
    const fee = FAKE_FEE_CENTS(amount);
    return { id: `ch_fake${String(++this.seq).padStart(8, '0')}`, amount, amount_refunded: 0, disputed: false, balance_transaction: { object: 'balance_transaction', type: 'charge', amount, fee, net: amount - fee, currency: 'mxn', available_on: FAKE_AVAILABLE_ON } };
  }

  private createIntent(form: URLSearchParams): { status: number; json: unknown } {
    const id = `pi_fake${String(++this.seq).padStart(8, '0')}`;
    const amount = Number(form.get('amount'));
    const method = form.get('payment_method') ?? '';
    const metadata: Record<string, string> = {};
    for (const [k, v] of form) {
      const m = /^metadata\[(.+)\]$/.exec(k);
      if (m) metadata[m[1]] = v;
    }
    let intent: FakeIntent = {
      id, object: 'payment_intent', livemode: this.livemode, status: 'succeeded', amount, currency: form.get('currency') ?? '', metadata,
      client_secret: `${id}_secret_fake`, last_payment_error: null, cancellation_reason: null, latest_charge: null,
    };
    if (method === 'pm_card_chargeDeclined') {
      intent.status = 'requires_payment_method';
      intent.last_payment_error = { code: 'card_declined', decline_code: 'generic_decline' };
    } else if (method === 'pm_card_threeDSecure2Required') {
      intent.status = 'requires_action';
    } else if (method === 'pm_card_processing') {
      intent.status = 'processing';
    } else {
      intent.latest_charge = this.charge(amount);
    }
    this.intents.set(id, intent);
    if (this.tamper) intent = this.tamper({ ...intent });
    if (intent.status === 'requires_payment_method') {
      return { status: 402, json: { error: { type: 'card_error', code: 'card_declined', decline_code: 'generic_decline', payment_intent: intent } } };
    }
    return { status: 200, json: intent };
  }

  private createRefund(form: URLSearchParams): { status: number; json: unknown } {
    const intent = this.intents.get(form.get('payment_intent') ?? '');
    if (!intent || !intent.latest_charge) return { status: 400, json: { error: { type: 'invalid_request_error', code: 'charge_already_refunded' } } };
    const amount = form.get('amount') ? Number(form.get('amount')) : intent.amount - intent.latest_charge.amount_refunded;
    const id = `re_fake${String(++this.seq).padStart(8, '0')}`;
    const refund = { id, object: 'refund' as const, payment_intent: intent.id, amount, currency: 'mxn', status: 'succeeded' };
    intent.latest_charge.amount_refunded += amount;
    this.refunds.set(id, refund);
    return { status: 200, json: refund };
  }

  // ---- transiciones que en Stripe ocurren fuera de PEI (el cliente completa 3-D Secure, el banco responde…) ----------
  completeAction(id: string, outcome: 'succeeded' | 'failed'): void {
    const intent = this.intents.get(id)!;
    if (outcome === 'succeeded') {
      intent.status = 'succeeded';
      intent.latest_charge = this.charge(intent.amount);
    } else {
      intent.status = 'requires_payment_method';
      intent.last_payment_error = { code: 'payment_intent_authentication_failure' };
    }
  }

  // ---- eventos de webhook firmados como lo hace Stripe ---------------------------------------------------------------
  event(type: string, object: Record<string, unknown>, over: { id?: string; livemode?: boolean } = {}): Buffer {
    const id = over.id ?? `evt_fake${String(++this.seq).padStart(8, '0')}`;
    return Buffer.from(JSON.stringify({ id, object: 'event', api_version: '2024-06-20', created: 1794790000, livemode: over.livemode ?? this.livemode, type, data: { object } }), 'utf8');
  }

  intentEvent(type: string, intentId: string, over: { id?: string; livemode?: boolean } = {}): Buffer {
    return this.event(type, { ...this.intents.get(intentId)! }, over);
  }
}

export const stripeSignature = (secret: string, rawBody: Buffer, timestampSeconds: number): string =>
  `t=${timestampSeconds},v1=${createHmac('sha256', secret).update(`${timestampSeconds}.`).update(rawBody).digest('hex')}`;
