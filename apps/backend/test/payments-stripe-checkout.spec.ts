import { BadRequestException, Logger, type ArgumentMetadata } from '@nestjs/common';
import { UniqueConstraintViolationError } from '../src/common/domain/persistence.errors';
import { createValidationPipe } from '../src/common/validation/create-validation-pipe';
import type { ConfirmationResult } from '../src/modules/appointments/application/integration/appointment-integration.services';
import type { AppointmentForPayment } from '../src/modules/payments/application/ports/appointment-payment.reader';
import type { MedicationOrderForPayment } from '../src/modules/payments/application/ports/medication-order-payment.reader';
import type { ProviderName } from '../src/modules/payments/application/ports/payment-provider.port';
import type { IdempotencyKeyRecord, NewPaymentRecord, PaymentProviderUpdate, PaymentRecord } from '../src/modules/payments/application/ports/payments.repositories';
import {
  WebhookAuthenticationError, type NewWebhookEvent, type WebhookEventRecord, type WebhookEventRepository,
} from '../src/modules/payments/application/ports/provider-webhook.port';
import { ActivePaymentExistsError, NoEffectiveProcessorFeeError, ProviderStateConflictError } from '../src/modules/payments/application/payments-use-case.errors';
import { AppointmentPatientMismatchError } from '../src/modules/payments/application/use-cases/payment-appointment-identity';
import { PayAppointmentUseCase } from '../src/modules/payments/application/use-cases/pay-appointment.use-case';
import {
  MedicationOrderNotFoundForPaymentError, MedicationOrderNotPayableError, MedicationOrderPatientMismatchError, NotAMedicationPaymentError,
  PayMedicationOrderUseCase, SyncMedicationOrderPaymentUseCase,
} from '../src/modules/payments/application/use-cases/pay-medication-order.use-case';
import { IN_FLIGHT_WINDOW_MS, PaymentsUseCases } from '../src/modules/payments/application/use-cases/payments.use-cases';
import { ProcessProviderWebhookEventUseCase, ReceiveProviderWebhookUseCase, type ProcessWebhookResult } from '../src/modules/payments/application/use-cases/provider-webhook.use-cases';
import { SyncAppointmentPaymentUseCase } from '../src/modules/payments/application/use-cases/sync-appointment-payment.use-case';
import { money } from '../src/modules/payments/domain/money';
import type { ProcessorFeeSnapshot } from '../src/modules/payments/domain/payment-amounts';
import { canTransition } from '../src/modules/payments/domain/payment-transitions';
import { StripePaymentProvider } from '../src/modules/payments/infrastructure/stripe/stripe-payment-provider';
import { StripeWebhookAuthenticator } from '../src/modules/payments/infrastructure/stripe/stripe-webhook-authenticator';
import { PayAppointmentDto, PayMedicationOrderDto } from '../src/modules/payments/presentation/dto/pay-appointment.dto';
import { PatientPaymentsController } from '../src/modules/payments/presentation/patient-payments.controller';
import { FakeStripe, stripeSignature } from './support/stripe-fake';

// Stripe como proveedor de AMBOS checkouts · INTEGRACIÓN SIMULADA. Código real de punta a punta dentro de Payments:
// casos de uso, adaptador de Stripe, firma y procesamiento de webhooks. Dobles en memoria para la API de Stripe
// (test/support/stripe-fake.ts), la base de datos y M08. NO hay red, ni PostgreSQL, ni el modo de prueba de Stripe:
// estas pruebas no demuestran la integración real con Stripe.
//
// Los dobles reproducen lo que importa de 0017: idempotency_key_uq, un solo pago activo por cita y por pedido
// (payment_active_appointment_uq, payment_active_medication_order_uq), payment_guard (transiciones y datos fijados una
// vez), provider_webhook_event_uq y el rollback de la unidad de trabajo.
//
// Reglas de negocio vigentes (Payments-decisiones.md §7.6): consulta de 200.00 MXN, comisión fija de PEI de 20.00 y neto
// del médico de 180.00. La tarifa del procesador de estas pruebas es ILUSTRATIVA: no es una tarifa de Stripe.

const SECRET_KEY = ['sk', 'test', 'sintetica9999999999'].join('_');
const WEBHOOK_SECRET = ['whsec', 'sintetico9999999999'].join('_');
const T0 = new Date('2026-11-15T12:00:00Z');
const APPOINTMENT = '00000000-0000-4000-8000-0000000000a1';
const ORDER = '00000000-0000-4000-8000-0000000000b1';
const ILLUSTRATIVE_SCHEDULE: ProcessorFeeSnapshot = { scheduleId: 'sch-stripe', percentageRate: '0.036000', fixedFee: money(300), vatRate: '0.160000' };
// (200.00 × 3.6 % + 3.00) × 1.16 = 11.83
const ESTIMATED_ON_200 = money(1_183);
const KEY_1 = 'clave-idempotencia-0001';
const KEY_2 = 'clave-idempotencia-0002';
const card = (token = 'pm_card_visa') => ({ token, paymentMethodId: 'card', installments: 1 });

class World {
  now = T0;
  clock = { now: () => this.now };
  stripe = new FakeStripe();
  provider = new StripePaymentProvider({ secretKey: SECRET_KEY, fetch: this.stripe.fetch, environment: 'test' });
  payments = new Map<string, PaymentRecord>();
  keys = new Map<string, IdempotencyKeyRecord>();
  events = new Map<string, WebhookEventRecord & { payload: Record<string, unknown> }>();
  appointments = new Map<string, AppointmentForPayment>([[APPOINTMENT, {
    appointmentId: APPOINTMENT, patientId: 'pat-1', doctorId: 'doc-1', status: 'pending_payment', price: money(20_000), paymentHoldExpiresAt: new Date(T0.getTime() + 5 * 60_000),
  }]]);
  orders = new Map<string, MedicationOrderForPayment>([[ORDER, { medicationOrderId: ORDER, patientId: 'pat-1', status: 'order_received', total: money(123_456) }]]);
  schedules: Partial<Record<ProviderName, ProcessorFeeSnapshot>> = { stripe: ILLUSTRATIVE_SCHEDULE };
  peiFeeLookups = 0;
  confirmations: string[] = [];
  confirmCalls: ConfirmationResult[] = [];
  holdReleases: string[] = [];
  dispatched: string[] = [];
  private seq = 0;

