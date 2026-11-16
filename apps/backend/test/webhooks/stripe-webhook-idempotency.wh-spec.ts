import { Test, type TestingModule } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { verifyNeonRuntimeIdentity } from '../support/c2-target-guard';
import { db } from '../../src/db';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/common/application/ports/clock';
import { UniqueConstraintViolationError } from '../../src/common/domain/persistence.errors';
import { translatePostgresError } from '../../src/common/infrastructure/postgres-error-translator';
import { money, ZERO } from '../../src/modules/payments/domain/money';
import { PAYMENT_PROVIDER, PaymentProviderError, type PaymentProviderPort, type ProviderPaymentSnapshot } from '../../src/modules/payments/application/ports/payment-provider.port';
import {
  PROVIDER_WEBHOOK_EVENT_REPOSITORY,
  WEBHOOK_EVENT_DISPATCHER,
  WebhookAuthenticationError,
  type ProviderWebhookAuthenticator,
  type RawWebhookRequest,
  type WebhookEventDispatcher,
  type WebhookEventRepository,
} from '../../src/modules/payments/application/ports/provider-webhook.port';
import {
  ProcessProviderWebhookEventUseCase,
  ReceiveProviderWebhookUseCase,
  RetryProviderWebhookEventsUseCase,
  WEBHOOK_MAX_ATTEMPTS,
} from '../../src/modules/payments/application/use-cases/provider-webhook.use-cases';
import { STRIPE_WEBHOOK_SETTINGS } from '../../src/modules/payments/payments.module';
import {
  caseState,
  COMPACT,
  createBaseFixtures,
  createCase,
  eventId,
  MARK,
  newSecret,
  signedEvent,
  type BaseFixtures,
  type CaseFixtures,
} from '../support/payments-webhook-fixtures';

// Salvaguarda de destino: solo C2, modo `webhooks`, conexión directa y la marca de datos confirmados de H-5.
assertC2BranchTarget();

// H-5 · Idempotencia y concurrencia de los webhooks de Stripe sobre PostgreSQL REAL (C2), autorizado el 2026-11-16.
//
// Reales: PostgreSQL, repositorios Drizzle, unidad de trabajo, triggers y restricciones, StripeWebhookAuthenticator
// (con un secreto generado en memoria), Receive/Process/RetryProviderWebhookEventsUseCase y la confirmación de M08.
// Dobles: el proveedor (getPayment devuelve un PaymentIntent ficticio; nada sale a Stripe), el despachador (manual,
// para controlar cuándo se procesa) y el reloj (hora real más un desplazamiento, para los plazos de reintento).
// Fixtures sintéticos marcados wh-h5-<C2_RUN_ID> (test/support/payments-webhook-fixtures.ts). Las escrituras se
// confirman, como en producción; lo que los triggers no permiten borrar queda en C2 identificado por la marca.
//
// Ejecución: pnpm c2 run webhooks test/webhooks/stripe-webhook-idempotency.wh-spec.ts --committed-fixtures wh-h5-committed

const SECRET = newSecret();

