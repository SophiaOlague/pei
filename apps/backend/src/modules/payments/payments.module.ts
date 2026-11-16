import { randomUUID } from 'crypto';
import { Logger, Module } from '@nestjs/common';
import { CLOCK, type Clock } from '../../common/application/ports/clock';
import { UNIT_OF_WORK, type UnitOfWork } from '../../common/application/ports/unit-of-work';
import { AppointmentConfirmationService } from '../appointments/application/integration/appointment-integration.services';
import { AppointmentChainService, RootResolvingPaymentLedger, type RootPaymentLookup } from '../appointments/application/integration/appointment-chain.services';
import { AppointmentsModule } from '../appointments/appointments.module';
import { APPOINTMENT_PAYMENT_READER, type AppointmentPaymentReader } from './application/ports/appointment-payment.reader';
import { PAYMENT_PROVIDER, type PaymentProviderPort } from './application/ports/payment-provider.port';
import {
  FEE_RECONCILIATION_READER,
  IDEMPOTENCY_KEY_REPOSITORY,
  PAYMENT_ID_GENERATOR,
  PAYMENT_LOCK_REPOSITORY,
  PAYMENT_REPOSITORY,
  PEI_FEE_CONFIGURATION_REPOSITORY,
  PROCESSOR_FEE_SCHEDULE_REPOSITORY,
  type FeeReconciliationReader,
  type IdempotencyKeyRepository,
  type PaymentIdGenerator,
  type PaymentLockRepository,
  type PaymentRepository,
  type PeiFeeConfigurationRepository,
  type ProcessorFeeScheduleRepository,
} from './application/ports/payments.repositories';
import { PaymentsUseCases } from './application/use-cases/payments.use-cases';
import { PayAppointmentUseCase } from './application/use-cases/pay-appointment.use-case';
import { SyncAppointmentPaymentUseCase } from './application/use-cases/sync-appointment-payment.use-case';
import { DrizzleRootPaymentLookup } from './infrastructure/persistence/drizzle-root-payment-lookup';
import { PATIENT_PROFILE_READER } from './application/ports/patient-profile.reader';
import { DrizzlePatientProfileReader } from './infrastructure/persistence/drizzle-patient-profile.reader';
import { PatientPaymentsController } from './presentation/patient-payments.controller';
import { DrizzleAppointmentPaymentReader } from './infrastructure/persistence/drizzle-appointment-payment.reader';
import { describeStripeConfig, describeStripeWebhookConfig, loadStripeConfig, loadStripeWebhookConfig, type StripeSettings, type StripeWebhookSettings } from './infrastructure/stripe/stripe.config';
import { StripePaymentProvider } from './infrastructure/stripe/stripe-payment-provider';
import { StripeWebhookAuthenticator, UnconfiguredStripeWebhookAuthenticator } from './infrastructure/stripe/stripe-webhook-authenticator';
import { MEDICATION_ORDER_PAYMENT_READER, type MedicationOrderPaymentReader } from './application/ports/medication-order-payment.reader';
import { PayMedicationOrderUseCase, SyncMedicationOrderPaymentUseCase } from './application/use-cases/pay-medication-order.use-case';
import { DrizzleMedicationOrderPaymentReader } from './infrastructure/persistence/drizzle-medication-order-payment.reader';
import { StripeWebhookController } from './presentation/stripe-webhook.controller';
import { AdminRefundsController } from './presentation/admin-refunds.controller';
import { AdminRefundsService } from './application/use-cases/admin-refunds.service';
import { AUDIT_TRAIL, type AuditTrail } from '../audit/application/ports/audit-trail';
import { ReconcileProviderFeesUseCase } from './application/use-cases/reconcile-provider-fees.use-case';
import { loadWebhookRetryWorkerConfig, PgAdvisoryXactLock, WEBHOOK_RETRY_WORKER_ENV, WebhookRetryWorker, type ExclusiveRunLock, type WebhookRetryWorkerConfig } from './infrastructure/webhook-retry.worker';
import { db } from '../../db';
import {
  DrizzleIdempotencyKeyRepository,
  DrizzlePaymentRepository,
  DrizzlePeiFeeConfigurationRepository,
  DrizzleProcessorFeeScheduleRepository,
} from './infrastructure/persistence/drizzle-payments.repositories';
import { UnconfiguredPaymentProvider } from './infrastructure/unconfigured-payment-provider';
import {
  PROVIDER_WEBHOOK_AUTHENTICATOR,
  PROVIDER_WEBHOOK_EVENT_REPOSITORY,
  WEBHOOK_EVENT_DISPATCHER,
  type ProviderWebhookAuthenticator,
  type WebhookEventDispatcher,
  type WebhookEventRepository,
} from './application/ports/provider-webhook.port';
import {
  ProcessProviderWebhookEventUseCase,
  ReceiveProviderWebhookUseCase,
  RetryProviderWebhookEventsUseCase,
} from './application/use-cases/provider-webhook.use-cases';
import { InProcessWebhookDispatcher } from './infrastructure/in-process-webhook-dispatcher';
import { DrizzleWebhookEventRepository } from './infrastructure/persistence/drizzle-webhook-events.repository';
import { REFUND_PROVIDER, REFUND_REPOSITORY, type RefundProviderPort, type RefundRepository } from './application/ports/refunds.port';
import { RefundsUseCases } from './application/use-cases/refunds.use-cases';
import { AppointmentCanceledRefundHandler } from './application/use-cases/appointment-canceled-refund.handler';
import { DrizzleRefundRepository } from './infrastructure/persistence/drizzle-refunds.repository';
import { AppointmentCanceledRefundListener } from './infrastructure/appointment-canceled-refund.listener';
import { AppointmentEventSubscribers } from '../appointments/application/appointment-events';
import type { PaymentLedgerPort } from '../appointments/application/integration/appointment-chain.services';
import { CanceledAppointmentFeedService } from '../appointments/application/integration/canceled-appointment-feed';
import { ReconcileCanceledAppointmentRefundsUseCase } from './application/use-cases/reconcile-canceled-appointment-refunds.use-case';

