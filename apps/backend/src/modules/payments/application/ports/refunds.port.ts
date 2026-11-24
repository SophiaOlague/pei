import type { Money } from '../../domain/money';
import type { RefundStatus } from '../../domain/refund';
import type { ProviderName } from './payment-provider.port';

// F5: puertos de reembolsos. La aplicación no conoce la API de Mercado Pago; el adaptador (infrastructure/mercadopago)
// implementa RefundProviderPort y la persistencia Drizzle, RefundRepository. Solo tablas y columnas de 0017.

export const REFUND_PROVIDER = Symbol('REFUND_PROVIDER');
export const REFUND_REPOSITORY = Symbol('REFUND_REPOSITORY');

// Estado de un reembolso en el proveedor, normalizado. El valor original se conserva en providerStatus.
// - processing: aceptado pero sin confirmar (p. ej. in_process).
// - succeeded: el proveedor lo confirma (approved).
// - failed: rechazado o cancelado por el proveedor.
export interface ProviderRefundSnapshot {
  provider: ProviderName;
  providerRefundId: string;
  providerPaymentId: string;
  providerStatus: string;
  status: Extract<RefundStatus, 'processing' | 'succeeded' | 'failed'>;
  amount: Money;
}

export interface CreateProviderRefund {
  providerPaymentId: string;
  // X-Idempotency-Key ESTABLE: el id del reembolso de PEI (igual en todos los reintentos).
  idempotencyKey: string;
  // null: reembolso total (el proveedor reembolsa el pago completo). Si no, el importe exacto.
  amount: Money | null;
}

export interface RefundProviderPort {
  readonly name: ProviderName;
  // Errores: PaymentProviderError. rejected_request/not_found son definitivos; unavailable, timeout, unauthorized y
  // unexpected_response dejan el reembolso pendiente para reintentar con la MISMA clave.
  createRefund(request: CreateProviderRefund): Promise<ProviderRefundSnapshot>;
  getRefund(providerPaymentId: string, providerRefundId: string): Promise<ProviderRefundSnapshot>;
}

export type RefundReason = 'patient_cancellation' | 'doctor_cancellation' | 'admin_cancellation' | 'exceptional_refund' | 'payment_error' | 'other'
  // 0019: reembolso total por inasistencia del médico o de ambos (videoconsulta).
  | 'no_show_doctor'
  | 'no_show_both';
export type RefundRequesterType = 'patient' | 'doctor' | 'admin' | 'system';

// Fila de `refund`. Sin datos de tarjeta.
export interface RefundRecord {
  id: string;
  paymentId: string;
  amount: Money;
  reason: RefundReason;
  status: RefundStatus;
  provider: ProviderName;
  providerRefundId: string | null;
  providerStatus: string | null;
  peiFeeShare: Money;
  doctorShare: Money;
  providerFeeReturned: Money | null;
  unrecoveredProviderFee: Money | null;
  requestedByType: RefundRequesterType | null;
  requestedByUserProfileId: string | null;
  approvedBy: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  failureReason: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewRefundRecord = Pick<
  RefundRecord,
  'id' | 'paymentId' | 'amount' | 'reason' | 'provider' | 'peiFeeShare' | 'doctorShare' | 'requestedByType' | 'requestedByUserProfileId' | 'approvedBy' | 'notes' | 'requestedAt'
>;

// Cambios permitidos tras el alta. Las referencias y la conciliación se fijan una sola vez (refund_guard).
export interface RefundUpdate {
  status?: RefundStatus;
  providerRefundId?: string;
  providerStatus?: string;
  approvedBy?: string;
  processedAt?: Date;
  failureReason?: string;
  providerFeeReturned?: Money;
  unrecoveredProviderFee?: Money;
  updatedAt: Date;
}

export interface RecoverableRefundQuery {
  // pending/processing/requested aprobados sin actividad desde antes de esta fecha.
  idleBefore: Date;
  limit: number;
}

export interface RefundRepository {
  insert(record: NewRefundRecord): Promise<void>;
  findById(id: string): Promise<RefundRecord | null>;
  // SELECT … FOR UPDATE (solo dentro de una unidad de trabajo).
  lockById(id: string): Promise<RefundRecord | null>;
  listByPayment(paymentId: string): Promise<RefundRecord[]>;
  // Actualización condicionada al estado esperado: devuelve false si otro proceso ya lo cambió.
  update(id: string, expectedStatus: RefundStatus, changes: RefundUpdate): Promise<boolean>;
  // Reembolsos abiertos que pueden avanzar (para la recuperación periódica).
  findRecoverable(query: RecoverableRefundQuery): Promise<string[]>;
}