class AdjustableClock {
  offsetMs = 0;
  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

class ManualDispatcher implements WebhookEventDispatcher {
  readonly dispatched: string[] = [];
  dispatch(eventId: string): void {
    this.dispatched.push(eventId);
  }
}

interface Behaviour {
  paymentId: string;
  failRemaining: number;
  failAlways: boolean;
  gate?: Promise<void>;
  calls: number;
}

// Proveedor ficticio: un PaymentIntent `succeeded` de 200.00 MXN con comisión y neto sintéticos (1.23 y 198.77).
class FakeStripeProvider implements PaymentProviderPort {
  readonly name = 'stripe' as const;
  readonly behaviours = new Map<string, Behaviour>();
  register(c: CaseFixtures, b: Partial<Omit<Behaviour, 'paymentId' | 'calls'>> = {}): void {
    this.behaviours.set(c.providerPaymentId, { paymentId: c.paymentId, failRemaining: 0, failAlways: false, calls: 0, ...b });
  }
  async createPayment(): Promise<ProviderPaymentSnapshot> {
    throw new Error('H-5: createPayment no debe llamarse');
  }
  async getPayment(providerPaymentId: string): Promise<ProviderPaymentSnapshot> {
    const b = this.behaviours.get(providerPaymentId);
    if (!b) throw new PaymentProviderError('not_found', 'PaymentIntent ficticio desconocido');
    b.calls += 1;
    if (b.gate && b.calls === 1) await b.gate;
    if (b.failAlways || b.failRemaining > 0) {
      b.failRemaining = Math.max(0, b.failRemaining - 1);
      throw new PaymentProviderError('unavailable', 'fallo simulado del proveedor (H-5)');
    }
    return {
      provider: 'stripe',
      providerPaymentId,
      providerStatus: 'succeeded',
      status: 'succeeded',
      externalReference: b.paymentId,
      amount: money(20000),
      refunded: ZERO,
      providerFeeActual: money(123),
      netReceived: money(19877),
      moneyReleaseDate: new Date('2099-12-31T00:00:00.000Z'),
    };
  }
  async createRefund(): Promise<never> {
    throw new Error('H-5: createRefund no debe llamarse');
  }
  async getRefund(): Promise<never> {
    throw new Error('H-5: getRefund no debe llamarse');
  }
}

const clock = new AdjustableClock();
const dispatcher = new ManualDispatcher();
const provider = new FakeStripeProvider();
let moduleRef: TestingModule;
let receive: ReceiveProviderWebhookUseCase;
let processor: ProcessProviderWebhookEventUseCase;
let retry: RetryProviderWebhookEventsUseCase;
let events: WebhookEventRepository;
let base: BaseFixtures;
const results: Record<string, string> = {};

const piObject = (c: CaseFixtures) => ({ id: c.providerPaymentId, object: 'payment_intent' });
const succeeded = (c: CaseFixtures, n = 1): RawWebhookRequest =>
  signedEvent(SECRET, { eventId: eventId(c.caseId, n), type: 'payment_intent.succeeded', object: piObject(c), at: clock.now() });
const eventRow = async (id: string) =>
  (await db.execute(sql`select status::text, processing_attempts, payment_id, last_error, data_id from provider_webhook_event where id = ${id}`)).rows[0] as {
    status: string; processing_attempts: number; payment_id: string | null; last_error: string | null; data_id: string;
  };
const countByRequestId = async (requestId: string) =>
  Number((await db.execute(sql`select count(*)::int as n from provider_webhook_event where request_id = ${requestId}`)).rows[0].n);

// Efectos esperados de un evento de pago procesado una sola vez.
async function expectSingleEffects(c: CaseFixtures, expectedEvents = 1) {
  const s = await caseState(c);
  expect(s.payment.status).toBe('succeeded');
  expect(s.payment.provider_fee_actual).toBe('1.23');
  expect(s.payment.net_received_amount).toBe('198.77');
  expect(s.appointment).toBe('confirmed');
  expect(s.payments).toBe(1);
  expect(s.confirmed).toBe(1);
  expect(s.history).toBe(1);
  expect(s.refunds).toBe(0);
  expect(s.events).toHaveLength(expectedEvents);
  for (const e of s.events) {
    expect(e.signature_valid).toBe(true);
    expect(e.payment_id).toBe(c.paymentId);
  }
  return s;
}

async function settle<T>(promises: Promise<T>[]) {
  return Promise.allSettled(promises);
}

beforeAll(async () => {
  // Identidad REAL de la conexión (neon.*) antes de cualquier escritura.
  await verifyNeonRuntimeIdentity(async (name) => ((await db.execute(sql`select current_setting(${name}, true) as v`)).rows[0]?.v as string) ?? null);
  moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PAYMENT_PROVIDER).useValue(provider)
    .overrideProvider(WEBHOOK_EVENT_DISPATCHER).useValue(dispatcher)
    .overrideProvider(STRIPE_WEBHOOK_SETTINGS).useValue({ secret: SECRET, toleranceMs: 300_000, environment: 'test' })
    .overrideProvider(CLOCK).useValue(clock)
    .compile();
  receive = moduleRef.get(ReceiveProviderWebhookUseCase);
  processor = moduleRef.get(ProcessProviderWebhookEventUseCase);
  retry = moduleRef.get(RetryProviderWebhookEventsUseCase);
  events = moduleRef.get(PROVIDER_WEBHOOK_EVENT_REPOSITORY);
  base = await createBaseFixtures();
  console.log(`[H-5] marca ${MARK}; fixtures base creados`);
});

