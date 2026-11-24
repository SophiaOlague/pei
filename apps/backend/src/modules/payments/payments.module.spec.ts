import { Global, Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CLOCK } from '../../common/application/ports/clock';
import { UNIT_OF_WORK } from '../../common/application/ports/unit-of-work';
import { ACTOR_PROFILE_READER } from '../../auth/ports/actor-profile-reader';
import { SESSION_PROVIDER } from '../../auth/ports/session-provider';
import { AppointmentConfirmationService } from '../appointments/application/integration/appointment-integration.services';
import { AppointmentsModule } from '../appointments/appointments.module';
import { OutcomeRecordedFeedService } from '../appointments/application/integration/outcome-recorded-feed';
import { AppointmentEventSubscribers } from '../appointments/application/appointment-events';
import { CanceledAppointmentFeedService } from '../appointments/application/integration/canceled-appointment-feed';
import { ReconcileCanceledAppointmentRefundsUseCase } from './application/use-cases/reconcile-canceled-appointment-refunds.use-case';
import { AppointmentChainService, RootResolvingPaymentLedger } from '../appointments/application/integration/appointment-chain.services';
import { SyncAppointmentPaymentUseCase } from './application/use-cases/sync-appointment-payment.use-case';
import { DrizzleRootPaymentLookup } from './infrastructure/persistence/drizzle-root-payment-lookup';
import { PatientPaymentsController } from './presentation/patient-payments.controller';
import { PayAppointmentUseCase } from './application/use-cases/pay-appointment.use-case';
import { PAYMENT_PROVIDER, PaymentProviderError, type PaymentProviderPort } from './application/ports/payment-provider.port';
import {
  IDEMPOTENCY_KEY_REPOSITORY,
  PAYMENT_ID_GENERATOR,
  PAYMENT_REPOSITORY,
  PEI_FEE_CONFIGURATION_REPOSITORY,
  PROCESSOR_FEE_SCHEDULE_REPOSITORY,
} from './application/ports/payments.repositories';
import { PaymentsUseCases } from './application/use-cases/payments.use-cases';
import { StripeConfigError } from './infrastructure/stripe/stripe.config';
import { StripePaymentProvider } from './infrastructure/stripe/stripe-payment-provider';
import { StripeWebhookAuthenticator, UnconfiguredStripeWebhookAuthenticator } from './infrastructure/stripe/stripe-webhook-authenticator';
import { StripeWebhookController } from './presentation/stripe-webhook.controller';
import { MEDICATION_ORDER_PAYMENT_READER } from './application/ports/medication-order-payment.reader';
import { PayMedicationOrderUseCase, SyncMedicationOrderPaymentUseCase } from './application/use-cases/pay-medication-order.use-case';
import { DrizzleMedicationOrderPaymentReader } from './infrastructure/persistence/drizzle-medication-order-payment.reader';
import {
  DrizzleIdempotencyKeyRepository,
  DrizzlePaymentRepository,
  DrizzlePeiFeeConfigurationRepository,
  DrizzleProcessorFeeScheduleRepository,
} from './infrastructure/persistence/drizzle-payments.repositories';
import { UnconfiguredPaymentProvider } from './infrastructure/unconfigured-payment-provider';
import * as paymentsModuleExports from './payments.module';
import { PAYMENT_LEDGER, PaymentsModule, randomPaymentIds, ROOT_PAYMENT_LOOKUP, STRIPE_FETCH, STRIPE_SETTINGS, STRIPE_WEBHOOK_SETTINGS, WEBHOOK_RETRY_LOCK, WEBHOOK_RETRY_WORKER_CONFIG } from './payments.module';
import { PAYMENT_LOCK_REPOSITORY } from './application/ports/payments.repositories';
import { PROVIDER_WEBHOOK_AUTHENTICATOR, PROVIDER_WEBHOOK_EVENT_REPOSITORY, WEBHOOK_EVENT_DISPATCHER, WebhookAuthenticationError, type ProviderWebhookAuthenticator } from './application/ports/provider-webhook.port';
import { ProcessProviderWebhookEventUseCase, ReceiveProviderWebhookUseCase, RetryProviderWebhookEventsUseCase } from './application/use-cases/provider-webhook.use-cases';
import { InProcessWebhookDispatcher } from './infrastructure/in-process-webhook-dispatcher';
import { AdminRefundsController } from './presentation/admin-refunds.controller';
import { PgAdvisoryXactLock, WebhookRetryWorker } from './infrastructure/webhook-retry.worker';
import { AUDIT_TRAIL } from '../audit/application/ports/audit-trail';
import { DrizzleWebhookEventRepository } from './infrastructure/persistence/drizzle-webhook-events.repository';
import { REFUND_PROVIDER, REFUND_REPOSITORY } from './application/ports/refunds.port';
import { RefundsUseCases } from './application/use-cases/refunds.use-cases';
import { AppointmentCanceledRefundHandler } from './application/use-cases/appointment-canceled-refund.handler';
import { DrizzleRefundRepository } from './infrastructure/persistence/drizzle-refunds.repository';

