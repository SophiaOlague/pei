import { Test, type TestingModule } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { verifyNeonRuntimeIdentity } from '../support/c2-target-guard';
import { db } from '../../src/db';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/common/application/ports/clock';
import { money, ZERO } from '../../src/modules/payments/domain/money';
import { PAYMENT_PROVIDER, PaymentProviderError, type PaymentProviderPort, type ProviderPaymentSnapshot } from '../../src/modules/payments/application/ports/payment-provider.port';
import { WEBHOOK_EVENT_DISPATCHER, type RawWebhookRequest, type WebhookEventDispatcher } from '../../src/modules/payments/application/ports/provider-webhook.port';
import { ProcessProviderWebhookEventUseCase, ReceiveProviderWebhookUseCase } from '../../src/modules/payments/application/use-cases/provider-webhook.use-cases';
import { STRIPE_WEBHOOK_SETTINGS } from '../../src/modules/payments/payments.module';
import { caseState, createCase, eventId, MARK, newSecret, signedEvent, type BaseFixtures, type CaseFixtures } from '../support/payments-webhook-fixtures';

// Salvaguarda de destino: solo C2, modo `webhooks`, conexión directa y la marca de datos confirmados de H-5.
assertC2BranchTarget();

// H5-1 · Repetición en PostgreSQL real (C2) de WH-PG-01, 02, 07 y 08 tras la corrección de
// DrizzleWebhookEventRepository.insert (autorizada el 2026-11-16).
//
// Reutiliza la ejecución anterior c2-20261116071451-5767 (usuarios, perfiles, política, comisión y tarifa sintéticas, y
// los eventos ya procesados de sus casos 01, 02 y 07). Solo crea el caso R (1 cita y 1 pago; después 1 evento, 1
// historial y 1 auditoría): 5 filas en total, marcadas con la ejecución actual.
//
// Ejecución: pnpm c2 run webhooks test/webhooks/stripe-webhook-redelivery.wh-spec.ts --committed-fixtures wh-h5-committed

const PREVIOUS_RUN = 'c2-20261116071451-5767';
const PREVIOUS_MARK = `wh-h5-${PREVIOUS_RUN}`;
const PREVIOUS_COMPACT = PREVIOUS_RUN.replace(/-/g, '');
// Hora libre para la cita nueva: la ejecución anterior usó las horas 1 a 12 desde 2099-01-01.
const NEW_SLOT = 100;
const SECRET = newSecret();

class ManualDispatcher implements WebhookEventDispatcher {
  readonly dispatched: string[] = [];
  dispatch(id: string): void {
    this.dispatched.push(id);
  }
}

// Proveedor ficticio para el caso R: el primer getPayment falla (controlado) y los siguientes devuelven `succeeded`.
class FakeStripeProvider implements PaymentProviderPort {
  readonly name = 'stripe' as const;
  failRemaining = 1;
  calls = 0;
  constructor(private readonly target: () => CaseFixtures) {}
  async createPayment(): Promise<ProviderPaymentSnapshot> {
    throw new Error('H5-1: createPayment no debe llamarse');
  }
  async getPayment(providerPaymentId: string): Promise<ProviderPaymentSnapshot> {
    const c = this.target();
    if (providerPaymentId !== c.providerPaymentId) throw new Error('H5-1: getPayment solo para el caso R');
    this.calls += 1;
    if (this.failRemaining > 0) {
      this.failRemaining -= 1;
      throw new PaymentProviderError('unavailable', 'fallo simulado del proveedor (H5-1)');
    }
    return {
      provider: 'stripe', providerPaymentId, providerStatus: 'succeeded', status: 'succeeded', externalReference: c.paymentId,
      amount: money(20000), refunded: ZERO, providerFeeActual: money(123), netReceived: money(19877), moneyReleaseDate: new Date('2099-12-31T00:00:00.000Z'),
    };
  }
}

let caseR: CaseFixtures;
const dispatcher = new ManualDispatcher();
const provider = new FakeStripeProvider(() => caseR);
let moduleRef: TestingModule;
let receive: ReceiveProviderWebhookUseCase;
let processor: ProcessProviderWebhookEventUseCase;
const results: Record<string, string> = {};

