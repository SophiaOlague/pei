# Webhook de Stripe: documentación técnica

Decisión: `Payments-decisiones.md` §8. Estado al 2026-11-15: implementado y probado con dobles. **No se ha probado
contra Stripe TEST ni está listo para producción.**

Código:
- `apps/backend/src/modules/payments/presentation/stripe-webhook.controller.ts`: la ruta y la captura del cuerpo.
- `apps/backend/src/modules/payments/infrastructure/stripe/stripe-webhook-authenticator.ts`: la firma y el formato.
- `apps/backend/src/modules/payments/application/use-cases/provider-webhook.use-cases.ts`: recepción, procesamiento
  y reintento (común a cualquier proveedor; no cambió).
- `apps/backend/src/modules/payments/infrastructure/stripe/stripe-payment-provider.ts`: la consulta a la API.

## 1. Endpoint

`POST /webhooks/stripe`. Ruta pública, sin sesión: la autenticidad la da la firma.

| Respuesta | Cuándo |
|---|---|
| 200 `{ "received": true }` | El evento quedó registrado, o ya lo estaba |
| 401 | Firma ausente, mal formada, inválida, antigua, de otro modo, o cuerpo que no es un evento |
| 503 | Falta `STRIPE_WEBHOOK_SECRET` (falla cerrada; Stripe reintenta) |

La respuesta nunca incluye ids internos, el estado del pago ni el motivo exacto del rechazo. El motivo técnico solo
se escribe en el registro del servidor, sin la firma, el secreto ni el cuerpo.

## 2. Firma y cuerpo original

- Cabecera `Stripe-Signature: t=<segundos>,v1=<hmac>[,v1=<hmac>…]`.
- La firma es HMAC-SHA256, en hexadecimal, con el secreto del endpoint (`whsec_…`) sobre `<t>.<cuerpo original>`.
- La firma cubre el cuerpo byte a byte, así que no sirve el JSON ya interpretado. `AppModule` configura
  `bodyParser.json({ verify: captureStripeRawBody })`, que guarda los bytes en `req.rawBody` **solo** en esta ruta.
- El evento se interpreta a partir de esos mismos bytes firmados, nunca de `req.body`.
- Con varias `v1` (rotación del secreto) basta con que una coincida. La comparación es en tiempo constante.
- La marca de tiempo se comprueba siempre: tolerancia de 300 s, configurable con `STRIPE_WEBHOOK_TOLERANCE_SECONDS`.
- Un evento con `livemode` distinto del modo de `STRIPE_ENV` se rechaza aunque la firma sea válida.

## 3. Registro en `provider_webhook_event`

La tabla es la de 0017; no cambió. Clave única: `(provider, topic, data_id, request_id)`.

| Columna | Valor con Stripe |
|---|---|
| `provider` | `stripe` |
| `topic` | `payment` si el tipo se procesa; si no, el tipo del evento (queda `ignored`) |
| `action` | Tipo del evento, por ejemplo `payment_intent.succeeded` |
| `data_id` | Id del PaymentIntent (`pi_…`) |
| `request_id` | Id del evento (`evt_…`) |
| `payload` | Solo id, tipo, `livemode`, `created`, `api_version` y los ids del objeto. Sin importes ni datos del pagador |

Una firma inválida no registra nada. Una reentrega del mismo evento choca con la clave única y no se procesa otra vez.

## 4. Eventos

Todos llevan a la misma acción: volver a consultar el PaymentIntent en la API.

| Evento | Para qué sirve |
|---|---|
| `payment_intent.succeeded` | Pago aprobado, incluido el que termina tras 3-D Secure |
| `payment_intent.payment_failed` | Tarjeta o autenticación rechazada |
| `payment_intent.processing` | Pago en proceso |
| `payment_intent.requires_action` | Espera la autenticación del cliente |
| `payment_intent.canceled` | Intento cancelado |
| `charge.refunded`, `charge.refund.updated`, `refund.updated`, `refund.failed` | Reembolsos |
| `charge.dispute.created`, `charge.dispute.closed` | Disputas |

Cualquier otro tipo se registra como `ignored`. Al configurar el endpoint en Stripe conviene suscribir solo estos.

## 5. Procesamiento

Ocurre en segundo plano, después de responder 200.

1. Se reclama el evento de forma atómica (`received` o `failed` → `processing`).
2. Se consulta el PaymentIntent en la API con el id firmado. **El evento solo avisa; nunca prueba el pago.**
3. Si el intento no tiene `metadata.pei_payment_id`, se ignora como pago ajeno.
4. Se bloquea el pago y se valida que el snapshot sea suyo: mismo proveedor, misma referencia y mismo importe en
   centavos de MXN. Una diferencia deja el evento en `failed` para conciliar y no cambia el pago.
5. Se aplica la transición permitida por `payment_guard`. Un snapshot repetido o atrasado no escribe nada.
6. Efecto en la cita, solo para pagos de consulta:

| Estado real del pago | Efecto |
|---|---|
| `succeeded` | `confirmPaid` en M08, que es idempotente |
| `failed` o `canceled`, retención vigente | Ninguno: el paciente puede reintentar |
| `failed` o `canceled`, retención vencida | `markPaymentFailed` |
| `pending` o `processing` | Ninguno |
| `succeeded` con cita no confirmable (vencida o importe distinto) | Reembolso total idempotente |

Un pago de medicamentos solo actualiza su estado: no hay efecto sobre citas ni sobre el pedido.

Reintentos: hasta 8 intentos por evento. `src/cli/payments-retry-webhooks.ts` recoge los fallidos, los no despachados
y los abandonados. Quién lo ejecuta y cada cuánto sigue pendiente de decisión.

## 6. Configuración

| Variable | Uso |
|---|---|
| `STRIPE_WEBHOOK_SECRET` | Secreto de firma del endpoint (`whsec_…`). Sin él se rechaza todo |
| `STRIPE_WEBHOOK_TOLERANCE_SECONDS` | Opcional; 300 s si está vacía |
| `STRIPE_ENV` | Modo esperado de los eventos (`test` o `live`) |

En local, `stripe listen --forward-to localhost:3000/webhooks/stripe` imprime un secreto propio de esa sesión. Un
endpoint creado en el panel de Stripe tiene otro secreto distinto.

## 7. Limitaciones conocidas

- Un intento que queda en `requires_action` porque el paciente abandona la autenticación sigue `processing` en PEI.
  No hay un proceso que lo cancele.
- Una disputa deja el pago `in_dispute`. Su resolución (ganada o perdida) no se deduce automáticamente: es la Fase 6.
- La comisión real solo se registra si el `balance_transaction` está en MXN.
- El mapeo de un intento cancelado tras un rechazo usa `cancellation_reason = abandoned`. Falta confirmarlo en TEST.
