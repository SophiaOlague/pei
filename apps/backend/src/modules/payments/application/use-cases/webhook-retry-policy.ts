// H-6, etapa 2: política de reintento de webhooks SIN cambios de esquema (2026-11-16).
//
// R-3 · Backoff. provider_webhook_event no guarda la hora del último intento (no hay claimed_at ni next_attempt_at, y
// esta etapa no crea migraciones). Se usa una espera ACUMULADA desde received_at según los intentos ya hechos: un evento
// `failed` con n intentos solo vuelve a ser elegible cuando han pasado CUMULATIVE[n] desde que se recibió. Para el caso
// habitual (el primer procesamiento falla poco después de recibirse) los reintentos quedan espaciados 1, 2, 5, 15, 30,
// 60 y 120 minutos (≈ 3 h 53 min en total) y una caída breve ya no consume los 8 intentos.
// LIMITACIÓN: si el primer fallo ocurre mucho después de received_at (p. ej. una reentrega tardía de Stripe que falla),
// los umbrales ya pasaron y los reintentos quedan espaciados solo por el intervalo del worker. Resolverlo exige guardar
// la hora del último intento (next_attempt_at / claimed_at, R-6), que requiere una migración.
// Alternativas descartadas: reutilizar processed_at como «último intento» (cambiaría su significado: hoy solo existe en
// eventos processed) o codificar la hora en last_error (frágil y mezcla datos con el código de error).
//
// R-4 · Errores permanentes. El barrido automático no reintenta un evento `failed` cuyo last_error es permanente: el
// mismo PaymentIntent consultado otra vez devolvería lo mismo. No se fuerza ningún cambio de estado ni de intentos: el
// evento queda `failed` con su recuento real y su código, y una reentrega de Stripe o una acción manual pueden volver a
// procesarlo (el reclamo no cambia). Un código desconocido se trata como TRANSITORIO (conservador).

export const WEBHOOK_RETRY_BACKOFF_MINUTES = [1, 2, 5, 15, 30, 60, 120] as const;

// Espera acumulada (ms) desde received_at para que un evento con `attempts` intentos vuelva a ser elegible.
export function cumulativeBackoffMs(attempts: number): number {
  const steps = WEBHOOK_RETRY_BACKOFF_MINUTES.slice(0, Math.max(0, Math.min(attempts, WEBHOOK_RETRY_BACKOFF_MINUTES.length)));
  return steps.reduce((sum, minutes) => sum + minutes * 60_000, 0);
}

export interface WebhookFailureMatcher {
  kind: 'exact' | 'prefix';
  value: string;
  why: string;
}

// Códigos permanentes (last_error que escribe webhookFailureReason), justificados uno a uno.
export const PERMANENT_WEBHOOK_FAILURES: readonly WebhookFailureMatcher[] = Object.freeze([
  { kind: 'prefix', value: 'appointment_mismatch:', why: 'el pago no corresponde a la cita (paciente, médico o cita): la identidad registrada no cambia al reintentar' },
  { kind: 'exact', value: 'appointment_not_found', why: 'la cita del pago no existe; las citas no se borran' },
  { kind: 'exact', value: 'payment_vanished', why: 'el pago desapareció tras bloquearlo; los pagos no se borran (trigger payment_no_delete)' },
  { kind: 'exact', value: 'provider:not_found', why: 'Stripe responde 404 para el PaymentIntent firmado en esta cuenta y modo; sus lecturas son consistentes' },
  { kind: 'exact', value: 'provider:rejected_request', why: 'Stripe rechaza la solicitud (4xx distinto de 401/403/404/409/429) o el id es inválido: la misma consulta se rechazará igual' },
  { kind: 'exact', value: 'conflict:otro proveedor', why: 'el snapshot es de otro proveedor que el pago registrado' },
  { kind: 'exact', value: 'conflict:external_reference distinta', why: 'el PaymentIntent pertenece a otro pago de PEI (metadata.pei_payment_id)' },
  { kind: 'exact', value: 'conflict:importe distinto', why: 'el importe del PaymentIntent no coincide con el del pago, que es inmutable' },
  { kind: 'exact', value: 'conflict:otro pago del proveedor', why: 'el pago ya está ligado a otro PaymentIntent (provider_payment_id se fija una vez)' },
  { kind: 'prefix', value: 'conflict:transición ', why: 'transición imposible (p. ej. failed → succeeded): decideSnapshot ya trata como atrasados los estados alcanzables, así que solo quedan contradicciones que exigen conciliación manual' },
  { kind: 'prefix', value: 'conflict:valor distinto del ya registrado', why: 'contradice un dato de conciliación que se fija una sola vez (comisión, neto o fecha)' },
]);

// Transitorios (se reintentan con backoff), también justificados:
//   provider:unavailable / provider:timeout  red, 5xx, 409 o 429 de Stripe
//   provider:unauthorized                    credenciales: se recupera al corregir la configuración
//   provider:unexpected_response             incluye respuestas no JSON con estado 2xx (proxy, corte): puede ser pasajero
//   confirmation_failed / release_failed     error de M08 al confirmar o liberar (BD, bloqueo): reintentable e idempotente
//   refund_request_failed                    no se pudo registrar el reembolso obligatorio: debe reintentarse
//   internal y cualquier código desconocido conservador: no se pierde la oportunidad de recuperación
export type WebhookFailureKind = 'transient' | 'permanent';

export function classifyWebhookFailure(reason: string | null | undefined): WebhookFailureKind {
  if (!reason) return 'transient';
  return PERMANENT_WEBHOOK_FAILURES.some((m) => (m.kind === 'exact' ? reason === m.value : reason.startsWith(m.value))) ? 'permanent' : 'transient';
}
