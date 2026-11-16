# Pruebas de Payments con Stripe

Decisión: `docs/arquitectura/Payments-decisiones.md` §8. Webhook: `docs/arquitectura/Payments-webhook-stripe.md`.

Estado al 2026-11-15: pruebas unitarias y de integración simulada **con dobles**. Ninguna toca PostgreSQL ni Stripe.
**No se ha ejecutado ninguna prueba contra Stripe TEST.**

## 1. Cómo ejecutarlas

Desde `apps/backend`. Hay que usar el script del proyecto (activa los módulos ES que Jest necesita):

```bash
npm test -- src/modules/payments test/payments-stripe-checkout.spec.ts
```

```bash
npm test
```

```bash
npm run build
```

Las pruebas del módulo retiran las variables `STRIPE_*` del proceso, así que no dependen del `.env` local.

## 2. Archivos

| Archivo | Qué cubre |
|---|---|
| `test/support/stripe-fake.ts` | Doble en memoria de la API de Stripe, con su idempotencia y eventos firmados |
| `test/payments-stripe-checkout.spec.ts` | Flujo completo de ambos checkouts y del webhook con código real de Payments |
| `src/modules/payments/infrastructure/stripe/stripe-payment-provider.spec.ts` | Adaptador: solicitudes, estados, errores, reembolsos |
| `src/modules/payments/infrastructure/stripe/stripe-webhook-authenticator.spec.ts` | Firma y formato de los eventos |
| `src/modules/payments/infrastructure/stripe/stripe.config.spec.ts` | Variables de entorno y separación test/live |
| `src/modules/payments/presentation/stripe-webhook.http.spec.ts` | HTTP real de Nest con el cuerpo original |
| `src/modules/payments/payments.module.spec.ts` | Cableado: Stripe activo, Mercado Pago sin registrar |
| `src/modules/payments/payments-architecture.spec.ts` | Solo el adaptador conoce la API; sin SDK; sin secretos en el código |
| `scripts/*.spec.ts`, `test/payments-f1-schema.spec.ts` | Migración 0018 y su autorización por ejecutor |

## 3. Cobertura pedida

| Caso | Dónde |
|---|---|
| Crear un pago de consulta (200 / 20 / 180) | `payments-stripe-checkout.spec.ts`, «checkout de consultas» |
| Crear un pago de medicamentos | Mismo archivo, «checkout de medicamentos» |
| Rechazar importes manipulados desde el frontend | Mismo archivo: el DTO rechaza campos de importe y el cobro usa el de la cita o el pedido |
| Pago exitoso | Mismo archivo, «webhooks» y «checkout de consultas» |
| Pago fallido | Tarjeta rechazada y autenticación rechazada por webhook |
| Pago pendiente | 3-D Secure y `processing` |
| Firmas incorrectas | `stripe-webhook-authenticator.spec.ts`, `stripe-webhook.http.spec.ts` y el flujo |
| Webhooks duplicados | Misma entrega repetida y dos eventos distintos del mismo pago |
| Idempotencia | Misma `Idempotency-Key` y respuesta perdida |
| No confirmar citas sin pago aprobado | Evento que dice `succeeded` con la API en otro estado; sincronizar un pago pendiente |
| No asignar dos pagos a una cita o a un pedido | Segundo intento con un pago activo |

## 4. Resultados del 2026-11-15

| Ejecución | Resultado |
|---|---|
| Payments, CLI de webhooks y flujo de Stripe (31 suites) | PASS: 564 de 564 |
| Suite completa del backend (116 suites) | 1952 PASS, 1 FAIL |
| `npm run build` | PASS |

La única falla es previa y ajena a Payments: `test/support/c2-target-guard.spec.ts` [TC-M02-247]. Dos specs de
integración (`appointments-reschedule.int-spec.ts` y `m08-0014-verify.int-spec.ts`) no están clasificados en su
inventario (CT-20).

## 5. Pruebas no ejecutadas

- `test/integration/payments-f1.int-spec.ts` y cualquier prueba con escritura en C2 o en desarrollo: sin autorización.
- Cualquier prueba contra Stripe TEST.
- Web: el checkout de consultas usa Stripe Elements y se probó con un Stripe.js simulado
  (`apps/web/src/features/payments/appointment-payment.test.tsx`; `npx vitest run` en `apps/web`: 248 de 248). No se
  probó en el navegador contra Stripe: hace falta el backend, una sesión de paciente y una cita en `pending_payment`.
- Móvil: sigue con Card Payment Brick de Mercado Pago y no se probó con Stripe.

## 6. Primera prueba integral en Stripe TEST (pendiente)

Requisitos previos: `Payments-decisiones.md` §8.8.

En el web se usan las tarjetas de prueba que publica Stripe. Por API (y para el checkout de medicamentos, que no tiene
interfaz) se usan sus PaymentMethods de prueba. El cuerpo de la petición solo lleva `token`:

| `token` | Resultado esperado |
|---|---|
| `pm_card_visa` | `succeeded`; la cita queda confirmada |
| `pm_card_chargeDeclined` | `failed`; la cita sigue sin confirmar |
| `pm_card_threeDSecure2Required` | `processing` con `nextAction`; se confirma por webhook al aprobar |

Comprobar en cada caso: la fila de `payment` (proveedor `stripe`, importes y estado), la fila de
`provider_webhook_event` y que la cita solo se confirma con el pago aprobado.

## 7. Primera prueba integral en Stripe TEST: auditoría de cierre (2026-11-16)

Auditoría de solo lectura, sin pagos, reembolsos ni escrituras:
- en PostgreSQL, una transacción `READ ONLY` sobre la base principal de desarrollo, con la huella de 8 componentes verificada contra `C:\pei-dev\payments-preflight-dev.authorized.json`;
- en Stripe TEST, solo peticiones `GET` (clave `sk_test`, `livemode = false`).

**Datos de la prueba**

| Dato | Valor |
|---|---|
| Fecha y hora | 2026-11-16 06:10:58 UTC (PaymentIntent creado); cita confirmada a las 06:10:59.685 UTC |
| Entorno | Base principal de desarrollo (`br-royal-recipe-b54s5hnn`, 19 migraciones, última 0018); Stripe modo TEST; web local |
| PaymentIntent | `pi_3UcJ827E5qvo4iCt0qa2xx5K` (cargo `ch_3UcJ827E5qvo4iCt0w4rw8z6`) |
| Registro `payment` | `98c9d9e1-654d-47d0-a4a9-4ff7c03483a3` |
| Cita | `5b7e511d-a084-4785-88a9-78789f214149` |
| Evento webhook | `evt_3UcJ827E5qvo4iCt0pCvhwBV` (`payment_intent.succeeded`) existe en Stripe, pero **no se registró en PEI** |
| Importe y moneda | 200.00 MXN (Stripe: 20000 centavos, `mxn`) |

**Resultados**

Estados usados: **Comprobada** (con evidencia directa), **Pendiente** (sin demostrar) y **Discrepancia**.

| # | Verificación | Resultado | Evidencia |
|---|---|---|---|
| 1.1 | El PaymentIntent existe y está `succeeded` | Comprobada | API de Stripe: `status = succeeded` y `amount_received = 20000` |
| 1.2 | Importe y moneda | Comprobada | 20000 `mxn` en Stripe, igual a 200.00 MXN en `payment` |
| 1.3 | El PaymentIntent corresponde al registro `payment` | Comprobada | `metadata.pei_payment_id` coincide con `payment.id`, y `payment.provider_payment_id` con el id del PaymentIntent |
| 1.4 | Proveedor `stripe` | Comprobada | `payment.provider = stripe`, `provider_status = succeeded` |
| 1.5 | Sin pagos duplicados | Comprobada | Un solo `payment` para la cita y para el PaymentIntent; una sola `idempotency_key` (`payment.create`) |
| 2.1 | Stripe envió el evento | Pendiente | El evento existe, pero `pending_webhooks = 1`: Stripe no tiene una entrega confirmada al endpoint `we_1UcIxX7E5qvo4iCtuKLqvCE5` (túnel ngrok) |
| 2.2 | Firma validada | Pendiente | `provider_webhook_event` está vacía en desarrollo (0 filas) |
| 2.3 | Evento registrado en `provider_webhook_event` | Discrepancia | 0 filas |
| 2.4 | Evento procesado | Pendiente | Sin fila que procesar |
| 2.5 | Duplicados sin efectos adicionales | Pendiente en real; solo cubierto con dobles | `stripe-webhook.http.spec.ts` y `payments-stripe-checkout.spec.ts` |
| 2.6 | Se consultó el estado real del PaymentIntent | Comprobada para el camino síncrono | El backend confirma en el servidor y guarda `provider_status = succeeded` antes de confirmar la cita. La cita se confirmó sin webhook |
| 3.1 | `payment` en `succeeded` | Comprobada | `payment.status = succeeded` |
| 3.2 | Cita `confirmed` | Comprobada | `appointment.status = confirmed`; historial `pending_payment` (paciente, 06:10:32) y luego `confirmed` (`system`, motivo `payment_succeeded`, 06:10:59) |
| 3.3 | Comisión fija de PEI de 20 MXN | Comprobada | `pei_fixed_fee = 20.00` (`pei_fee_configuration` `b3b8e746-…`) |
| 3.4 | Neto del médico de 180 MXN | Comprobada | `doctor_net_amount = 180.00` |
| 3.5 | Comisión del procesador como costo de PEI | Comprobada en el diseño; conciliación pendiente | El neto del médico no descuenta la comisión, y se estimó `provider_fee_estimated = 12.04`. Pero `provider_fee_actual`, `net_received_amount`, `money_release_date` y `fee_reconciled_at` siguen nulos, aunque Stripe ya informa una comisión real de 12.99 MXN (11.20 de comisión + 1.79 de impuesto), un neto de 187.01 y disponibilidad el 2026-11-23 |
| 3.6 | Registros relacionados consistentes | Comprobada con observaciones | Sin reembolsos en PEI ni en Stripe; `doctor_ledger_entry` vacío para el pago, lo esperado porque ningún módulo escribe aún en el ledger. Ver las observaciones |
| 4.1 | No se puede confirmar una cita solo desde el frontend | Cubierta con dobles; no probada en real | `payments-stripe-checkout.spec.ts` (cita sin pago aprobado; importe del cliente ignorado) |
| 4.2 | Un webhook repetido no duplica el procesamiento | Cubierta con dobles; no probada en real | Clave única de `request_id` y specs del webhook |
| 4.3 | Un evento con firma inválida se rechaza | Cubierta con dobles; no probada en real | `stripe-webhook.http.spec.ts` (401) |
| 4.4 | El mismo pago no se aplica dos veces | Comprobada en esta prueba y cubierta con dobles | Una sola `idempotency_key` y un solo `payment`; `Idempotency-Key = payment.id` hacia Stripe |

