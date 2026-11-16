import { Test, type TestingModule } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { assertC2BranchTarget } from '../support/c2-target-guard';
import { verifyNeonRuntimeIdentity } from '../support/c2-target-guard';
import { db } from '../../src/db';
import { AppModule } from '../../src/app.module';
import { CLOCK } from '../../src/common/application/ports/clock';
import { money, ZERO } from '../../src/modules/payments/domain/money';
import { PAYMENT_PROVIDER, type PaymentProviderPort, type ProviderPaymentSnapshot } from '../../src/modules/payments/application/ports/payment-provider.port';
import {
  PROVIDER_WEBHOOK_EVENT_REPOSITORY,
  WEBHOOK_EVENT_DISPATCHER,
  type WebhookEventDispatcher,
  type WebhookEventRepository,
} from '../../src/modules/payments/application/ports/provider-webhook.port';
import { ReceiveProviderWebhookUseCase, WEBHOOK_MAX_ATTEMPTS } from '../../src/modules/payments/application/use-cases/provider-webhook.use-cases';
import { PgAdvisoryXactLock, WebhookRetryWorker } from '../../src/modules/payments/infrastructure/webhook-retry.worker';
import { STRIPE_WEBHOOK_SETTINGS, WEBHOOK_RETRY_WORKER_CONFIG } from '../../src/modules/payments/payments.module';
import { caseState, createCase, eventId, MARK, newSecret, signedEvent, type BaseFixtures, type CaseFixtures } from '../support/payments-webhook-fixtures';

// Salvaguarda de destino: solo C2, modo `webhooks`, conexión directa y la marca de datos confirmados de H-5.
assertC2BranchTarget();

// H-6, etapa 1 · Prueba controlada del worker de recuperación en PostgreSQL real (C2), autorizada el 2026-11-16.
//
// Un evento sintético queda `received` sin procesar (el despachador manual simula que el proceso cayó tras responder
// 200). Al arrancar la aplicación con el worker activado, su ejecución inicial lo recupera SIN llamar al CLI ni al caso
// de uso de reintento a mano. Además, el candado consultivo real impide un segundo barrido simultáneo.
//
// Reutiliza la ejecución c2-20261116071451-5767 (paciente, médico, política, comisión y tarifa sintéticas). Crea solo el
// caso W: 1 cita y 1 pago; después 1 evento, 1 historial y 1 auditoría (5 filas), marcadas con la ejecución actual.
// Antes de activar el worker comprueba que el único evento recuperable de C2 es el suyo: no toca eventos ajenos.
//
// Ejecución: pnpm c2 run webhooks test/webhooks/stripe-webhook-retry-worker.wh-spec.ts --committed-fixtures wh-h5-committed

const PREVIOUS_RUN = 'c2-20261116071451-5767';
const PREVIOUS_MARK = `wh-h5-${PREVIOUS_RUN}`;
const PREVIOUS_COMPACT = PREVIOUS_RUN.replace(/-/g, '');
const NEW_SLOT = 101;
const SECRET = newSecret();

const clock = { offsetMs: 0, now: () => new Date(Date.now() + clock.offsetMs) };
class ManualDispatcher implements WebhookEventDispatcher {
  readonly dispatched: string[] = [];
  dispatch(id: string): void {
    this.dispatched.push(id);
  }
}
let caseW: CaseFixtures;
const provider: PaymentProviderPort & { calls: number } = {
  name: 'stripe',
  calls: 0,
  async createPayment(): Promise<ProviderPaymentSnapshot> {
    throw new Error('H-6: createPayment no debe llamarse');
  },
  async getPayment(providerPaymentId: string): Promise<ProviderPaymentSnapshot> {
    if (providerPaymentId !== caseW?.providerPaymentId) throw new Error('H-6: getPayment solo para el caso W');
    provider.calls += 1;
    return {
      provider: 'stripe', providerPaymentId, providerStatus: 'succeeded', status: 'succeeded', externalReference: caseW.paymentId,
      amount: money(20000), refunded: ZERO, providerFeeActual: money(123), netReceived: money(19877), moneyReleaseDate: new Date('2099-12-31T00:00:00.000Z'),
    };
  },
};
const dispatcher = new ManualDispatcher();
let moduleRef: TestingModule;
const results: Record<string, string> = {};
const q = async <T>(query: ReturnType<typeof sql>) => (await db.execute(query)).rows as T[];
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
    .overrideProvider(CLOCK).useValue(clock)
    // Activado SOLO en este proceso de prueba; intervalo corto para no esperar 60 s.
    .overrideProvider(WEBHOOK_RETRY_WORKER_CONFIG).useValue({ enabled: true, intervalMs: 5_000 })
    .compile();
  // Sin init(): el worker aún no arranca.
});

afterAll(async () => {
  console.log(`[H-6] marca nueva ${MARK}; reutiliza ${PREVIOUS_MARK}; resultados ${JSON.stringify(results)}`);
  await moduleRef?.close();
});