// Payments. Usa UNIT_OF_WORK y CLOCK del CommonModule global.
//
// Proveedor ACTIVO de ambos checkouts (consulta y medicamentos): Stripe (Payments-decisiones.md §8).
// - STRIPE_SETTINGS: la configuración se valida al construir el módulo; una configuración parcial o insegura impide el
//   arranque (StripeConfigError, sin secretos). Sin variables, el módulo arranca sin proveedor y todo cobro falla cerrado.
// - STRIPE_FETCH: el `fetch` del adaptador; las pruebas lo sustituyen con overrideProvider.
// - PaymentsUseCases se construye con una factory (la capa de aplicación no depende de Nest).
//
// Mercado Pago está DESACTIVADO, no eliminado: su adaptador, su autenticador de webhooks, su configuración, su
// controlador (presentation/mercado-pago-webhook.controller.ts) y sus pruebas siguen en infrastructure/mercadopago,
// pero este módulo ya no los registra. No se lee ninguna variable MERCADO_PAGO_* y la ruta /webhooks/mercado-pago no
// existe. Los pagos históricos con provider = 'mercado_pago' no se consultan ni se sincronizan con Stripe.
export const STRIPE_SETTINGS = Symbol('STRIPE_SETTINGS');
export const STRIPE_FETCH = Symbol('STRIPE_FETCH');
// F3.2 (A.20, AP-27a): implementación de pagos del contrato de M08 y su composición con rootOf.
export const ROOT_PAYMENT_LOOKUP = Symbol('ROOT_PAYMENT_LOOKUP');
export const PAYMENT_LEDGER = Symbol('PAYMENT_LEDGER');