Pruebas con dobles ejecutadas el 2026-11-16 (`npm test -- --testPathPatterns stripe`): 5 suites, 140 de 140.

**Observaciones**

- La tarifa `stripe` de `processor_fee_schedule` (`711a2fc9-…`, vigente desde el 2026-11-16) copia los valores y la fuente de la tarifa de referencia de Mercado Pago (3.19 % + 4.00 + IVA). Por eso la estimación (12.04) no coincide con la comisión real de Stripe (12.99). No se encontró documentada la autorización de esa fila.
- En desarrollo hay 4 pagos anteriores de `mercado_pago` en `failed`, sin `provider_payment_id`, del 15 y 16-nov. Son intentos previos al cambio de proveedor; cada uno está en una cita distinta.

> Las verificaciones 2.1 a 2.4, 2.6 (vía webhook) y 3.5 (conciliación) quedaron resueltas tras corregir el endpoint y
> reenviar el evento (§8). La tabla anterior se conserva como resultado de la auditoría inicial.

## 8. Webhook de Stripe TEST: corrección del endpoint y reenvío del evento (2026-11-16)

**Causa de la falla inicial.** La URL del endpoint `we_1UcIxX7E5qvo4iCtuKLqvCE5` no tenía ruta
(`https://glibbest-isobathythermal-nikole.ngrok-free.dev`). Stripe envió los eventos a `POST /` y NestJS respondió 404
(`Cannot POST /`), por lo que el controlador del webhook nunca se ejecutó.
- El inspector local de ngrok registró cuatro entregas, a las 06:10:58 y 06:11:15 UTC. Eran `payment_intent.succeeded` y
  `payment_intent.created`, todas con `Stripe-Signature`.
- La firma de esas entregas se recalculó en local (HMAC-SHA256 de `t.cuerpo`) con `STRIPE_WEBHOOK_SECRET` y coincidió:
  el secreto configurado corresponde a ese endpoint.

**Corrección y reenvío** (autorizados por la responsable del producto):
1. Se actualizó el endpoint existente `we_1UcIxX7E5qvo4iCtuKLqvCE5`. Es el mismo ID y no se creó otro endpoint; el
   signing secret se conservó (la API no lo devolvió ni lo rotó).
   - URL nueva: `https://glibbest-isobathythermal-nikole.ngrok-free.dev/webhooks/stripe`.
   - Sigue `enabled`, en modo TEST y suscrito a `payment_intent.succeeded`.
2. Se reenvió solo `evt_3UcJ827E5qvo4iCt0pCvhwBV` (`payment_intent.succeeded`), solo a ese endpoint. Antes del reenvío
   no había llegado ningún reintento automático (`provider_webhook_event` vacía). Sin pagos ni reembolsos nuevos.

**Resultado**

| # | Verificación | Resultado | Evidencia |
|---|---|---|---|
| W-1 | Respuesta del backend | Comprobada | ngrok: `POST /webhooks/stripe` → 200 `{"received":true}` a las 06:30:56 UTC |
| W-2 | `pending_webhooks = 0` | Comprobada | API de Stripe: el evento tenía 1 antes del reenvío y 0 después |
| W-3 | Firma válida | Comprobada | `provider_webhook_event.signature_valid = true` |
| W-4 | Un solo registro | Comprobada | 1 fila: `9e1bd5a1-7f56-49d4-b9e6-77f82cd9d9cb` |
| W-5 | Evento registrado y procesado | Comprobada | Recibido a las 06:30:56.463 UTC y procesado a las 06:30:58.702 UTC; `status = processed`, `processing_attempts = 1`, `last_error` nulo |
| W-6 | Referencias entre evento, PaymentIntent y payment | Comprobada | `provider = stripe`, `topic = payment`, `action = payment_intent.succeeded`; `request_id = evt_3UcJ827E5qvo4iCt0pCvhwBV`, `data_id = pi_3UcJ827E5qvo4iCt0qa2xx5K`, `payment_id = 98c9d9e1-654d-47d0-a4a9-4ff7c03483a3` |
| W-7 | Sin duplicación ni cambios indebidos | Comprobada | Un solo `payment` para la cita, que sigue `succeeded`. La cita sigue `confirmed` con el mismo `updated_at` (06:10:59.685 UTC) y 2 entradas de historial, sin nuevas. 0 reembolsos en PEI y en Stripe |
| W-8 | Conciliación de la comisión real | Comprobada parcialmente | Se completaron `provider_fee_actual`, `net_received_amount` y `money_release_date`; `fee_reconciled_at` sigue nulo (ver limitaciones) |

Evidencia W-7: comparación de dos lecturas `READ ONLY` de la base, antes y después del reenvío. Solo cambiaron la fila
nueva de `provider_webhook_event` y, en `payment`, las columnas de conciliación y `updated_at`.

No se probó un segundo reenvío. Por tanto, la idempotencia frente a un evento duplicado real no está demostrada en esta
prueba; solo está cubierta con dobles (§7, 2.5).

**Importes**

| Concepto | Importe | Origen |
|---|---|---|
| Importe cobrado | 200.00 MXN | `payment.amount`; Stripe: 20000 centavos `mxn` |
| Comisión de PEI | 20.00 MXN | `payment.pei_fixed_fee` |
| Neto del médico | 180.00 MXN | `payment.doctor_net_amount` |
| Comisión real del procesador | 12.99 MXN | `balance_transaction` de Stripe: 11.20 de comisión + 1.79 de impuesto; `payment.provider_fee_actual` |
| Neto recibido por PEI | 187.01 MXN | `balance_transaction.net`; `payment.net_received_amount` |
| Fecha de disponibilidad | 2026-11-23 | `balance_transaction.available_on`; `payment.money_release_date` |

**Limitaciones pendientes**

- `fee_reconciled_at` continúa vacío. Actualmente ningún código lo establece: en `src` solo lo lee el mapeo del
  repositorio.
- La tarifa configurada para `stripe` en `processor_fee_schedule` (`711a2fc9-…`) todavía reutiliza los valores y el texto
  de fuente de la tarifa de referencia de Mercado Pago (3.19 % + 4.00 MXN + IVA 16 %). No es una tarifa contractual ni
  definitiva de Stripe.
- Por eso la comisión estimada (12.04 MXN) difirió de la real (12.99 MXN), con una diferencia de 0.95 MXN. PEI absorbe
  esa diferencia y el neto del médico permanece en 180.00 MXN.

## 9. Suscripciones del webhook de Stripe TEST alineadas con el backend (2026-11-16)

Hallazgo H-1 de la auditoría de cierre: el endpoint de TEST no estaba suscrito a varios de los eventos que procesa el
backend y sí a otros que no usa.

**Cambio.** Se actualizaron solo las suscripciones (`enabled_events`) del endpoint existente
`we_1UcIxX7E5qvo4iCtuKLqvCE5`.
- Conserva su ID y su URL (`https://glibbest-isobathythermal-nikole.ngrok-free.dev/webhooks/stripe`).
- Conserva su signing secret: la API no lo devolvió ni lo rotó.
- No se creó otro endpoint.

**Eventos agregados (4):**
- `charge.refunded`
- `charge.refund.updated`
- `charge.dispute.created`
- `charge.dispute.closed`

**Eventos retirados (4):** el backend no los procesa y los registraba como `ignored`.
- `payment_intent.created`
- `payment_intent.amount_capturable_updated`
- `payment_intent.partially_funded`
- `refund.created`

**Suscripción resultante.** Exactamente los 11 eventos de `STRIPE_PAYMENT_EVENT_TYPES`
(`stripe-webhook-authenticator.ts`), documentados en `Payments-decisiones.md` §8.5:
- `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.processing`,
  `payment_intent.requires_action`, `payment_intent.canceled`;
- `charge.refunded`, `charge.refund.updated`, `refund.updated`, `refund.failed`;
- `charge.dispute.created`, `charge.dispute.closed`.

**Verificación mediante la API de Stripe (GET antes y después)**

| | Antes | Después |
|---|---|---|
| URL | `…ngrok-free.dev/webhooks/stripe` | Igual |
| `status` / `livemode` | `enabled` / `false` | `enabled` / `false` |
| `api_version` | `2026-06-24.dahlia` | Igual |
| Eventos suscritos | 11 (4 faltantes y 4 sin uso) | 11, idénticos a `STRIPE_PAYMENT_EVENT_TYPES` |
| Endpoints en la cuenta | 1 | 1 |

No se modificó código, base de datos, documentación ni configuración LIVE. Tampoco se hicieron pagos, reembolsos ni
reenvíos.

**Alcance.** Recibir eventos de disputa no significa que su resolución esté implementada. Hoy una disputa solo hace que
el pago se consulte en la API y pase a `in_dispute`; su resolución (ganada o perdida, `charged_back`) sigue pendiente de
F6 (PAY-19). Ninguno de los cuatro eventos agregados se ha probado aún con un caso real en TEST.

## 10. H-5: idempotencia y concurrencia de webhooks sobre PostgreSQL real en C2 (2026-11-16)

Autorizado por la responsable del producto: C2 como destino exclusivo, fixtures sintéticos confirmados y cambios solo en
la infraestructura de pruebas. No se modificó `src/**`, el esquema ni las migraciones.

### 10.1 Plan

