import { createHash } from 'crypto';
import type { Clock } from '../../../../common/application/ports/clock';
import type { UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import { toDecimalString, type Money } from '../../domain/money';
import { buildPaymentRequest, type CardPaymentData, type PaymentRequest } from '../../domain/payment-request';
import { isCaptured, type PaymentStatus } from '../../domain/payment-status';
import { canTransition } from '../../domain/payment-transitions';
import { InvalidPaymentRequestError } from '../../domain/payments.errors';
import {
  PaymentProviderError,
  type PaymentProviderErrorKind,
  type PaymentProviderPort,
  type ProviderNextAction,
  type ProviderPaymentSnapshot,
} from '../ports/payment-provider.port';
import type {
  IdempotencyKeyRepository,
  PaymentIdGenerator,
  PaymentProviderUpdate,
  PaymentRecord,
  PaymentRepository,
  PeiFeeConfigurationRepository,
  ProcessorFeeScheduleRepository,
} from '../ports/payments.repositories';
import {
  ActivePaymentExistsError,
  IdempotencyKeyConflictError,
  NoEffectivePeiFeeError,
  NoEffectiveProcessorFeeError,
  PaymentInProgressError,
  PaymentNotFoundError,
  PaymentTypeNotEnabledError,
  ProviderStateConflictError,
} from '../payments-use-case.errors';

// Casos de uso de pagos (F2, segunda entrega): crear y consultar. Dependen solo de puertos.
//
// Idempotencia en dos niveles (PAY-14):
// 1. idempotency_key (scope payment.create): la clave del cliente queda ligada al hash de la solicitud y al pago en la
//    MISMA transacción que crea el pago. Repetir la clave devuelve el mismo pago; otra solicitud con la misma clave es
//    un conflicto.
// 2. Proveedor: clave de idempotencia = payment.id. Reenviar el mismo pago (tras un error o una respuesta perdida) no
//    crea otro cobro.
// AP-27a: el índice payment_active_appointment_uq impide un segundo pago activo para la misma cita, y
// payment_active_medication_order_uq, para el mismo pedido.
//
// Dos checkouts, un solo flujo (Payments-decisiones.md §8): consulta (comisión fija de PEI y neto del médico) y pedido
// de medicamentos (100 % de PEI, sin comisión fija y con neto del médico 0). El importe SIEMPRE lo aporta quien llama
// desde la cita o el pedido registrados; nunca viaja desde el cliente.

export const PAYMENT_CREATE_SCOPE = 'payment.create';
// Una clave sin completar más reciente que esto se considera EN CURSO por otra solicitud (no se reenvía).
export const IN_FLIGHT_WINDOW_MS = 60_000;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,128}$/;

export interface CreateConsultationPaymentInput {
  idempotencyKey: string;
  patientId: string;
  doctorId: string;
  // Cita RAÍZ (AP-27a). El precio lo determina quien llama a partir de la cita (integración con M08: fuera de alcance).
  appointmentId: string;
  gross: Money;
  card: CardPaymentData;
}

export interface CreateMedicationPaymentInput {
  idempotencyKey: string;
  patientId: string;
  medicationOrderId: string;
  // Total registrado en el pedido (medication_order.total).
  gross: Money;
  card: CardPaymentData;
}

// Destino del cobro, ya validado por quien llama.
type PaymentTarget =
  | { type: 'consultation'; patientId: string; doctorId: string; appointmentId: string; gross: Money }
  | { type: 'medication'; patientId: string; medicationOrderId: string; gross: Money };

export interface PaymentView {
  paymentId: string;
  type: PaymentRecord['type'];
  status: PaymentStatus;
  // AP-27a: capturado no significa liquidable ni que permita confirmar una cita.
  captured: boolean;
  providerPaymentId: string | null;
  providerStatus: string | null;
  gross: string;
  peiFixedFee: string | null;
  doctorNet: string;
  providerFeeEstimated: string;
  providerFeeActual: string | null;
  netReceived: string | null;
  moneyReleaseDate: string | null;
}

export interface CreatePaymentResult {
  payment: PaymentView;
  // true si el cobro puede no haberse completado en el proveedor y debe reintentarse con la MISMA clave.
  recoverable: boolean;
  providerError?: PaymentProviderErrorKind;
  // El cobro espera una acción del cliente (3-D Secure). Solo se entrega al dueño del pago; nunca se guarda.
  nextAction?: ProviderNextAction;
}