// Configuración de webhooks (secreto de firma de Stripe-Signature), leída del entorno al construir el módulo.
export const STRIPE_WEBHOOK_SETTINGS = Symbol('STRIPE_WEBHOOK_SETTINGS');
export const WEBHOOK_RETRY_WORKER_CONFIG = Symbol('WEBHOOK_RETRY_WORKER_CONFIG');
export const WEBHOOK_RETRY_LOCK = Symbol('WEBHOOK_RETRY_LOCK');

// H-6: los CLI de pagos (ejecuciones cortas) fuerzan la desactivación del worker periódico ANTES de crear su contexto,
// aunque el .env lo active. Se expone aquí para que los CLI no importen la infraestructura de pagos.
export function disablePeriodicWebhookWorker(env: NodeJS.ProcessEnv = process.env): void {
  env[WEBHOOK_RETRY_WORKER_ENV.enabled] = 'false';
}

export const randomPaymentIds: PaymentIdGenerator = { newId: () => randomUUID() };

export function paymentProviderFactory(settings: StripeSettings | null, fetchFn: typeof fetch): PaymentProviderPort {
  new Logger('PaymentsModule').log(describeStripeConfig(settings));
  return settings
    ? new StripePaymentProvider({ secretKey: settings.secretKey, environment: settings.environment, fetch: fetchFn })
    : new UnconfiguredPaymentProvider('stripe', 'Stripe');
}

export function webhookAuthenticatorFactory(settings: StripeWebhookSettings | null, clock: Clock): ProviderWebhookAuthenticator {
  new Logger('PaymentsModule').log(describeStripeWebhookConfig(settings));
  return settings
    ? new StripeWebhookAuthenticator({ secret: settings.secret, toleranceMs: settings.toleranceMs, environment: settings.environment, now: () => clock.now() })
    : new UnconfiguredStripeWebhookAuthenticator();
}