**Infraestructura**
- Modo `webhooks` del lanzador C2:
  - destino exacto C2 (`royal-paper-10258990` / `br-shy-pond-b50a3m8f` / `ep-withered-block-b5e8v9ov` / `neondb`);
  - exige conexión directa (sin `-pooler`) y la marca `--committed-fixtures wh-h5-committed`;
  - esa marca no se admite en ningún otro modo;
  - siguen vigentes el rechazo de desarrollo y respaldos, `db-tripwire` y la verificación de la identidad real
    (`neon.*`) antes de Jest y dentro del spec.
- Comando:
  `pnpm c2 run webhooks test/webhooks/stripe-webhook-idempotency.wh-spec.ts --committed-fixtures wh-h5-committed`.

**Qué es real y qué es doble**
- Reales: PostgreSQL, repositorios Drizzle, unidad de trabajo, triggers y restricciones, `StripeWebhookAuthenticator`
  (con un secreto generado en memoria), `Receive`/`Process`/`RetryProviderWebhookEventsUseCase` y la confirmación de M08.
- Dobles:
  - el proveedor: `getPayment` devuelve un PaymentIntent ficticio `succeeded` de 200.00 MXN, con comisión 1.23 y neto
    198.77 sintéticos; nada sale a Stripe;
  - el despachador, manual;
  - el reloj: hora real más un desplazamiento, para los plazos de 60 s y 15 min.

**Fixtures sintéticos**
- Marca `wh-h5-<C2_RUN_ID>` en usuarios (`…@h5.test.invalid`), motivo de la cita, `source` de la tarifa,
  `pi_test_whh5_…` y `evt_whh5…`.
- Las versiones de `cancellation_policy`, `pei_fee_configuration` y `processor_fee_schedule` son ventanas de un minuto en
  el año 2000, nunca vigentes.
- La tarifa `stripe` sintética tiene valores 0 y solo es destino de la llave foránea de `payment`: **no es una tarifa**.
- No se copió ninguna configuración de desarrollo ni se modificó ninguna fila existente de C2.

### 10.2 Resultados (ejecución `c2-20261116071451-5767`)

| Caso | Qué verifica | Resultado |
|---|---|---|
| WH-PG-01 | El mismo evento recibido dos veces seguidas | **FAIL**: la segunda recepción lanza un error (ver H5-1) |
| WH-PG-02 | Cinco entregas simultáneas del mismo evento | **FAIL**: 1 aceptada y 4 rechazadas con error en lugar de `duplicate` (ver H5-1). En la base quedó **una sola** fila |
| WH-PG-03 | `claim` concurrente (5) y cinco procesamientos simultáneos | PASS: un reclamo; un procesamiento y cuatro `skipped`; efectos una vez |
| WH-PG-04 | Dos eventos distintos del mismo PaymentIntent procesados a la vez | PASS: un cambio del pago y una confirmación |
| WH-PG-05 | Recuperación de un evento `received` no despachado | PASS: procesado una vez; un segundo barrido no lo toca |
| WH-PG-06 | Recuperación de un evento `failed` (fallo simulado del proveedor) | PASS: `failed` (`provider:unavailable`) y después `processed` con 2 intentos |
| WH-PG-07 | Reentrega de un evento procesado | **FAIL**: la reentrega lanza un error (H5-1); sin efectos adicionales |
| WH-PG-08 | Reentrega de un evento `failed` | **FAIL**: la reentrega lanza un error y no se redespacha (H5-1). El barrido posterior lo completó una vez |
| WH-PG-09 | Evento abandonado en `processing` reclamado por el barrido con el primer trabajador aún activo | PASS: 2 intentos, efectos una vez; el trabajador abandonado terminó sin cambios |
| WH-PG-10 | Firma inválida, cuerpo alterado y marca de tiempo vencida | PASS: rechazados y 0 filas |
| WH-PG-11 | Guards: datos recibidos, estado, `payment_id`, borrado del evento, comisión real y borrado del pago | PASS: los seis rechazados por PostgreSQL; `finish` no altera un evento procesado |
| WH-PG-12 | Unicidad de `payment` (`payment_provider_payment_uq`) y otro error (CHECK de tema vacío) | PASS: 23505 traducido a `UniqueConstraintViolationError`; el otro error se propaga sin dejar fila |
| WH-PG-13 | Límite de 8 intentos | PASS: tras 8 fallos queda `failed` y no se reclama ni se reintenta |
| WH-PG-INV | Invariantes globales de la ejecución | PASS: un registro por evento, un pago por cita, ≤ 1 confirmación por cita, 0 reembolsos |

Jest: 10 de 14 aprobadas y 4 fallidas. Las cuatro fallas tienen la misma causa, H5-1. Jest avisó de que no terminó un
segundo después de la suite (el pool de conexiones queda abierto); no afecta a los resultados.

**Estado final de los casos.** Todas las citas con un pago exitoso quedaron `confirmed` con una sola entrada de historial
y una sola fila de evento por `evt_…`. Eso incluye las de los casos fallidos: los barridos de WH-PG-05 y WH-PG-09
recogieron los eventos que quedaron `received` o `failed`. Las citas 10, 12 y 13 siguen `pending_payment` con su pago en
`processing`, como se esperaba.

### 10.3 Hallazgo H5-1 (comprobado con PostgreSQL real): una reentrega del mismo evento responde con error

- **Evidencia:** `jest-output.log` registra 3 veces `duplicate key value violates unique constraint
  "provider_webhook_event_uq"`, y en WH-PG-02 cuatro rechazos `Failed query: insert into "provider_webhook_event"`.
- **Causa:**
  - `ReceiveProviderWebhookUseCase.execute` (`provider-webhook.use-cases.ts`) solo trata como duplicado un
    `UniqueConstraintViolationError` con la restricción `provider_webhook_event_uq`;
  - pero `DrizzleWebhookEventRepository.insert` (`drizzle-webhook-events.repository.ts`) se ejecuta fuera de una unidad
    de trabajo y no traduce el error: llega el `DrizzleQueryError` del driver, con el 23505 en `cause`;
  - el caso de uso lo relanza, y el controlador respondería 500 a Stripe.
  - Las pruebas con dobles no lo detectaban porque su repositorio lanza directamente `UniqueConstraintViolationError`.
- **Lo que SÍ garantiza la base:** nunca hay dos filas para el mismo evento, y los efectos sobre el pago y la cita no se
  repiten (WH-PG-INV).
- **Impacto:**
  - Stripe recibiría 500 en cada reentrega y seguiría reintentando.
  - Un evento `received` o `failed` no se redespacha al reentregarse; depende del barrido
    (`payments-retry-webhooks`), que hoy no está programado (H-6).
- **Corrección propuesta (requiere autorización, toca `src`):** traducir el error en
  `DrizzleWebhookEventRepository.insert` con `translatePostgresError`, como ya hace `DrizzleUnitOfWork`, y volver a
  ejecutar esta suite. No requiere cambios de esquema.

### 10.4 Huellas de C2 antes y después

Huella autorizada de 8 componentes verificada antes de la ejecución, en el lanzador y en el spec, y después:
- `neondb`, `system_identifier` 7688416788070812297, `server_version` 180007, `neondb_owner`;
- `royal-paper-10258990` / `br-shy-pond-b50a3m8f` / `ep-withered-block-b5e8v9ov`; host `f5472c77268d2972`;
- migraciones: 19 antes y 19 después.

**Comparación** de las 65 tablas de `public` (hash md5 de cada fila con `to_jsonb`, sin guardar filas; corte
`2026-11-16 07:14:24.389635+00`):
- **filas preexistentes sin cambios en ninguna tabla**;
- tablas que crecieron:
  - `appointment` 23 → 35, `appointment_status_history` 40 → 49, `audit_log` 254 → 263;
  - `cancellation_policy`, `pei_fee_configuration` y `processor_fee_schedule` 1 → 2;
  - `doctor_profile` 17 → 18, `patient_profile` 23 → 24;
  - `payment` 10 → 22, `provider_webhook_event` 0 → 11;
  - `user` 52 → 55, `user_profile` 51 → 54.

Todas las filas nuevas posteriores al corte pertenecen a la marca de la ejecución.

### 10.5 Datos sintéticos que permanecen en C2

No se pudo borrar ninguno sin desactivar protecciones, y no se desactivó ninguna:
- **Sin borrado posible:** `payment`, `provider_webhook_event`, las tres configuraciones versionadas y `audit_log`, por
  sus triggers `*_no_delete`, versionado y append-only.
- **Fijados por esas filas:** `appointment`, `appointment_status_history`, los perfiles y los usuarios, que esas filas
  referencian.

| Tabla | Filas | Cómo se identifican |
|---|---|---|
| `user` / `user_profile` | 3 / 3 | `user.id` y correo `wh-h5-c2-20261116071451-5767-<rol>@h5.test.invalid` |
| `patient_profile` / `doctor_profile` | 1 / 1 | `user_profile_id` de los perfiles anteriores |
| `cancellation_policy` / `pei_fee_configuration` / `processor_fee_schedule` | 1 / 1 / 1 | ventana de 1 minuto en el año 2000; la tarifa con `source` `SINTÉTICO wh-h5-c2-20261116071451-5767: …` |
| `appointment` | 12 | `reason` `wh-h5-c2-20261116071451-5767-<caso>`, fechas en 2099 |
| `appointment_status_history` | 9 | citas anteriores (`confirmed`, `payment_succeeded`) |
| `payment` | 12 | `provider_payment_id` `pi_test_whh5_c2202611160714515767_<caso>` |
| `provider_webhook_event` | 11 | `data_id` `pi_test_whh5_c2202611160714515767_%`, `request_id` `evt_whh5c2202611160714515767…` |
| `audit_log` | 9 | `entity_id` de las citas anteriores |
| `refund` | 0 | — |

Las citas 10, 12 y 13 siguen `pending_payment`, con una retención que vence a las 2 horas.

### 10.6 Aislamiento