describe('H-6 etapa 1 · worker de recuperación en PostgreSQL real (C2)', () => {
  it('[H6-PG-01] el candado consultivo real impide un segundo barrido simultáneo (sin escrituras)', record('H6-PG-01', async () => {
    const a = new PgAdvisoryXactLock(db.$client);
    const b = new PgAdvisoryXactLock(db.$client);
    const outer = await a.runExclusive(async () => b.runExclusive(async () => 'no debe ejecutarse'));
    expect(outer).toEqual({ acquired: true, value: { acquired: false } });
    // Liberado al terminar: otra instancia ya puede tomarlo.
    expect(await b.runExclusive(async () => 'ok')).toEqual({ acquired: true, value: 'ok' });
  }));

  it('[H6-PG-02] un evento `received` abandonado se recupera con la ejecución inicial del worker, sin CLI', record('H6-PG-02', async () => {
    const [patient] = await q<{ id: string }>(sql`
      select pp.id from patient_profile pp join user_profile up on up.id = pp.user_profile_id where up.user_id = ${`${PREVIOUS_MARK}-patient`}`);
    const [doctor] = await q<{ id: string }>(sql`
      select dp.id from doctor_profile dp join user_profile up on up.id = dp.user_profile_id where up.user_id = ${`${PREVIOUS_MARK}-doctor`}`);
    const [ref] = await q<{ policy: string; fee: string; schedule: string }>(sql`
      select a.cancellation_policy_id as policy, p.pei_fee_configuration_id as fee, p.processor_fee_schedule_id as schedule
      from payment p join appointment a on a.id = p.appointment_id where p.provider_payment_id = ${`pi_test_whh5_${PREVIOUS_COMPACT}_01`}`);
    const base: BaseFixtures = { adminProfileId: '', patientProfileId: patient.id, doctorProfileId: doctor.id, policyId: ref.policy, peiFeeId: ref.fee, scheduleId: ref.schedule };
    caseW = await createCase(base, 'W', NEW_SLOT);

    // Recepción real; el despachador manual no procesa (simula la caída tras el 200).
    const receive = moduleRef.get(ReceiveProviderWebhookUseCase);
    const { outcome, eventId: id } = await receive.execute(
      signedEvent(SECRET, { eventId: eventId('W'), type: 'payment_intent.succeeded', object: { id: caseW.providerPaymentId, object: 'payment_intent' }, at: clock.now() }),
    );
    expect(outcome).toBe('accepted');
    expect(dispatcher.dispatched).toEqual([id]);
    expect((await caseState(caseW)).events).toEqual([expect.objectContaining({ status: 'received', processing_attempts: 0 })]);

    // El evento queda "abandonado": más de 60 s después (reloj desplazado). Salvaguarda: el ÚNICO recuperable de C2 es este.
    clock.offsetMs = 120_000;
    const events = moduleRef.get<WebhookEventRepository>(PROVIDER_WEBHOOK_EVENT_REPOSITORY);
    const retryable = await events.findRetryable({
      maxAttempts: WEBHOOK_MAX_ATTEMPTS, receivedBefore: new Date(clock.now().getTime() - 60_000),
      processingReceivedBefore: new Date(clock.now().getTime() - 15 * 60_000), limit: 50,
    });
    expect(retryable).toEqual([id]);

    // Arranque: onApplicationBootstrap activa el worker y su ejecución inicial lo recupera.
    const worker = moduleRef.get(WebhookRetryWorker);
    await moduleRef.init();
    expect(worker.running).toBe(true);
    let state = await caseState(caseW);
    for (let i = 0; i < 100 && state.events[0]?.status !== 'processed'; i++) {
      await new Promise((r) => setTimeout(r, 200));
      state = await caseState(caseW);
    }
    expect(state.events).toEqual([expect.objectContaining({ status: 'processed', processing_attempts: 1, last_error: null, payment_id: caseW.paymentId, signature_valid: true })]);
    expect(state).toMatchObject({ appointment: 'confirmed', payments: 1, confirmed: 1, history: 1, refunds: 0 });
    expect(state.payment).toMatchObject({ status: 'succeeded', provider_fee_actual: '1.23', net_received_amount: '198.77' });
    expect(provider.calls).toBe(1);
    // La vía rápida no procesó nada: el despachador solo registró la entrega inicial.
    expect(dispatcher.dispatched).toEqual([id]);

    // Un turno posterior no lo vuelve a tocar.
    const tick = await worker.tick();
    expect(['completed', 'busy']).toContain(tick.status);
    expect((await caseState(caseW)).events).toEqual([expect.objectContaining({ status: 'processed', processing_attempts: 1 })]);

    // Apagado ordenado.
    await worker.beforeApplicationShutdown();
    expect(worker.running).toBe(false);
    expect(await worker.tick()).toEqual({ status: 'stopped' });
  }));
});
