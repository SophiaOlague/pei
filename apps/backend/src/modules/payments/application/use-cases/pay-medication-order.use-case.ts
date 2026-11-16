import { DomainError } from '../../../../common/domain/domain-error';
import type { CardPaymentData } from '../../domain/payment-request';
import type { MedicationOrderPaymentReader } from '../ports/medication-order-payment.reader';
import type { ProviderNextAction } from '../ports/payment-provider.port';
import type { IdempotencyKeyRepository, PaymentRepository } from '../ports/payments.repositories';
import { PaymentNotFoundError } from '../payments-use-case.errors';
import { PAYMENT_CREATE_SCOPE, type CreatePaymentResult, type PaymentsUseCases, type PaymentView } from './payments.use-cases';

// Checkout de medicamentos (PAY-20; Payments-decisiones.md §8.6): cobrar un pedido que YA existe. Solo el proceso de
// pago: Payments no crea pedidos, no cambia su estado y no interviene en la dispensación, el inventario ni la logística.
//
// Flujo: leer el pedido → el paciente autenticado es el del pedido → el pedido admite cobro → cobrar con el flujo de
// creación común (importe = medication_order.total, tomado del backend).
// - Reparto (§2.2): 100 % de PEI. Sin comisión fija de PEI y con neto del médico 0. No hay asientos en el ledger.
// - Un solo pago activo por pedido (payment_active_medication_order_uq); un intento rechazado permite otro.
// - Reintento con la MISMA clave de idempotencia: devuelve el mismo pago sin cobrar de nuevo, aunque el pedido ya no
//   esté en un estado que admita cobro.

// Estados del pedido que admiten cobro. SUPUESTO DE DISEÑO (no definido en el Maestro): solo el estado inicial del
// pedido; en preparación, enviado, entregado, vencido o cancelado ya no se cobra.
export const PAYABLE_ORDER_STATUSES: ReadonlySet<string> = new Set(['order_received']);

export interface PayMedicationOrderInput {
  idempotencyKey: string;
  // Paciente autenticado que paga.
  patientId: string;
  medicationOrderId: string;
  card: CardPaymentData;
}

export interface PayMedicationOrderResult {
  payment: PaymentView;
  recoverable: boolean;
  providerError?: CreatePaymentResult['providerError'];
  nextAction?: ProviderNextAction;
}

export class MedicationOrderNotFoundForPaymentError extends DomainError {
  readonly kind = 'not_found' as const;
  constructor() {
    super('El pedido no existe');
  }
}

// Quien paga no es el paciente del pedido. Mensaje genérico: no revela de quién es el pedido.
export class MedicationOrderPatientMismatchError extends DomainError {
  readonly kind = 'forbidden' as const;
  constructor() {
    super('No puede pagar este pedido');
  }
}

export class MedicationOrderNotPayableError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('El pedido no admite pago en su estado actual');
  }

  override get details() {
    return { reason: 'invalid_state' };
  }
}

export class NotAMedicationPaymentError extends DomainError {
  readonly kind = 'business_rule' as const;
  constructor() {
    super('El pago no corresponde a un pedido');
  }
}

export interface PayMedicationOrderDeps {
  orders: MedicationOrderPaymentReader;
  payments: Pick<PaymentsUseCases, 'createMedicationPayment'>;
  paymentRecords: Pick<PaymentRepository, 'findById'>;
  keys: Pick<IdempotencyKeyRepository, 'find'>;
}

export class PayMedicationOrderUseCase {
  constructor(private readonly deps: PayMedicationOrderDeps) {}

  async execute(input: PayMedicationOrderInput): Promise<PayMedicationOrderResult> {
    const order = await this.deps.orders.findForPayment(input.medicationOrderId);
    if (!order) throw new MedicationOrderNotFoundForPaymentError();
    if (order.patientId !== input.patientId) throw new MedicationOrderPatientMismatchError();
    if (!(await this.isRetryOfThisOrder(input, order.medicationOrderId)) && !PAYABLE_ORDER_STATUSES.has(order.status)) {
      throw new MedicationOrderNotPayableError();
    }
    const created = await this.deps.payments.createMedicationPayment({
      idempotencyKey: input.idempotencyKey,
      patientId: order.patientId,
      medicationOrderId: order.medicationOrderId,
      // El importe sale del pedido registrado; el cliente no lo envía.
      gross: order.total,
      card: input.card,
    });
    return {
      payment: created.payment,
      recoverable: created.recoverable,
      ...(created.providerError ? { providerError: created.providerError } : {}),
      ...(created.nextAction ? { nextAction: created.nextAction } : {}),
    };
  }

  // ¿Esta misma clave ya creó un pago de este pedido? (sin llamar al proveedor)
  private async isRetryOfThisOrder(input: PayMedicationOrderInput, medicationOrderId: string): Promise<boolean> {
    const key = await this.deps.keys.find(PAYMENT_CREATE_SCOPE, input.idempotencyKey);
    if (!key?.paymentId) return false;
    const p = await this.deps.paymentRecords.findById(key.paymentId);
    return !!p && p.type === 'medication' && p.medicationOrderId === medicationOrderId;
  }
}

// Sincroniza el pago de un pedido con el proveedor (nunca cobra): persiste el estado real con las transiciones de
// payment_guard. Si quien sincroniza es un paciente, debe ser el del pago.
export interface SyncMedicationOrderPaymentDeps {
  payments: Pick<PaymentsUseCases, 'getPayment'>;
  paymentRecords: Pick<PaymentRepository, 'findById'>;
}

export class SyncMedicationOrderPaymentUseCase {
  constructor(private readonly deps: SyncMedicationOrderPaymentDeps) {}

  async execute(input: { paymentId: string; requestingPatientId?: string }): Promise<{ payment: PaymentView }> {
    const record = await this.deps.paymentRecords.findById(input.paymentId);
    if (!record) throw new PaymentNotFoundError();
    if (record.type !== 'medication' || !record.medicationOrderId) throw new NotAMedicationPaymentError();
    if (input.requestingPatientId !== undefined && input.requestingPatientId !== record.patientId) throw new MedicationOrderPatientMismatchError();
    return { payment: await this.deps.payments.getPayment(record.id, { refresh: true }) };
  }
}