// Construcción del módulo sin base de datos ni red: la unidad de trabajo y el reloj son dobles (en la aplicación los
// aporta el CommonModule global), el `fetch` es falso y los tokens son sintéticos. Construir los repositorios Drizzle no
// abre conexiones (solo consultan al usarse; db-tripwire bloquearía cualquier intento).
// Claves SINTÉTICAS con el formato de Stripe (armadas por partes: no son credenciales de ninguna cuenta).
const SANDBOX_TOKEN = ['sk', 'test', 'sintetica3333333333'].join('_');
const PROD_TOKEN = ['sk', 'live', 'sintetica4444444444'].join('_');
const PI = 'pi_sintetico000123';

@Global()
@Module({
  providers: [
    { provide: UNIT_OF_WORK, useValue: { runInTransaction: (work: () => Promise<unknown>) => work() } },
    { provide: CLOCK, useValue: { now: () => new Date('2026-11-11T12:00:00Z') } },
    // F4: dependencias de SessionGuard (en la aplicación las aporta el AuthModule global).
    { provide: SESSION_PROVIDER, useValue: { getSession: jest.fn() } },
    { provide: ACTOR_PROFILE_READER, useValue: { read: jest.fn() } },
    // H-7: AuditTrail (en la aplicación lo aporta el AuditModule global).
    { provide: AUDIT_TRAIL, useValue: { record: jest.fn() } },
  ],
  exports: [UNIT_OF_WORK, CLOCK, SESSION_PROVIDER, ACTOR_PROFILE_READER, AUDIT_TRAIL],
})
class FakeCommonModule {}

// F3.1: AppointmentsModule se sustituye por un doble que solo aporta AppointmentConfirmationService.
@Module({
  providers: [
    { provide: AppointmentConfirmationService, useValue: { confirmPaid: jest.fn() } },
    { provide: AppointmentChainService, useValue: { rootOf: jest.fn() } },
    // F5: suscripción a AppointmentCanceled (la clase real: en memoria, sin dependencias).
    AppointmentEventSubscribers,
    // A.25: consulta duradera de cancelaciones (doble).
    { provide: CanceledAppointmentFeedService, useValue: { listCanceled: jest.fn() } },
    // Videoconsulta: consulta duradera de resultados (doble).
    { provide: OutcomeRecordedFeedService, useValue: { listOutcomes: jest.fn() } },
  ],
  exports: [AppointmentConfirmationService, AppointmentChainService, AppointmentEventSubscribers, CanceledAppointmentFeedService, OutcomeRecordedFeedService],
})
class FakeAppointmentsModule {}

