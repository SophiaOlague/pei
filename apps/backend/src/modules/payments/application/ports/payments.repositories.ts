import type { Money } from '../../domain/money';
import type { PaymentType, ProcessorFeeSnapshot } from '../../domain/payment-amounts';
import type { PaymentStatus } from '../../domain/payment-status';
import type { ProviderName } from './payment-provider.port';

// Puertos de persistencia de pagos (F2, segunda entrega). Solo usan tablas y columnas de 0017 (F1).

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');
export const IDEMPOTENCY_KEY_REPOSITORY = Symbol('IDEMPOTENCY_KEY_REPOSITORY');
export const PEI_FEE_CONFIGURATION_REPOSITORY = Symbol('PEI_FEE_CONFIGURATION_REPOSITORY');
export const PROCESSOR_FEE_SCHEDULE_REPOSITORY = Symbol('PROCESSOR_FEE_SCHEDULE_REPOSITORY');
export const PAYMENT_ID_GENERATOR = Symbol('PAYMENT_ID_GENERATOR');

// Fila de `payment` (snapshot financiero incluido). No hay PAN, CVV ni datos de tarjeta: la tabla no los tiene.
export interface PaymentRecord {
  id: string;
  type: PaymentType;
  provider: ProviderName;
  providerPaymentId: string | null;
  providerStatus: string | null;
  status: PaymentStatus;
  patientId: string;
  doctorId: string | null;
  appointmentId: string | null;
  medicationOrderId: string | null;
  gross: Money;
  peiFeeConfigurationId: string | null;
  peiFixedFee: Money | null;
  doctorNet: Money;
  processorFeeScheduleId: string;
  providerFeeEstimated: Money;
  providerFeeActual: Money | null;
  netReceived: Money | null;
  moneyReleaseDate: Date | null;
  feeReconciledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPaymentRecord = Omit<PaymentRecord, 'providerPaymentId' | 'providerStatus' | 'providerFeeActual' | 'netReceived' | 'moneyReleaseDate' | 'feeReconciledAt' | 'updatedAt'>;

// Cambios que provienen del proveedor. Los campos de referencia y conciliación solo se fijan una vez (payment_guard).
export interface PaymentProviderUpdate {
  providerPaymentId?: string;
  providerStatus?: string;
  status?: PaymentStatus;
  providerFeeActual?: Money;
  netReceived?: Money;
  moneyReleaseDate?: Date;
  // H-3: comisión conciliada (solo desde el flujo bloqueado y con un balance_transaction verificado). Se fija una vez.
  feeReconciledAt?: Date;
  updatedAt: Date;
}

// H-2: pagos cuya comisión real aún no está conciliada (sin provider_fee_actual o sin fee_reconciled_at).
export interface FeeReconciliationQuery {
  provider: ProviderName;
  // Solo pagos creados antes de esta fecha (deja tiempo a Stripe para generar el balance_transaction).
  createdBefore: Date;
  limit: number;
}

export const FEE_RECONCILIATION_READER = Symbol('FEE_RECONCILIATION_READER');

export interface FeeReconciliationReader {
  findPendingFeeReconciliation(query: FeeReconciliationQuery): Promise<string[]>;
}

export interface PaymentRepository {
  insert(record: NewPaymentRecord): Promise<void>;
  findById(id: string): Promise<PaymentRecord | null>;
  update(id: string, changes: PaymentProviderUpdate): Promise<void>;
}

// F3.3: bloqueo del pago (SELECT … FOR UPDATE) dentro de una unidad de trabajo. Serializa las sincronizaciones
// concurrentes del mismo pago (dos webhooks a la vez, o webhook y reintento): la segunda ve el estado ya aplicado.
export const PAYMENT_LOCK_REPOSITORY = Symbol('PAYMENT_LOCK_REPOSITORY');

export interface PaymentLockRepository {
  // Solo dentro de runInTransaction; el bloqueo dura hasta el COMMIT o el ROLLBACK.
  lockById(id: string): Promise<PaymentRecord | null>;
}

export interface IdempotencyKeyRecord {
  scope: string;
  key: string;
  requestHash: string;
  paymentId: string | null;
  // F5: reembolso ligado a la clave (idempotency_key.refund_id). Ausente en las claves de creación de pagos.
  refundId?: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface IdempotencyKeyRepository {
  find(scope: string, key: string): Promise<IdempotencyKeyRecord | null>;
  insert(record: { scope: string; key: string; requestHash: string; paymentId: string; refundId?: string; createdAt: Date }): Promise<void>;
  complete(scope: string, key: string, at: Date): Promise<void>;
}

export interface PeiFeeVersion {
  id: string;
  fixedFee: Money;
}

export interface PeiFeeConfigurationRepository {
  findEffective(at: Date): Promise<PeiFeeVersion | null>;
}

export interface ProcessorFeeScheduleRepository {
  findEffective(provider: ProviderName, at: Date): Promise<ProcessorFeeSnapshot | null>;
  findById(id: string): Promise<ProcessorFeeSnapshot | null>;
}

export interface PaymentIdGenerator {
  newId(): string;
}