  // Unidad de trabajo: un fallo descarta todo lo escrito dentro (rollback).
  uow = {
    runInTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
      const before = { payments: new Map(this.payments), keys: new Map(this.keys) };
      try {
        return await work();
      } catch (error) {
        this.payments = before.payments;
        this.keys = before.keys;
        throw error;
      }
    },
  };

  paymentsRepo = {
    insert: async (r: NewPaymentRecord) => {
      const active = [...this.payments.values()].filter((p) => !['failed', 'canceled'].includes(p.status));
      if (r.type === 'consultation' && active.some((p) => p.type === 'consultation' && p.appointmentId === r.appointmentId)) {
        throw new UniqueConstraintViolationError({ code: '23505', constraint: 'payment_active_appointment_uq', table: 'payment' });
      }
      if (r.type === 'medication' && active.some((p) => p.type === 'medication' && p.medicationOrderId === r.medicationOrderId)) {
        throw new UniqueConstraintViolationError({ code: '23505', constraint: 'payment_active_medication_order_uq', table: 'payment' });
      }
      this.payments.set(r.id, { ...r, providerPaymentId: null, providerStatus: null, providerFeeActual: null, netReceived: null, moneyReleaseDate: null, feeReconciledAt: null, updatedAt: r.createdAt });
    },
    findById: async (id: string) => (this.payments.has(id) ? { ...this.payments.get(id)! } : null),
    update: async (id: string, update: PaymentProviderUpdate) => {
      const current = this.payments.get(id)!;
      // payment_guard de 0017.
      if (update.status && !canTransition(current.status, update.status)) throw new Error(`payment_guard: ${current.status} → ${update.status}`);
      for (const field of ['providerPaymentId', 'providerFeeActual', 'netReceived', 'moneyReleaseDate'] as const) {
        if (update[field] !== undefined && current[field] !== null) throw new Error(`payment_guard: ${field} ya fijado`);
      }
      this.payments.set(id, { ...current, ...update } as PaymentRecord);
    },
    lockById: async (id: string) => (this.payments.has(id) ? { ...this.payments.get(id)! } : null),
  };

  keysRepo = {
    find: async (scope: string, key: string) => this.keys.get(`${scope}|${key}`) ?? null,
    insert: async (r: { scope: string; key: string; requestHash: string; paymentId: string; createdAt: Date }) => {
      if (this.keys.has(`${r.scope}|${r.key}`)) throw new UniqueConstraintViolationError({ code: '23505', constraint: 'idempotency_key_uq', table: 'idempotency_key' });
      this.keys.set(`${r.scope}|${r.key}`, { ...r, completedAt: null });
    },
    complete: async (scope: string, key: string, at: Date) => {
      const k = this.keys.get(`${scope}|${key}`)!;
      if (k.completedAt === null) k.completedAt = at;
    },
  };

  eventsRepo: WebhookEventRepository = {
    insert: async (e: NewWebhookEvent) => {
      if ([...this.events.values()].some((x) => x.provider === e.provider && x.topic === e.topic && x.dataId === e.dataId && x.requestId === e.requestId)) {
        throw new UniqueConstraintViolationError({ code: '23505', constraint: 'provider_webhook_event_uq', table: 'provider_webhook_event' });
      }
      const id = `row-${++this.seq}`;
      this.events.set(id, { ...e, id, paymentId: null, processedAt: null, processingAttempts: 0, lastError: null });
      return id;
    },
    findByKey: async (k) => [...this.events.values()].find((x) => x.provider === k.provider && x.topic === k.topic && x.dataId === k.dataId && x.requestId === k.requestId) ?? null,
    claim: async (id, o) => {
      const e = this.events.get(id);
      if (!e || e.processingAttempts >= o.maxAttempts || (e.status !== 'received' && e.status !== 'failed')) return null;
      e.status = 'processing';
      e.processingAttempts += 1;
      return { ...e };
    },
    finish: async (id, o) => {
      const e = this.events.get(id)!;
      if (e.status === 'processed' || e.status === 'ignored') return;
      e.status = o.status;
      if (o.status === 'processed') e.processedAt = o.at;
      e.lastError = o.lastError ?? null;
      if (o.paymentId && !e.paymentId) e.paymentId = o.paymentId;
    },
    findRetryable: async () => [],
  };

  // M08 simulado con la lógica de AppointmentConfirmationService: idempotencia, vencimiento e importe.
  confirmation = {
    confirmPaid: async (appointmentId: string, paymentId: string, amount: string): Promise<ConfirmationResult> => {
      const a = this.appointments.get(appointmentId)!;
      const result = ((): ConfirmationResult => {
        if (a.status === 'confirmed') return { result: 'already_confirmed' };
        if (a.status !== 'pending_payment') return { result: 'not_confirmable', reason: 'invalid_state' };
        if (!a.paymentHoldExpiresAt || a.paymentHoldExpiresAt <= this.now) return { result: 'not_confirmable', reason: 'expired' };
        if (Number(amount) !== a.price.cents / 100) return { result: 'not_confirmable', reason: 'amount_mismatch' };
        a.status = 'confirmed';
        this.confirmations.push(`${appointmentId}:${paymentId}`);
        return { result: 'confirmed' };
      })();
      this.confirmCalls.push(result);
      return result;
    },
    markPaymentFailed: async (appointmentId: string) => void this.holdReleases.push(appointmentId),
  };

  appointmentReader = { findForPayment: async (id: string) => (this.appointments.has(id) ? { ...this.appointments.get(id)! } : null) };
  orderReader = { findForPayment: async (id: string) => (this.orders.has(id) ? { ...this.orders.get(id)! } : null) };

  useCases = new PaymentsUseCases({
    uow: this.uow, clock: this.clock, payments: this.paymentsRepo, keys: this.keysRepo,
    peiFees: { findEffective: async () => (this.peiFeeLookups++, { id: 'fee-20', fixedFee: money(2_000) }) },
    processorFees: {
      findEffective: async (provider) => this.schedules[provider] ?? null,
      findById: async (id) => Object.values(this.schedules).find((s) => s?.scheduleId === id) ?? null,
    },
    provider: this.provider,
    ids: { newId: () => `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}` },
  });
  payAppointment = new PayAppointmentUseCase({ clock: this.clock, appointments: this.appointmentReader, payments: this.useCases, paymentRecords: this.paymentsRepo, keys: this.keysRepo, confirmation: this.confirmation });
  syncAppointment = new SyncAppointmentPaymentUseCase({ payments: this.useCases, paymentRecords: this.paymentsRepo, appointments: this.appointmentReader, confirmation: this.confirmation });
  payOrder = new PayMedicationOrderUseCase({ orders: this.orderReader, payments: this.useCases, paymentRecords: this.paymentsRepo, keys: this.keysRepo });
  syncOrder = new SyncMedicationOrderPaymentUseCase({ payments: this.useCases, paymentRecords: this.paymentsRepo });

  receiver = new ReceiveProviderWebhookUseCase({
    clock: this.clock,
    authenticator: new StripeWebhookAuthenticator({ secret: WEBHOOK_SECRET, toleranceMs: 300_000, environment: 'test', now: this.clock.now }),
    events: this.eventsRepo,
    dispatcher: { dispatch: (id) => this.dispatched.push(id) },
  });
  processor = new ProcessProviderWebhookEventUseCase({
    uow: this.uow, clock: this.clock, events: this.eventsRepo, provider: this.provider, payments: this.paymentsRepo, locks: this.paymentsRepo,
    appointments: this.appointmentReader, confirmation: this.confirmation,
  });

  // Entrega un evento firmado como lo hace Stripe y procesa lo despachado (en la aplicación, en segundo plano).
  async deliver(type: string, intentId: string, over: { eventId?: string; secret?: string } = {}) {
    const raw = this.stripe.intentEvent(type, intentId, over.eventId ? { id: over.eventId } : {});
    const signature = stripeSignature(over.secret ?? WEBHOOK_SECRET, raw, Math.floor(this.now.getTime() / 1000));
    const received = await this.receiver.execute({ url: '/webhooks/stripe', headers: { 'stripe-signature': signature }, body: undefined, rawBody: raw });
    const processed: ProcessWebhookResult[] = [];
    for (const id of this.dispatched.splice(0)) processed.push(await this.processor.execute(id));
    return { received, processed };
  }

  get appointment() {
    return this.appointments.get(APPOINTMENT)!;
  }
  only(): PaymentRecord {
    expect(this.payments.size).toBe(1);
    return [...this.payments.values()][0];
  }
  getCalls(): number {
    return this.stripe.calls.filter((c) => c.method === 'GET').length;
  }
}

