import type { Actor } from '../../../../common/application/actor';
import type { UnitOfWork } from '../../../../common/application/ports/unit-of-work';
import type { AuditTrail } from '../../../audit/application/ports/audit-trail';
import { AuditActor } from '../../../audit/domain/audit-actor';
import { AuditEvent } from '../../../audit/domain/audit-event';
import { toDecimalString, type Money } from '../../domain/money';
import type { RefundReason } from '../ports/refunds.port';
import { InvalidRefundRequestError } from '../refunds.errors';
import {
  REFUND_CREATE_SCOPE,
  type AdvanceResult,
  type RefundsUseCases,
  type RefundView,
  type RequestRefundResult,
} from './refunds.use-cases';

// H-7 (autorizado el 2026-11-16): operaciones administrativas de reembolso sobre el motor EXISTENTE (RefundsUseCases).
// No reimplementa reglas: RF-46 y PAY-17 (estados, idempotencia, tope acumulado, prorrata PEI/médico, aprobación de los
// parciales) siguen en RefundsUseCases, refund_guard y refund_within_payment. Este servicio solo:
// - fija quién actúa a partir de la SESIÓN del administrador (nunca del cuerpo): requested_by_user_profile_id y
//   approved_by del reembolso;
// - deja la traza del administrador en audit_log (solicitud, aprobación y rechazo; el rechazo no tiene columna propia en
//   refund), sin datos personales ni del proveedor. AuditTrail solo escribe dentro de una UnitOfWork (D6): cada evento
//   se registra en su PROPIA transacción corta, DESPUÉS de que el motor terminó (su envío a Stripe ocurre fuera de toda
//   transacción y no se repite: reintentar con la misma clave devuelve `existing`).
// Una solicitud parcial NO se aprueba en la misma llamada: la aprobación es una acción explícita aparte (PAY-17).

export const ADMIN_REFUND_AUDIT_ACTIONS = {
  requested: 'payments.refund.requested_by_admin',
  approved: 'payments.refund.approved',
  rejected: 'payments.refund.rejected',
} as const;

// Motivos que puede registrar un administrador. Las cancelaciones de cita los fija M08 (patient_cancellation,
// doctor_cancellation) y la cancelación administrativa de plataforma (admin_cancellation) está fuera de H-7.
export const ADMIN_REFUND_REASONS = ['exceptional_refund', 'payment_error', 'other'] as const satisfies readonly RefundReason[];
export type AdminRefundReason = (typeof ADMIN_REFUND_REASONS)[number];

export interface AdminRefundRequest {
  paymentId: string;
  idempotencyKey: string;
  amount: { kind: 'full' } | { kind: 'partial'; amount: Money };
  reason: AdminRefundReason;
  notes?: string | null;
}

export interface AdminRefundsDeps {
  refunds: Pick<RefundsUseCases, 'requestRefund' | 'approveRefund' | 'rejectRefund' | 'refundsForPayment' | 'getRefund'>;
  audit: AuditTrail;
  uow: UnitOfWork;
}

const refundEntity = (id: string) => ({ type: 'refund', id });

function requireAdminProfile(actor: Actor): string {
  if (!actor?.userProfileId) throw new InvalidRefundRequestError('el administrador no tiene perfil');
  return actor.userProfileId;
}

export class AdminRefundsService {
  constructor(private readonly d: AdminRefundsDeps) {}

  // Auditoría en su propia UnitOfWork (nunca abarca la llamada al proveedor).
  private audit(event: AuditEvent): Promise<void> {
    return this.d.uow.runInTransaction(() => this.d.audit.record(event));
  }

  async request(actor: Actor, input: AdminRefundRequest): Promise<RequestRefundResult> {
    const admin = requireAdminProfile(actor);
    if (!input.idempotencyKey?.trim()) throw new InvalidRefundRequestError('falta la cabecera Idempotency-Key');
    const result = await this.d.refunds.requestRefund({
      scope: REFUND_CREATE_SCOPE,
      key: input.idempotencyKey.trim(),
      paymentId: input.paymentId,
      amount: input.amount,
      reason: input.reason,
      requestedBy: { type: 'admin', userProfileId: admin },
      notes: input.notes ?? null,
    });
    // Solo la creación se audita (una repetición con la misma clave no es una acción nueva).
    if (result.outcome === 'created' && result.refund) {
      await this.audit(AuditEvent.create({
        actor: AuditActor.fromActor(actor),
        action: ADMIN_REFUND_AUDIT_ACTIONS.requested,
        entity: refundEntity(result.refund.refundId),
        metadata: { paymentId: input.paymentId, kind: input.amount.kind, amount: result.refund.amount, reason: input.reason, status: result.refund.status },
      }));
    }
    return result;
  }

  // Una aprobación repetida del mismo administrador es idempotente en el motor (no reenvía nada). Solo la TRANSICIÓN
  // real de «sin aprobar» a «aprobado por este administrador» se audita: se compara approved_by antes y después.
  async approve(actor: Actor, refundId: string): Promise<AdvanceResult> {
    const admin = requireAdminProfile(actor);
    const before = await this.d.refunds.getRefund(refundId);
    const result = await this.d.refunds.approveRefund(refundId, admin);
    const transitioned = before.approvedBy === null && result.refund.approvedBy === admin;
    if (transitioned) {
      await this.audit(AuditEvent.create({
        actor: AuditActor.fromActor(actor),
        action: ADMIN_REFUND_AUDIT_ACTIONS.approved,
        entity: refundEntity(refundId),
        metadata: { paymentId: result.refund.paymentId, amount: result.refund.amount, status: result.refund.status, action: result.action },
      }));
    }
    return result;
  }

  async reject(actor: Actor, refundId: string, reason: string): Promise<AdvanceResult> {
    requireAdminProfile(actor);
    const result = await this.d.refunds.rejectRefund(refundId, reason);
    await this.audit(AuditEvent.create({
      actor: AuditActor.fromActor(actor),
      action: ADMIN_REFUND_AUDIT_ACTIONS.rejected,
      entity: refundEntity(refundId),
      metadata: { paymentId: result.refund.paymentId, amount: result.refund.amount, status: result.refund.status },
    }));
    return result;
  }

  async forPayment(paymentId: string): Promise<{ refunds: RefundView[]; reconciliation: Record<string, string | null> }> {
    const { refunds, reconciliation } = await this.d.refunds.refundsForPayment(paymentId);
    const s = (m: Money | null) => (m ? toDecimalString(m) : null);
    return {
      refunds,
      reconciliation: {
        gross: s(reconciliation.gross),
        refundedSucceeded: s(reconciliation.refundedSucceeded),
        refundedInFlight: s(reconciliation.refundedInFlight),
        providerFeeActual: s(reconciliation.providerFeeActual),
        providerFeeReturned: s(reconciliation.providerFeeReturned),
        netReceived: s(reconciliation.netReceived),
        netAfterRefunds: s(reconciliation.netAfterRefunds),
      },
    };
  }
}