- **Solo C2:** identidad real `neon.*` verificada antes de Jest y en el spec.
- **Sin conexión a desarrollo:** el lanzador no lee `apps/backend/.env` y ejecuta Jest en un directorio sin `.env`;
  `db-tripwire` bloquea cualquier conexión sin identidad de C2; los scripts de huella solo leen `C:\pei-c2\.env.c2`.
- **Stripe:** ninguna petición; los eventos se firmaron en memoria.

Evidencias, fuera del repositorio:
- `C:\pei-c2-evidencias\2026-11-16\c2-20261116071451-5767`: `run.json`, `jest-results.json`, `jest-output.log` y
  `SHA256SUMS`;
- `C:\pei-c2-evidencias\2026-11-16\h5-webhooks`: `c2-before.json`, `c2-after.json`, `c2-comparison.json` y
  `residue-c2-20261116071451-5767.json`.

### 10.7 Archivos

- Nuevos:
  - `test/webhooks/stripe-webhook-idempotency.wh-spec.ts`;
  - `test/support/payments-webhook-fixtures.ts`;
  - `test/support/c2-mode-webhooks.ts`;
  - `test/jest-webhooks.json`.
- Modificados:
  - `test/support/c2-target-guard.ts`: modo `webhooks` y marca `wh-h5-committed`;
  - `test/support/c2-launcher.ts`: configuración del modo y reglas de la marca;
  - `scripts/c2-run.ts`: solo el uso documentado;
  - `test/support/c2-target-guard.spec.ts`: H5-GUARD-01 a 03, e inventario con los specs de webhooks,
    `appointments-reschedule` y `m08-0014-verify` (TC-M02-247 vuelve a pasar);
  - `test/support/c2-launcher.spec.ts`: H5-LAUNCH-01 a 03;
  - `test/support/c2-isolated-target.spec.ts`: TC-M08-352 con la marca del modo `webhooks`.
- Pruebas sin BD: `test/support` 11 suites, 215 de 215; Payments, Stripe y webhooks 34 suites, 734 de 734.

## 11. H5-1 corregido y validado en PostgreSQL real (2026-11-16)

Cierra el hallazgo H5-1 de §10.3. La corrección y su validación en C2 fueron autorizadas por la responsable del producto.

### 11.1 Problema original

- `ReceiveProviderWebhookUseCase` reconoce una reentrega solo si recibe un `UniqueConstraintViolationError` de
  `provider_webhook_event_uq`.
- `DrizzleWebhookEventRepository.insert` se ejecuta fuera de una unidad de trabajo y no traducía el error. PostgreSQL
  devolvía el 23505 dentro del `DrizzleQueryError` del driver, sin traducir.
- El caso de uso lo relanzaba: cada entrega repetida del mismo evento terminaba en error (HTTP 500 para Stripe) en lugar
  de reconocerse como duplicado, y un evento `failed` no se redespachaba al reentregarse.
- La base nunca guardó dos filas ni repitió efectos. Las pruebas con dobles no lo detectaron porque su repositorio
  lanzaba directamente el error ya traducido.

### 11.2 Corrección

Único cambio de código de producción, en
`src/modules/payments/infrastructure/persistence/drizzle-webhook-events.repository.ts`. `insert` envuelve la
inserción en `try/catch` y relanza `translatePostgresError(error) ?? error`, el mismo patrón de `DrizzleUnitOfWork`.
- Un 23505 de `provider_webhook_event_uq` llega como `UniqueConstraintViolationError` y la recepción devuelve
  `duplicate` (HTTP 200).
- Cualquier otro error de PostgreSQL se traduce a su error de dominio; uno que no sea de PostgreSQL se relanza sin
  cambios.
- El caso de uso sigue exigiendo la restricción exacta del evento, así que ningún otro error se toma por duplicado.

Sin cambios de esquema, migraciones ni otros servicios.

### 11.3 Pruebas unitarias nuevas

En `drizzle-webhook-events.repository.spec.ts`, sin base de datos: un contexto falso devuelve el error tal como lo
entrega Drizzle.

| Prueba | Comprueba | Código original | Con la corrección |
|---|---|---|---|
| H5-1-U1 | 23505 de `provider_webhook_event_uq` → `UniqueConstraintViolationError` con código, restricción y tabla | Falla | Pasa |
| H5-1-U2 | 23505 de otra restricción: se traduce y conserva su propia restricción | Falla | Pasa |
| H5-1-U3 | CHECK (23514) → `IntegrityConstraintViolationError`, no de unicidad | Falla | Pasa |
| H5-1-U4 | Un error que no es de PostgreSQL (red) se relanza sin cambios | Pasa | Pasa |
| H5-1-U5 | Recepción con el repositorio real: reentrega de un evento terminado → `duplicate`, sin redespacho | Falla | Pasa |
| H5-1-U6 | Reentrega de un evento `failed` → `duplicate` y se redespacha | Falla | Pasa |
| H5-1-U7 | Otra restricción única o un CHECK siguen propagándose (no son duplicado) | Falla | Pasa |

Resultados:
- Contra el código original (sustituido temporalmente y restaurado): 6 de las 7 fallan; U4 ya pasaba.
- Con la corrección: el archivo pasa 9 de 9.
- Payments, Stripe, webhooks e infraestructura de pruebas: 44 suites, 927 de 927.
- `npm run build`: correcto.

### 11.4 Repetición en C2 de WH-PG-01, 02, 07 y 08

**Ejecución.** `c2-20261116160945-ede2`, con el spec
`test/webhooks/stripe-webhook-redelivery.wh-spec.ts`, en modo `webhooks` con la marca `wh-h5-committed`. No se repitió
la suite completa.

**Reutilización.** De la ejecución anterior `c2-20261116071451-5767` se reutilizaron, solo en lectura:
- el paciente y el médico;
- la política, la comisión y la tarifa sintéticas;
- los eventos ya procesados de sus casos 01 y 07.

| Caso | Resultado | Evidencia |
|---|---|---|
| WH-PG-01 | PASS | El evento ya procesado del caso 01 se reentregó dos veces seguidas: las dos devolvieron `duplicate` con el mismo `eventId`, sin redespacho. Fila, pago, cita e historial idénticos (`confirmed`, 1 pago, 1 confirmación, 0 reembolsos) |
| WH-PG-02 | PASS | Cinco **primeras** entregas simultáneas de un evento nuevo: **1 `accepted` y 4 `duplicate`, 0 rechazos** (ningún HTTP 500). **1 sola fila** (`received`, 0 intentos, `signature_valid = true`). Pago `processing`, cita `pending_payment`, 0 historial, 0 reembolsos: sin efectos duplicados |
| WH-PG-07 | PASS | El evento procesado del caso 07 se reentregó: `duplicate`, sin redespacho ni cambios |
| WH-PG-08 | PASS | Recuperación del evento fallido (abajo). Al final: 1 pago `succeeded`, 1 confirmación, 1 entrada de historial, 0 reembolsos; el proveedor se consultó 2 veces |

Jest: 4 de 4. Avisó de que no terminó un segundo después de la suite (pool de conexiones abierto); no afecta a los
resultados.

**Recuperación del evento fallido (WH-PG-08).**
1. El primer procesamiento falló de forma controlada (`provider:unavailable`).
2. El evento quedó `failed`, con 1 intento y `last_error = provider:unavailable`; la cita siguió `pending_payment`.
3. La segunda entrega se reconoció como `duplicate` y se redespachó.
4. El siguiente procesamiento lo terminó `processed`: 2 intentos, sin error, `payment_id` del pago y
   `paymentChanged = true`.

### 11.5 Registros sintéticos adicionales

Exactamente los 5 autorizados, con la marca `wh-h5-c2-20261116160945-ede2`. No se crearon usuarios, perfiles ni
configuraciones.

| Tabla | Filas | Identificador |
|---|---|---|
| `appointment` | 1 | `reason = 'wh-h5-c2-20261116160945-ede2-R'`; hora 2099-01-05 04:00 UTC (100 h desde 2099-01-01) |
| `payment` | 1 | `provider_payment_id = 'pi_test_whh5_c220261116160945ede2_R'` |
| `provider_webhook_event` | 1 | `request_id = 'evt_whh5c220261116160945ede2R1'`, `data_id` = el `pi_test_…_R` anterior |
| `appointment_status_history` | 1 | La de la cita anterior (`confirmed`, `payment_succeeded`) |
| `audit_log` | 1 | `entity_id` de la cita anterior (confirmación) |

### 11.6 Huellas de C2 antes y después

- **Huella de 8 componentes**, idéntica antes y después:
  - `neondb`, `system_identifier` 7688416788070812297, `server_version` 180007, `neondb_owner`;
  - `royal-paper-10258990` / `br-shy-pond-b50a3m8f` / `ep-withered-block-b5e8v9ov`; host `f5472c77268d2972`;
  - 19 migraciones.
- **Comparación de las 65 tablas** de `public` (corte `2026-11-16 16:09:03.491643+00`):
  - las **filas preexistentes no cambiaron en ninguna tabla**, incluidos los eventos, pagos y citas de la ejecución
    `c2-20261116071451-5767` que se reentregaron;
  - tablas que crecieron: `appointment` 35 → 36, `appointment_status_history` 49 → 50, `audit_log` 263 → 264,
    `payment` 22 → 23, `provider_webhook_event` 11 → 12;
  - todas las filas nuevas pertenecen a la marca.
- **Evidencias:**
  - `C:\pei-c2-evidencias\2026-11-16\h5-1-redelivery` (`c2-before.json`, `c2-after.json`, `c2-comparison.json`,
    `residue-c2-20261116160945-ede2.json`);
  - `C:\pei-c2-evidencias\2026-11-16\c2-20261116160945-ede2` (salida de Jest).

### 11.7 Estado

- **H5-1: corregido y validado** con pruebas unitarias y en PostgreSQL real (C2).
- **H-5: cubierto para los escenarios probados.** Son WH-PG-01 a 13 en la ejecución 5767, con la repetición de 01, 02,
  07 y 08 tras la corrección. No demuestra todas las condiciones de concurrencia posibles: otras combinaciones de tiempo,
  carga o fallos de red del driver no se ensayaron.