const payConsultation = (w: World, token = 'pm_card_visa', idempotencyKey = KEY_1, patientId = 'pat-1') =>
  w.payAppointment.execute({ idempotencyKey, patientId, appointmentId: APPOINTMENT, card: card(token) });
const payMedication = (w: World, token = 'pm_card_visa', idempotencyKey = KEY_1, patientId = 'pat-1') =>
  w.payOrder.execute({ idempotencyKey, patientId, medicationOrderId: ORDER, card: card(token) });

beforeEach(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------------------------------------------------
describe('Stripe · checkout de consultas', () => {
  it('crea el pago de una consulta: 200.00 cobrados, comisión fija de PEI 20.00, neto del médico 180.00, y la cita queda confirmada', async () => {
    const w = new World();
    const result = await payConsultation(w);

    expect(result).toMatchObject({ payment: { status: 'succeeded', gross: '200.00', peiFixedFee: '20.00', doctorNet: '180.00' }, confirmation: { result: 'confirmed' }, appointmentConfirmed: true, recoverable: false });
    const p = w.only();
    expect(p).toMatchObject({
      type: 'consultation', provider: 'stripe', status: 'succeeded', providerStatus: 'succeeded', patientId: 'pat-1', doctorId: 'doc-1', appointmentId: APPOINTMENT, medicationOrderId: null,
      gross: money(20_000), peiFeeConfigurationId: 'fee-20', peiFixedFee: money(2_000), doctorNet: money(18_000),
      processorFeeScheduleId: 'sch-stripe', providerFeeEstimated: ESTIMATED_ON_200,
    });
    expect(p.providerPaymentId).toMatch(/^pi_/);
    // Stripe recibió el importe de la cita en centavos de MXN y payment.id como clave de idempotencia y referencia.
    expect(w.stripe.created).toHaveLength(1);
    expect(Object.fromEntries(w.stripe.created[0].form!)).toMatchObject({ amount: '20000', currency: 'mxn', 'metadata[pei_payment_id]': p.id });
    expect(w.stripe.created[0].headers['idempotency-key']).toBe(p.id);
    expect(w.confirmations).toEqual([`${APPOINTMENT}:${p.id}`]);
    expect(w.appointment.status).toBe('confirmed');
  });

  it('la comisión del procesador es un costo de PEI: se registra aparte y no reduce el neto del médico', async () => {
    const w = new World();
    await payConsultation(w);
    const p = w.only();
    // Comisión real informada por el proveedor (ilustrativa en el doble: 8.00) y neto que recibe PEI de Stripe (192.00).
    expect(p).toMatchObject({ providerFeeActual: money(800), netReceived: money(19_200) });
    expect(p.moneyReleaseDate).toBeInstanceOf(Date);
    // El reparto de la consulta no cambia: bruto − comisión fija de PEI = neto del médico, con cualquier comisión.
    expect(p.doctorNet.cents).toBe(p.gross.cents - p.peiFixedFee!.cents);
    expect(p.doctorNet).toEqual(money(18_000));
    // El margen de PEI es su comisión fija menos el costo del procesador: 20.00 − 8.00 = 12.00.
    expect(p.peiFixedFee!.cents - p.providerFeeActual!.cents).toBe(1_200);
  });

  it('el importe nunca viene del cliente: el caso de uso no lo admite y la validación rechaza cualquier campo de importe', async () => {
    const pipe = createValidationPipe();
    const meta: ArgumentMetadata = { type: 'body', metatype: PayAppointmentDto };
    await expect(pipe.transform({ token: 'pm_card_visa' }, meta)).resolves.toBeInstanceOf(PayAppointmentDto);
    for (const extra of [{ amount: 1 }, { amount: '1.00' }, { transaction_amount: 1 }, { currency: 'usd' }, { gross: 100 }, { price: 1 }, { doctorNet: 0 }, { peiFixedFee: 0 }, { cardNumber: '4242424242424242' }, { cvc: '123' }]) {
      await expect(pipe.transform({ token: 'pm_card_visa', ...extra }, meta)).rejects.toThrow(BadRequestException);
    }
    // Aunque un cliente manipulado lo intentara, lo que se cobra es el precio registrado en la cita.
    const w = new World();
    await w.payAppointment.execute({ idempotencyKey: KEY_1, patientId: 'pat-1', appointmentId: APPOINTMENT, card: card(), amount: 1, gross: money(100) } as never);
    expect(w.stripe.created[0].form!.get('amount')).toBe('20000');
    expect(w.only().gross).toEqual(money(20_000));
  });

  it('si Stripe responde con otro importe u otra moneda, el pago NO se da por cobrado y la cita no se confirma', async () => {
    for (const tamper of [(i: { amount: number }) => ({ ...i, amount: 100 }), (i: { currency: string }) => ({ ...i, currency: 'usd' })]) {
      const w = new World();
      w.stripe.tamper = tamper as never;
      const result = await payConsultation(w);
      expect(result).toMatchObject({ payment: { status: 'pending' }, appointmentConfirmed: false, recoverable: true, providerError: 'unexpected_response' });
      expect(w.only().status).toBe('pending');
      expect(w.confirmCalls).toEqual([]);
      expect(w.appointment.status).toBe('pending_payment');
    }
  });

  it('otro paciente no puede pagar la cita: no se crea ningún pago ni se llama a Stripe', async () => {
    const w = new World();
    await expect(payConsultation(w, 'pm_card_visa', KEY_1, 'pat-otro')).rejects.toBeInstanceOf(AppointmentPatientMismatchError);
    expect(w.payments.size).toBe(0);
    expect(w.stripe.calls).toEqual([]);
  });

  it('pago fallido (tarjeta rechazada): el intento queda failed, la cita NO se confirma y el paciente puede reintentar con otro pago', async () => {
    const w = new World();
    const declined = await payConsultation(w, 'pm_card_chargeDeclined');
    expect(declined).toMatchObject({ payment: { status: 'failed', providerStatus: 'requires_payment_method/generic_decline' }, confirmation: { result: 'not_requested' }, appointmentConfirmed: false, recoverable: false });
    expect(w.confirmCalls).toEqual([]);
    expect(w.appointment.status).toBe('pending_payment');
    expect(w.only()).toMatchObject({ providerFeeActual: null, netReceived: null });

    // Reintento dentro de la retención (S6): otra intención de pago, otra clave.
    const retry = await payConsultation(w, 'pm_card_visa', KEY_2);
    expect(retry).toMatchObject({ payment: { status: 'succeeded' }, appointmentConfirmed: true });
    expect([...w.payments.values()].map((p) => p.status).sort()).toEqual(['failed', 'succeeded']);
    expect(w.confirmations).toHaveLength(1);
  });

  it('pago pendiente (3-D Secure): queda processing con la acción para el cliente y la cita NO se confirma hasta que Stripe lo aprueba', async () => {
    const w = new World();
    const pending = await payConsultation(w, 'pm_card_threeDSecure2Required');
    expect(pending).toMatchObject({ payment: { status: 'processing', providerStatus: 'requires_action' }, confirmation: { result: 'not_requested' }, appointmentConfirmed: false });
    expect(pending.nextAction).toEqual({ type: 'stripe_sdk', clientSecret: expect.stringMatching(/_secret_/) });
    expect(w.confirmCalls).toEqual([]);
    expect(w.appointment.status).toBe('pending_payment');
    const p = w.only();

    // El cliente completa la autenticación; Stripe avisa por webhook; PEI consulta el estado real y confirma.
    w.stripe.completeAction(p.providerPaymentId!, 'succeeded');
    const { received, processed } = await w.deliver('payment_intent.succeeded', p.providerPaymentId!);
    expect(received.outcome).toBe('accepted');
    expect(processed).toEqual([expect.objectContaining({ outcome: 'processed', paymentId: p.id, paymentStatus: 'succeeded', paymentChanged: true, effect: { kind: 'confirmation', result: { result: 'confirmed' } } })]);
    expect(w.only()).toMatchObject({ status: 'succeeded', providerFeeActual: money(800), doctorNet: money(18_000) });
    expect(w.confirmations).toEqual([`${APPOINTMENT}:${p.id}`]);
  });

  it('volver de la página de «pago exitoso» no confirma nada: sincronizar un pago aún no aprobado lo deja sin confirmar', async () => {
    const w = new World();
    const pending = await payConsultation(w, 'pm_card_threeDSecure2Required');
    for (let i = 0; i < 2; i++) {
      const synced = await w.syncAppointment.execute({ paymentId: pending.payment.paymentId, requestingPatientId: 'pat-1' });
      expect(synced).toMatchObject({ payment: { status: 'processing' }, confirmation: { result: 'not_requested' }, appointmentConfirmed: false });
    }
    expect(w.confirmCalls).toEqual([]);
    expect(w.appointment.status).toBe('pending_payment');
    // La acción pendiente se puede recuperar para el dueño del pago sin volver a cobrar.
    await expect(w.useCases.pendingAction(pending.payment.paymentId)).resolves.toEqual({ type: 'stripe_sdk', clientSecret: expect.any(String) });
    expect(w.stripe.created).toHaveLength(1);
  });

  it('un evento que DICE succeeded no basta: si la API de Stripe no lo confirma, la cita no se confirma', async () => {
    const w = new World();
    const pending = await payConsultation(w, 'pm_card_threeDSecure2Required');
    const p = w.only();
    // Evento con firma válida y tipo payment_intent.succeeded, pero el intento sigue en requires_action en Stripe.
    const { processed } = await w.deliver('payment_intent.succeeded', p.providerPaymentId!);
    expect(processed).toEqual([expect.objectContaining({ outcome: 'processed', paymentStatus: 'processing', paymentChanged: false, effect: { kind: 'none' } })]);
    expect(w.only().status).toBe('processing');
    expect(w.confirmCalls).toEqual([]);
    expect(w.appointment.status).toBe('pending_payment');
    expect(pending.appointmentConfirmed).toBe(false);
  });

  it('webhook de pago fallido (autenticación rechazada): el pago queda failed y la cita no se confirma; con la retención vigente se puede reintentar', async () => {
    const w = new World();
    await payConsultation(w, 'pm_card_threeDSecure2Required');
    const p = w.only();
    w.stripe.completeAction(p.providerPaymentId!, 'failed');
    const { processed } = await w.deliver('payment_intent.payment_failed', p.providerPaymentId!);
    expect(processed).toEqual([expect.objectContaining({ outcome: 'processed', paymentStatus: 'failed', paymentChanged: true, effect: { kind: 'retry_allowed' }, refundRequired: false })]);
    expect(w.only()).toMatchObject({ status: 'failed', providerStatus: 'requires_payment_method/payment_intent_authentication_failure' });
    expect(w.confirmCalls).toEqual([]);
    expect(w.holdReleases).toEqual([]);
    // El intento rechazado se cerró en Stripe, y el paciente puede pagar de nuevo.
    expect(w.stripe.intents.get(p.providerPaymentId!)!.status).toBe('canceled');
    await expect(payConsultation(w, 'pm_card_visa', KEY_2)).resolves.toMatchObject({ payment: { status: 'succeeded' }, appointmentConfirmed: true });
  });

  it('idempotencia: repetir la solicitud con la misma Idempotency-Key devuelve el mismo pago, sin otro cobro ni otra confirmación', async () => {
    const w = new World();
    const first = await payConsultation(w);
    const second = await payConsultation(w);
    const third = await payConsultation(w, 'pm_card_visa', KEY_1);
    expect([second.payment.paymentId, third.payment.paymentId]).toEqual([first.payment.paymentId, first.payment.paymentId]);
    expect(w.payments.size).toBe(1);
    expect(w.stripe.created).toHaveLength(1);
    expect(w.stripe.intents.size).toBe(1);
    expect(w.confirmations).toHaveLength(1);
    expect(second).toMatchObject({ payment: { status: 'succeeded' }, appointmentConfirmed: true });
  });

  it('idempotencia ante una respuesta perdida: el reintento reenvía EL MISMO pago con la misma clave de Stripe y hay un solo intento', async () => {
    const w = new World();
    w.stripe.failures.push('network');
    const lost = await payConsultation(w);
    expect(lost).toMatchObject({ payment: { status: 'pending' }, recoverable: true, providerError: 'unavailable', appointmentConfirmed: false });
    expect(w.confirmCalls).toEqual([]);

    w.now = new Date(w.now.getTime() + IN_FLIGHT_WINDOW_MS + 1);
    const retried = await payConsultation(w);
    expect(retried).toMatchObject({ payment: { paymentId: lost.payment.paymentId, status: 'succeeded' }, appointmentConfirmed: true });
    expect(w.payments.size).toBe(1);
    expect(w.stripe.created.map((c) => c.headers['idempotency-key'])).toEqual([lost.payment.paymentId, lost.payment.paymentId]);
    expect(w.stripe.intents.size).toBe(1);
  });

  it('no se asignan dos pagos a una misma cita: con un pago activo, un segundo intento se rechaza sin llamar a Stripe', async () => {
    const w = new World();
    await payConsultation(w, 'pm_card_processing');
    await expect(payConsultation(w, 'pm_card_visa', KEY_2)).rejects.toBeInstanceOf(ActivePaymentExistsError);
    expect(w.payments.size).toBe(1);
    expect(w.stripe.created).toHaveLength(1);
    // Con la cita ya pagada tampoco: ya no está en pending_payment.
    const paid = new World();
    await payConsultation(paid);
    await expect(payConsultation(paid, 'pm_card_visa', KEY_2)).rejects.toMatchObject({ reason: 'invalid_state' });
    expect(paid.stripe.created).toHaveLength(1);
    expect(paid.payments.size).toBe(1);
  });

  it('sin una tarifa vigente del procesador para STRIPE no se cobra, aunque exista una de Mercado Pago', async () => {
    const w = new World();
    w.schedules = { mercado_pago: { ...ILLUSTRATIVE_SCHEDULE, scheduleId: 'sch-mp' } };
    await expect(payConsultation(w)).rejects.toBeInstanceOf(NoEffectiveProcessorFeeError);
    expect(w.payments.size).toBe(0);
    expect(w.stripe.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('Stripe · webhooks', () => {
  it('pago exitoso por webhook: se registra el evento, se consulta el pago en Stripe y la cita se confirma una vez', async () => {
    const w = new World();
    await payConsultation(w, 'pm_card_processing');
    const p = w.only();
    w.stripe.completeAction(p.providerPaymentId!, 'succeeded');
    const queriesBefore = w.getCalls();

    const { received, processed } = await w.deliver('payment_intent.succeeded', p.providerPaymentId!, { eventId: 'evt_flujo00000001' });
    expect(received.outcome).toBe('accepted');
    expect(w.getCalls()).toBe(queriesBefore + 1);
    expect([...w.events.values()]).toEqual([expect.objectContaining({
      provider: 'stripe', topic: 'payment', action: 'payment_intent.succeeded', dataId: p.providerPaymentId, requestId: 'evt_flujo00000001', status: 'processed', paymentId: p.id, processingAttempts: 1, lastError: null,
    })]);
    expect(processed[0]).toMatchObject({ outcome: 'processed', paymentStatus: 'succeeded', effect: { kind: 'confirmation', result: { result: 'confirmed' } } });
    expect(w.confirmations).toEqual([`${APPOINTMENT}:${p.id}`]);
  });

  it('webhook duplicado (misma entrega repetida): no se registra otra vez, no se vuelve a procesar y no hay una segunda confirmación', async () => {
    const w = new World();
    await payConsultation(w, 'pm_card_processing');
    const p = w.only();
    w.stripe.completeAction(p.providerPaymentId!, 'succeeded');
    await w.deliver('payment_intent.succeeded', p.providerPaymentId!, { eventId: 'evt_flujo00000002' });
    const after = { ...w.only() };
    const queries = w.getCalls();

    for (let i = 0; i < 3; i++) {
      const again = await w.deliver('payment_intent.succeeded', p.providerPaymentId!, { eventId: 'evt_flujo00000002' });
      expect(again.received.outcome).toBe('duplicate');
      expect(again.processed).toEqual([]);
    }
    expect(w.events.size).toBe(1);
    expect(w.getCalls()).toBe(queries);
    expect(w.only()).toEqual(after);
    expect(w.confirmations).toHaveLength(1);
    expect(w.payments.size).toBe(1);
  });

  it('dos eventos distintos del mismo pago: el segundo no cambia el pago ni confirma de nuevo (already_confirmed)', async () => {
    const w = new World();
    await payConsultation(w);
    const p = w.only();
    const first = await w.deliver('payment_intent.succeeded', p.providerPaymentId!);
    const second = await w.deliver('payment_intent.succeeded', p.providerPaymentId!);
    // H-3: el pago síncrono guarda la comisión sin marca (ruta sin bloqueo); el primer webhook (flujo bloqueado) la
    // concilia, que es su único cambio. El segundo ya no cambia nada.
    expect(p.feeReconciledAt).toBeNull();
    expect(first.processed[0]).toMatchObject({ outcome: 'processed', paymentChanged: true, effect: { kind: 'confirmation', result: { result: 'already_confirmed' } } });
    expect(second.processed[0]).toMatchObject({ outcome: 'processed', paymentChanged: false, effect: { kind: 'confirmation', result: { result: 'already_confirmed' } } });
    expect(w.only().feeReconciledAt).toBeInstanceOf(Date);
    expect(w.events.size).toBe(2);
    expect(w.confirmations).toEqual([`${APPOINTMENT}:${p.id}`]);
    expect(w.only()).toMatchObject({ status: 'succeeded', providerFeeActual: money(800) });
  });

  it('firma incorrecta: se rechaza sin registrar el evento, sin consultar a Stripe y sin tocar el pago ni la cita', async () => {
    const w = new World();
    await payConsultation(w, 'pm_card_processing');
    const p = w.only();
    w.stripe.completeAction(p.providerPaymentId!, 'succeeded');
    const queries = w.getCalls();
    await expect(w.deliver('payment_intent.succeeded', p.providerPaymentId!, { secret: ['whsec', 'atacante00000000000'].join('_') })).rejects.toBeInstanceOf(WebhookAuthenticationError);
    const raw = w.stripe.intentEvent('payment_intent.succeeded', p.providerPaymentId!);
    await expect(w.receiver.execute({ url: '/webhooks/stripe', headers: {}, body: JSON.parse(raw.toString('utf8')), rawBody: raw })).rejects.toBeInstanceOf(WebhookAuthenticationError);
    expect(w.events.size).toBe(0);
    expect(w.getCalls()).toBe(queries);
    expect(w.only().status).toBe('processing');
    expect(w.confirmCalls).toEqual([]);
  });

  it('pago pendiente por webhook (processing): se registra el estado y no se confirma', async () => {
    const w = new World();
    await payConsultation(w, 'pm_card_processing');
    const p = w.only();
    const { processed } = await w.deliver('payment_intent.processing', p.providerPaymentId!);
    expect(processed[0]).toMatchObject({ outcome: 'processed', paymentStatus: 'processing', effect: { kind: 'none' } });
    expect(w.confirmCalls).toEqual([]);
  });

  it('pago capturado con la retención ya vencida: la cita no se confirma (not_confirmable) y corresponde reembolso', async () => {
    const w = new World();
    await payConsultation(w, 'pm_card_processing');
    const p = w.only();
    w.stripe.completeAction(p.providerPaymentId!, 'succeeded');
    w.now = new Date(T0.getTime() + 6 * 60_000);
    const { processed } = await w.deliver('payment_intent.succeeded', p.providerPaymentId!);
    expect(processed[0]).toMatchObject({ outcome: 'processed', paymentStatus: 'succeeded', effect: { kind: 'confirmation', result: { result: 'not_confirmable', reason: 'expired' } }, refundRequired: true });
    expect(w.confirmations).toEqual([]);
  });

  it('un evento de un PaymentIntent que PEI no creó se ignora (pago ajeno)', async () => {
    const w = new World();
    w.stripe.intents.set('pi_ajeno00000001', {
      id: 'pi_ajeno00000001', object: 'payment_intent', livemode: false, status: 'succeeded', amount: 20_000, currency: 'mxn', metadata: {}, client_secret: 'x', last_payment_error: null, cancellation_reason: null, latest_charge: null,
    });
    const { processed } = await w.deliver('payment_intent.succeeded', 'pi_ajeno00000001');
    expect(processed).toEqual([{ outcome: 'ignored', reason: 'foreign_payment' }]);
    expect(w.confirmCalls).toEqual([]);
  });

  it('un evento sobre un pago cuyo importe en Stripe no coincide con el registrado no cambia el pago ni confirma: queda para conciliar', async () => {
    const w = new World();
    await payConsultation(w, 'pm_card_processing');
    const p = w.only();
    w.stripe.completeAction(p.providerPaymentId!, 'succeeded');
    w.stripe.intents.get(p.providerPaymentId!)!.amount = 100;
    const { processed } = await w.deliver('payment_intent.succeeded', p.providerPaymentId!);
    expect(processed[0]).toMatchObject({ outcome: 'failed', reason: 'conflict:importe distinto' });
    expect(w.only().status).toBe('processing');
    expect(w.confirmCalls).toEqual([]);
  });

  it('un pago histórico de Mercado Pago nunca se consulta ni se sincroniza con Stripe', async () => {
    const w = new World();
    await payConsultation(w, 'pm_card_processing');
    const p = w.only();
    w.payments.set(p.id, { ...p, provider: 'mercado_pago', providerPaymentId: '987654321' });
    const calls = w.stripe.calls.length;
    await expect(w.useCases.getPayment(p.id, { refresh: true })).rejects.toBeInstanceOf(ProviderStateConflictError);
    await expect(w.useCases.pendingAction(p.id)).resolves.toBeNull();
    expect(w.stripe.calls).toHaveLength(calls);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('Stripe · checkout de medicamentos', () => {
  it('crea el pago de un pedido: se cobra el total del pedido, sin comisión fija de PEI y con neto del médico 0', async () => {
    const w = new World();
    const result = await payMedication(w);

    expect(result).toMatchObject({ payment: { type: 'medication', status: 'succeeded', gross: '1234.56', peiFixedFee: null, doctorNet: '0.00' }, recoverable: false });
    const p = w.only();
    expect(p).toMatchObject({
      type: 'medication', provider: 'stripe', status: 'succeeded', patientId: 'pat-1', medicationOrderId: ORDER, appointmentId: null, doctorId: null,
      gross: money(123_456), peiFeeConfigurationId: null, peiFixedFee: null, doctorNet: money(0), processorFeeScheduleId: 'sch-stripe',
    });
    // La comisión fija de PEI por consulta ni siquiera se consulta para un pedido.
    expect(w.peiFeeLookups).toBe(0);
    // El costo del procesador se registra como costo de PEI.
    expect(p.providerFeeActual).toEqual(money(4_938));
    expect(Object.fromEntries(w.stripe.created[0].form!)).toMatchObject({ amount: '123456', currency: 'mxn', description: 'Pedido PEI', 'metadata[pei_payment_id]': p.id, 'metadata[pei_payment_type]': 'medication' });
    // Un pedido no confirma ninguna cita.
    expect(w.confirmCalls).toEqual([]);
  });

  it('el importe sale del pedido registrado: el cliente no puede enviarlo ni alterarlo', async () => {
    const pipe = createValidationPipe();
    const meta: ArgumentMetadata = { type: 'body', metatype: PayMedicationOrderDto };
    await expect(pipe.transform({ token: 'pm_card_visa' }, meta)).resolves.toBeInstanceOf(PayMedicationOrderDto);
    for (const extra of [{ amount: 1 }, { total: '1.00' }, { subtotal: 1 }, { shippingCost: 0 }, { currency: 'usd' }]) {
      await expect(pipe.transform({ token: 'pm_card_visa', ...extra }, meta)).rejects.toThrow(BadRequestException);
    }
    const w = new World();
    await w.payOrder.execute({ idempotencyKey: KEY_1, patientId: 'pat-1', medicationOrderId: ORDER, card: card(), amount: 1, total: money(100) } as never);
    expect(w.stripe.created[0].form!.get('amount')).toBe('123456');
  });

  it.each([
    ['el pedido no existe', (w: World) => w.orders.clear(), 'pat-1', MedicationOrderNotFoundForPaymentError],
    ['el pedido es de otro paciente', () => undefined, 'pat-otro', MedicationOrderPatientMismatchError],
    ['el pedido ya está en preparación', (w: World) => void (w.orders.get(ORDER)!.status = 'preparing'), 'pat-1', MedicationOrderNotPayableError],
    ['el pedido está cancelado', (w: World) => void (w.orders.get(ORDER)!.status = 'canceled'), 'pat-1', MedicationOrderNotPayableError],
  ])('no cobra si %s (sin crear pago ni llamar a Stripe)', async (_name, arrange, patientId, error) => {
    const w = new World();
    arrange(w);
    await expect(payMedication(w, 'pm_card_visa', KEY_1, patientId)).rejects.toBeInstanceOf(error);
    expect(w.payments.size).toBe(0);
    expect(w.stripe.calls).toEqual([]);
  });

  it('pago fallido de un pedido: queda failed y se puede reintentar con otro pago', async () => {
    const w = new World();
    await expect(payMedication(w, 'pm_card_chargeDeclined')).resolves.toMatchObject({ payment: { status: 'failed' }, recoverable: false });
    await expect(payMedication(w, 'pm_card_visa', KEY_2)).resolves.toMatchObject({ payment: { status: 'succeeded' } });
    expect([...w.payments.values()].map((p) => p.status).sort()).toEqual(['failed', 'succeeded']);
  });

  it('no se asignan dos pagos a un mismo pedido, e idempotencia con la misma clave', async () => {
    const w = new World();
    const first = await payMedication(w);
    const same = await payMedication(w);
    expect(same.payment.paymentId).toBe(first.payment.paymentId);
    await expect(payMedication(w, 'pm_card_visa', KEY_2)).rejects.toMatchObject({ subject: 'order' });
    expect(w.payments.size).toBe(1);
    expect(w.stripe.created).toHaveLength(1);
    // La misma clave no sirve para otro destino: una clave usada en el pedido no cobra una cita.
    await expect(payConsultation(w, 'pm_card_visa', KEY_1)).rejects.toThrow(/clave de idempotencia/);
    expect(w.stripe.created).toHaveLength(1);
  });

  it('pago pendiente de un pedido y su aprobación por webhook: el pago pasa a succeeded sin efectos sobre citas', async () => {
    const w = new World();
    const pending = await payMedication(w, 'pm_card_threeDSecure2Required');
    expect(pending).toMatchObject({ payment: { status: 'processing' }, nextAction: { type: 'stripe_sdk' } });
    const p = w.only();
    await expect(w.syncOrder.execute({ paymentId: p.id, requestingPatientId: 'pat-1' })).resolves.toMatchObject({ payment: { status: 'processing' } });
    await expect(w.syncOrder.execute({ paymentId: p.id, requestingPatientId: 'pat-otro' })).rejects.toBeInstanceOf(MedicationOrderPatientMismatchError);

    w.stripe.completeAction(p.providerPaymentId!, 'succeeded');
    const { processed } = await w.deliver('payment_intent.succeeded', p.providerPaymentId!);
    expect(processed[0]).toMatchObject({ outcome: 'processed', paymentStatus: 'succeeded', paymentChanged: true, effect: { kind: 'none' }, refundRequired: false });
    expect(w.only()).toMatchObject({ status: 'succeeded', doctorNet: money(0), peiFixedFee: null });
    expect(w.confirmCalls).toEqual([]);
  });

  it('la sincronización de un pedido no acepta un pago de consulta', async () => {
    const w = new World();
    const paid = await payConsultation(w);
    await expect(w.syncOrder.execute({ paymentId: paid.payment.paymentId, requestingPatientId: 'pat-1' })).rejects.toBeInstanceOf(NotAMedicationPaymentError);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
describe('Stripe · rutas del paciente', () => {
  const ACTOR = { userId: 'u-1', userProfileId: 'up-1', role: 'patient', ipAddress: null, userAgent: null } as never;
  const controller = (w: World) => new PatientPaymentsController(w.payAppointment, w.syncAppointment, { patientProfileIdFor: async () => 'pat-1' }, w.payOrder, w.syncOrder, w.useCases);

  it('consulta: la respuesta no expone el reparto ni las comisiones; con 3-D Secure incluye la acción del cliente', async () => {
    const w = new World();
    const ok = await controller(w).payAppointment(ACTOR, APPOINTMENT, KEY_1, { token: 'pm_card_visa' } as PayAppointmentDto);
    expect(ok).toEqual({ paymentId: expect.any(String), status: 'succeeded', amount: '200.00', currency: 'MXN', appointmentConfirmed: true, confirmation: { result: 'confirmed' }, recoverable: false });
    expect(JSON.stringify(ok)).not.toMatch(/180\.00|20\.00"|11\.83|8\.00|doctorNet|peiFixedFee|providerFee|pi_/);

    const w2 = new World();
    const c = controller(w2);
    const pending = await c.payAppointment(ACTOR, APPOINTMENT, KEY_1, { token: 'pm_card_threeDSecure2Required' } as PayAppointmentDto);
    expect(pending).toMatchObject({ status: 'processing', appointmentConfirmed: false, nextAction: { type: 'stripe_sdk', clientSecret: expect.any(String) } });
    // Reintento con la misma clave y sincronización: la acción se recupera sin crear otro cobro.
    const again = await c.payAppointment(ACTOR, APPOINTMENT, KEY_1, { token: 'pm_card_threeDSecure2Required' } as PayAppointmentDto);
    const synced = await c.syncPayment(ACTOR, pending.paymentId);
    expect([again.nextAction, synced.nextAction]).toEqual([pending.nextAction, pending.nextAction]);
    expect(w2.stripe.created).toHaveLength(1);
  });

  it('pedido: se paga por su ruta y la sincronización común reconoce un pago de pedido', async () => {
    const w = new World();
    const c = controller(w);
    const paid = await c.payMedicationOrder(ACTOR, ORDER, KEY_1, { token: 'pm_card_visa' } as PayMedicationOrderDto);
    expect(paid).toEqual({ paymentId: expect.any(String), status: 'succeeded', amount: '1234.56', currency: 'MXN', recoverable: false });
    await expect(c.syncPayment(ACTOR, paid.paymentId)).resolves.toEqual(paid);
  });
});