const q = async <T>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];
const previousCase = (n: string): CaseFixtures & { requestId: string } => ({
  caseId: n,
  appointmentId: '',
  paymentId: '',
  providerPaymentId: `pi_test_whh5_${PREVIOUS_COMPACT}_${n}`,
  requestId: `evt_whh5${PREVIOUS_COMPACT}${n}1`,
});
async function loadPreviousCase(n: string) {
  const c = previousCase(n);
  const [row] = await q<{ appointment_id: string; id: string }>(sql`select id, appointment_id from payment where provider_payment_id = ${c.providerPaymentId}`);
  if (!row) throw new Error(`H5-1: no existe el caso ${n} de ${PREVIOUS_RUN}`);
  return { ...c, paymentId: row.id, appointmentId: row.appointment_id };
}
const redelivery = (c: { requestId: string; providerPaymentId: string }): RawWebhookRequest =>
  signedEvent(SECRET, { eventId: c.requestId, type: 'payment_intent.succeeded', object: { id: c.providerPaymentId, object: 'payment_intent' }, at: new Date() });
const eventRows = (requestId: string) =>
  q<{ id: string; status: string; processing_attempts: number; signature_valid: boolean; payment_id: string | null; last_error: string | null }>(sql`
    select id, status::text, processing_attempts, signature_valid, payment_id, last_error from provider_webhook_event where request_id = ${requestId}`);
const record = (id: string, fn: () => Promise<void>) => async () => {
  try {
    await fn();
    results[id] = 'PASS';
  } catch (error) {
    results[id] = 'FAIL';
    throw error;
  }
};

beforeAll(async () => {
  await verifyNeonRuntimeIdentity(async (name) => ((await db.execute(sql`select current_setting(${name}, true) as v`)).rows[0]?.v as string) ?? null);
  moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PAYMENT_PROVIDER).useValue(provider)
    .overrideProvider(WEBHOOK_EVENT_DISPATCHER).useValue(dispatcher)
    .overrideProvider(STRIPE_WEBHOOK_SETTINGS).useValue({ secret: SECRET, toleranceMs: 300_000, environment: 'test' })
    .overrideProvider(CLOCK).useValue({ now: () => new Date() })
    .compile();
  receive = moduleRef.get(ReceiveProviderWebhookUseCase);
  processor = moduleRef.get(ProcessProviderWebhookEventUseCase);
});

afterAll(async () => {
  console.log(`[H5-1] marca nueva ${MARK}; reutiliza ${PREVIOUS_MARK}; resultados ${JSON.stringify(results)}`);
  await moduleRef?.close();
});

