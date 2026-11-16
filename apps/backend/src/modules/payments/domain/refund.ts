import { money, type Money } from './money';
import type { PaymentType } from './payment-amounts';
import type { PaymentStatus } from './payment-status';
import { InvalidAmountError } from './payments.errors';

// F5: reembolsos (RF-46; PAY-17, PAY-18; Payments-decisiones §2.3). Reglas puras que reproducen las de 0017
// (refund_guard y refund_within_payment) para validar ANTES de escribir; la base de datos sigue siendo la autoridad.

export const REFUND_STATUSES = ['requested', 'pending', 'processing', 'succeeded', 'failed', 'canceled'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

// Mismas transiciones que refund_guard. requested: registrado (un parcial espera aprobación); pending: enviado o por
// enviar al proveedor SIN respuesta fiable; processing: el proveedor lo aceptó (tiene su id) pero no lo confirmó;
// succeeded/failed: estado final del PROVEEDOR. Nunca se pasa a succeeded solo porque la petición HTTP se aceptó.
export const ALLOWED_REFUND_TRANSITIONS: Readonly<Record<RefundStatus, readonly RefundStatus[]>> = Object.freeze({
  requested: ['pending', 'canceled'],
  pending: ['processing', 'canceled', 'failed'],
  processing: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
  canceled: [],
});
export const canRefundTransition = (from: RefundStatus, to: RefundStatus) => from === to || ALLOWED_REFUND_TRANSITIONS[from].includes(to);

// Cuentan para el acumulado (refund_within_payment y la prorrata de refund_guard): todo lo que no terminó en fallo.
export const ACTIVE_REFUND_STATUSES: readonly RefundStatus[] = ['requested', 'pending', 'processing', 'succeeded'];
export const isActiveRefund = (s: RefundStatus) => ACTIVE_REFUND_STATUSES.includes(s);
export const isOpenRefund = (s: RefundStatus) => s === 'requested' || s === 'pending' || s === 'processing';

// refund_guard: solo se reembolsa un pago capturado en estos estados (no en disputa ni ya reembolsado del todo).
export const REFUNDABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = ['succeeded', 'partially_refunded'];

export interface RefundablePayment {
  type: PaymentType;
  gross: Money;
  peiFixedFee: Money | null;
}

export interface RefundShares {
  peiFeeShare: Money;
  doctorShare: Money;
}

// round(x, 2) de PostgreSQL sobre numeric: mitad lejos de cero (para positivos, mitad hacia arriba). En centavos y con
// BigInt: (prev + amount) · F / G puede superar 2^53.
function roundHalfUpDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

// Prorrata acumulativa (I-8), idéntica a refund_guard:
//   pei_cum = round((prev_amount + amount) · F / G, 2); pei_share = pei_cum − prev_pei; doctor_share = amount − pei_share.
// prev_* = reembolsos ACTIVOS anteriores (no failed/canceled). Medicamento: 100 % de PEI.
export function refundShares(p: RefundablePayment, previous: { amount: Money; peiFeeShare: Money }, amount: Money): RefundShares {
  if (amount.cents <= 0) throw new InvalidAmountError('el reembolso debe ser mayor que cero');
  if (p.type === 'medication') return { peiFeeShare: amount, doctorShare: money(0) };
  if (!p.peiFixedFee) throw new InvalidAmountError('el pago de consulta no tiene comisión fija registrada');
  const peiCum = roundHalfUpDiv(BigInt(previous.amount.cents + amount.cents) * BigInt(p.peiFixedFee.cents), BigInt(p.gross.cents));
  const peiShare = Number(peiCum) - previous.peiFeeShare.cents;
  const doctorShare = amount.cents - peiShare;
  if (peiShare < 0 || doctorShare < 0) throw new InvalidAmountError('la prorrata del reembolso no es válida');
  return { peiFeeShare: money(peiShare), doctorShare: money(doctorShare) };
}

// Disponible para reembolsar = bruto − acumulado activo (refund_within_payment).
export function refundableAmount(gross: Money, activeRefunded: Money): Money {
  return money(Math.max(0, gross.cents - activeRefunded.cents));
}

// Un reembolso menor que el bruto del pago es PARCIAL y necesita aprobación administrativa para enviarse (PAY-17;
// refund_guard: amount < payment.amount y estado distinto de requested/canceled ⇒ approved_by obligatorio). Esto incluye
// el saldo restante tras un parcial anterior.
export const isPartialRefund = (gross: Money, amount: Money) => amount.cents < gross.cents;

// Conciliación (PAY-07, PAY-18). La comisión del proveedor NO se supone devuelta: si no hay dato real, queda null y el
// neto posterior no se calcula (se informa como desconocido, nunca como cero).
export interface RefundReconciliation {
  gross: Money;
  refundedSucceeded: Money;
  refundedInFlight: Money;
  providerFeeActual: Money | null;
  // Suma de provider_fee_returned de los reembolsos exitosos; null si alguno no lo tiene.
  providerFeeReturned: Money | null;
  netReceived: Money | null;
  // net_received − reembolsado + comisión devuelta. null mientras falte algún dato real.
  netAfterRefunds: Money | null;
}

export function reconcileRefunds(
  payment: { gross: Money; providerFeeActual: Money | null; netReceived: Money | null },
  refunds: readonly { status: RefundStatus; amount: Money; providerFeeReturned: Money | null }[],
): RefundReconciliation {
  const succeeded = refunds.filter((r) => r.status === 'succeeded');
  const inFlight = refunds.filter((r) => r.status === 'requested' || r.status === 'pending' || r.status === 'processing');
  const sum = (xs: readonly { amount: Money }[]) => money(xs.reduce((c, r) => c + r.amount.cents, 0));
  const feeReturned = succeeded.every((r) => r.providerFeeReturned !== null)
    ? money(succeeded.reduce((c, r) => c + r.providerFeeReturned!.cents, 0))
    : null;
  const refunded = sum(succeeded);
  const netAfter = payment.netReceived !== null && feeReturned !== null ? money(payment.netReceived.cents - refunded.cents + feeReturned.cents) : null;
  return {
    gross: payment.gross,
    refundedSucceeded: refunded,
    refundedInFlight: sum(inFlight),
    providerFeeActual: payment.providerFeeActual,
    providerFeeReturned: feeReturned,
    netReceived: payment.netReceived,
    netAfterRefunds: netAfter,
  };
}
