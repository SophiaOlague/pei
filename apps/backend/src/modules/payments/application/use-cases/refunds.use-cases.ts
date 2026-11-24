import { createHash } from 'crypto';
import type { Clock } from '../../../../common/application/ports/clock';
import type { UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import { UniqueConstraintViolationError } from '../../../../common/domain/persistence.errors';
import { money, toDecimalString, type Money } from '../../domain/money';
import {
  isActiveRefund,
  isOpenRefund,
  isPartialRefund,
  reconcileRefunds,
  refundableAmount,
  refundShares,
  REFUNDABLE_PAYMENT_STATUSES,
  type RefundReconciliation,
  type RefundStatus,
} from '../../domain/refund';
import { PaymentProviderError, type PaymentProviderPort } from '../ports/payment-provider.port';
import type { IdempotencyKeyRecord, IdempotencyKeyRepository, PaymentIdGenerator, PaymentLockRepository, PaymentRecord, PaymentRepository } from '../ports/payments.repositories';
import type { ProviderRefundSnapshot, RefundProviderPort, RefundReason, RefundRecord, RefundRepository, RefundRequesterType } from '../ports/refunds.port';
import { IdempotencyKeyConflictError, PaymentNotFoundError, PaymentTypeNotEnabledError } from '../payments-use-case.errors';
import { InvalidRefundRequestError, PaymentNotRefundableError, RefundApprovalError, RefundExceedsAvailableError, RefundNotFoundError } from '../refunds.errors';
import { refreshPaymentFromProvider } from './provider-snapshot-sync';

// F5: reembolsos de consultas (RF-46; PAY-17, PAY-18; 0017). Dependen solo de puertos.
//
// Ciclo de vida (mismas transiciones que refund_guard):
//   requested ──(total, o parcial aprobado)──▶ pending ──POST con X-Idempotency-Key = refund.id──▶ processing
//   processing ──(estado REAL del proveedor)──▶ succeeded | failed
// - Se pasa a pending ANTES de llamar al proveedor: si el proceso cae a mitad de la llamada, la recuperación reenvía el
//   MISMO reembolso con la MISMA clave (Mercado Pago no duplica dentro de su ventana de 24 h).
// - Con el id del proveedor se pasa a processing; succeeded solo si el proveedor informa approved (al crear o al
//   consultar). Una respuesta HTTP aceptada no basta.
// - Rechazo definitivo del proveedor (4xx de solicitud o pago inexistente) → failed. Red, tiempo, 5xx, 409/428,
//   credenciales o respuesta inesperada → sigue pending y se reintenta.
// - Pasada la ventana segura de reenvío, un pending sin id del proveedor NO se reenvía: queda para revisión manual
//   (evita un segundo reembolso si la clave ya caducó en el proveedor).
// Idempotencia de la solicitud: idempotency_key (scope, key) ligada al reembolso en la MISMA transacción que lo crea; el
// pago se bloquea (FOR UPDATE) para calcular el disponible y la prorrata, así que dos solicitudes simultáneas se
// serializan y nunca superan el importe del pago (refund_within_payment lo vuelve a comprobar).
// Comisión del proveedor: no se supone devuelta. provider_fee_returned/unrecovered_provider_fee solo se fijan con un
// dato real del proveedor (hoy la API de reembolsos no lo informa: quedan null y la conciliación los muestra como
// desconocidos).

export const REFUND_CREATE_SCOPE = 'refund.create';
export const REFUND_CANCELLATION_SCOPE = 'refund.appointment_canceled';
export const REFUND_PAYMENT_ERROR_SCOPE = 'refund.payment_error';
// Videoconsulta: reembolso total por no_show_doctor o no_show_both, idempotente por pago (key = payment.id).
export const REFUND_NO_SHOW_SCOPE = 'refund.appointment_no_show';
// Mercado Pago conserva la idempotencia 24 h. Margen: solo se reenvía un pending sin respuesta dentro de 20 h.
export const REFUND_RESUBMIT_WINDOW_MS = 20 * 3_600_000;
// La recuperación no toca reembolsos con actividad más reciente que esto (otro proceso puede estar en curso).
export const REFUND_RECOVERY_IDLE_MS = 60_000;
// Un pending más reciente que esto tiene probablemente su envío EN CURSO en otro proceso (webhook o evento duplicado):
// no se reenvía todavía. Reenviar sería seguro (misma clave), pero innecesario.
export const REFUND_IN_FLIGHT_MS = 30_000;

export type RefundAmountRequest =
  // El pago completo: exige que no haya otros reembolsos activos.
  | { kind: 'full' }
  | { kind: 'partial'; amount: Money }
  // Lo que quede disponible (cancelaciones y pagos no confirmables). Si no queda nada, no se crea reembolso.
  | { kind: 'remaining' };

export interface RequestRefundInput {
  scope: string;
  key: string;
  paymentId: string;
  amount: RefundAmountRequest;
  reason: RefundReason;
  requestedBy: { type: RefundRequesterType; userProfileId: string | null };
  // Administrador que aprueba un parcial en la misma solicitud (PAY-17). Puede aprobarse después.
  approvedBy?: string | null;
  notes?: string | null;
}

export interface RefundView {
  refundId: string;
  paymentId: string;
  status: RefundStatus;
  amount: string;
  reason: RefundReason;
  peiFeeShare: string;
  doctorShare: string;
  providerRefundId: string | null;
  providerStatus: string | null;
  approvedBy: string | null;
  awaitingApproval: boolean;
  processedAt: string | null;
  failureReason: string | null;
}

export type AdvanceAction =
  | 'awaiting_approval' // parcial sin aprobación
  | 'submitted' // se envió al proveedor y se aplicó su respuesta
  | 'synced' // se consultó el estado real en el proveedor
  | 'rejected' // el proveedor lo rechazó de forma definitiva (failed)
  | 'retry_later' // sin respuesta fiable: sigue pending/processing
  | 'in_flight' // otro proceso lo está enviando ahora mismo
  | 'manual_review' // no es seguro continuar automáticamente (ventana vencida o respuesta incoherente)
  | 'terminal'; // ya terminó (succeeded, failed o canceled)

export interface AdvanceResult {
  refund: RefundView;
  action: AdvanceAction;
}

export interface RequestRefundResult {
  // created: nuevo; existing: misma clave (o pago no confirmable ya en curso); nothing_to_refund: no queda saldo.
  outcome: 'created' | 'existing' | 'nothing_to_refund';
  refund: RefundView | null;
  action: AdvanceAction | null;
}

export interface RecoverRefundsSummary {
  examined: number;
  byAction: Partial<Record<AdvanceAction | 'error', number>>;
}

export interface RefundsUseCasesDeps {
  uow: UnitOfWork;
  clock: Clock;
  payments: Pick<PaymentRepository, 'findById' | 'update'>;
  locks: PaymentLockRepository;
  refunds: RefundRepository;
  keys: IdempotencyKeyRepository;
  provider: RefundProviderPort;
  // Consulta del pago tras un reembolso exitoso (partially_refunded/refunded con el estado real).
  paymentProvider: Pick<PaymentProviderPort, 'getPayment'>;
  ids: PaymentIdGenerator;
  warn?: (message: string) => void;
}

const sumMoney = (xs: readonly Money[]) => money(xs.reduce((c, m) => c + m.cents, 0));

export function refundRequestHash(input: RequestRefundInput): string {
  const amount = input.amount.kind === 'partial' ? ['partial', input.amount.amount.cents] : [input.amount.kind];
  return createHash('sha256').update(JSON.stringify(['refund', input.paymentId, ...amount, input.reason]), 'utf8').digest('hex');
}

export function toRefundView(r: RefundRecord, gross: Money | null): RefundView {
  return {
    refundId: r.id,
    paymentId: r.paymentId,
    status: r.status,
    amount: toDecimalString(r.amount),
    reason: r.reason,
    peiFeeShare: toDecimalString(r.peiFeeShare),
    doctorShare: toDecimalString(r.doctorShare),
    providerRefundId: r.providerRefundId,
    providerStatus: r.providerStatus,
    approvedBy: r.approvedBy,
    awaitingApproval: r.status === 'requested' && gross !== null && isPartialRefund(gross, r.amount) && r.approvedBy === null,
    processedAt: r.processedAt ? r.processedAt.toISOString() : null,
    failureReason: r.failureReason,
  };
}

type TxOutcome = { kind: 'created' } | { kind: 'nothing' } | { kind: 'existing'; refundId: string } | { kind: 'key'; key: IdempotencyKeyRecord };

export class RefundsUseCases {
  constructor(private readonly d: RefundsUseCasesDeps) {}

  // Solicitar un reembolso (total, parcial o del saldo restante). Idempotente por (scope, key).
  async requestRefund(input: RequestRefundInput): Promise<RequestRefundResult> {
    if (!input.scope?.trim() || !input.key?.trim()) throw new InvalidRefundRequestError('falta la clave de idempotencia');
    if (input.amount.kind === 'partial' && input.amount.amount.cents <= 0) throw new InvalidRefundRequestError('el importe debe ser mayor que cero');
    const requestHash = refundRequestHash(input);
    const known = await this.d.keys.find(input.scope, input.key);
    if (known) return this.resumeKey(known, requestHash);

    const now = this.d.clock.now();
    const refundId = this.d.ids.newId();
    let tx: TxOutcome;
    try {
      tx = await this.d.uow.runInTransaction(async (): Promise<TxOutcome> => {
        const payment = await this.d.locks.lockById(input.paymentId);
        if (!payment) throw new PaymentNotFoundError();
        // Con el pago bloqueado: otra solicitud con la misma clave pudo terminar mientras esperábamos.
        const raced = await this.d.keys.find(input.scope, input.key);
        if (raced) return { kind: 'key', key: raced };
        if (payment.type !== 'consultation') throw new PaymentTypeNotEnabledError();
        if (!REFUNDABLE_PAYMENT_STATUSES.includes(payment.status)) throw new PaymentNotRefundableError(payment.status);
        if (!payment.providerPaymentId) throw new PaymentNotRefundableError('without_provider_reference');

        const active = (await this.d.refunds.listByPayment(payment.id)).filter((r) => isActiveRefund(r.status));
        // C-29: un solo reembolso por error de pago activo (refund_payment_error_uq).
        const activePaymentError = active.find((r) => r.reason === 'payment_error');
        if (input.reason === 'payment_error' && activePaymentError) return { kind: 'existing', refundId: activePaymentError.id };

        const previous = { amount: sumMoney(active.map((r) => r.amount)), peiFeeShare: sumMoney(active.map((r) => r.peiFeeShare)) };
        const available = refundableAmount(payment.gross, previous.amount);
        const amount = this.resolveAmount(input.amount, payment.gross, available);
        if (!amount) return { kind: 'nothing' };
        const shares = refundShares(payment, previous, amount);
        await this.d.refunds.insert({
          id: refundId,
          paymentId: payment.id,
          amount,
          reason: input.reason,
          provider: payment.provider,
          peiFeeShare: shares.peiFeeShare,
          doctorShare: shares.doctorShare,
          requestedByType: input.requestedBy.type,
          requestedByUserProfileId: input.requestedBy.userProfileId,
          approvedBy: input.approvedBy ?? null,
          notes: input.notes ?? null,
          requestedAt: now,
        });
        await this.d.keys.insert({ scope: input.scope, key: input.key, requestHash, paymentId: payment.id, refundId, createdAt: now });
        return { kind: 'created' };
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationError) {
        const winner = await this.d.keys.find(input.scope, input.key);
        if (winner) return this.resumeKey(winner, requestHash);
        if (error.detail.constraint === 'refund_payment_error_uq' && input.reason === 'payment_error') {
          const existing = (await this.d.refunds.listByPayment(input.paymentId)).find((r) => r.reason === 'payment_error' && isActiveRefund(r.status));
          if (existing) return this.existing(existing.id);
        }
      }
      throw error;
    }
    if (tx.kind === 'key') return this.resumeKey(tx.key, requestHash);
    if (tx.kind === 'existing') return this.existing(tx.refundId);
    if (tx.kind === 'nothing') return { outcome: 'nothing_to_refund', refund: null, action: null };
    const step = await this.advance(refundId);
    return { outcome: 'created', refund: step.refund, action: step.action };
  }

  // C-29 / CC-4: pago capturado cuya cita no se puede confirmar → reembolso total del saldo, idempotente por pago.
  async requestForUnconfirmablePayment(paymentId: string): Promise<RequestRefundResult> {
    return this.requestRefund({
      scope: REFUND_PAYMENT_ERROR_SCOPE,
      key: paymentId,
      paymentId,
      amount: { kind: 'remaining' },
      reason: 'payment_error',
      requestedBy: { type: 'system', userProfileId: null },
    });
  }

  // PAY-17: aprobación administrativa de un parcial registrado. Idempotente para el mismo aprobador.
  async approveRefund(refundId: string, approverUserProfileId: string): Promise<AdvanceResult> {
    if (!approverUserProfileId?.trim()) throw new RefundApprovalError('invalid_approver');
    const r = await this.d.refunds.findById(refundId);
    if (!r) throw new RefundNotFoundError();
    const payment = await this.paymentOf(r);
    if (!isPartialRefund(payment.gross, r.amount)) throw new RefundApprovalError('not_partial');
    if (r.approvedBy === null) {
      if (r.status !== 'requested') throw new RefundApprovalError('not_awaiting_approval');
      const moved = await this.d.refunds.update(r.id, 'requested', { approvedBy: approverUserProfileId, updatedAt: this.d.clock.now() });
      if (!moved) throw new RefundApprovalError('not_awaiting_approval');
    } else if (r.approvedBy !== approverUserProfileId) {
      throw new RefundApprovalError('not_awaiting_approval');
    }
    return this.advance(refundId);
  }

  // PAY-17: rechazo administrativo de un parcial que espera aprobación (requested → canceled). Libera su importe.
  async rejectRefund(refundId: string, reason: string): Promise<AdvanceResult> {
    const r = await this.d.refunds.findById(refundId);
    if (!r) throw new RefundNotFoundError();
    const payment = await this.paymentOf(r);
    if (r.status !== 'requested' || r.approvedBy !== null || !isPartialRefund(payment.gross, r.amount)) throw new RefundApprovalError('not_awaiting_approval');
    const now = this.d.clock.now();
    const moved = await this.d.refunds.update(r.id, 'requested', { status: 'canceled', failureReason: `rejected:${reason}`.slice(0, 200), updatedAt: now });
    if (!moved) throw new RefundApprovalError('not_awaiting_approval');
    return { refund: toRefundView((await this.d.refunds.findById(r.id))!, payment.gross), action: 'terminal' };
  }

  async getRefund(refundId: string): Promise<RefundView> {
    const r = await this.d.refunds.findById(refundId);
    if (!r) throw new RefundNotFoundError();
    return toRefundView(r, (await this.d.payments.findById(r.paymentId))?.gross ?? null);
  }

  // Reembolsos del pago y conciliación (importe original, reembolsado, comisión original y devuelta si se conoce, neto).
  async refundsForPayment(paymentId: string): Promise<{ refunds: RefundView[]; reconciliation: RefundReconciliation }> {
    const payment = await this.d.payments.findById(paymentId);
    if (!payment) throw new PaymentNotFoundError();
    const refunds = await this.d.refunds.listByPayment(paymentId);
    return { refunds: refunds.map((r) => toRefundView(r, payment.gross)), reconciliation: reconcileRefunds(payment, refunds) };
  }

  // Avanza un reembolso según su estado real. Idempotente: se puede llamar cualquier número de veces.
  async advance(refundId: string): Promise<AdvanceResult> {
    const r = await this.d.refunds.findById(refundId);
    if (!r) throw new RefundNotFoundError();
    const payment = await this.paymentOf(r);
    const now = this.d.clock.now();
    switch (r.status) {
      case 'requested': {
        if (isPartialRefund(payment.gross, r.amount) && r.approvedBy === null) return { refund: toRefundView(r, payment.gross), action: 'awaiting_approval' };
        // Se marca pending ANTES de llamar al proveedor (ver arriba). Si otro proceso ya lo hizo, se continúa con él.
        if (!(await this.d.refunds.update(r.id, 'requested', { status: 'pending', updatedAt: now }))) return this.advance(refundId);
        return this.submit({ ...r, status: 'pending', updatedAt: now }, payment);
      }
      case 'pending':
        if (now.getTime() - r.updatedAt.getTime() < REFUND_IN_FLIGHT_MS) return { refund: toRefundView(r, payment.gross), action: 'in_flight' };
        if (now.getTime() - r.updatedAt.getTime() > REFUND_RESUBMIT_WINDOW_MS) {
          this.d.warn?.(`Reembolso ${r.id} pendiente sin respuesta del proveedor fuera de la ventana de reenvío: requiere revisión manual`);
          return { refund: toRefundView(r, payment.gross), action: 'manual_review' };
        }
        return this.submit(r, payment);
      case 'processing':
        return this.sync(r, payment);
      default:
        return { refund: toRefundView(r, payment.gross), action: 'terminal' };
    }
  }

  // Webhook de pago (p. ej. tras un reembolso): avanza los reembolsos abiertos del pago. Sin errores hacia fuera.
  async syncOpenForPayment(paymentId: string): Promise<number> {
    let advanced = 0;
    for (const r of await this.d.refunds.listByPayment(paymentId)) {
      if (!isOpenRefund(r.status)) continue;
      try {
        await this.advance(r.id);
        advanced += 1;
      } catch (error) {
        this.d.warn?.(`No se pudo avanzar el reembolso ${r.id} (${error instanceof PaymentProviderError ? `provider:${error.kind}` : 'internal'})`);
      }
    }
    return advanced;
  }

  // Recuperación periódica (independiente de que el servidor siga activo): reenvía o consulta lo que quedó abierto.
  async recover(options: { limit?: number } = {}): Promise<RecoverRefundsSummary> {
    const ids = await this.d.refunds.findRecoverable({ idleBefore: new Date(this.d.clock.now().getTime() - REFUND_RECOVERY_IDLE_MS), limit: options.limit ?? 50 });
    const summary: RecoverRefundsSummary = { examined: ids.length, byAction: {} };
    for (const id of ids) {
      let key: AdvanceAction | 'error';
      try {
        key = (await this.advance(id)).action;
      } catch {
        key = 'error';
      }
      summary.byAction[key] = (summary.byAction[key] ?? 0) + 1;
    }
    return summary;
  }

  // -------------------------------------------------------------------------------------------------------------------

  private resolveAmount(request: RefundAmountRequest, gross: Money, available: Money): Money | null {
    if (request.kind === 'remaining') return available.cents > 0 ? available : null;
    const amount = request.kind === 'full' ? gross : request.amount;
    if (amount.cents > available.cents) throw new RefundExceedsAvailableError(toDecimalString(available));
    return amount;
  }

  private async resumeKey(key: IdempotencyKeyRecord, requestHash: string): Promise<RequestRefundResult> {
    if (key.requestHash !== requestHash) throw new IdempotencyKeyConflictError();
    if (!key.refundId) throw new RefundNotFoundError();
    return this.existing(key.refundId);
  }

  private async existing(refundId: string): Promise<RequestRefundResult> {
    const step = await this.advance(refundId);
    return { outcome: 'existing', refund: step.refund, action: step.action };
  }

  private async paymentOf(r: RefundRecord): Promise<PaymentRecord> {
    const payment = await this.d.payments.findById(r.paymentId);
    if (!payment) throw new PaymentNotFoundError();
    return payment;
  }

  private async submit(r: RefundRecord, payment: PaymentRecord): Promise<AdvanceResult> {
    let snapshot: ProviderRefundSnapshot;
    try {
      snapshot = await this.d.provider.createRefund({
        providerPaymentId: payment.providerPaymentId!,
        idempotencyKey: r.id,
        // Total (sin importe) solo si es el pago completo; si no, el importe exacto.
        amount: r.amount.cents === payment.gross.cents ? null : r.amount,
      });
    } catch (error) {
      if (!(error instanceof PaymentProviderError)) throw error;
      if (error.kind === 'rejected_request' || error.kind === 'not_found') {
        const now = this.d.clock.now();
        const code = `provider:${error.kind}${error.providerCode ? `:${error.providerCode}` : ''}`;
        await this.d.refunds.update(r.id, 'pending', { status: 'failed', failureReason: code, processedAt: now, updatedAt: now });
        return { refund: toRefundView((await this.d.refunds.findById(r.id))!, payment.gross), action: 'rejected' };
      }
      return { refund: toRefundView(r, payment.gross), action: 'retry_later' };
    }
    return this.applySnapshot(r, payment, snapshot, 'submitted');
  }

  private async sync(r: RefundRecord, payment: PaymentRecord): Promise<AdvanceResult> {
    if (!r.providerRefundId) return this.submit(r, payment);
    let snapshot: ProviderRefundSnapshot;
    try {
      snapshot = await this.d.provider.getRefund(payment.providerPaymentId!, r.providerRefundId);
    } catch (error) {
      if (!(error instanceof PaymentProviderError)) throw error;
      return { refund: toRefundView(r, payment.gross), action: 'retry_later' };
    }
    return this.applySnapshot(r, payment, snapshot, 'synced');
  }

  private async applySnapshot(r: RefundRecord, payment: PaymentRecord, s: ProviderRefundSnapshot, action: 'submitted' | 'synced'): Promise<AdvanceResult> {
    // La respuesta debe ser de ESTE reembolso: mismo pago, mismo importe y, si ya se fijó, el mismo id del proveedor.
    if (s.providerPaymentId !== payment.providerPaymentId || s.amount.cents !== r.amount.cents || (r.providerRefundId !== null && r.providerRefundId !== s.providerRefundId)) {
      this.d.warn?.(`Reembolso ${r.id}: la respuesta del proveedor no corresponde (pago, importe o referencia): requiere revisión manual`);
      return { refund: toRefundView(r, payment.gross), action: 'manual_review' };
    }
    const final = await this.d.uow.runInTransaction(async () => {
      const current = await this.d.refunds.lockById(r.id);
      if (!current) throw new RefundNotFoundError();
      const now = this.d.clock.now();
      let status = current.status;
      if (status === 'pending') {
        await this.d.refunds.update(current.id, 'pending', { status: 'processing', providerRefundId: s.providerRefundId, providerStatus: s.providerStatus, updatedAt: now });
        status = 'processing';
      }
      if (status !== 'processing') {
        if (status === 'succeeded' && s.status === 'failed') this.d.warn?.(`Reembolso ${r.id}: el proveedor informa un estado distinto del final registrado`);
        return status;
      }
      if (s.status === 'succeeded') {
        await this.d.refunds.update(current.id, 'processing', { status: 'succeeded', providerStatus: s.providerStatus, processedAt: now, updatedAt: now });
        return 'succeeded';
      }
      if (s.status === 'failed') {
        await this.d.refunds.update(current.id, 'processing', { status: 'failed', providerStatus: s.providerStatus, failureReason: `provider_status:${s.providerStatus}`.slice(0, 200), processedAt: now, updatedAt: now });
        return 'failed';
      }
      if (current.providerStatus !== s.providerStatus) await this.d.refunds.update(current.id, 'processing', { providerStatus: s.providerStatus, updatedAt: now });
      return 'processing';
    });
    if (final === 'succeeded') await this.refreshPayment(payment.id);
    return { refund: toRefundView((await this.d.refunds.findById(r.id))!, payment.gross), action };
  }

  // El estado del pago (partially_refunded/refunded) sale del proveedor, nunca se deduce aquí. Un fallo no afecta al
  // reembolso ya registrado: el webhook de pago o la sincronización lo aplicarán.
  private async refreshPayment(paymentId: string): Promise<void> {
    try {
      await refreshPaymentFromProvider({ uow: this.d.uow, clock: this.d.clock, locks: this.d.locks, payments: this.d.payments, provider: this.d.paymentProvider, reader: this.d.payments }, paymentId);
    } catch (error) {
      this.d.warn?.(`Pago ${paymentId}: no se pudo actualizar tras el reembolso (${error instanceof PaymentProviderError ? `provider:${error.kind}` : 'conflict'})`);
    }
  }
}