- **H-6 sigue pendiente:** reintentos automáticos y despacho durable. El barrido `payments-retry-webhooks` no está
  programado y el despacho en proceso no sobrevive a un reinicio.
- **Fixtures que permanecen en C2:** los 64 registros de `c2-20261116071451-5767` (§10.5) y estos 5. Los triggers
  impiden borrarlos y no se desactivó ninguna protección.
- **Aislamiento:** solo C2. Sin conexiones a desarrollo ni solicitudes a Stripe.

## 12. H-6: recuperación automática de webhooks (2026-11-16)

Etapas 1 y 2, autorizadas por la responsable del producto. Sin migraciones ni cambios de esquema, sin dependencias ni
infraestructura nuevas, y sin cambios en pagos, reembolsos ni confirmación de citas.

### 12.1 Etapa 1: worker periódico

**Qué hace**
- `src/modules/payments/infrastructure/webhook-retry.worker.ts` reutiliza `RetryProviderWebhookEventsUseCase`: una
  ejecución al arrancar (`onApplicationBootstrap`) y después una por intervalo.
- `InProcessWebhookDispatcher` sigue siendo la vía rápida.

**Configuración**
- `PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED`: `true` o `false`; vacía equivale a `false`. **Desactivado por defecto.**
- `PAYMENTS_WEBHOOK_RETRY_INTERVAL_SECONDS`: de 5 a 3600; vacía equivale a 60.
- Un valor inválido detiene el arranque.
- Documentadas en `.env.example`.

**Exclusión**
- Por instancia: un turno se omite si el anterior sigue en curso.
- Entre instancias (`PgAdvisoryXactLock`): `BEGIN` + `pg_try_advisory_xact_lock(7031420610001)` en una conexión
  dedicada, sin esperar.
  - Si otra instancia tiene el candado, se omite el turno.
  - Se libera al terminar la transacción o si cae la conexión, y es válido tras un pooler en modo transacción.
- El reclamo atómico de cada evento sigue siendo la segunda capa.

**Errores y apagado**
- Un error se registra solo por su nombre y no detiene el worker.
- Apagado ordenado (`beforeApplicationShutdown`): deja de iniciar turnos, cancela el temporizador y espera al turno en
  curso.
- `main.ts` añade `app.enableShutdownHooks()` para que SIGTERM y SIGINT lleguen a ese hook.

**Archivos**
- Nuevos: `webhook-retry.worker.ts` y su spec, y `test/webhooks/stripe-webhook-retry-worker.wh-spec.ts`.
- Modificados: `payments.module.ts`, `main.ts`, `.env.example`, `payments.module.spec.ts` e inventario TC-M02-247.

**Pruebas**
- 17 unitarias del worker, del candado y de la configuración (H6-W-01 a 08, H6-L-01 a 03, H6-CFG-01 a 03).
- H6-MOD-01 y 02 en el módulo.
- Suite completa: 117 suites, 1999 de 1999.
- `npm run build`: correcto.

**C2** (ejecución `c2-20261116172436-2f12`, 2 de 2)
- **H6-PG-01:** el candado consultivo real impide un segundo barrido simultáneo, sin escrituras.
- **H6-PG-02:** un evento sintético quedó `received` sin procesar (caída simulada tras el 200). Al arrancar con el worker
  activado **solo en ese proceso de prueba**, su ejecución inicial lo llevó a `processed` (1 intento) **sin el CLI**:
  pago `succeeded`, cita `confirmed`, 1 historial y 0 reembolsos.
  - Antes se comprobó que era el único evento recuperable de C2.
- **Datos:** 5 filas nuevas marcadas `wh-h5-c2-20261116172436-2f12`: 1 cita (`reason …-W`), 1 pago
  (`pi_test_whh5_c2202611161724362f12_W`), 1 evento, 1 historial y 1 auditoría. Se reutilizaron los fixtures de
  `c2-20261116071451-5767`.
- **Huellas:** la de 8 componentes, idéntica antes y después; filas preexistentes sin cambios en las 65 tablas.
- **Evidencias:** `C:\pei-c2-evidencias\2026-11-16\h6-worker`.

### 12.2 Etapa 2: backoff, errores permanentes y avisos

**Campos disponibles.** `provider_webhook_event` tiene `received_at`, `processed_at` (solo en `processed`),
`processing_attempts`, `last_error` y `status`, pero **no la hora del último intento**. No se usaron `claimed_at` ni
`next_attempt_at` (R-6, requieren migración).
- Se descartó reutilizar `processed_at` como «último intento»: cambiaría su significado.
- Se descartó codificar la hora en `last_error`: frágil.

**R-3 · Backoff** (`webhook-retry-policy.ts`)
- Espera acumulada desde `received_at` según los intentos hechos: un `failed` con n intentos solo es elegible tras
  0, 1, 3, 8, 23, 53, 113 o 233 min. Son esperas de 1, 2, 5, 15, 30, 60 y 120 min, unas 3 h 53 min en total.
- Una caída breve ya no consume los 8 intentos: con barridos cada minuto durante 10 minutos se usan 4 (H6-E2-02).
- **Limitación sin migración:** si el primer fallo ocurre mucho después de `received_at` (por ejemplo, una reentrega
  tardía que falla), los umbrales ya vencieron y los reintentos quedan espaciados solo por el intervalo del worker. La
  solución completa es `next_attempt_at` (R-6).

**R-4 · Errores permanentes.** El barrido no reintenta un `failed` cuyo `last_error` es permanente. La comparación es
exacta o por prefijo con `left()` (sin `LIKE`, porque los códigos contienen `_`), y `coalesce` protege los nulos.
- No se fuerza el estado ni los intentos: el evento queda `failed` con su recuento real. Una reentrega de Stripe o una
  acción manual pueden reprocesarlo.

| Tipo | Códigos | Justificación |
|---|---|---|
| Permanente | `appointment_mismatch:*`, `appointment_not_found`, `payment_vanished` | Identidad o existencia que no cambia (las citas y los pagos no se borran) |
| Permanente | `provider:not_found`, `provider:rejected_request` | 404 o 4xx de Stripe para el PaymentIntent firmado: la misma consulta da lo mismo |
| Permanente | `conflict:otro proveedor`, `conflict:external_reference distinta`, `conflict:importe distinto`, `conflict:otro pago del proveedor` | El snapshot no corresponde a este pago, o contradice datos inmutables |
| Permanente | `conflict:transición …`, `conflict:valor distinto del ya registrado …` | `decideSnapshot` ya trata como atrasados los estados alcanzables; quedan contradicciones que exigen conciliación manual |
| Transitorio | `provider:unavailable`, `provider:timeout` | Red, 5xx, 409 o 429 |
| Transitorio | `provider:unauthorized` | Se recupera al corregir las credenciales |
| Transitorio | `provider:unexpected_response` | Incluye respuestas no JSON con 2xx (proxy, corte) |
| Transitorio | `confirmation_failed`, `release_failed`, `refund_request_failed`, `internal` | M08, BD o reembolso obligatorio: reintentable e idempotente |
| Transitorio | Cualquier código o conflicto desconocido | Conservador: no se pierde la recuperación |

**R-5 · Avisos.** `ProcessProviderWebhookEventUseCase` emite con `logger.error` dos etiquetas fijas y buscables, con id
del evento, proveedor, tipo, intento y código, sin datos personales:
- `[PAYMENTS-WEBHOOK-PERMANENT]` ante un error permanente;
- `[PAYMENTS-WEBHOOK-EXHAUSTED]` cuando se agotan los 8 intentos.

El resultado `failed` incluye `permanent` y `exhausted`.

**CLI.** Los tres CLI que montan `PaymentsCliModule` llaman a `disablePeriodicWebhookWorker()` antes de crear su
contexto, así que nunca arrancan el worker aunque el `.env` lo active: `payments-retry-webhooks`,
`payments-recover-refunds` y `payments-reconcile-cancellations`. La función vive en `payments.module.ts`: la regla de
arquitectura impide que los CLI importen la infraestructura de pagos.

**Archivos**
- Nuevos:
  - `application/use-cases/webhook-retry-policy.ts` y su spec;
  - `test/webhooks/stripe-webhook-retry-policy.wh-spec.ts`.
- Modificados:
  - `application/ports/provider-webhook.port.ts`: `RetryableQuery.failedReceivedBefore` y `excludeFailures`,
    opcionales;
  - `application/use-cases/provider-webhook.use-cases.ts`: `buildRetryableQuery`, clasificación, avisos y `alert`;
  - `infrastructure/persistence/drizzle-webhook-events.repository.ts`: `failedBackoffCondition` y
    `notPermanentCondition`;
  - `payments.module.ts`: `alert` y `disablePeriodicWebhookWorker`;
  - los tres CLI y su spec;
  - las specs de casos de uso y repositorio, el inventario y `c2-isolated-target.spec.ts` (tipo).

**Pruebas**

| Grupo | Pruebas |
|---|---|
| `webhook-retry-policy.spec.ts` | H6-POL-01 a 04 (esperas; 13 permanentes y 12 transitorios o desconocidos) |
| `provider-webhook.use-cases.spec.ts` | H6-E2-01 a 07: dentro y fuera de la espera, caída breve, transitorios, permanentes, conflicto frente a M08, elegibles y consulta |
| Pruebas ajustadas | Cuatro pruebas de reintento existentes ahora avanzan el reloj antes de reintentar (comportamiento esperado del backoff) |
| `drizzle-webhook-events.repository.spec.ts` | H6-SQL-01 y 02 |
| `payments-retry-webhooks.spec.ts` | H6-CLI-01 y 02 |

- Suite completa: **118 suites, 2040 de 2040**.
- `npm run build`: correcto.
- `tsc` solo conserva errores previos ajenos: `dev-migrate-core.spec.ts` y `better-auth-memory.ts`.

