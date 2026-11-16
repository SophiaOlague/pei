import type { PaymentStatus } from './payment-status';

// Transiciones de estado permitidas: las MISMAS que impone el trigger payment_guard de 0017 (F1). El caso de uso las
// comprueba antes de escribir para no depender de un error de la base de datos. Repetir el mismo estado es idempotente.
export const ALLOWED_PAYMENT_TRANSITIONS: Readonly<Record<PaymentStatus, readonly PaymentStatus[]>> = Object.freeze({
  pending: ['processing', 'succeeded', 'failed', 'canceled'],
  processing: ['succeeded', 'failed', 'canceled'],
  succeeded: ['partially_refunded', 'refunded', 'in_dispute'],
  partially_refunded: ['refunded', 'in_dispute'],
  in_dispute: ['succeeded', 'partially_refunded', 'charged_back'],
  failed: [],
  canceled: [],
  refunded: [],
  charged_back: [],
});

export const canTransition = (from: PaymentStatus, to: PaymentStatus): boolean =>
  from === to || ALLOWED_PAYMENT_TRANSITIONS[from].includes(to);

// ¿Se puede llegar de `from` a `to` con una o más transiciones permitidas? Sirve para reconocer un snapshot ATRASADO
// (leído antes que otro que ya se aplicó): el estado registrado es alcanzable desde el del snapshot.
export function isReachable(from: PaymentStatus, to: PaymentStatus): boolean {
  const seen = new Set<PaymentStatus>([from]);
  const queue: PaymentStatus[] = [from];
  while (queue.length) {
    for (const next of ALLOWED_PAYMENT_TRANSITIONS[queue.shift()!]) {
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}