function fakeFetch() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({
      id: PI, object: 'payment_intent', livemode: false, status: 'succeeded', currency: 'mxn', amount: 1000, metadata: { pei_payment_id: 'ref' },
      latest_charge: { id: 'ch_1', amount_refunded: 0, disputed: false, balance_transaction: { fee: 50, net: 950, currency: 'mxn', available_on: 1794800000 } },
    }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

async function build(settings: unknown, fetchFn: typeof fetch = fakeFetch().fn) {
  return Test.createTestingModule({ imports: [FakeCommonModule, PaymentsModule] })
    .overrideModule(AppointmentsModule).useModule(FakeAppointmentsModule)
    .overrideProvider(STRIPE_SETTINGS).useValue(settings)
    .overrideProvider(STRIPE_FETCH).useValue(fetchFn)
    .compile();
}

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
const NO_MP = { STRIPE_ENV: undefined, STRIPE_SECRET_KEY: undefined, STRIPE_ALLOW_LIVE: undefined };

describe('PaymentsModule', () => {
  let logs: string[];
  // Aislamiento del .env local (lo carga dotenv al importar la base de datos): ninguna variable STRIPE_* del equipo
  // interviene en estas pruebas; cada una define las suyas con withEnv.
  const savedStripeEnv: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const k of Object.keys(process.env).filter((name) => name.startsWith('STRIPE_'))) {
      savedStripeEnv[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(savedStripeEnv)) process.env[k] = v;
  });
  beforeEach(() => {
    logs = [];
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logs.push(String(args[0]));
      });
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('resuelve PaymentsUseCases y registra los repositorios Drizzle, el generador de ids y el adaptador', async () => {
    const m = await build({ environment: 'test', secretKey: SANDBOX_TOKEN });
    expect(m.get(PaymentsUseCases)).toBeInstanceOf(PaymentsUseCases);
    expect(m.get(PayAppointmentUseCase)).toBeInstanceOf(PayAppointmentUseCase);
    expect(m.get(SyncAppointmentPaymentUseCase)).toBeInstanceOf(SyncAppointmentPaymentUseCase);
    expect(m.get(ROOT_PAYMENT_LOOKUP)).toBeInstanceOf(DrizzleRootPaymentLookup);
    expect(m.get(PAYMENT_LEDGER)).toBeInstanceOf(RootResolvingPaymentLedger);
    expect(m.get(PAYMENT_REPOSITORY)).toBeInstanceOf(DrizzlePaymentRepository);
    expect(m.get(IDEMPOTENCY_KEY_REPOSITORY)).toBeInstanceOf(DrizzleIdempotencyKeyRepository);
    expect(m.get(PEI_FEE_CONFIGURATION_REPOSITORY)).toBeInstanceOf(DrizzlePeiFeeConfigurationRepository);
    expect(m.get(PROCESSOR_FEE_SCHEDULE_REPOSITORY)).toBeInstanceOf(DrizzleProcessorFeeScheduleRepository);
    expect(m.get(PAYMENT_ID_GENERATOR)).toBe(randomPaymentIds);
    expect(m.get(PAYMENT_PROVIDER)).toBeInstanceOf(StripePaymentProvider);
    expect(m.get<PaymentProviderPort>(PAYMENT_PROVIDER).name).toBe('stripe');
    expect(m.get(PayMedicationOrderUseCase)).toBeInstanceOf(PayMedicationOrderUseCase);
    expect(m.get(SyncMedicationOrderPaymentUseCase)).toBeInstanceOf(SyncMedicationOrderPaymentUseCase);
    expect(m.get(MEDICATION_ORDER_PAYMENT_READER)).toBeInstanceOf(DrizzleMedicationOrderPaymentReader);
    expect(randomPaymentIds.newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('el adaptador inyectado usa el fetch falso y el token configurado, sin registrarlo', async () => {
    const f = fakeFetch();
    const m = await build({ environment: 'test', secretKey: SANDBOX_TOKEN }, f.fn);
    const provider = m.get<PaymentProviderPort>(PAYMENT_PROVIDER);
    const snapshot = await provider.getPayment(PI);
    expect(snapshot).toMatchObject({ provider: 'stripe', providerPaymentId: PI, status: 'succeeded' });
    expect(f.calls).toHaveLength(1);
    expect((f.calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SANDBOX_TOKEN}`);
    expect(logs).toContain('Stripe configurado (test)');
    expect(logs.join('\n')).not.toContain(SANDBOX_TOKEN);
  });

  it('sin configuración: arranca con un proveedor que falla cerrado (no reintentable)', async () => {
    const m = await build(null);
    const provider = m.get<PaymentProviderPort>(PAYMENT_PROVIDER);
    expect(provider).toBeInstanceOf(UnconfiguredPaymentProvider);
    // Aun sin configurar, el proveedor es Stripe: nunca se vuelve a Mercado Pago por omisión.
    expect(provider.name).toBe('stripe');
    for (const call of [() => provider.getPayment('1'), () => provider.createPayment({} as never)]) {
      const e = await Promise.resolve().then(call).then(() => null, (err: unknown) => err as PaymentProviderError);
      expect(e).toBeInstanceOf(PaymentProviderError);
      expect(e!.kind).toBe('unauthorized');
      expect(e!.retryable).toBe(false);
    }
    expect(logs.some((l) => /no configurado/.test(l))).toBe(true);
  });

  it('la configuración se lee del entorno al construir el módulo: modo de prueba válido', async () => {
    await withEnv({ ...NO_MP, STRIPE_ENV: 'test', STRIPE_SECRET_KEY: SANDBOX_TOKEN }, async () => {
      const m = await Test.createTestingModule({ imports: [FakeCommonModule, PaymentsModule] }).overrideModule(AppointmentsModule).useModule(FakeAppointmentsModule).overrideProvider(STRIPE_FETCH).useValue(fakeFetch().fn).compile();
      expect(m.get(STRIPE_SETTINGS)).toEqual({ environment: 'test', secretKey: SANDBOX_TOKEN });
    });
  });

  it.each([
    ['configuración incompleta', { ...NO_MP, STRIPE_ENV: 'test' }],
    ['clave sin formato de Stripe', { ...NO_MP, STRIPE_ENV: 'test', STRIPE_SECRET_KEY: 'token-desconocido-4444444444' }],
    ['clave real con STRIPE_ENV=test', { ...NO_MP, STRIPE_ENV: 'test', STRIPE_SECRET_KEY: PROD_TOKEN }],
    ['modo real sin permiso explícito', { ...NO_MP, STRIPE_ENV: 'live', STRIPE_SECRET_KEY: PROD_TOKEN }],
    ['modo real durante las pruebas', { ...NO_MP, STRIPE_ENV: 'live', STRIPE_SECRET_KEY: PROD_TOKEN, STRIPE_ALLOW_LIVE: 'true' }],
  ])('%s: el módulo no arranca y el error no contiene el token', async (_n, env) => {
    await withEnv(env, async () => {
      const error = await Test.createTestingModule({ imports: [FakeCommonModule, PaymentsModule] }).overrideModule(AppointmentsModule).useModule(FakeAppointmentsModule).compile().then(() => null, (e: unknown) => e as Error);
      expect(error).toBeInstanceOf(StripeConfigError);
      expect(error!.message).not.toContain(PROD_TOKEN);
      expect(error!.message).not.toContain(SANDBOX_TOKEN);
      expect(JSON.stringify(error)).not.toContain(PROD_TOKEN);
      expect(logs.join('\n')).not.toMatch(/4444444444|3333333333/);
    });
  });

  it('exporta solo los casos de uso (ambos checkouts) e importa AppointmentsModule', () => {
    const exported = Reflect.getMetadata('exports', PaymentsModule) as unknown[];
    expect(exported).toEqual([PaymentsUseCases, PayAppointmentUseCase, SyncAppointmentPaymentUseCase, PayMedicationOrderUseCase, PAYMENT_LEDGER]);
    expect(Reflect.getMetadata('imports', PaymentsModule)).toEqual([AppointmentsModule]);
    expect(Reflect.getMetadata('controllers', PaymentsModule)).toEqual([PatientPaymentsController, StripeWebhookController, AdminRefundsController]);
  });

  // Mercado Pago queda desactivado (su código se conserva): el módulo no registra su controlador, no expone sus tokens
  // de configuración y no lee sus variables de entorno, ni siquiera cuando están definidas.
  it('Mercado Pago está desactivado: sin controlador, sin tokens de configuración y sin leer MERCADO_PAGO_*', async () => {
    const controllers = (Reflect.getMetadata('controllers', PaymentsModule) as { name: string }[]).map((c) => c.name);
    expect(controllers).not.toContain('MercadoPagoWebhookController');
    expect(Object.keys(paymentsModuleExports).filter((k) => /MERCADO_PAGO/i.test(k))).toEqual([]);
    await withEnv({ ...NO_MP, MERCADO_PAGO_ENV: 'sandbox', MERCADO_PAGO_ACCESS_TOKEN: 'TEST-3333333333333333-333333-sintetico', MERCADO_PAGO_WEBHOOK_SECRET: 'clave-secreta-webhook-sintetica-5555' }, async () => {
      const m = await Test.createTestingModule({ imports: [FakeCommonModule, PaymentsModule] }).overrideModule(AppointmentsModule).useModule(FakeAppointmentsModule).compile();
      const provider = m.get<PaymentProviderPort>(PAYMENT_PROVIDER);
      expect(provider).toBeInstanceOf(UnconfiguredPaymentProvider);
      expect(provider.name).toBe('stripe');
      expect(m.get(STRIPE_SETTINGS)).toBeNull();
      expect(logs.join('\n')).not.toMatch(/Mercado Pago/);
    });
  });

  // F5: reembolsos.
  it('registra los reembolsos: casos de uso, repositorio Drizzle, el adaptador como proveedor de reembolsos y la suscripción a AppointmentCanceled', async () => {
    const m = await build({ environment: 'test', secretKey: SANDBOX_TOKEN });
    expect(m.get(RefundsUseCases)).toBeInstanceOf(RefundsUseCases);
    expect(m.get(REFUND_REPOSITORY)).toBeInstanceOf(DrizzleRefundRepository);
    expect(m.get(REFUND_PROVIDER)).toBe(m.get(PAYMENT_PROVIDER));
    expect(m.get(AppointmentCanceledRefundHandler)).toBeInstanceOf(AppointmentCanceledRefundHandler);
    expect(m.get(ReconcileCanceledAppointmentRefundsUseCase)).toBeInstanceOf(ReconcileCanceledAppointmentRefundsUseCase);
    const subscribers = m.get(AppointmentEventSubscribers);
    const spy = jest.spyOn(m.get(AppointmentCanceledRefundHandler), 'handle').mockResolvedValue({ outcome: 'no_refund' });
    await m.init(); // onModuleInit: suscripción
    await subscribers.dispatch({ type: 'AppointmentCanceled', appointmentId: 'a', patientProfileId: 'p', doctorProfileId: 'd', occurredAt: '', canceledBy: 'patient', reason: null, refundOutcome: 'no_refund' });
    expect(spy).toHaveBeenCalledTimes(1);
    await m.close();
  });

  // F3.3: webhooks.
  it('registra los webhooks: casos de uso, repositorio Drizzle, despachador en proceso y bloqueo con el mismo repositorio', async () => {
    const m = await build({ environment: 'test', secretKey: SANDBOX_TOKEN });
    expect(m.get(ReceiveProviderWebhookUseCase)).toBeInstanceOf(ReceiveProviderWebhookUseCase);
    expect(m.get(ProcessProviderWebhookEventUseCase)).toBeInstanceOf(ProcessProviderWebhookEventUseCase);
    expect(m.get(RetryProviderWebhookEventsUseCase)).toBeInstanceOf(RetryProviderWebhookEventsUseCase);
    expect(m.get(PROVIDER_WEBHOOK_EVENT_REPOSITORY)).toBeInstanceOf(DrizzleWebhookEventRepository);
    expect(m.get(WEBHOOK_EVENT_DISPATCHER)).toBeInstanceOf(InProcessWebhookDispatcher);
    expect(m.get(PAYMENT_LOCK_REPOSITORY)).toBe(m.get(PAYMENT_REPOSITORY));
  });

  // H-6, etapa 1: el worker periódico se registra DESACTIVADO por defecto y no sustituye al despacho inmediato.
  it('[H6-MOD-01] registra el worker de recuperación desactivado por defecto; la vía rápida sigue siendo el despacho en proceso', async () => {
    await withEnv({ PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED: undefined, PAYMENTS_WEBHOOK_RETRY_INTERVAL_SECONDS: undefined }, async () => {
      const m = await build({ environment: 'test', secretKey: SANDBOX_TOKEN });
      const worker = m.get(WebhookRetryWorker);
      expect(worker).toBeInstanceOf(WebhookRetryWorker);
      expect(m.get(WEBHOOK_RETRY_WORKER_CONFIG)).toEqual({ enabled: false, intervalMs: 60_000 });
      expect(m.get(WEBHOOK_RETRY_LOCK)).toBeInstanceOf(PgAdvisoryXactLock);
      expect(m.get(WEBHOOK_EVENT_DISPATCHER)).toBeInstanceOf(InProcessWebhookDispatcher);
      await m.init();
      expect(worker.running).toBe(false);
      expect(logs.some((l) => /recuperación de webhooks desactivado/.test(l))).toBe(true);
      await m.close();
    });
  });

  it('[H6-MOD-02] una configuración inválida del worker detiene el arranque', async () => {
    await withEnv({ PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED: 'si' }, async () => {
      await expect(build({ environment: 'test', secretKey: SANDBOX_TOKEN })).rejects.toThrow(/PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED solo admite true o false/);
    });
  });

  it('sin clave secreta de webhooks: el autenticador rechaza todo (falla cerrada)', async () => {
    await withEnv({ STRIPE_WEBHOOK_SECRET: undefined, STRIPE_WEBHOOK_TOLERANCE_SECONDS: undefined }, async () => {
      const m = await build(null);
      const auth = m.get<ProviderWebhookAuthenticator>(PROVIDER_WEBHOOK_AUTHENTICATOR);
      expect(auth).toBeInstanceOf(UnconfiguredStripeWebhookAuthenticator);
      expect(() => auth.authenticate({ url: '/', headers: {}, body: {} })).toThrow(WebhookAuthenticationError);
      expect(logs.some((l) => /sin secreto de firma/.test(l))).toBe(true);
    });
  });

  it('con secreto de firma en el entorno usa el autenticador de Stripe (tolerancia de 300 s) y no registra el secreto', async () => {
    const secret = ['whsec', 'sintetico5555555555'].join('_');
    await withEnv({ ...NO_MP, STRIPE_WEBHOOK_SECRET: secret, STRIPE_WEBHOOK_TOLERANCE_SECONDS: undefined }, async () => {
      const m = await build(null);
      expect(m.get(STRIPE_WEBHOOK_SETTINGS)).toEqual({ secret, toleranceMs: 300_000, environment: null });
      expect(m.get(PROVIDER_WEBHOOK_AUTHENTICATOR)).toBeInstanceOf(StripeWebhookAuthenticator);
      expect(logs.join(' ')).not.toContain(secret);
    });
  });
});