**C2** (ejecución `c2-20261116174256-96d5`, H6-PG-03 PASS)
- Se crearon solo 4 filas de `provider_webhook_event`, sin pago ni cita, marcadas en `data_id` y `request_id`:
  - B1 `e58a8c37-03da-4eb2-92d3-5c448893f551`
  - B2 `93c00653-627e-471e-9010-4e2fcb58025c`
  - B3 `86cafd5a-1f40-4b53-ad24-350a6736b3e6`
  - B4 `df6ce79e-7473-40da-ba0e-f1073d89d6d9`
- Con la consulta real del barrido (`buildRetryableQuery`):
  - ahora solo es elegible **B2** (transitorio fuera de su espera);
  - 10 minutos después, B1, B2 y B4;
  - **B3**, permanente, nunca;
  - sin la política (consulta de la etapa 1), las cuatro.
- No se procesó nada.
- Al terminar, las 4 se **neutralizaron** con `processing_attempts = 8`, el único cambio que el guard permite: ningún
  barrido futuro las toma.
- **Huellas:** la de 8 componentes, idéntica.
  - Las filas se insertaron con `received_at` 5 minutos antes (necesario para la prueba), así que el comparador las
    contó como «anteriores al corte» y marcó `provider_webhook_event`.
  - Una verificación adicional confirmó que las **13 filas preexistentes** de esa tabla tienen el mismo hash que antes.
  - En las otras 64 tablas no cambió ninguna fila.
- **Evidencias:** `C:\pei-c2-evidencias\2026-11-16\h6-stage2`.

### 12.3 Estado

- **R-3: resuelto sin migración**, con la limitación de §12.2. La solución completa es `next_attempt_at` (R-6).
- **R-4: resuelto.**
- **R-5: resuelto en registros.** Los avisos son líneas de log con etiqueta fija; no hay notificación externa (correo o
  canal), lo que sería una decisión aparte.
- **R-6** (`claimed_at` / `next_attempt_at`): pendiente; requiere migración.
- **Worker:** sigue **desactivado** en todos los entornos. R-3 y R-4 quedan cubiertos, pero activarlo en un entorno
  concreto requiere una decisión explícita.
- **Fixtures en C2:** se suman a los anteriores (64 + 5 + 5 + 4 filas), todos marcados `wh-h5-…`.

## 13. H-2 / H-3: conciliación de la comisión real y `fee_reconciled_at` (2026-11-16)

Autorizado por la responsable del producto. Sin migraciones ni cambios de esquema, sin cambios en el neto del médico ni
en las reglas de distribución, y sin ejecución periódica.

### 13.1 Decisiones de negocio

- **Comisión conciliada:** el backend obtuvo de Stripe la comisión real del pago, verificó que corresponde al pago y a la
  moneda esperados y persistió el importe.
  - Nunca por la tarifa estimada o provisional, ni solo porque el PaymentIntent esté `succeeded`.
  - Nunca sin un `balance_transaction` válido.
  - La fecha de disponibilidad no interviene.
- **La comisión real incluye impuestos:** se usa `balance_transaction.fee` (12.99 = 11.20 + 1.79 de IVA en el pago TEST).
- **Backfill** de los pagos con `provider_fee_actual` y sin `fee_reconciled_at`, limitado por ahora a desarrollo y C2.

### 13.2 Implementación

**Validación de `balance_transaction`** (`stripe-payment-provider.ts`, `chargeFacts`). La comisión, el neto y la fecha
solo se toman si el `balance_transaction` cumple todo esto:
- está expandido y su `object` es `balance_transaction`;
- su `type` es el del cobro (`charge` o `payment`);
- `currency = mxn`;
- su `amount` es igual al del cargo, y el del cargo al del PaymentIntent;
- `net = amount − fee`.

Si algo no cuadra, quedan `null` y `providerFeeVerified = false`; un valor malformado sigue siendo una respuesta
inesperada. El snapshot lleva `providerFeeVerified`, opcional y `true` solo en ese caso.

**Regla de `fee_reconciled_at`** (`providerUpdateFor` con `reconcile`, activado solo por `decideSnapshot` dentro de
`applyProviderSnapshot`, el flujo transaccional y bloqueado). La marca se fija cuando se cumple todo esto:
- el pago no la tiene;
- el snapshot está verificado;
- la comisión y el neto del snapshot son iguales a los persistidos, o se fijan en la **misma escritura**.

Además:
- La creación del pago y la sincronización del paciente (rutas sin bloqueo) persisten la comisión, pero **no la
  marcan**.
- Una comisión o un neto distintos de los persistidos son un conflicto: nunca se sobrescriben.
- `payment_guard` (escritura única) y `payment_fee_reconciled_chk` (sin comisión no hay marca) se mantienen.

**Barrido** (`ReconcileProviderFeesUseCase` + `findPendingFeeReconciliation`)
- Selecciona pagos `stripe` con PaymentIntent, sin `fee_reconciled_at`, con cobro capturado (`succeeded`,
  `partially_refunded`, `refunded`, `in_dispute` o `charged_back`) y con más de 5 minutos de antigüedad. Entran tanto los
  que no tienen comisión real como los que la tienen guardada sin marca.
- Cada pago se vuelve a consultar con `refreshPaymentFromProvider`, por el flujo bloqueado.
- Un fallo se registra con su código y no detiene los siguientes.

**CLI** `src/cli/payments-reconcile-fees.ts [--limit N]`
- Solo con `STRIPE_ENV=test` y nunca con `NODE_ENV=production`.
- Desactiva el worker periódico antes de crear su contexto.
- Imprime solo conteos y sale con 1 si algún pago falló.
- No hay ejecución automática ni programada.

### 13.3 Pruebas y resultados

| Grupo | Pruebas |
|---|---|
| Adaptador | H2-A-01 a 04: válido; 10 casos de `balance_transaction` inválido; ausente o sin expandir; malformado |
| Regla | H3-R-01 a 08: marca en la misma escritura; backfill; idempotencia; sin verificación no hay marca; nunca por estimación; la fecha no decide; conflictos sin sobrescritura; rutas sin bloqueo sin marca |
| Caso de uso | H2-UC-01 a 04 |
| SQL | H2-SQL-01 y 02 |
| CLI | H2-CLI-01 a 03, y H6-CLI-02 ampliado al nuevo CLI |

- **Pruebas ajustadas:**
  - el doble de Stripe (`test/support/stripe-fake.ts`) ahora devuelve `amount` del cargo, y `type` y `amount` del
    `balance_transaction`, como Stripe real;
  - en `payments-stripe-checkout.spec.ts`, el primer webhook tras un pago síncrono ahora concilia
    (`paymentChanged: true`), que es el cambio esperado.
- **Suite completa:** 120 suites, 2071 de 2071. `npm run build`: correcto.

**C2, ejecución `c2-20261116180614-8590`**
- 3 citas y 3 pagos sintéticos, que reutilizan los fixtures de `c2-20261116071451-5767`:

  | Pago | `payment.id` | Situación inicial |
  |---|---|---|
  | F1 | `98068782-769b-4b1e-a5e8-64d3681ea7ef` | Sin comisión real |
  | F2 | `d55217f5-e6e7-4257-84e5-d5423d34c1bf` | Con comisión guardada sin marca |
  | F3 | `889ecaa6-3805-4432-b31a-facf7a95fcfc` | Sin `balance_transaction` |

- **Primer barrido:** 14 examinados, 2 conciliados (F1 y F2), 1 pendiente (F3) y 11 con error. Los 11 son otros pagos
  sintéticos cuyo PaymentIntent no conoce el proveedor ficticio; no se escribió nada en ellos.