describe('H5-1 · reentregas de webhooks de Stripe tras la corrección (PostgreSQL real, C2)', () => {
  it('[WH-PG-01] reenvío secuencial (dos veces) de un evento ya procesado: duplicate, misma fila, sin efectos', record('WH-PG-01', async () => {
    const c = await loadPreviousCase('01');
    const before = await caseState(c);
    const [event] = await eventRows(c.requestId);
    expect(event.status).toBe('processed');
    const first = await receive.execute(redelivery(c));
    const second = await receive.execute(redelivery(c));
    expect(first).toEqual({ outcome: 'duplicate', eventId: event.id });
    expect(second).toEqual({ outcome: 'duplicate', eventId: event.id });
    expect(dispatcher.dispatched).not.toContain(event.id);
    expect(await eventRows(c.requestId)).toEqual([event]);
    expect(await caseState(c)).toEqual(before);
    expect(before).toMatchObject({ appointment: 'confirmed', payments: 1, confirmed: 1, history: 1, refunds: 0 });
  }));

  it('[WH-PG-07] reenvío de un evento procesado: duplicate, sin redespacho ni cambios', record('WH-PG-07', async () => {
    const c = await loadPreviousCase('07');
    const before = await caseState(c);
    const [event] = await eventRows(c.requestId);
    const dispatchedBefore = dispatcher.dispatched.length;
    expect(await receive.execute(redelivery(c))).toEqual({ outcome: 'duplicate', eventId: event.id });
    expect(dispatcher.dispatched.length).toBe(dispatchedBefore);
    expect(await eventRows(c.requestId)).toEqual([event]);
    expect(await caseState(c)).toEqual(before);
  }));

  it('[WH-PG-02] cinco PRIMERAS entregas simultáneas de un evento nuevo: 1 accepted, 4 duplicate, 1 fila, sin errores', record('WH-PG-02', async () => {
    const [patient] = await q<{ id: string }>(sql`
      select pp.id from patient_profile pp join user_profile up on up.id = pp.user_profile_id where up.user_id = ${`${PREVIOUS_MARK}-patient`}`);
    const [doctor] = await q<{ id: string }>(sql`
      select dp.id from doctor_profile dp join user_profile up on up.id = dp.user_profile_id where up.user_id = ${`${PREVIOUS_MARK}-doctor`}`);
    const [ref] = await q<{ policy: string; fee: string; schedule: string }>(sql`
      select a.cancellation_policy_id as policy, p.pei_fee_configuration_id as fee, p.processor_fee_schedule_id as schedule
      from payment p join appointment a on a.id = p.appointment_id where p.provider_payment_id = ${`pi_test_whh5_${PREVIOUS_COMPACT}_01`}`);
    const base: BaseFixtures = { adminProfileId: '', patientProfileId: patient.id, doctorProfileId: doctor.id, policyId: ref.policy, peiFeeId: ref.fee, scheduleId: ref.schedule };
    caseR = await createCase(base, 'R', NEW_SLOT);
    const req = signedEvent(SECRET, { eventId: eventId('R'), type: 'payment_intent.succeeded', object: { id: caseR.providerPaymentId, object: 'payment_intent' }, at: new Date() });
    const outcomes = await Promise.allSettled(Array.from({ length: 5 }, () => receive.execute(req)));
    const rejected = outcomes.filter((o) => o.status === 'rejected') as PromiseRejectedResult[];
    if (rejected.length) console.log(`[H5-1] WH-PG-02 rechazos: ${rejected.map((r) => (r.reason as Error)?.message?.slice(0, 120)).join(' | ')}`);
    expect(rejected).toHaveLength(0); // sin error: el controlador respondería 200 en las cinco entregas
    const values = (outcomes as PromiseFulfilledResult<{ outcome: string; eventId: string }>[]).map((o) => o.value);
    expect(values.filter((v) => v.outcome === 'accepted')).toHaveLength(1);
    expect(values.filter((v) => v.outcome === 'duplicate')).toHaveLength(4);
    expect(new Set(values.map((v) => v.eventId)).size).toBe(1);
    const rows = await eventRows(eventId('R'));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'received', processing_attempts: 0, signature_valid: true });
    // Una sola entrega se despachó (la aceptada); las duplicadas de un evento `received` se redespachan, sin procesarse.
    expect(dispatcher.dispatched.filter((id) => id === rows[0].id).length).toBeGreaterThanOrEqual(1);
    const s = await caseState(caseR);
    expect(s).toMatchObject({ appointment: 'pending_payment', payments: 1, history: 0, confirmed: 0, refunds: 0 });
    expect(s.payment.status).toBe('processing');
  }));

  it('[WH-PG-08] primer procesamiento fallido, segunda entrega reconocida y redespachada, termina processed una vez', record('WH-PG-08', async () => {
    const [row] = await eventRows(eventId('R'));
    const first = await processor.execute(row.id);
    expect(first).toMatchObject({ outcome: 'failed', reason: 'provider:unavailable' });
    expect((await eventRows(eventId('R')))[0]).toMatchObject({ status: 'failed', processing_attempts: 1, last_error: 'provider:unavailable' });
    expect((await caseState(caseR)).appointment).toBe('pending_payment');
    const dispatchedBefore = dispatcher.dispatched.length;
    const again = await receive.execute(signedEvent(SECRET, { eventId: eventId('R'), type: 'payment_intent.succeeded', object: { id: caseR.providerPaymentId, object: 'payment_intent' }, at: new Date() }));
    expect(again).toEqual({ outcome: 'duplicate', eventId: row.id });
    expect(dispatcher.dispatched.length).toBe(dispatchedBefore + 1);
    expect(dispatcher.dispatched[dispatcher.dispatched.length - 1]).toBe(row.id);
    const second = await processor.execute(row.id);
    expect(second).toMatchObject({ outcome: 'processed', paymentChanged: true });
    const [final] = await eventRows(eventId('R'));
    expect(final).toMatchObject({ status: 'processed', processing_attempts: 2, last_error: null, payment_id: caseR.paymentId });
    const s = await caseState(caseR);
    expect(s).toMatchObject({ appointment: 'confirmed', payments: 1, confirmed: 1, history: 1, refunds: 0 });
    expect(s.payment).toMatchObject({ status: 'succeeded', provider_fee_actual: '1.23', net_received_amount: '198.77' });
    expect(s.events).toHaveLength(1);
    expect(provider.calls).toBe(2);
  }));
});