afterAll(async () => {
  console.log(`[H-5] resultados ${JSON.stringify(results)}`);
  await moduleRef?.close();
});

const record = (id: string, fn: () => Promise<void>) => async () => {
  try {
    await fn();
    results[id] = 'PASS';
  } catch (error) {
    results[id] = 'FAIL';
    throw error;
  }
};

describe('H-5 · webhooks de Stripe sobre PostgreSQL real (C2)', () => {
  const cases: Record<string, CaseFixtures> = {};

  it('[WH-PG-01] el mismo evento recibido dos veces seguidas: un registro y efectos una sola vez', record('WH-PG-01', async () => {
    const c = (cases['01'] = await createCase(base, '01'));
    provider.register(c);
    const req = succeeded(c);
    const first = await receive.execute(req);
    expect(first.outcome).toBe('accepted');
    const processed = await processor.execute(first.eventId);
    expect(processed.outcome).toBe('processed');
    const second = await receive.execute(req);
    expect(second).toEqual({ outcome: 'duplicate', eventId: first.eventId });
    expect(dispatcher.dispatched.filter((id) => id === first.eventId)).toHaveLength(1);
    await expectSingleEffects(c);
    expect(await countByRequestId(eventId('01'))).toBe(1);
  }));

  it('[WH-PG-02] cinco entregas simultáneas del mismo evento: una aceptada, cuatro duplicadas (23505 real)', record('WH-PG-02', async () => {
    const c = (cases['02'] = await createCase(base, '02'));
    provider.register(c);
    const req = succeeded(c);
    const outcomes = await settle(Array.from({ length: 5 }, () => receive.execute(req)));
    const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
    if (rejected.length) console.log(`[H-5] WH-PG-02 rechazos: ${rejected.map((r) => `${(r.reason as Error)?.name}:${(r.reason as Error)?.message?.slice(0, 120)}`).join(' | ')}`);
    expect(rejected).toHaveLength(0);
    const values = (outcomes as PromiseFulfilledResult<{ outcome: string; eventId: string }>[]).map((o) => o.value);
    expect(values.filter((v) => v.outcome === 'accepted')).toHaveLength(1);
    expect(values.filter((v) => v.outcome === 'duplicate')).toHaveLength(4);
    expect(new Set(values.map((v) => v.eventId)).size).toBe(1);
    expect(await countByRequestId(eventId('02'))).toBe(1);
    await processor.execute(values[0].eventId);
    await expectSingleEffects(c);
  }));

  it('[WH-PG-03] claim concurrente: un solo reclamo; cinco procesamientos simultáneos: uno procesa, cuatro se omiten', record('WH-PG-03', async () => {
    const c = (cases['03'] = await createCase(base, '03'));
    provider.register(c);
    const { eventId: id } = await receive.execute(succeeded(c));
    const claims = await Promise.all(Array.from({ length: 5 }, () => events.claim(id, { now: clock.now(), maxAttempts: WEBHOOK_MAX_ATTEMPTS })));
    expect(claims.filter((r) => r !== null)).toHaveLength(1);
    expect(await eventRow(id)).toMatchObject({ status: 'processing', processing_attempts: 1 });
    await events.finish(id, { status: 'failed', at: clock.now(), lastError: 'h5_reclamo_manual' });
    const runs = await Promise.all(Array.from({ length: 5 }, () => processor.execute(id)));
    expect(runs.filter((r) => r.outcome === 'processed')).toHaveLength(1);
    expect(runs.filter((r) => r.outcome === 'skipped')).toHaveLength(4);
    expect(await eventRow(id)).toMatchObject({ status: 'processed', processing_attempts: 2, last_error: null });
    await expectSingleEffects(c);
  }));

  it('[WH-PG-04] dos eventos distintos del mismo PaymentIntent procesados a la vez: un cambio del pago y una confirmación', record('WH-PG-04', async () => {
    const c = (cases['04'] = await createCase(base, '04'));
    provider.register(c);
    const a = await receive.execute(succeeded(c, 1));
    const b = await receive.execute(signedEvent(SECRET, {
      eventId: eventId('04', 2), type: 'charge.refund.updated', at: clock.now(),
      object: { id: `re_whh5${COMPACT}04`, object: 'refund', payment_intent: c.providerPaymentId },
    }));
    expect([a.outcome, b.outcome]).toEqual(['accepted', 'accepted']);
    const [ra, rb] = await Promise.all([processor.execute(a.eventId), processor.execute(b.eventId)]);
    expect([ra.outcome, rb.outcome]).toEqual(['processed', 'processed']);
    const changed = [ra, rb].filter((r) => r.outcome === 'processed' && r.paymentChanged);
    expect(changed).toHaveLength(1);
    await expectSingleEffects(c, 2);
  }));

  it('[WH-PG-05] recuperación de un evento `received` no despachado: se procesa una vez; un segundo barrido no lo toca', record('WH-PG-05', async () => {
    const c = (cases['05'] = await createCase(base, '05'));
    provider.register(c);
    const { eventId: id } = await receive.execute(succeeded(c));
    expect((await eventRow(id)).status).toBe('received');
    clock.offsetMs += 120_000; // más de WEBHOOK_UNDISPATCHED_AFTER_MS (60 s)
    await retry.execute({ limit: 200 });
    expect(await eventRow(id)).toMatchObject({ status: 'processed', processing_attempts: 1 });
    await retry.execute({ limit: 200 });
    expect(await eventRow(id)).toMatchObject({ status: 'processed', processing_attempts: 1 });
    await expectSingleEffects(c);
  }));

  it('[WH-PG-06] recuperación de un evento `failed`: el primer intento falla en el proveedor y el reintento lo completa', record('WH-PG-06', async () => {
    const c = (cases['06'] = await createCase(base, '06'));
    provider.register(c, { failRemaining: 1 });
    const { eventId: id } = await receive.execute(succeeded(c));
    const first = await processor.execute(id);
    expect(first).toMatchObject({ outcome: 'failed', reason: 'provider:unavailable' });
    expect(await eventRow(id)).toMatchObject({ status: 'failed', processing_attempts: 1, last_error: 'provider:unavailable' });
    expect((await caseState(c)).appointment).toBe('pending_payment');
    await retry.execute({ limit: 200 });
    expect(await eventRow(id)).toMatchObject({ status: 'processed', processing_attempts: 2, last_error: null });
    await expectSingleEffects(c);
  }));

  it('[WH-PG-07] reentrega de un evento ya procesado: duplicado, sin redespacho ni cambios', record('WH-PG-07', async () => {
    const c = (cases['07'] = await createCase(base, '07'));
    provider.register(c);
    const req = succeeded(c);
    const { eventId: id } = await receive.execute(req);
    await processor.execute(id);
    const before = await caseState(c);
    const dispatchedBefore = dispatcher.dispatched.length;
    const again = await receive.execute(req);
    expect(again).toEqual({ outcome: 'duplicate', eventId: id });
    expect(dispatcher.dispatched.length).toBe(dispatchedBefore);
    expect(await caseState(c)).toEqual(before);
    await expectSingleEffects(c);
  }));

  it('[WH-PG-08] reentrega de un evento `failed`: se redespacha y se procesa una sola vez', record('WH-PG-08', async () => {
    const c = (cases['08'] = await createCase(base, '08'));
    provider.register(c, { failRemaining: 1 });
    const req = succeeded(c);
    const { eventId: id } = await receive.execute(req);
    expect((await processor.execute(id)).outcome).toBe('failed');
    const again = await receive.execute(req);
    expect(again).toEqual({ outcome: 'duplicate', eventId: id });
    expect(dispatcher.dispatched[dispatcher.dispatched.length - 1]).toBe(id);
    expect((await processor.execute(id)).outcome).toBe('processed');
    expect(await eventRow(id)).toMatchObject({ status: 'processed', processing_attempts: 2 });
    await expectSingleEffects(c);
  }));

  it('[WH-PG-09] evento abandonado en `processing` y reclamado por el barrido mientras el primer trabajador sigue: efectos una vez', record('WH-PG-09', async () => {
    const c = (cases['09'] = await createCase(base, '09'));
    let release!: () => void;
    provider.register(c, { gate: new Promise<void>((r) => (release = r)) });
    const { eventId: id } = await receive.execute(succeeded(c));
    const workerA = processor.execute(id);
    for (let i = 0; i < 100 && (await eventRow(id)).status !== 'processing'; i++) await new Promise((r) => setTimeout(r, 100));
    expect((await eventRow(id)).status).toBe('processing');
    clock.offsetMs += 16 * 60_000; // más de WEBHOOK_STALE_PROCESSING_AFTER_MS (15 min)
    await retry.execute({ limit: 200 });
    expect(await eventRow(id)).toMatchObject({ status: 'processed', processing_attempts: 2 });
    release();
    const a = await workerA;
    console.log(`[H-5] WH-PG-09 resultado del trabajador abandonado: ${a.outcome}${'reason' in a ? ` (${a.reason})` : ''}`);
    expect(await eventRow(id)).toMatchObject({ status: 'processed', processing_attempts: 2 });
    await expectSingleEffects(c);
  }));

  it('[WH-PG-10] firma inválida, cuerpo alterado o marca de tiempo vencida: se rechaza y no se registra nada', record('WH-PG-10', async () => {
    const c = (cases['10'] = await createCase(base, '10'));
    provider.register(c);
    const wrong = signedEvent(newSecret(), { eventId: eventId('10', 1), type: 'payment_intent.succeeded', object: piObject(c), at: clock.now() });
    await expect(receive.execute(wrong)).rejects.toMatchObject({ name: WebhookAuthenticationError.name, reason: 'invalid_signature' });
    const good = signedEvent(SECRET, { eventId: eventId('10', 2), type: 'payment_intent.succeeded', object: piObject(c), at: clock.now() });
    const tampered = { ...good, rawBody: Buffer.from(good.rawBody!.toString('utf8').replace('"livemode":false', '"livemode":false ')) };
    await expect(receive.execute(tampered)).rejects.toMatchObject({ reason: 'invalid_signature' });
    const stale = signedEvent(SECRET, { eventId: eventId('10', 3), type: 'payment_intent.succeeded', object: piObject(c), at: new Date(clock.now().getTime() - 10 * 60_000) });
    await expect(receive.execute(stale)).rejects.toMatchObject({ reason: 'stale_timestamp' });
    for (const n of [1, 2, 3]) expect(await countByRequestId(eventId('10', n))).toBe(0);
    const s = await caseState(c);
    expect(s).toMatchObject({ appointment: 'pending_payment', history: 0, refunds: 0, events: [] });
    expect(s.payment.status).toBe('processing');
  }));

  it('[WH-PG-11] guards de PostgreSQL: un evento procesado y su pago no se alteran ni se borran', record('WH-PG-11', async () => {
    const c = cases['01'];
    const [{ id }] = (await db.execute(sql`select id from provider_webhook_event where request_id = ${eventId('01')}`)).rows as { id: string }[];
    const before = await eventRow(id);
    const attempts: [string, ReturnType<typeof sql>][] = [
      ['data_id', sql`update provider_webhook_event set data_id = 'pi_otro_h5' where id = ${id}`],
      ['estado', sql`update provider_webhook_event set status = 'failed' where id = ${id}`],
      ['payment_id', sql`update provider_webhook_event set payment_id = ${cases['02'].paymentId} where id = ${id}`],
      ['borrado del evento', sql`delete from provider_webhook_event where id = ${id}`],
      ['comisión real', sql`update payment set provider_fee_actual = 9.99 where id = ${c.paymentId}`],
      ['borrado del pago', sql`delete from payment where id = ${c.paymentId}`],
    ];
    for (const [label, q] of attempts) {
      let failed = false;
      try {
        await db.execute(q);
      } catch {
        failed = true;
      }
      expect({ label, failed }).toEqual({ label, failed: true });
    }
    await events.finish(id, { status: 'failed', at: clock.now(), lastError: 'h5_no_debe_aplicarse' });
    expect(await eventRow(id)).toEqual(before);
    await expectSingleEffects(c);
  }));

  it('[WH-PG-12] errores de base de datos: unicidad de payment y una restricción distinta de la clave del evento', record('WH-PG-12', async () => {
    const c = (cases['12'] = await createCase(base, '12'));
    // a) Segundo pago con el mismo PaymentIntent (provider, provider_payment_id): 23505 → UniqueConstraintViolationError.
    let uniqueError: unknown;
    try {
      await db.execute(sql`
        insert into payment (doctor_id, patient_id, appointment_id, type, provider, provider_payment_id, provider_status, status, amount, currency,
                             pei_fee_configuration_id, pei_fixed_fee, doctor_net_amount, processor_fee_schedule_id, provider_fee_estimated)
        values (${base.doctorProfileId}, ${base.patientProfileId}, ${c.appointmentId}, 'consultation', 'stripe', ${cases['01'].providerPaymentId}, 'failed', 'failed',
                200.00, 'MXN', ${base.peiFeeId}, 20.00, 180.00, ${base.scheduleId}, 0)`);
    } catch (error) {
      uniqueError = error;
    }
    const translated = translatePostgresError(uniqueError);
    expect(translated).toBeInstanceOf(UniqueConstraintViolationError);
    expect((translated as UniqueConstraintViolationError).detail.constraint).toBe('payment_provider_payment_uq');
    // b) Un error que no es la clave única del evento (CHECK de tema vacío) se propaga y no deja fila.
    const blankTopic: ProviderWebhookAuthenticator = {
      provider: 'stripe',
      authenticate: () => ({ provider: 'stripe', topic: '   ', action: 'payment_intent.succeeded', dataId: c.providerPaymentId, requestId: eventId('12'), payload: { h5: MARK } }),
    } as unknown as ProviderWebhookAuthenticator;
    const isolated = new ReceiveProviderWebhookUseCase({ clock, authenticator: blankTopic, events, dispatcher: new ManualDispatcher() });
    let other: unknown;
    try {
      await isolated.execute({ url: '/webhooks/stripe', headers: {}, body: {} });
    } catch (error) {
      other = error;
    }
    expect(other).toBeDefined();
    expect(other).not.toBeInstanceOf(UniqueConstraintViolationError);
    expect(await countByRequestId(eventId('12'))).toBe(0);
    const s = await caseState(c);
    expect(s).toMatchObject({ payments: 1, appointment: 'pending_payment', refunds: 0 });
  }));

  it('[WH-PG-13] límite de intentos: tras 8 fallos el evento ya no se reclama ni se reintenta', record('WH-PG-13', async () => {
    const c = (cases['13'] = await createCase(base, '13'));
    provider.register(c, { failAlways: true });
    const { eventId: id } = await receive.execute(succeeded(c));
    for (let i = 1; i <= WEBHOOK_MAX_ATTEMPTS; i++) expect((await processor.execute(id)).outcome).toBe('failed');
    expect(await eventRow(id)).toMatchObject({ status: 'failed', processing_attempts: WEBHOOK_MAX_ATTEMPTS });
    expect((await processor.execute(id)).outcome).toBe('skipped');
    const retryable = await events.findRetryable({
      maxAttempts: WEBHOOK_MAX_ATTEMPTS, receivedBefore: clock.now(), processingReceivedBefore: clock.now(), limit: 500,
    });
    expect(retryable).not.toContain(id);
    expect(await eventRow(id)).toMatchObject({ status: 'failed', processing_attempts: WEBHOOK_MAX_ATTEMPTS });
    const s = await caseState(c);
    expect(s).toMatchObject({ appointment: 'pending_payment', history: 0, refunds: 0, payments: 1 });
    expect(s.payment.status).toBe('processing');
  }));

  it('[WH-PG-INV] invariantes globales de la ejecución: un registro por evento, un pago por cita, sin reembolsos ni confirmaciones dobles', record('WH-PG-INV', async () => {
    const like = `pi_test_whh5_${COMPACT}_%`;
    const dupEvents = (await db.execute(sql`select request_id from provider_webhook_event where data_id like ${like} group by request_id having count(*) > 1`)).rows;
    expect(dupEvents).toEqual([]);
    const perAppointment = (await db.execute(sql`
      select a.id, (select count(*)::int from payment p where p.appointment_id = a.id) as payments,
             (select count(*)::int from appointment_status_history h where h.appointment_id = a.id and h.status = 'confirmed') as confirmed
      from appointment a where a.reason like ${`${MARK}-%`}`)).rows as { payments: number; confirmed: number }[];
    expect(perAppointment.length).toBe(Object.keys(cases).length);
    for (const r of perAppointment) {
      expect(r.payments).toBe(1);
      expect(r.confirmed).toBeLessThanOrEqual(1);
    }
    const refunds = Number((await db.execute(sql`select count(*)::int as n from refund r join payment p on p.id = r.payment_id where p.provider_payment_id like ${like}`)).rows[0].n);
    expect(refunds).toBe(0);
  }));
});
