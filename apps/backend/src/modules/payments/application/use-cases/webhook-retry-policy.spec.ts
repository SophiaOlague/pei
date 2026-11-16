import { classifyWebhookFailure, cumulativeBackoffMs, PERMANENT_WEBHOOK_FAILURES, WEBHOOK_RETRY_BACKOFF_MINUTES } from './webhook-retry-policy';
import { WEBHOOK_MAX_ATTEMPTS } from './provider-webhook.use-cases';

// H-6 etapa 2: política de reintento (sin BD).
describe('Política de reintento de webhooks', () => {
  it('[H6-POL-01] espera acumulada desde received_at: 0, 1, 3, 8, 23, 53, 113 y 233 min', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((n) => cumulativeBackoffMs(n) / 60_000)).toEqual([0, 1, 3, 8, 23, 53, 113, 233]);
    expect(cumulativeBackoffMs(99)).toBe(cumulativeBackoffMs(7));
    expect(cumulativeBackoffMs(-1)).toBe(0);
    // Una espera por cada reintento posible (7 tras el primer intento de 8).
    expect(WEBHOOK_RETRY_BACKOFF_MINUTES).toHaveLength(WEBHOOK_MAX_ATTEMPTS - 1);
  });

  it.each([
    'appointment_mismatch:patient',
    'appointment_mismatch:doctor',
    'appointment_mismatch:appointment',
    'appointment_not_found',
    'payment_vanished',
    'provider:not_found',
    'provider:rejected_request',
    'conflict:otro proveedor',
    'conflict:external_reference distinta',
    'conflict:importe distinto',
    'conflict:otro pago del proveedor',
    'conflict:transición failed → succeeded no permitida',
    'conflict:valor distinto del ya registrado (la comisión real)',
  ])('[H6-POL-02] permanente: %s', (reason) => {
    expect(classifyWebhookFailure(reason)).toBe('permanent');
  });

  it.each([
    'provider:unavailable',
    'provider:timeout',
    'provider:unauthorized',
    'provider:unexpected_response',
    'confirmation_failed',
    'release_failed',
    'refund_request_failed',
    'internal',
    'conflict:un motivo nuevo que aún no se clasificó',
    'codigo_desconocido',
    '',
    null,
  ])('[H6-POL-03] transitorio (o desconocido, conservador): %s', (reason) => {
    expect(classifyWebhookFailure(reason)).toBe('transient');
  });

  it('[H6-POL-04] cada código permanente tiene su justificación', () => {
    for (const m of PERMANENT_WEBHOOK_FAILURES) expect(m.why.length).toBeGreaterThan(20);
    // Ningún prefijo genérico de conflictos: solo motivos concretos.
    expect(PERMANENT_WEBHOOK_FAILURES.map((m) => m.value)).not.toContain('conflict:');
  });
});
