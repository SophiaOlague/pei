import type { Clock } from '../../../../common/application/ports/clock';
import type { UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import type { AppointmentConfirmationService, ConfirmationResult } from '../../../appointments/application/integration/appointment-integration.services';
import {
  AppointmentNotFoundForPaymentError,
  assertPaymentMatchesAppointment,
  confirmCapturedPayment,
  PaymentAppointmentMismatchError,
  requiresPaymentErrorRefund,
} from './payment-appointment-identity';
import { UnconfirmableRefundRequestError } from '../refunds.errors';
import type { RefundsUseCases } from './refunds.use-cases';
import type { AppointmentStatus } from '../../../appointments/domain/appointment-status';
import { isHoldActive } from '../../../appointments/domain/hold';
import type { PaymentStatus } from '../../domain/payment-status';
import type { AppointmentPaymentReader } from '../ports/appointment-payment.reader';
import { PaymentProviderError, type PaymentProviderPort } from '../ports/payment-provider.port';
import type { PaymentLockRepository, PaymentRecord, PaymentRepository } from '../ports/payments.repositories';
import type {
  ProviderWebhookAuthenticator,
  RawWebhookRequest,
  RetryableQuery,
  WebhookEventDispatcher,
  WebhookEventRecord,
  WebhookEventRepository,
} from '../ports/provider-webhook.port';
import { ProviderStateConflictError } from '../payments-use-case.errors';
import { applyProviderSnapshot } from './provider-snapshot-sync';
import { classifyWebhookFailure, cumulativeBackoffMs, PERMANENT_WEBHOOK_FAILURES } from './webhook-retry-policy';

// F3.3 (PAY-14, PAY-15): webhooks del proveedor.
//
// Recepción (ReceiveProviderWebhookUseCase), síncrona y rápida:
//   validar la firma → registrar el evento (único por proveedor, tema, data.id y x-request-id) → despachar → 200.
//   - Firma inválida: no se registra nada (un evento falso no debe ocupar la clave única de uno legítimo).
//   - Evento repetido: no se registra otra vez ni se procesa de nuevo si ya terminó.
// Procesamiento (ProcessProviderWebhookEventUseCase), en segundo plano:
//   reclamar el evento → consultar el pago REAL en la API con el data.id firmado (el cuerpo nunca decide) → bloquear el
//   pago y aplicar la transición (decideSnapshot) → efectos en M08 → cerrar el evento.
//   - succeeded → paso compartido confirmCapturedPayment (identidad del pago con la cita: cita, paciente y médico; el
//     mismo que usan el pago y la sincronización manual) → confirmPaid (idempotente en M08).
//   - failed/canceled → con la retención vigente no se hace nada (el paciente puede reintentar, S6/T-1); con la
//     retención vencida el intento es terminal → markPaymentFailed.
//   - pending/processing (in_process, authorized, 3DS) → solo se registra el estado; no se confirma.
//   - not_confirmable por retención vencida o importe → se registra el reembolso total idempotente (F5, CC-4/AP-8) y el
//     evento queda procesado con refundRequired. invalid_state (la cita ya se confirmó con este pago y cambió después)
//     no reembolsa. Si el registro del reembolso falla, el evento falla y se reintenta.
// Reintento (RetryProviderWebhookEventsUseCase): recoge eventos fallidos, no despachados o abandonados a medias.
//
// Garantías ante duplicados y concurrencia: el evento se reclama de forma atómica; el pago se actualiza con bloqueo
// de fila y solo si hay algo nuevo; confirmPaid y markPaymentFailed son idempotentes en M08 (bloquean la cita). Una
// notificación repetida nunca confirma dos veces una cita ni escribe dos veces los datos financieros del pago. En esta
// fase no se crean asientos del ledger (F6).

export const PAYMENT_WEBHOOK_TOPIC = 'payment';
export const SUPPORTED_WEBHOOK_TOPICS: ReadonlySet<string> = new Set([PAYMENT_WEBHOOK_TOPIC]);
export const WEBHOOK_MAX_ATTEMPTS = 8;
// Un evento `received` más antiguo que esto no llegó a despacharse (p. ej. el proceso se reinició).
export const WEBHOOK_UNDISPATCHED_AFTER_MS = 60_000;
// Un evento `processing` más antiguo que esto se considera abandonado (no hay columna de reclamo: se usa received_at;
// procesarlo dos veces es seguro).
export const WEBHOOK_STALE_PROCESSING_AFTER_MS = 15 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------------------------------------------------
// Recepción
// ---------------------------------------------------------------------------------------------------------------------

export interface ReceiveWebhookResult {
  // accepted: registrado y despachado; ignored: registrado, tema sin procesamiento; duplicate: ya estaba registrado.
  outcome: 'accepted' | 'ignored' | 'duplicate';
  eventId: string;
}

export interface ReceiveProviderWebhookDeps {
  clock: Clock;
  authenticator: ProviderWebhookAuthenticator;
  events: WebhookEventRepository;
  dispatcher: WebhookEventDispatcher;
}

export class ReceiveProviderWebhookUseCase {
  constructor(private readonly deps: ReceiveProviderWebhookDeps) {}

  // Lanza WebhookAuthenticationError si la firma no es válida (antes de tocar la base de datos).
  async execute(request: RawWebhookRequest): Promise<ReceiveWebhookResult> {
    const n = this.deps.authenticator.authenticate(request);
    const status = SUPPORTED_WEBHOOK_TOPICS.has(n.topic) ? 'received' : 'ignored';
    try {
      const eventId = await this.deps.events.insert({
        provider: n.provider, topic: n.topic, action: n.action, dataId: n.dataId, requestId: n.requestId,
        payload: n.payload, status, receivedAt: this.deps.clock.now(),
      });
      if (status === 'received') this.deps.dispatcher.dispatch(eventId);
      return { outcome: status === 'received' ? 'accepted' : 'ignored', eventId };
    } catch (error) {
      if (!(error instanceof UniqueConstraintViolationError) || error.detail.constraint !== 'provider_webhook_event_uq') throw error;
      const existing = await this.deps.events.findByKey({ provider: n.provider, topic: n.topic, dataId: n.dataId, requestId: n.requestId });
      if (!existing) throw error;
      // Reentrega del mismo evento: si quedó pendiente o falló, se vuelve a intentar (es idempotente); si ya terminó
      // o está en curso, no se hace nada.
      if (existing.status === 'received' || existing.status === 'failed') this.deps.dispatcher.dispatch(existing.id);
      return { outcome: 'duplicate', eventId: existing.id };
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Procesamiento
// ---------------------------------------------------------------------------------------------------------------------

export type AppointmentEffect =
  // Estado sin efecto en M08 (pending, processing, reembolsos, disputas, pagos que no son de consulta).
  | { kind: 'none' }
  | { kind: 'confirmation'; result: ConfirmationResult }
  // Intento terminal con la retención vencida: markPaymentFailed.
  | { kind: 'hold_released' }
  // Rechazo con la retención vigente: no se toca la cita; el paciente puede reintentar (S6, T-1).
  | { kind: 'retry_allowed' };

export type ProcessWebhookResult =
  | { outcome: 'skipped' }
  | { outcome: 'ignored'; reason: string }
  | {
      outcome: 'processed';
      paymentId: string;
      paymentStatus: PaymentStatus;
      // El snapshot aplicó un cambio al pago (false si era un duplicado o un snapshot atrasado).
      paymentChanged: boolean;
      effect: AppointmentEffect;
      // succeeded pero M08 no pudo confirmar: corresponde reembolso (F5, CC-4/AP-8).
      refundRequired: boolean;
    }
  // permanent: el barrido automático no lo reintentará (R-4). exhausted: agotó WEBHOOK_MAX_ATTEMPTS (R-5).
  | { outcome: 'failed'; reason: string; paymentId: string | null; permanent: boolean; exhausted: boolean };

export interface ProcessProviderWebhookDeps {
  uow: UnitOfWork;
  clock: Clock;
  events: WebhookEventRepository;
  provider: PaymentProviderPort;
  payments: Pick<PaymentRepository, 'findById' | 'update'>;
  locks: PaymentLockRepository;
  appointments: AppointmentPaymentReader;
  confirmation: Pick<AppointmentConfirmationService, 'confirmPaid' | 'markPaymentFailed'>;
  // F5: reembolso del pago no confirmable y avance de los reembolsos abiertos del pago notificado.
  refunds?: Pick<RefundsUseCases, 'requestForUnconfirmablePayment' | 'syncOpenForPayment'>;
  // Registro de anomalías sin datos personales (solo ids técnicos y códigos).
  warn?: (message: string) => void;
  // H-6 etapa 2 (R-5): avisos que exigen revisión (error permanente o intentos agotados), con una etiqueta fija y
  // buscable. Sin datos personales.
  alert?: (message: string) => void;
}

// Etiquetas de los avisos de R-5 (buscables en los registros).
export const WEBHOOK_PERMANENT_FAILURE_TAG = '[PAYMENTS-WEBHOOK-PERMANENT]';
export const WEBHOOK_EXHAUSTED_TAG = '[PAYMENTS-WEBHOOK-EXHAUSTED]';

// Fallos del procesamiento con un código corto que se guarda en last_error (sin datos personales).
class WebhookProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function webhookFailureReason(error: unknown): string {
  if (error instanceof WebhookProcessingError) return error.code;
  if (error instanceof PaymentAppointmentMismatchError) return `appointment_mismatch:${error.party}`;
  if (error instanceof AppointmentNotFoundForPaymentError) return 'appointment_not_found';
  if (error instanceof UnconfirmableRefundRequestError) return 'refund_request_failed';
  if (error instanceof PaymentProviderError) return `provider:${error.kind}`;
  if (error instanceof ProviderStateConflictError) return `conflict:${error.reason}`.slice(0, 200);
  return 'internal';
}

export class ProcessProviderWebhookEventUseCase {
  constructor(private readonly deps: ProcessProviderWebhookDeps) {}

  async execute(eventId: string, options: { reclaimProcessingReceivedBefore?: Date } = {}): Promise<ProcessWebhookResult> {
    const event = await this.deps.events.claim(eventId, {
      now: this.deps.clock.now(),
      maxAttempts: WEBHOOK_MAX_ATTEMPTS,
      reclaimProcessingReceivedBefore: options.reclaimProcessingReceivedBefore,
    });
    if (!event) return { outcome: 'skipped' };
    if (event.topic !== PAYMENT_WEBHOOK_TOPIC) return this.ignore(event, 'unsupported_topic');

    let paymentId: string | null = null;
    try {
      // PAY-15: la verdad del pago es la API, consultada con el data.id FIRMADO. Nada del cuerpo se usa aquí.
      const snapshot = await this.deps.provider.getPayment(event.dataId);
      // external_reference = payment.id (lo fija el adaptador al crear). Otro valor: un pago que PEI no creó.
      if (!UUID.test(snapshot.externalReference)) return this.ignore(event, 'foreign_payment');

      const applied = await applyProviderSnapshot(this.deps, snapshot.externalReference, snapshot, (id) => (paymentId = id));
      if (!applied) return this.ignore(event, 'unknown_payment');

      const record = await this.deps.payments.findById(applied.id);
      if (!record) throw new WebhookProcessingError('payment_vanished');
      const effect = await this.settleAppointment(record);
      // F5: el reembolso ya quedó registrado (durable) en el paso de confirmación; aquí solo se informa.
      const refundRequired = effect.kind === 'confirmation' && requiresPaymentErrorRefund(effect.result);
      if (refundRequired) {
        const reason = (effect.result as { reason?: string }).reason ?? 'unknown';
        this.deps.warn?.(`Pago ${record.id} capturado sin cita confirmable (${reason}): reembolso total ${this.deps.refunds ? 'solicitado' : 'pendiente (sin servicio de reembolsos)'}`);
      }
      // F5: un webhook de pago también avisa de reembolsos; se avanzan los abiertos de este pago (errores no bloquean).
      if (this.deps.refunds && ['succeeded', 'partially_refunded', 'refunded'].includes(record.status)) await this.deps.refunds.syncOpenForPayment(record.id);
      await this.deps.events.finish(event.id, { status: 'processed', at: this.deps.clock.now(), paymentId: record.id, lastError: null });
      return { outcome: 'processed', paymentId: record.id, paymentStatus: record.status, paymentChanged: applied.changed, effect, refundRequired };
    } catch (error) {
      const reason = webhookFailureReason(error);
      if (reason.startsWith('conflict:') || reason.startsWith('appointment_')) {
        this.deps.warn?.(`Evento de webhook ${event.id} con anomalía (${reason}): requiere conciliación`);
      }
      await this.deps.events.finish(event.id, { status: 'failed', at: this.deps.clock.now(), paymentId, lastError: reason });
      // H-6 etapa 2: un error permanente no se reintenta en el barrido (R-4); unos intentos agotados tampoco (R-5).
      const permanent = classifyWebhookFailure(reason) === 'permanent';
      const exhausted = event.processingAttempts >= WEBHOOK_MAX_ATTEMPTS;
      const what = `evento de webhook ${event.id} (${event.provider}, ${event.action ?? event.topic}, intento ${event.processingAttempts} de ${WEBHOOK_MAX_ATTEMPTS})`;
      if (permanent) {
        this.deps.alert?.(`${WEBHOOK_PERMANENT_FAILURE_TAG} ${what}: error permanente (${reason}); no se reintentará automáticamente, requiere revisión`);
      } else if (exhausted) {
        this.deps.alert?.(`${WEBHOOK_EXHAUSTED_TAG} ${what}: agotó sus intentos (último error ${reason}); no se reintentará automáticamente, requiere revisión`);
      }
      return { outcome: 'failed', reason, paymentId, permanent, exhausted };
    }
  }

  private async ignore(event: WebhookEventRecord, reason: string): Promise<ProcessWebhookResult> {
    await this.deps.events.finish(event.id, { status: 'ignored', at: this.deps.clock.now(), lastError: reason });
    return { outcome: 'ignored', reason };
  }

  private async settleAppointment(record: PaymentRecord): Promise<AppointmentEffect> {
    if (record.type !== 'consultation' || !record.appointmentId) return { kind: 'none' };
    const terminalFailure = record.status === 'failed' || record.status === 'canceled';
    if (record.status !== 'succeeded' && !terminalFailure) return { kind: 'none' };

    const appointment = await this.deps.appointments.findForPayment(record.appointmentId);
    if (!appointment) throw new AppointmentNotFoundForPaymentError();
    // Misma regla de identidad para confirmar y para liberar la retención.
    assertPaymentMatchesAppointment(record, appointment);

    if (record.status === 'succeeded') {
      // AP-27a: solo un pago succeeded verificado con la API confirma la cita.
      const result = await confirmCapturedPayment(this.deps, record, appointment);
      if (result.result === 'confirmation_failed' || result.result === 'not_requested') throw new WebhookProcessingError('confirmation_failed');
      return { kind: 'confirmation', result };
    }

    if (appointment.status !== 'pending_payment') return { kind: 'none' };
    const hold = { status: appointment.status as AppointmentStatus, paymentHoldExpiresAt: appointment.paymentHoldExpiresAt };
    if (isHoldActive(hold, this.deps.clock.now())) return { kind: 'retry_allowed' };
    try {
      await this.deps.confirmation.markPaymentFailed(appointment.appointmentId);
    } catch {
      throw new WebhookProcessingError('release_failed');
    }
    return { kind: 'hold_released' };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Reintento periódico
// ---------------------------------------------------------------------------------------------------------------------

export interface RetryWebhookSummary {
  examined: number;
  processed: number;
  failed: number;
  ignored: number;
  skipped: number;
}

export interface RetryProviderWebhookDeps {
  clock: Clock;
  events: WebhookEventRepository;
  processor: Pick<ProcessProviderWebhookEventUseCase, 'execute'>;
}

// Recoge los eventos fallidos con intentos disponibles, los no despachados y los abandonados a medias, y los procesa
// uno por uno. Quién lo ejecuta y cada cuánto está pendiente de decisión (no hay planificador en el proyecto).
// Consulta del barrido: `received` no despachados (60 s), `failed` con intentos y fuera de su espera acumulada (H-6 etapa
// 2, R-3), sin errores permanentes (R-4), y `processing` abandonados (15 min).
export function buildRetryableQuery(at: Date, limit: number): RetryableQuery {
  const now = at.getTime();
  return {
    maxAttempts: WEBHOOK_MAX_ATTEMPTS,
    receivedBefore: new Date(now - WEBHOOK_UNDISPATCHED_AFTER_MS),
    processingReceivedBefore: new Date(now - WEBHOOK_STALE_PROCESSING_AFTER_MS),
    limit,
    failedReceivedBefore: Array.from({ length: WEBHOOK_MAX_ATTEMPTS }, (_, n) => new Date(now - cumulativeBackoffMs(n))),
    excludeFailures: PERMANENT_WEBHOOK_FAILURES,
  };
}

export class RetryProviderWebhookEventsUseCase {
  constructor(private readonly deps: RetryProviderWebhookDeps) {}

  async execute(options: { limit?: number } = {}): Promise<RetryWebhookSummary> {
    const query = buildRetryableQuery(this.deps.clock.now(), options.limit ?? 50);
    const processingReceivedBefore = query.processingReceivedBefore;
    const ids = await this.deps.events.findRetryable(query);
    const summary: RetryWebhookSummary = { examined: ids.length, processed: 0, failed: 0, ignored: 0, skipped: 0 };
    for (const id of ids) {
      const r = await this.deps.processor.execute(id, { reclaimProcessingReceivedBefore: processingReceivedBefore });
      summary[r.outcome] += 1;
    }
    return summary;
  }
}