// F3.1: importa AppointmentsModule para usar AppointmentConfirmationService (Payments → M08; M08 no importa pagos).
// PatientPaymentsController: pago de consultas y de pedidos de medicamentos (PaymentMethod de Stripe) y sincronización.
// StripeWebhookController: notificaciones firmadas de Stripe; procesamiento en segundo plano.
@Module({
  imports: [AppointmentsModule],
  controllers: [PatientPaymentsController, StripeWebhookController, AdminRefundsController],
  providers: [
    { provide: STRIPE_SETTINGS, useFactory: () => loadStripeConfig(process.env) },
    { provide: STRIPE_FETCH, useFactory: () => globalThis.fetch },
    { provide: PAYMENT_PROVIDER, inject: [STRIPE_SETTINGS, STRIPE_FETCH], useFactory: paymentProviderFactory },
    { provide: PAYMENT_REPOSITORY, useClass: DrizzlePaymentRepository },
    { provide: IDEMPOTENCY_KEY_REPOSITORY, useClass: DrizzleIdempotencyKeyRepository },
    { provide: PEI_FEE_CONFIGURATION_REPOSITORY, useClass: DrizzlePeiFeeConfigurationRepository },
    { provide: PROCESSOR_FEE_SCHEDULE_REPOSITORY, useClass: DrizzleProcessorFeeScheduleRepository },
    { provide: PAYMENT_ID_GENERATOR, useValue: randomPaymentIds },
    {
      provide: PaymentsUseCases,
      inject: [UNIT_OF_WORK, CLOCK, PAYMENT_REPOSITORY, IDEMPOTENCY_KEY_REPOSITORY, PEI_FEE_CONFIGURATION_REPOSITORY, PROCESSOR_FEE_SCHEDULE_REPOSITORY, PAYMENT_PROVIDER, PAYMENT_ID_GENERATOR],
      useFactory: (
        uow: UnitOfWork,
        clock: Clock,
        payments: PaymentRepository,
        keys: IdempotencyKeyRepository,
        peiFees: PeiFeeConfigurationRepository,
        processorFees: ProcessorFeeScheduleRepository,
        provider: PaymentProviderPort,
        ids: PaymentIdGenerator,
      ) => new PaymentsUseCases({ uow, clock, payments, keys, peiFees, processorFees, provider, ids }),
    },
    { provide: APPOINTMENT_PAYMENT_READER, useClass: DrizzleAppointmentPaymentReader },
    {
      provide: PayAppointmentUseCase,
      inject: [CLOCK, APPOINTMENT_PAYMENT_READER, PaymentsUseCases, PAYMENT_REPOSITORY, IDEMPOTENCY_KEY_REPOSITORY, AppointmentConfirmationService, RefundsUseCases],
      useFactory: (
        clock: Clock,
        appointments: AppointmentPaymentReader,
        payments: PaymentsUseCases,
        paymentRecords: PaymentRepository,
        keys: IdempotencyKeyRepository,
        confirmation: AppointmentConfirmationService,
        refunds: RefundsUseCases,
      ) => new PayAppointmentUseCase({ clock, appointments, payments, paymentRecords, keys, confirmation, refunds }),
    },
    {
      provide: SyncAppointmentPaymentUseCase,
      inject: [PaymentsUseCases, PAYMENT_REPOSITORY, APPOINTMENT_PAYMENT_READER, AppointmentConfirmationService, RefundsUseCases],
      useFactory: (
        payments: PaymentsUseCases,
        paymentRecords: PaymentRepository,
        appointments: AppointmentPaymentReader,
        confirmation: AppointmentConfirmationService,
        refunds: RefundsUseCases,
      ) => new SyncAppointmentPaymentUseCase({ payments, paymentRecords, appointments, confirmation, refunds }),
    },
    // Checkout de medicamentos (PAY-20): cobra un pedido existente; el importe sale de medication_order.total.
    { provide: MEDICATION_ORDER_PAYMENT_READER, useClass: DrizzleMedicationOrderPaymentReader },
    {
      provide: PayMedicationOrderUseCase,
      inject: [MEDICATION_ORDER_PAYMENT_READER, PaymentsUseCases, PAYMENT_REPOSITORY, IDEMPOTENCY_KEY_REPOSITORY],
      useFactory: (orders: MedicationOrderPaymentReader, payments: PaymentsUseCases, paymentRecords: PaymentRepository, keys: IdempotencyKeyRepository) =>
        new PayMedicationOrderUseCase({ orders, payments, paymentRecords, keys }),
    },
    {
      provide: SyncMedicationOrderPaymentUseCase,
      inject: [PaymentsUseCases, PAYMENT_REPOSITORY],
      useFactory: (payments: PaymentsUseCases, paymentRecords: PaymentRepository) => new SyncMedicationOrderPaymentUseCase({ payments, paymentRecords }),
    },
    // F3.3: webhooks. El bloqueo de pagos es el mismo repositorio Drizzle (SELECT … FOR UPDATE).
    { provide: PAYMENT_LOCK_REPOSITORY, useExisting: PAYMENT_REPOSITORY },
    // H-2/H-3: conciliación de la comisión real (la invoca el CLI payments-reconcile-fees; sin ejecución periódica).
    { provide: FEE_RECONCILIATION_READER, useExisting: PAYMENT_REPOSITORY },
    {
      provide: ReconcileProviderFeesUseCase,
      inject: [UNIT_OF_WORK, CLOCK, PAYMENT_LOCK_REPOSITORY, PAYMENT_REPOSITORY, PAYMENT_PROVIDER, FEE_RECONCILIATION_READER],
      useFactory: (uow: UnitOfWork, clock: Clock, locks: PaymentLockRepository, payments: PaymentRepository, provider: PaymentProviderPort, pending: FeeReconciliationReader) => {
        const logger = new Logger('PaymentsFeeReconciliation');
        return new ReconcileProviderFeesUseCase({ uow, clock, locks, payments, provider, pending, warn: (m) => logger.warn(m) });
      },
    },
    { provide: STRIPE_WEBHOOK_SETTINGS, useFactory: () => loadStripeWebhookConfig(process.env) },
    { provide: PROVIDER_WEBHOOK_AUTHENTICATOR, inject: [STRIPE_WEBHOOK_SETTINGS, CLOCK], useFactory: webhookAuthenticatorFactory },
    { provide: PROVIDER_WEBHOOK_EVENT_REPOSITORY, useClass: DrizzleWebhookEventRepository },
    {
      provide: ProcessProviderWebhookEventUseCase,
      inject: [UNIT_OF_WORK, CLOCK, PROVIDER_WEBHOOK_EVENT_REPOSITORY, PAYMENT_PROVIDER, PAYMENT_REPOSITORY, PAYMENT_LOCK_REPOSITORY, APPOINTMENT_PAYMENT_READER, AppointmentConfirmationService, RefundsUseCases],
      useFactory: (
        uow: UnitOfWork,
        clock: Clock,
        events: WebhookEventRepository,
        provider: PaymentProviderPort,
        payments: PaymentRepository,
        locks: PaymentLockRepository,
        appointments: AppointmentPaymentReader,
        confirmation: AppointmentConfirmationService,
        refunds: RefundsUseCases,
      ) => {
        const logger = new Logger('PaymentsWebhooks');
        return new ProcessProviderWebhookEventUseCase({ uow, clock, events, provider, payments, locks, appointments, confirmation, refunds, warn: (m) => logger.warn(m), alert: (m) => logger.error(m) });
      },
    },
    {
      provide: WEBHOOK_EVENT_DISPATCHER,
      inject: [ProcessProviderWebhookEventUseCase],
      useFactory: (processor: ProcessProviderWebhookEventUseCase) => new InProcessWebhookDispatcher(processor),
    },
    {
      provide: ReceiveProviderWebhookUseCase,
      inject: [CLOCK, PROVIDER_WEBHOOK_AUTHENTICATOR, PROVIDER_WEBHOOK_EVENT_REPOSITORY, WEBHOOK_EVENT_DISPATCHER],
      useFactory: (clock: Clock, authenticator: ProviderWebhookAuthenticator, events: WebhookEventRepository, dispatcher: WebhookEventDispatcher) =>
        new ReceiveProviderWebhookUseCase({ clock, authenticator, events, dispatcher }),
    },
    {
      provide: RetryProviderWebhookEventsUseCase,
      inject: [CLOCK, PROVIDER_WEBHOOK_EVENT_REPOSITORY, ProcessProviderWebhookEventUseCase],
      useFactory: (clock: Clock, events: WebhookEventRepository, processor: ProcessProviderWebhookEventUseCase) =>
        new RetryProviderWebhookEventsUseCase({ clock, events, processor }),
    },
    // H-6, etapa 1: worker periódico de recuperación (desactivado por defecto; PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED=true).
    // Reutiliza RetryProviderWebhookEventsUseCase; InProcessWebhookDispatcher sigue siendo la vía rápida.
    { provide: WEBHOOK_RETRY_WORKER_CONFIG, useFactory: () => loadWebhookRetryWorkerConfig(process.env) },
    { provide: WEBHOOK_RETRY_LOCK, useFactory: () => new PgAdvisoryXactLock(db.$client) },
    {
      provide: WebhookRetryWorker,
      inject: [WEBHOOK_RETRY_WORKER_CONFIG, RetryProviderWebhookEventsUseCase, WEBHOOK_RETRY_LOCK],
      useFactory: (config: WebhookRetryWorkerConfig, retry: RetryProviderWebhookEventsUseCase, lock: ExclusiveRunLock) => new WebhookRetryWorker({ config, retry, lock }),
    },
    // F5: reembolsos. El adaptador de Stripe (o el proveedor sin configurar) implementa también RefundProviderPort.
    { provide: REFUND_PROVIDER, useExisting: PAYMENT_PROVIDER },
    // H-7: rutas administrativas sobre RefundsUseCases (sin reglas propias) con traza en audit_log.
    {
      provide: AdminRefundsService,
      inject: [RefundsUseCases, AUDIT_TRAIL, UNIT_OF_WORK],
      useFactory: (refunds: RefundsUseCases, audit: AuditTrail, uow: UnitOfWork) => new AdminRefundsService({ refunds, audit, uow }),
    },
    { provide: REFUND_REPOSITORY, useClass: DrizzleRefundRepository },
    {
      provide: RefundsUseCases,
      inject: [UNIT_OF_WORK, CLOCK, PAYMENT_REPOSITORY, PAYMENT_LOCK_REPOSITORY, REFUND_REPOSITORY, IDEMPOTENCY_KEY_REPOSITORY, REFUND_PROVIDER, PAYMENT_PROVIDER, PAYMENT_ID_GENERATOR],
      useFactory: (
        uow: UnitOfWork,
        clock: Clock,
        payments: PaymentRepository,
        locks: PaymentLockRepository,
        refunds: RefundRepository,
        keys: IdempotencyKeyRepository,
        provider: RefundProviderPort,
        paymentProvider: PaymentProviderPort,
        ids: PaymentIdGenerator,
      ) => {
        const logger = new Logger('PaymentsRefunds');
        return new RefundsUseCases({ uow, clock, payments, locks, refunds, keys, provider, paymentProvider, ids, warn: (m) => logger.warn(m) });
      },
    },
    {
      provide: AppointmentCanceledRefundHandler,
      inject: [PAYMENT_LEDGER, ROOT_PAYMENT_LOOKUP, PAYMENT_REPOSITORY, RefundsUseCases],
      useFactory: (ledger: PaymentLedgerPort, rootPayments: RootPaymentLookup, payments: PaymentRepository, refunds: RefundsUseCases) => {
        const logger = new Logger('PaymentsRefunds');
        return new AppointmentCanceledRefundHandler({ ledger, rootPayments, payments, refunds, warn: (m) => logger.warn(m) });
      },
    },
    // A.25: barrido duradero de cancelaciones (la ruta en memoria es solo una optimización).
    {
      provide: ReconcileCanceledAppointmentRefundsUseCase,
      inject: [CanceledAppointmentFeedService, AppointmentCanceledRefundHandler],
      useFactory: (feed: CanceledAppointmentFeedService, handler: AppointmentCanceledRefundHandler) => new ReconcileCanceledAppointmentRefundsUseCase({ feed, handler }),
    },
    {
      provide: AppointmentCanceledRefundListener,
      inject: [AppointmentEventSubscribers, AppointmentCanceledRefundHandler],
      useFactory: (subscribers: AppointmentEventSubscribers, handler: AppointmentCanceledRefundHandler) => new AppointmentCanceledRefundListener(subscribers, handler),
    },
    { provide: ROOT_PAYMENT_LOOKUP, useClass: DrizzleRootPaymentLookup },
    { provide: PATIENT_PROFILE_READER, useClass: DrizzlePatientProfileReader },
    // A.20: pagos monta RootResolvingPaymentLedger con AppointmentChainService (M08 resuelve la raíz; pagos, el pago).
    {
      provide: PAYMENT_LEDGER,
      inject: [AppointmentChainService, ROOT_PAYMENT_LOOKUP],
      useFactory: (chain: AppointmentChainService, lookup: RootPaymentLookup) => new RootResolvingPaymentLedger(chain, lookup),
    },
  ],
  exports: [PaymentsUseCases, PayAppointmentUseCase, SyncAppointmentPaymentUseCase, PayMedicationOrderUseCase, PAYMENT_LEDGER],
})
export class PaymentsModule {}