- **Segundo barrido:** F3 conciliado; F1 sin cambios.
- **H2-PG-02 (protecciones reales), PASS:**
  - una segunda escritura de `fee_reconciled_at` y un cambio de la comisión, rechazados por `payment_guard` ("se fijan
    una sola vez");
  - una marca sin comisión, rechazada por `payment_fee_reconciled_chk`.
- **H2-PG-01 y 03:** fallaron solo en la aserción de tipo (el SQL crudo devuelve `fee_reconciled_at` como texto); los
  datos eran correctos.
- **Huellas:** la de 8 componentes, idéntica; filas preexistentes sin cambios en las 65 tablas; solo crecieron
  `appointment` y `payment` (+3 cada una).
- **Evidencias:** `C:\pei-c2-evidencias\2026-11-16\h2-h3`.

**C2, revalidación `c2-20261116181552-47b1`** (`payments-fee-reconciliation-verify.wh-spec.ts`), sin escrituras ni
barrido, con la comparación de timestamps corregida:
- **H2-PG-01R, PASS:** F1 y F2 conciliados con 12.99 y 187.01; estimación 0.00 sin usar; neto del médico 180.00.
- **H2-PG-03R, PASS:** F3 conciliado después de F1, y ninguno figura en la consulta real de pendientes.
- **Huellas:** las 65 tablas tienen el mismo hash antes y después.
- **Evidencias:** `C:\pei-c2-evidencias\2026-11-16\h2-h3-verify`.
- La conciliación en sí no se repitió: hacerlo exigiría 6 filas sintéticas nuevas.

### 13.4 Backfill en desarrollo: único pago TEST

Autorizado solo para `98c9d9e1-654d-47d0-a4a9-4ff7c03483a3`. Sin barrido general.

**Comprobaciones previas, todas correctas**
- Huella de desarrollo: `royal-paper-10258990` / `br-royal-recipe-b54s5hnn` / `ep-wandering-bonus-b5kxacor` /
  `neondb`.
- El pool de la aplicación usaba esa misma URL.
- El pago es `stripe` y está `succeeded`, con `fee_reconciled_at` nulo.
- En Stripe TEST (solo GET): `balance_transaction` verificado, referencia igual, y el importe (200.00), la comisión
  (12.99) y el neto (187.01) iguales a los guardados.

**Escritura.** `refreshPaymentFromProvider` para ese id, por el flujo bloqueado.

| Campo | Antes | Después |
|---|---|---|
| `fee_reconciled_at` | `null` | `2026-11-16T18:12:25.354Z` |
| `provider_fee_actual` / `net_received_amount` | 12.99 / 187.01 | Sin cambios |
| `doctor_net_amount` / `pei_fixed_fee` / `amount` | 180.00 / 20.00 / 200.00 | Sin cambios |
| `provider_fee_estimated` / `money_release_date` / `status` | 12.04 / 2026-11-23 / succeeded | Sin cambios |

- Ninguna otra columna del pago cambió, salvo `updated_at`.
- Los demás pagos de desarrollo tienen el mismo hash; la cita no cambió; hay 0 reembolsos antes y después; la huella de
  desarrollo es idéntica.
- **Evidencia:** `C:\pei-dev-evidencias\2026-11-16\h2-backfill\backfill-98c9d9e1.json`.

### 13.5 Limitaciones y decisiones pendientes

- El barrido no está programado y solo se ejecuta a mano con el CLI. Decidir su periodicidad y su entorno es aparte, como
  en H-6.
- **Producción:** el CLI se niega a arrancar. Habilitarlo exige una decisión y una tarifa contractual de Stripe (H-4,
  pendiente).
- **Sincronización del paciente:** sigue sin bloqueo. Ante concurrencia puede recibir un error del guard (nunca datos
  incorrectos). No marca la comisión, así que no afecta a H-3.
- **Comisión de reembolsos:** la del cargo se concilia aunque el pago se reembolse después. La de los reembolsos
  (`refund.provider_fee_returned`) es parte de F5/F6 y no de este cambio.
- **Datos en C2:** se suman 3 citas y 3 pagos sintéticos marcados `wh-h5-c2-20261116180614-8590`; los triggers impiden
  borrarlos.

## 14. H-8: versiones de la API de Stripe distintas e intencionales (2026-11-16)

**Decisión de la responsable del producto.** La versión `2026-06-24.dahlia` del endpoint de webhooks TEST
(`we_1UcIxX7E5qvo4iCtuKLqvCE5`) se eligió intencionalmente y no se cambia para igualarla al backend. Las dos versiones
coexisten.

### 14.1 Qué controla cada versión

| Versión | Dónde | Controla |
|---|---|---|
| `2026-06-24.dahlia` | Endpoint de webhooks (configuración de Stripe) | La forma del objeto `data.object` de los **eventos** que Stripe entrega a ese endpoint |
| `2024-06-20` | `STRIPE_API_VERSION`, cabecera `Stripe-Version` de cada solicitud del backend (`stripe-payment-provider.ts`) | La forma de las **respuestas de la API**: creación y consulta del PaymentIntent (con `latest_charge.balance_transaction`) y reembolsos |

**Por qué son independientes.** El backend no decide nada con el cuerpo del evento (PAY-15). De cada evento,
`StripeWebhookAuthenticator` solo lee esto:
- `id`, `type`, `livemode`, `created` y `api_version`;
- de `data.object`: `id`, `object` y `payment_intent`.

Después consulta el PaymentIntent en la API con su propia versión (`2024-06-20`). Los campos de dinero, estado, comisión
y referencia vienen siempre de esa consulta, nunca del evento.

### 14.2 Verificación de solo lectura

Sin cambios de versión ni de configuración.
- **Eventos dahlia reales con el código del backend (sin red).** Los 4 cuerpos firmados que Stripe entregó en la
  prueba, capturados por ngrok, se autenticaron con `StripeWebhookAuthenticator` y el secreto del endpoint:
  - `payment_intent.succeeded` → `topic = payment`, `data_id = pi_3UcJ827E5qvo4iCt0qa2xx5K`,
    `request_id = evt_3UcJ827E5qvo4iCt0pCvhwBV`;
  - `payment_intent.created` → registrado como ignorado (tipo no procesado).

  Esto se suma a la entrega real ya comprobada (§8: HTTP 200, firma válida, procesado).
- **Eventos del PaymentIntent en Stripe TEST (GET):**
  - los cuatro tienen `api_version = 2026-06-24.dahlia`;
  - en `charge.succeeded` y `charge.updated`, el objeto `charge` trae el campo `payment_intent` con el PaymentIntent
    correcto, que es lo que el backend usa para los eventos `charge.*`.
- **El mismo cargo leído con cada versión (GET, `expand[]=balance_transaction`):** con `2026-06-24.dahlia` y con
  `2024-06-20` devuelve lo mismo en los campos que usa el backend:
  - `payment_intent` y `amount` (20000);
  - `balance_transaction`: `object = balance_transaction`, `type = charge`, `amount` 20000, `fee` 1299, `net` 18701,
    `mxn`.
- **El adaptador del backend con `2024-06-20` (GET):** PaymentIntent `succeeded`, 20000, comisión 1299, neto 18701,
  `providerFeeVerified = true` y la referencia del pago de PEI.

### 14.3 Riesgo real

- **Ninguno comprobado para los eventos y las solicitudes que existen hoy:** `payment_intent.*`, `charge.*` y el
  PaymentIntent con su cargo y su `balance_transaction`.
- **No verificado con datos reales.** No hay todavía ningún reembolso ni disputa en la cuenta TEST, así que no se pudo
  comprobar con datos reales en dahlia:
  - el campo `payment_intent` de los objetos `refund` (eventos `refund.updated` y `refund.failed`);
  - el de los objetos `dispute` (`charge.dispute.*`).

  Si faltara, el evento quedaría registrado como ignorado (sin efectos incorrectos) y el estado se recuperaría por la
  consulta del pago. Se comprobará en las pruebas reales de reembolsos y disputas (H-7).
- Un cambio futuro de cualquiera de las dos versiones debe revisarse contra los campos de §14.1.

**H-8 queda cerrado sin cambios de código ni de configuración.**

## 15. H-4: tarifas y configuración financiera por proveedor (2026-11-16)

**Decisión de la responsable del producto.** Las tarifas actuales se **conservan tal como están**. No se modificaron ni
sustituyeron sus valores, ni ninguna configuración o dato.

1. **Las tarifas de procesamiento dependen del proveedor de pagos.** `processor_fee_schedule` se versiona por proveedor
   (`provider`), y cada pago guarda la versión que se usó (`processor_fee_schedule_id`).
2. **Cada parámetro debe reflejar las condiciones del proveedor correspondiente:** porcentaje de comisión, cargo fijo,
   impuesto (IVA), plazo de disponibilidad del dinero y fuente de la tarifa.
3. **Los valores actuales de Stripe son una configuración provisional para pruebas.** La fila `stripe` reutiliza los
   valores de referencia de Mercado Pago (3.19 % + 4.00 MXN + IVA 16 %, 14 días) y **no debe interpretarse como una
   tarifa contractual definitiva de Stripe**. Por eso la comisión estimada del pago TEST (12.04 MXN) difirió de la real
   (12.99 MXN, §8 y §13).
4. **Antes de habilitar un proveedor en producción** deben revisarse sus condiciones comerciales reales y configurar con
   ellas una versión nueva de su tarifa. Las versiones no se editan: se cierra la vigente y se crea otra.
5. **La lógica de cálculo sigue separando tres conceptos:**
   - la comisión del procesador (estimada con la tarifa y conciliada con la real de Stripe), que es costo de PEI;
   - la comisión fija de PEI (`pei_fee_configuration`);
   - el neto del médico (importe menos la comisión de PEI), que no depende de la comisión del procesador ni de su
     tarifa.

**H-4 queda documentado y cerrado** sin cambios de código, tarifas, base de datos ni configuración. La configuración
real de cada proveedor es un requisito previo de su habilitación en producción.

## 16. H-7: endpoints administrativos de reembolso y validación real en Stripe TEST (2026-11-16)

Validación ejecutada contra la base de **desarrollo** (`royal-paper-10258990` / `br-royal-recipe-b54s5hnn` /
`ep-wandering-bonus-b5kxacor` / `neondb`, huella autorizada comprobada antes y después de cada escenario) y la cuenta
**Stripe TEST** (`livemode=false`). Ninguna operación LIVE. Cada escenario usó una cita y un pago creados para él; los
pagos y reembolsos anteriores no cambiaron (comparación de huellas por tabla antes y después de cada escenario).

### 16.1 Endpoints

Todos exigen sesión con rol `admin` (`SessionGuard`, `RolesGuard`). El administrador se toma de la sesión, nunca del
cuerpo. Las reglas (RF-46, PAY-17, tope acumulado, prorrata PEI/médico) siguen en el motor existente
(`RefundsUseCases`); `AdminRefundsService` solo fija quién actúa y audita.

| Método y ruta | Uso |
|---|---|
| `POST /admin/payments/:paymentId/refunds` | Solicita un reembolso `full` o `partial`. Exige la cabecera `Idempotency-Key`. Motivos: `exceptional_refund`, `payment_error`, `other`. |
| `GET /admin/payments/:paymentId/refunds` | Reembolsos del pago y conciliación (importes como cadenas decimales). |
| `POST /admin/refunds/:refundId/approve` | Aprueba un parcial (acción separada de la solicitud, PAY-17). |
| `POST /admin/refunds/:refundId/reject` | Rechaza un parcial pendiente con `{ reason }` (3 a 500 caracteres). |

Decisiones confirmadas por la responsable del producto:
- los tres motivos anteriores;
- la aprobación de un parcial es una acción aparte;
- el mismo administrador puede solicitar y aprobar, y ambas acciones quedan auditadas (`payments.refund.requested_by_admin`,
  `payments.refund.approved`; el rechazo, `payments.refund.rejected`).

### 16.2 Correcciones técnicas surgidas en la validación

1. **Auditoría dentro de una UnitOfWork (escenario 1).** `DrizzleAuditTrail.record` exige una transacción activa y
   lanzaba `AuditOutsideTransactionError`, lo que produjo el HTTP 500. Ahora cada evento se registra en su propia
   transacción corta, **después** de que el motor terminó; la llamada a Stripe nunca queda dentro de una transacción.
2. **Sin auditoría duplicada en aprobaciones repetidas (escenario 2).** Repetir la aprobación es idempotente en el motor
   (no reenvía nada a Stripe), pero se auditaba otra vez. Ahora `approve` compara `approved_by` antes y después y solo
   audita la transición real (de nulo al administrador de la sesión).
3. **Recuperación histórica de la auditoría del escenario 1.** Con autorización expresa se registró un único evento
   `payments.refund.audit_recovered` (`audit_log` `d534427e-6600-42f9-8d78-838b699ef9fb`), con el `AuditTrail` real
   dentro de una UnitOfWork y actor `system`. Su `created_at` es la **fecha real de recuperación** (lo fija
   PostgreSQL). La fecha y el administrador originales van en `metadata` (`originalOccurredAt`
   `2026-11-16T19:31:51.448000Z`, `originalActorUserProfileId`), tomados del propio reembolso. No se falsificó ninguna
   fecha ni se insertaron filas a mano.
4. **Recuperación de reembolsos (`payments-recover-refunds`).** El CLI reenvía los reembolsos abiertos que llevan más de
   60 s inactivos (`REFUND_RECOVERY_IDLE_MS`). En el escenario 6, la reutilización de la **misma clave de idempotencia**
   ante Stripe se infiere del resultado observado: Stripe devolvió el mismo refund ID y no creó un segundo reembolso (el
   CLI no registra la clave). La recuperación se ejecutó y se verificó en real en el escenario 6 (§16.5). No requirió
   cambios de código.

No se cambiaron tarifas, reglas de distribución, configuración ni migraciones.

### 16.3 Pruebas automatizadas (sin Stripe ni PostgreSQL)

| Archivo | Tipo | Casos |
|---|---|---|
| `admin-refunds.http.spec.ts` | HTTP con supertest y dobles del motor | H7-HTTP-01 a 08 (roles, validación, `Idempotency-Key`, rutas) |
| `admin-refunds.service.spec.ts` | Unitarias con el `DrizzleAuditTrail` real y una transacción falsa | H7-AUD-00 a 04 (auditoría dentro de la UnitOfWork); H7-APR-01 a 05 (solo la transición real se audita) |
| `payments.module.spec.ts` | Unitaria del módulo | registro de `AdminRefundsController` |

Resultado final: 122 suites, 2098/2098 pruebas; build correcto. Las fallas de los escenarios 1 y 2 no las detectaban las
pruebas previas porque usaban auditorías falsas; las nuevas pruebas H7-AUD y H7-APR las cubren. Ninguna de estas pruebas
es de integración con PostgreSQL ni con Stripe.

### 16.4 Operaciones reales en Stripe TEST

Las operaciones se ejecutaron por las rutas HTTP reales de la aplicación (AppModule en proceso, con supertest). Solo se
sustituyó la búsqueda de sesión, por las cuentas QA. Los webhooks los recibió el backend en ejecución vía ngrok, con la
versión `2026-06-24.dahlia`.

| # | Escenario | Pago | Reembolso en PEI | Reembolso en Stripe | Resultado |
|---|---|---|---|---|---|
| 1 | Reembolso total administrativo | `feee1199-588e-447a-a015-db4b14ea17b3` | `929c82ec-4d1e-4832-b896-13bb0f56d11f`: 200.00 (20.00/180.00), `exceptional_refund` | `re_3UcVcz7E5qvo4iCt0wg176i3` | Reembolso correcto en Stripe TEST y PostgreSQL. El primer HTTP devolvió **500** por el fallo de auditoría (§16.2-1). Se corrigió el código y se recuperó la trazabilidad con `payments.refund.audit_recovered` (§16.2-3). |
| 2 | Parcial con aprobación | `9dadfd66-80fd-482e-8db2-e8adbd900324` | `c7e7e40f-ed0c-419b-93a4-2971e2ead8dc`: 50.00 (5.00/45.00), `other` | `re_3UcW2x7E5qvo4iCt0mLwhT7q` | Reembolso correcto de 50 MXN; pago `partially_refunded`. Se detectó una auditoría duplicada al repetir la aprobación y se corrigió (§16.2-2). La fila histórica se conserva (§16.6). |
| 3 | Cancelación del paciente con 24 h o más | `5181a630-ac4a-44a2-8460-946cd6adac38` | `5596c6a9-cc49-454a-95e0-60a670107f88`: 200.00 (20.00/180.00), `patient_cancellation` | `re_3UcX4Z7E5qvo4iCt0fd0sJPN` | **PASS.** Reembolso total automático. |
| 4 | Cancelación del médico | `fc633697-79d2-4b38-95a1-f5c1e09c317d` | `151ce3c2-f6f3-4e27-b4ab-13913a88019e`: 200.00 (20.00/180.00), `doctor_cancellation` | `re_3UcX6s7E5qvo4iCt0DVlhKOK` | **PASS.** Reembolso total automático; cita `00725635-1d20-42a5-a8d7-8c87ff868a57` cancelada por el médico. |
| 5 | Pago no confirmable | — | — | — | **Sin operación real.** Cubierto solo por pruebas automatizadas existentes con dobles; no se ejecutó un pago manual con 3DS. |
| 6 | Recuperación de reembolso | `7edab0ae-a013-45cf-b402-00c7dad52a3f` | `d92b4328-777b-4333-a424-7db64cb3694f`: 200.00 (20.00/180.00), `exceptional_refund` | `re_3UcY7K7E5qvo4iCt1v9TcLV5` | **PASS.** Se perdió la respuesta de Stripe y el CLI recuperó el mismo reembolso sin duplicarlo (§16.5). |

**Sin duplicados.** En los escenarios 1 a 4 y 6, Stripe tiene **exactamente un reembolso** por PaymentIntent y
PostgreSQL uno por pago. En los escenarios 1, 2 y 6, repetir la solicitud con la misma `Idempotency-Key` devolvió
`existing` sin crear otro.

**Webhooks de reembolso en dahlia.** `charge.refunded` y `refund.updated` se verificaron dentro de los demás escenarios:
- todos los eventos quedaron `processed`;
- los objetos `charge` y `refund` traen `payment_intent`.

Esto cierra para reembolsos el punto pendiente de H-8 (§14.3); para disputas sigue sin verificar.

### 16.5 Escenario 6: recuperación con `payments-recover-refunds`

1. El proveedor del proceso de prueba llamó al Stripe real, que creó `re_3UcY7K…` con estado `succeeded`. Después lanzó
   un `timeout` simulado, de modo que la respuesta se perdió.
2. El reembolso quedó `pending`, sin `provider_refund_id`, y el endpoint respondió `retry_later`. La repetición con la
   misma clave devolvió `existing`.
3. Llegaron los 4 eventos dahlia. No cerraron el reembolso porque seguía dentro de la ventana en vuelo
   (`REFUND_IN_FLIGHT_MS` = 30 s). Antes del CLI, Stripe tenía 1 reembolso `succeeded` y PostgreSQL seguía `pending`
   sin ID (`state-s6-before-recover.json`).
4. **Primera ejecución del CLI:** `examinados 0`, porque el reembolso llevaba menos de 60 s inactivo; no cambió nada.
   **Segunda ejecución**, con 68 s de inactividad: `Reembolsos examinados: 1; submitted: 1` (`s6-recover-cli.txt`).
5. Stripe devolvió el mismo refund ID (`re_3UcY7K7E5qvo4iCt1v9TcLV5`) y no creó un segundo reembolso. De ese resultado
   se infiere que el reenvío reutilizó la misma clave de idempotencia; el CLI no registra la clave.

Estado final:
- reembolso `succeeded` con `re_3UcY7K7E5qvo4iCt1v9TcLV5`;
- pago `refunded`;
- Stripe con 1 reembolso de 20000 centavos;
- claves `refund.create` 1 y `payment.create` 1.

### 16.6 Limitaciones y pendientes reales

- **Escenario 5 (pago no confirmable):** sin ejecución manual real con 3DS; solo pruebas automatizadas con dobles.
- **No se probó** la reentrega de cancelaciones mediante el feed durable ni el CLI `payments-reconcile-cancellations`.
  Los escenarios 3 y 4 solo cubren la primera entrega.
- **El escenario 6 sí probó** la recuperación real de un reembolso cuya respuesta de Stripe se perdió.
- **Artefacto del escenario 2:** la fila `audit_log` `408928f7-3c83-4bf9-b153-1db8fb1a90c6` (`payments.refund.approved`,
  `metadata.action = terminal`) no es una aprobación adicional. Se conserva sin modificar ni compensar, porque
  `audit_log` es solo de inserción. La aprobación real es `bf7fa418-52bf-4631-be6a-629e15068dd7`.
- **Evento de recuperación del escenario 1:** lleva la fecha de recuperación, no una fecha histórica falsificada.
- **Disputas:** el campo `payment_intent` de los objetos `dispute` en dahlia sigue sin comprobar.
- **Fuera de H-7 y sin implementar:** PAY-18, ledger, payouts, ajustes, disputas, F6, cancelaciones administrativas o de
  plataforma, reembolsos de medicamentos y `on_hold`.

### 16.7 Evidencias

En `C:\pei-dev-evidencias\2026-11-16\h7\`:

- **Huellas y estado de las tablas:** `dev-before.json`, `dev-recheck.json`, `dev-before-s2.json`, `dev-before-s3.json`,
  `dev-before-s4.json`, `dev-before-s6.json` y `dev-after-s1.json`, `dev-after-s2.json`, `dev-after-s3.json`,
  `dev-after-s4.json`, `dev-after-s6.json`.
- **Ejecución por escenario:** `s1.json` (incluye el HTTP 500 del escenario 1), `s2.json`, `s3.json`, `s4.json`,
  `s6.json`. `s1-error.json` documenta una interrupción por la conexión con Neon, no el HTTP 500.
- **Estado en Stripe y PostgreSQL:** `state-s1-after.json`, `state-s2-after.json`, `state-s3-after.json`,
  `state-s4-after.json`, `state-s6-before-recover.json`, `state-s6-after.json`.
- **Auditoría:** `audit-recovery-s1.json`, `NOTA-auditoria-duplicada-s2.md`.
- **Recuperación y registros:** `s6-recover-cli.txt`; registros del backend en `backend.log`, `backend-2.log`,
  `backend-3.log`.

No hay evidencia de operación real para el escenario 5.

**H-7 queda validado para los escenarios 1 a 4 y 6**, con las limitaciones de §16.6.