export const toView = (r: PaymentRecord): PaymentView => ({
  paymentId: r.id,
  type: r.type,
  status: r.status,
  captured: isCaptured(r.status),
  providerPaymentId: r.providerPaymentId,
  providerStatus: r.providerStatus,
  gross: toDecimalString(r.gross),
  peiFixedFee: r.peiFixedFee ? toDecimalString(r.peiFixedFee) : null,
  doctorNet: toDecimalString(r.doctorNet),
  providerFeeEstimated: toDecimalString(r.providerFeeEstimated),
  providerFeeActual: r.providerFeeActual ? toDecimalString(r.providerFeeActual) : null,
  netReceived: r.netReceived ? toDecimalString(r.netReceived) : null,
  moneyReleaseDate: r.moneyReleaseDate ? r.moneyReleaseDate.toISOString() : null,
});

// Hash de lo que identifica la solicitud. Excluye el token de la tarjeta (de un solo uso) y los datos del pagador.
export function createRequestHash(input: CreateConsultationPaymentInput): string {
  const canonical = JSON.stringify(['consultation', input.patientId, input.doctorId, input.appointmentId, input.gross.cents, input.gross.currency]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function createMedicationRequestHash(input: CreateMedicationPaymentInput): string {
  const canonical = JSON.stringify(['medication', input.patientId, input.medicationOrderId, input.gross.cents, input.gross.currency]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// Cambios a persistir a partir del snapshot del proveedor. Nunca sobrescribe referencias ni datos de conciliación
// ya fijados (payment_guard) y solo aplica transiciones permitidas; cualquier contradicción es un conflicto.
// El snapshot corresponde a ESTE pago: misma referencia externa, mismo importe y, si ya se fijó, la misma referencia
// del proveedor. También lo usa la sincronización por webhook (provider-snapshot-sync.ts).
export function assertSnapshotIdentity(record: PaymentRecord, s: ProviderPaymentSnapshot): void {
  // Un pago se sincroniza solo con el proveedor que lo cobró (los pagos históricos de Mercado Pago no se mezclan).
  if (s.provider !== record.provider) throw new ProviderStateConflictError('otro proveedor');
  if (s.externalReference !== record.id) throw new ProviderStateConflictError('external_reference distinta');
  if (s.amount.cents !== record.gross.cents) throw new ProviderStateConflictError('importe distinto');
  if (record.providerPaymentId !== null && record.providerPaymentId !== s.providerPaymentId) throw new ProviderStateConflictError('otro pago del proveedor');
}

// H-3 (decisión del 2026-11-16): una comisión está CONCILIADA cuando el backend obtuvo de Stripe la comisión real del
// pago (bt.fee, IVA incluido) de un balance_transaction verificado y el importe quedó persistido. `reconcile` solo lo
// activa el flujo bloqueado (decideSnapshot, dentro de applyProviderSnapshot); las rutas sin bloqueo (creación y
// sincronización del paciente) persisten la comisión pero no la marcan. Nunca se marca por la tarifa estimada, por el
// estado succeeded sin balance_transaction, ni por la fecha de disponibilidad (concepto distinto).
export function providerUpdateFor(record: PaymentRecord, s: ProviderPaymentSnapshot, now: Date, options: { reconcile?: boolean } = {}): PaymentProviderUpdate {
  assertSnapshotIdentity(record, s);
  if (!canTransition(record.status, s.status)) throw new ProviderStateConflictError(`transición ${record.status} → ${s.status} no permitida`);
  const setOnce = <T>(current: T | null, next: T | null, same: (a: T, b: T) => boolean, field: string): T | undefined => {
    if (next === null) return undefined;
    if (current === null) return next;
    if (!same(current, next)) throw new ProviderStateConflictError(`valor distinto del ya registrado (${field})`);
    return undefined;
  };
  const sameMoney = (a: Money, b: Money) => a.cents === b.cents;
  const update: PaymentProviderUpdate = { updatedAt: now, providerStatus: s.providerStatus, status: s.status };
  if (record.providerPaymentId === null) update.providerPaymentId = s.providerPaymentId;
  const fee = setOnce(record.providerFeeActual, s.providerFeeActual, sameMoney, 'la comisión real');
  if (fee) update.providerFeeActual = fee;
  const net = setOnce(record.netReceived, s.netReceived, sameMoney, 'el neto recibido');
  if (net) update.netReceived = net;
  const release = setOnce(record.moneyReleaseDate, s.moneyReleaseDate, (a, b) => a.getTime() === b.getTime(), 'la fecha de liberación');
  if (release) update.moneyReleaseDate = release;
  // setOnce ya garantizó que la comisión y el neto del snapshot coinciden con los persistidos (o se fijan ahora en esta
  // misma actualización): la marca va en la MISMA escritura que el importe.
  if (options.reconcile && record.feeReconciledAt === null && s.providerFeeVerified === true && s.providerFeeActual !== null && s.netReceived !== null) {
    const fee = record.providerFeeActual ?? update.providerFeeActual;
    const net = record.netReceived ?? update.netReceived;
    if (fee && net && sameMoney(fee, s.providerFeeActual) && sameMoney(net, s.netReceived)) update.feeReconciledAt = now;
  }
  return update;
}

export interface PaymentsUseCasesDeps {
  uow: UnitOfWork;
  clock: Clock;
  payments: PaymentRepository;
  keys: IdempotencyKeyRepository;
  peiFees: PeiFeeConfigurationRepository;
  processorFees: ProcessorFeeScheduleRepository;
  provider: PaymentProviderPort;
  ids: PaymentIdGenerator;
}

// Sin decoradores de Nest (el dominio y la aplicación de pagos no dependen del framework; prueba de arquitectura).
// El módulo Nest, cuando exista, la construirá con una factory a partir de los tokens de los puertos.
export class PaymentsUseCases {
  private readonly uow: UnitOfWork;
  private readonly clock: Clock;
  private readonly payments: PaymentRepository;
  private readonly keys: IdempotencyKeyRepository;
  private readonly peiFees: PeiFeeConfigurationRepository;
  private readonly processorFees: ProcessorFeeScheduleRepository;
  private readonly provider: PaymentProviderPort;
  private readonly ids: PaymentIdGenerator;

  constructor(deps: PaymentsUseCasesDeps) {
    ({ uow: this.uow, clock: this.clock, payments: this.payments, keys: this.keys, peiFees: this.peiFees,
      processorFees: this.processorFees, provider: this.provider, ids: this.ids } = deps);
  }

  // Crea (o recupera, con la misma clave) un pago de consulta. Solo consultas en esta entrega (PAY-20).
  async createConsultationPayment(input: CreateConsultationPaymentInput & { type?: string }): Promise<CreatePaymentResult> {
    if (input.type !== undefined && input.type !== 'consultation') throw new PaymentTypeNotEnabledError();
    if (!IDEMPOTENCY_KEY.test(input.idempotencyKey ?? '')) throw new InvalidPaymentRequestError('clave de idempotencia inválida');
    for (const [field, value] of [['patientId', input.patientId], ['doctorId', input.doctorId], ['appointmentId', input.appointmentId]] as const) {
      if (typeof value !== 'string' || !value) throw new InvalidPaymentRequestError(`falta ${field}`);
    }
    return this.create(
      { type: 'consultation', patientId: input.patientId, doctorId: input.doctorId, appointmentId: input.appointmentId, gross: input.gross },
      input.idempotencyKey,
      createRequestHash(input),
      input.card,
    );
  }

  // Crea (o recupera, con la misma clave) el pago de un pedido de medicamentos. Sin comisión fija de PEI: el importe es
  // 100 % de PEI y el neto del médico es 0 (medicationSplit; payment_medication_split_chk).
  async createMedicationPayment(input: CreateMedicationPaymentInput): Promise<CreatePaymentResult> {
    if (!IDEMPOTENCY_KEY.test(input.idempotencyKey ?? '')) throw new InvalidPaymentRequestError('clave de idempotencia inválida');
    for (const [field, value] of [['patientId', input.patientId], ['medicationOrderId', input.medicationOrderId]] as const) {
      if (typeof value !== 'string' || !value) throw new InvalidPaymentRequestError(`falta ${field}`);
    }
    return this.create(
      { type: 'medication', patientId: input.patientId, medicationOrderId: input.medicationOrderId, gross: input.gross },
      input.idempotencyKey,
      createMedicationRequestHash(input),
      input.card,
    );
  }

  private async create(target: PaymentTarget, idempotencyKey: string, requestHash: string, card: CardPaymentData): Promise<CreatePaymentResult> {
    const existing = await this.keys.find(PAYMENT_CREATE_SCOPE, idempotencyKey);
    if (existing) return this.resume(existing, requestHash, card, idempotencyKey);

    const now = this.clock.now();
    // La comisión fija de PEI solo existe en las consultas (PAY-04): un pedido de medicamentos no la consulta.
    const fee = target.type === 'consultation' ? await this.peiFees.findEffective(now) : null;
    if (target.type === 'consultation' && !fee) throw new NoEffectivePeiFeeError();
    const schedule = await this.processorFees.findEffective(this.provider.name, now);
    if (!schedule) throw new NoEffectiveProcessorFeeError();

    const paymentId = this.ids.newId();
    const request = buildPaymentRequest({
      paymentId,
      type: target.type,
      gross: target.gross,
      ...(fee ? { peiFee: { configurationId: fee.id, fixedFee: fee.fixedFee } } : {}),
      processorFee: schedule,
      card,
    });

    try {
      await this.uow.runInTransaction(async () => {
        await this.payments.insert({
          id: paymentId,
          type: target.type,
          provider: this.provider.name,
          status: 'pending',
          patientId: target.patientId,
          doctorId: target.type === 'consultation' ? target.doctorId : null,
          appointmentId: target.type === 'consultation' ? target.appointmentId : null,
          medicationOrderId: target.type === 'medication' ? target.medicationOrderId : null,
          gross: request.split.gross,
          peiFeeConfigurationId: request.split.peiFeeConfigurationId,
          peiFixedFee: request.split.peiFixedFee,
          doctorNet: request.split.doctorNet,
          processorFeeScheduleId: request.processorFeeScheduleId,
          providerFeeEstimated: request.providerFeeEstimated,
          createdAt: now,
        });
        await this.keys.insert({ scope: PAYMENT_CREATE_SCOPE, key: idempotencyKey, requestHash, paymentId, createdAt: now });
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationError) {
        // Otra solicitud ganó la carrera: con la misma clave se recupera su pago; si no, es otro pago activo del destino.
        const winner = await this.keys.find(PAYMENT_CREATE_SCOPE, idempotencyKey);
        if (winner) return this.resume(winner, requestHash, card, idempotencyKey);
        if (error.detail.constraint === 'payment_active_appointment_uq') throw new ActivePaymentExistsError();
        if (error.detail.constraint === 'payment_active_medication_order_uq') throw new ActivePaymentExistsError('order');
      }
      throw error;
    }
    return this.submit(paymentId, request, idempotencyKey);
  }

  // Consulta un pago. Con refresh, verifica el estado real en el proveedor y lo persiste (nunca basta un webhook).
  async getPayment(paymentId: string, options: { refresh?: boolean } = {}): Promise<PaymentView> {
    const record = await this.payments.findById(paymentId);
    if (!record) throw new PaymentNotFoundError();
    if (!options.refresh || record.providerPaymentId === null) return toView(record);
    // Solo el proveedor que cobró el pago conoce su estado: un pago histórico de otro proveedor no se consulta aquí.
    if (record.provider !== this.provider.name) throw new ProviderStateConflictError('otro proveedor');
    const snapshot = await this.provider.getPayment(record.providerPaymentId);
    const update = providerUpdateFor(record, snapshot, this.clock.now());
    await this.uow.runInTransaction(() => this.payments.update(record.id, update));
    return toView((await this.payments.findById(record.id))!);
  }

  // Acción que el cliente aún debe completar (3-D Secure) en un pago en proceso, consultada al proveedor sin persistir
  // nada. null si no hay ninguna o no se puede saber ahora. Quien llama ya validó que el pago es del paciente.
  async pendingAction(paymentId: string): Promise<ProviderNextAction | null> {
    const record = await this.payments.findById(paymentId);
    if (!record || record.status !== 'processing' || record.providerPaymentId === null || record.provider !== this.provider.name) return null;
    try {
      return (await this.provider.getPayment(record.providerPaymentId)).nextAction ?? null;
    } catch (error) {
      if (error instanceof PaymentProviderError) return null;
      throw error;
    }
  }

  // Clave ya registrada: misma solicitud → mismo pago (reenvío seguro si quedó pendiente); otra solicitud → conflicto.
  private async resume(
    key: { requestHash: string; paymentId: string | null; createdAt: Date; completedAt: Date | null },
    requestHash: string,
    card: CardPaymentData,
    idempotencyKey: string,
  ): Promise<CreatePaymentResult> {
    if (key.requestHash !== requestHash) throw new IdempotencyKeyConflictError();
    const record = key.paymentId ? await this.payments.findById(key.paymentId) : null;
    if (!record) throw new PaymentNotFoundError();
    if (key.completedAt !== null || record.providerPaymentId !== null || record.status !== 'pending') {
      return { payment: toView(record), recoverable: false };
    }
    if (this.clock.now().getTime() - key.createdAt.getTime() < IN_FLIGHT_WINDOW_MS) throw new PaymentInProgressError();
    // Pendiente sin referencia del proveedor (error o respuesta perdida): se reenvía EL MISMO pago con la misma
    // X-Idempotency-Key, reconstruido con su snapshot. La tarifa debe seguir siendo la registrada.
    const schedule = await this.processorFees.findById(record.processorFeeScheduleId);
    if (!schedule) throw new ProviderStateConflictError('snapshot incompleto');
    let peiFee: { configurationId: string; fixedFee: Money } | undefined;
    if (record.type === 'consultation') {
      if (record.peiFeeConfigurationId === null || record.peiFixedFee === null) throw new ProviderStateConflictError('snapshot incompleto');
      peiFee = { configurationId: record.peiFeeConfigurationId, fixedFee: record.peiFixedFee };
    }
    const request = buildPaymentRequest({ paymentId: record.id, type: record.type, gross: record.gross, ...(peiFee ? { peiFee } : {}), processorFee: schedule, card });
    if (request.providerFeeEstimated.cents !== record.providerFeeEstimated.cents || request.split.doctorNet.cents !== record.doctorNet.cents) {
      throw new ProviderStateConflictError('el snapshot reconstruido no coincide con el registrado');
    }
    return this.submit(record.id, request, idempotencyKey);
  }

  private async submit(paymentId: string, request: PaymentRequest, idempotencyKey: string): Promise<CreatePaymentResult> {
    let snapshot: ProviderPaymentSnapshot;
    try {
      snapshot = await this.provider.createPayment(request);
    } catch (error) {
      if (!(error instanceof PaymentProviderError)) throw error;
      const record = (await this.payments.findById(paymentId))!;
      if (error.kind === 'rejected_request' || error.kind === 'unauthorized') {
        // El proveedor rechazó la solicitud (no hay cobro): el pago queda fallido y la clave, completada.
        const now = this.clock.now();
        await this.uow.runInTransaction(async () => {
          await this.payments.update(paymentId, { status: 'failed', updatedAt: now });
          await this.keys.complete(PAYMENT_CREATE_SCOPE, idempotencyKey, now);
        });
        return { payment: toView({ ...record, status: 'failed', updatedAt: now }), recoverable: false, providerError: error.kind };
      }
      // Sin respuesta fiable (red, tiempo, 5xx o respuesta inesperada): el cobro PUDO crearse. El pago queda pendiente
      // y la clave sin completar, para reenviar con la misma clave (misma X-Idempotency-Key) o conciliar.
      return { payment: toView(record), recoverable: true, providerError: error.kind };
    }
    const now = this.clock.now();
    const record = (await this.payments.findById(paymentId))!;
    const update = providerUpdateFor(record, snapshot, now);
    await this.uow.runInTransaction(async () => {
      await this.payments.update(paymentId, update);
      await this.keys.complete(PAYMENT_CREATE_SCOPE, idempotencyKey, now);
    });
    return { payment: toView((await this.payments.findById(paymentId))!), recoverable: false, ...(snapshot.nextAction ? { nextAction: snapshot.nextAction } : {}) };
  }
}
