# Payments: decisiones de Fase 0 (CC-PAY-1)

Anexo del Documento Maestro V2.4, registrado como cambio C-23 (CC-PAY-1). Fecha: 2026-11-11. Lo aprobó la
responsable del producto el 2026-11-11.

Este documento solo registra decisiones de diseño. **Nada de lo que describe está implementado.** El esquema real
sigue siendo el de las migraciones 0000–0016 (Drizzle + SQL; el proyecto no usa Prisma). Los cambios de esquema
se harán en la Fase 1, y la Fase 1 necesita autorización explícita.

Estados de una decisión:
- **A**: aprobada.
- **SD**: supuesto de diseño.
- **RP**: requisito para producción.
- **P**: pendiente.

## 1. Matriz PAY-01 a PAY-25

| ID | Decisión | Estado |
|---|---|---|
| PAY-01 | El dinero entra a la cuenta de Mercado Pago de PEI y se liquida internamente a los médicos. En v1 no hay Marketplace ni cuentas vinculadas de médicos | SD; RP: confirmación comercial de MP, que la cuenta lo permita y revisión legal de la recepción y transferencia de fondos a terceros |
| PAY-02 | Referencias genéricas del proveedor (`provider`, `provider_payment_id`, `provider_refund_id`, `provider_transfer_id`) en lugar de las columnas `stripe_*`, después de revisar dependencias | A |
| PAY-03 | Eliminar `stripe_connect_account` y `stripe_payment_method`, y sus relaciones en `relations.ts`. Sin tarjetas guardadas, sin Stripe Connect y sin cuentas vinculadas de MP. Una cuenta de destino genérica queda pospuesta | A |
| PAY-04 | Comisión fija de PEI por consulta, con importes y vigencias configurables y snapshot por pago. Se guarda en `pei_fee_configuration`, que sustituye a `consultation_commission_configuration` | A |
| PAY-05 | Transferencia manual a médicos detrás de `PayoutPort`, con referencia, método, responsable y evidencia. Sin dispersión, Marketplace ni transferencias automáticas | A |
| PAY-06 | La comisión fija es configurable y no tiene importe ni valor predeterminado | A (estructura); P (importe comercial) |
| PAY-07 | PEI absorbe el 100 % de la comisión de MP. Se registra como costo de PEI, separada de la comisión fija, con importe estimado y real conciliable | A |
| PAY-08 | Tarifa de referencia: 3.19 % + $4 MXN + IVA, liberación a 14 días. Fuente: asistente de MP; **no es tarifa contractual verificada**. Es configurable y versionada (`processor_fee_schedule`). La conciliación usa la comisión real de cada operación | A (referencia); RP (tarifa contractual) |
| PAY-09 | `doctor_ledger_entry` es el diario inmutable con signo. `doctor_payout_item` y `doctor_payout_adjustment` siguen siendo las unidades de liquidación (C-2, §3) | A |
| PAY-10 | El neto inicial del médico no puede ser negativo: CHECK `doctor_net_amount >= 0`, validación al crear el pago y al publicar la comisión. M08 no se modifica (C-3) | A |
| PAY-11 | Enum interno (`pending`, `processing`, `succeeded`, `failed`, `canceled`, `refunded`, `partially_refunded`, `charged_back`, `in_dispute`) y `provider_status` aparte | A |
| PAY-12 | PEI no almacena PAN, CVV ni datos de tarjeta; solo referencias del proveedor | A |
| PAY-13 | `numeric(12,2)` solo en las tablas financieras (`payment`, `refund`, `doctor_payout*`, `doctor_ledger_entry`) y en las variables locales de sus triggers. `appointment.price` y `consultation_price_configuration.price` no cambian | A |
| PAY-14 | Idempotencia: `idempotency_key`, `provider_webhook_event` único por proveedor y evento, asientos únicos por `(payment_id, entry_type, source_ref)` y un solo pago activo por cita raíz (AP-27a) | A |
| PAY-15 | Webhook asíncrono: validar la firma, registrar, responder rápido, procesar en segundo plano, verificar con la API, aplicar la transición y conciliar periódicamente. El webhook no prueba el pago | A |
| PAY-16 | Se mantiene la retención de 5 minutos de M08 en sandbox y se mide su comportamiento ante 3DS e `in_process`. M08 no se modifica sin justificación y autorización | A |
| PAY-17 | Reembolsos parciales solo con aprobación administrativa, idempotentes y con el acumulado limitado al pago (`refund_within_payment`) | A |
| PAY-18 | PEI absorbe la comisión de MP no devuelta en un reembolso. No se descuenta al médico. Se registra con el dato real de MP | A |
| PAY-19 | Contracargos: retención (`on_hold`) y ajustes en el ledger. **El reparto del riesgo entre PEI y el médico está pendiente**; se decide antes de la Fase 6 | A (mecanismo); **P** (riesgo) |
| PAY-20 | Checkout de medicamentos y PrEP dentro de Payments, **solo en sandbox** y solo el proceso de pago. Sin dispensación, logística, inventario, procesos clínicos ni autorización sanitaria | A (técnico); RP: autorización escrita de MP, giro y MCC, fiscal, legal y sanitario |
| PAY-21 | Giros a documentar: telemedicina y venta de medicamentos. No se asigna ningún MCC sin confirmación de MP | RP |
| PAY-22 | Tratamiento fiscal y contable (§6), con revisión por un contador antes de operar con dinero real | RP |
| PAY-23 | Alcance académico solo en sandbox; no hay operaciones reales | A |
| PAY-24 | `apps/mobile/src/app/(app)/pago.tsx` se reemplaza por Card Payment Brick y nunca se conecta a un procesamiento real | A |
| PAY-25 | CC-4 de `M08-diseno.md` se corrige para alinearlo con el código (`invalid_state`). Payments valida el paciente antes de llamar a `confirmPaid`. El código de M08 no cambia | A |

Contradicciones resueltas:
- **C-1** → AP-27a (ver `M08-diseno.md`).
- **C-2** → §3.
- **C-3** → PAY-10.

## 2. Modelo financiero

### 2.1 Consulta

```text
gross_amount               = appointment.price (snapshot)
pei_fixed_fee              = pei_fee_configuration vigente al crear el pago (snapshot + id)
doctor_net_amount          = gross_amount − pei_fixed_fee          (CHECK ≥ 0)
mercado_pago_fee_estimated = (gross_amount · rate + fixed_fee) · (1 + vat_rate)   (snapshot + processor_fee_schedule_id)
mercado_pago_fee_actual    = comisión real informada por MP (conciliación)
pei_margin                 = pei_fixed_fee − mercado_pago_fee_actual   (costo de PEI; puede ser negativo)
```

La comisión de MP **nunca** forma parte de `doctor_net_amount`.

El snapshot de cada pago guarda:
- `gross_amount`, `currency`;
- `pei_fixed_fee` y `pei_fee_configuration_id`;
- `doctor_net_amount`;
- `mercado_pago_fee_estimated` y `processor_fee_schedule_id`;
- `mercado_pago_fee_actual`, `net_received_amount` y `money_release_date`;
- `provider_status` y `fee_reconciled_at`.

### 2.2 Medicamentos y PrEP

- `pei_fixed_fee` no aplica: el importe es 100 % de PEI.
- `doctor_net_amount = 0`.
- No se crean asientos en el ledger. El trigger `gst_payout_item_insert` ya rechaza `type <> 'consultation'`.
- La comisión real de MP se registra como costo de PEI.
- El CHECK `payment_medication_split_chk` se reescribe sin porcentajes: `type <> 'medication' or doctor_net_amount = 0`.
- La descripción que se envía a MP es genérica, sin datos clínicos.
- La operación real queda bloqueada por configuración hasta cumplir los RP de PAY-20.

### 2.3 Reembolsos (PAY-17, PAY-18, P-NEW-1 = prorrata)

Variables:
- G = `gross_amount`, F = `pei_fixed_fee`, N = `doctor_net_amount` = G − F.
- R = importe del reembolso que se registra. R_cum = acumulado de reembolsos `succeeded`, incluido este.

```text
pei_cum     = round_half_up(R_cum · F / G, 2)
doctor_cum  = R_cum − pei_cum
pei_share   = pei_cum − pei_cum_anterior
doctor_share= doctor_cum − doctor_cum_anterior
```

Reglas de redondeo:
- Se trabaja en centavos. `pei_share + doctor_share = R` exactamente, porque el residuo del redondeo queda en `doctor_share`.
- El cálculo es acumulativo: varios reembolsos parciales no generan deriva.
- Un reembolso total da exactamente `pei_cum = F` y `doctor_cum = N`.
- Se valida `doctor_cum ≤ N` y `pei_cum ≤ F`.

La comisión de MP **no participa** en la prorrata. Se registra en el reembolso:
- `provider_fee_returned`: dato real de MP.
- `unrecovered_provider_fee` = parte de `mercado_pago_fee_actual` no devuelta. Es costo de PEI.

## 3. Ledger del médico (C-2)

### 3.1 Asientos (`doctor_ledger_entry`, solo inserción)

| `entry_type` | Signo | Cuándo | `source_ref` | Unidad de liquidación vinculada |
|---|---|---|---|---|
| `consultation_earning` | + `doctor_net_amount` | `confirmPaid` → `confirmed` sobre un pago `succeeded` | `payment.id` | Un `doctor_payout_item` (amount = `doctor_net_amount`) |
| `refund_reversal` | − `doctor_share` | Reembolso `succeeded` | `refund.id` | Revocación del item (si es total y el item no está en un payout transferido) **o** un `doctor_payout_adjustment` (`refund_reversal`) |
| `chargeback` | − importe asignado al médico (PAY-19, P) | Contracargo perdido | id de la disputa del proveedor | `doctor_payout_adjustment` (`chargeback`) |

Reglas:
- Unicidad: la regla definitiva es la de §3.5. Un webhook o evento repetido no crea un segundo asiento.
- Una reversión nunca modifica el asiento original. Un asiento opuesto lo referencia (`reverses_entry_id`).
- Las correcciones administrativas quedan fuera de la Fase 1 (§3.5.2).
- **Las transferencias no son asientos.** «Liquidado» se deriva del estado del payout, no de un movimiento. Así no hay doble conteo.

### 3.2 Cambios de elegibilidad (no son movimientos)

Las transiciones de `doctor_payout_item.eligibility_status` cambian **cuándo** se puede liquidar, no **cuánto**.

| Transición | Causa | ¿Asiento? |
|---|---|---|
| → `eligible` | Al crearse, con `eligible_at` ≥ `money_release_date` y las condiciones de la política | No |
| `eligible` → `on_hold` | Incidente o pago `in_dispute` | No |
| `on_hold` → `eligible` | Se resuelve a favor del médico | No |
| → `revoked` | Reembolso total antes de un payout transferido | **Sí**: el `refund_reversal` acompaña a la revocación |

### 3.3 Invariante de conciliación (verificable por prueba)

```text
Σ doctor_ledger_entry.amount (médico)
  = Σ doctor_payout_item.amount (eligibility_status <> 'revoked')
  + Σ doctor_payout_adjustment.amount
```

Saldos derivados, sin columnas mutables:
- **Retenido** = items `on_hold` + items `eligible` con `eligible_at` > ahora.
- **Disponible** = items `eligible` con `eligible_at` ≤ ahora fuera de un payout `paid` + saldo pendiente de ajustes (importe − aplicaciones).
- **Liquidado** = items y aplicaciones de ajustes en payouts `paid`.

### 3.4 C-4: reembolsos parciales antes de liquidar (alternativa B, aprobada el 2026-11-11)

Problema original: `doctor_payout_item.amount` es inmutable (`gst_payout_item_update`) y
`doctor_payout_adjustment.source_payout_id` era NOT NULL. Un reembolso parcial anterior a cualquier payout no tenía
unidad de liquidación.

Decisión (B):
- `doctor_payout_item_id` es obligatorio en los ajustes `refund_reversal` y `chargeback`.
- `source_payout_id` es nulo mientras el item no se haya liquidado.
- Si el item está en un payout `paid`, `source_payout_id` identifica ese payout.
- Los ajustes son inmutables.
- Un item con ajustes no se puede revocar, y no se puede crear un ajuste sobre un item revocado.
- Los ajustes pendientes se aplican antes de que el payout pase a `paid`.
- Se conserva la prorrata de §2.3.

**Implementación: solo cuando se inicie formalmente la Fase 1.**

### 3.5 Relación con el ledger (I-2) y unicidad (I-10)

Dirección de la referencia: el asiento se crea primero y la unidad de liquidación apunta a él.

| Unidad | Columna | Asiento |
|---|---|---|
| `doctor_payout_item` | `ledger_entry_id` NOT NULL UNIQUE | `consultation_earning` (mismo importe, pago y médico; lo valida un trigger) |
| `doctor_payout_item` (revocación) | `revocation_ledger_entry_id` UNIQUE, nulo; obligatorio ⇔ `revoked`; se fija una sola vez | `refund_reversal`, importe = `−item.amount`, `reverses_entry_id = item.ledger_entry_id` |
| `doctor_payout_adjustment` | `ledger_entry_id` NOT NULL UNIQUE | `refund_reversal` o `chargeback` (mismo tipo, importe con signo, pago y médico) |

Un constraint trigger diferido valida al hacer commit que cada asiento esté referenciado por **exactamente una**
unidad. El importe se escribe en el asiento y se copia en la unidad. Ambos son inmutables y se valida que sean iguales.

#### 3.5.1 Clave de unicidad del ledger

Todas las columnas de la clave son NOT NULL, y `payment_id` es NOT NULL en todos los tipos de la Fase 1.

| Evento | `entry_type` | `source_type` | `source_ref` | Referencia adicional |
|---|---|---|---|---|
| Pago confirmado | `consultation_earning` | `payment` | `payment.id` | — |
| Reembolso registrado como ajuste | `refund_reversal` | `refund_adjustment` | `doctor_payout_item.id` + `:` + `refund.id` | `refund_id` (FK NOT NULL para este tipo) |
| Revocación del item | `refund_reversal` | `item_revocation` | `doctor_payout_item.id` | `refund_id` (FK NOT NULL), `reverses_entry_id` |
| Contracargo | `chargeback` | `dispute` | `doctor_payout_item.id` + `:` + id de la disputa del proveedor | — |
| Backfill | El tipo correspondiente | `backfill_0017` | id de la fila de origen (item o ajuste) | Fila de origen |

Restricciones:
- `UNIQUE (entry_type, source_type, source_ref)`.
- `UNIQUE (payment_id) WHERE entry_type = 'consultation_earning'`.
- `UNIQUE (reverses_entry_id) WHERE reverses_entry_id IS NOT NULL`: una sola revocación por asiento de origen.
- CHECK de formato de `source_ref` según `source_type`, y CHECK de que `refund_id` no sea nulo cuando `source_type` es
  `refund_adjustment` o `item_revocation`.

Hoy un refund pertenece a un solo pago (`refund.payment_id`) y un pago a lo sumo a un item (`doctor_payout_item.payment_id`
UNIQUE). Aun así, la clave identifica **el evento por item**: si en el futuro un refund cubriera varios items, cada uno
tendría su propio asiento sin debilitar la unicidad, y `refund_id` conserva el vínculo con el refund original.

#### 3.5.2 Correcciones administrativas: fuera de la Fase 1

- `entry_type` en la Fase 1 = {`consultation_earning`, `refund_reversal`, `chargeback`}. No existe `correction`.
- No se pueden crear ajustes `correction` u `other`: CHECK `type IN ('refund_reversal','chargeback')` en las filas
  nuevas. Los valores del enum `doctor_payout_adjustment_type_enum` se conservan.
- Si el preflight encuentra ajustes `correction` u `other` ya existentes, es un caso pendiente de decisión y la
  migración aborta.
- **Extensión futura:** cuando se diseñe, una corrección administrativa será un `doctor_payout_adjustment` con su
  propio asiento (1:1), su `source_type` y su referencia de auditoría. No se permiten asientos sin unidad (I-2).

### 3.6 Invariantes definitivas

- **I-1** Σ ledger = Σ `item.amount` (todos) + Σ asientos de revocación + Σ ajustes, y
  equivalentemente Σ ledger = Σ items no revocados + Σ ajustes. Se verifican las dos formas.
- **I-2** Cada item tiene exactamente un asiento de origen, cada item revocado un asiento de revocación y cada ajuste un
  asiento. Todo asiento tiene exactamente una unidad.
- **I-3** Ajustes `refund_reversal` y `chargeback`: item y pago obligatorios y coherentes (pago, item y médico); el
  tipo y el importe con signo coinciden con los del asiento.
- **I-4** `source_payout_id` es nulo solo si el item no está en un payout `paid`; si lo está, es igual a `item.payout_id`.
- **I-5** Para cada item, |Σ ajustes `refund_reversal` + `chargeback`| ≤ `item.amount`.
- **I-6** Un payout pasa a `paid` solo con todos los ajustes de sus items aplicados.
- **I-7** Un item con ajustes no se revoca y no se crean ajustes sobre items revocados. La revocación = `−item.amount`
  y referencia el asiento de origen, así que ambos se compensan exactamente.
- **I-8** Prorrata exacta al centavo y acumulativa (§2.3).
- **I-9** Las de 0001 se conservan: reembolso ≤ pago, aplicaciones ≤ ajuste, payout `paid` inmutable, neto ≥ 0 y
  solo inserción.
- **I-10** Unicidad del ledger según §3.5.1, sin columnas nulas en la clave.

### 3.7 Paso 0 de la Fase 1: preflight de solo lectura

Cada punto requiere su propia autorización:
- **0.a** Crear el script y sus pruebas sin base de datos (`pg` falso).
- **0.b** Ejecutarlo en C2.
- **0.c** Ejecutarlo en cada otro destino, uno por uno.

Ninguno está autorizado al 2026-11-11.

**Identificación del destino:**
- Antes de cualquier consulta de datos, se obtiene la huella **completa**: `current_database()`,
  `pg_control_system().system_identifier`, `server_version`, `current_user` y el SHA-256 truncado del host.
- El script aborta si la huella:
  - **no está completa**, por ejemplo porque falta un componente o el rol no tiene permiso para obtenerlo;
  - no se puede verificar;
  - no coincide con la huella autorizada, que la responsable confirma por separado para cada destino.
- No se acepta una identificación aproximada en lugar de la huella completa.
- No se presupone el destino del `.env`.
- No se imprimen `DATABASE_URL`, host ni usuario en claro, y los errores se sanitizan.

**Modo:**
- `default_transaction_read_only = on`, `BEGIN READ ONLY`, `statement_timeout` y `lock_timeout`.
- Una prueba de que no hay sentencias de escritura.
- La salida contiene solo conteos e ids técnicos de las anomalías (máximo N por caso).

**Comprobaciones:**
- Conteos de `payment`, `refund`, `stripe_*`, `consultation_commission_configuration`, `doctor_payout*`.
- `payment`:
  - todos los valores de `status` × `type`;
  - `doctor_amount < 0` y `platform_amount < 0`;
  - consultas donde `doctor_amount + platform_amount ≠ amount`;
  - medicamentos con `doctor_amount ≠ 0`;
  - importes fuera de `numeric(10,2)`.
- `refund`:
  - acumulado mayor que el pago;
  - reembolsos sobre pagos que no están en `succeeded`;
  - pagos `succeeded` con reembolsos.
- Items:
  - pago que no es de consulta o no está en `succeeded`;
  - `amount ≠ doctor_amount`;
  - médico incoherente;
  - revocados sin fecha;
  - revocados con ajustes.
- Ajustes:
  - `refund_reversal` o `chargeback` sin item;
  - `correction` u `other` existentes;
  - médico del payout de origen;
  - |Σ| mayor que `item.amount`.
- Aplicaciones: Σ mayor que el ajuste, signo y médico.
- Payouts:
  - `gross = Σ items`;
  - `adjustment_amount = Σ aplicaciones`;
  - `net = gross + adjustment`;
  - payouts `paid` con `transferred_amount ≠ net` o con ajustes pendientes.

**Estados históricos:** se conserva `provider = 'stripe'` y `provider_status` = el valor original.

| Estado histórico | Estado interno | Condición |
|---|---|---|
| `succeeded` | `succeeded` | Si tiene reembolsos, queda pendiente de decisión (no se deriva `refunded` ni `partially_refunded`) |
| `failed` | `failed` | — |
| `canceled` | `canceled` | — |
| `pending` | Pendiente de decisión | La migración aborta |
| `requires_action` | Pendiente de decisión | La migración aborta |

**Compuerta 0.e:** con tablas vacías y sin anomalías, la migración toma el camino directo. En cualquier otro caso se
presentan las decisiones antes de escribir la migración.

**Verificación posterior al backfill, en C2 primero:**
- todo asiento `backfill_0017` tiene un `source_ref` existente;
- número de asientos = items + items revocados + ajustes;
- ninguna unidad queda sin asiento y ningún asiento sin unidad;
- I-1 se cumple en sus dos formas para cada médico;
- los totales de los payouts no cambian;
- todos los pagos conservan su `provider_status`.

## 4. Estados y AP-27a

- Conjunto capturado (AP-27a): `succeeded`, `partially_refunded`, `refunded`, `in_dispute`, `charged_back`. Solo sirve para que `RootPaymentLookup` encuentre el pago original de la cita raíz. La referencia al pago se conserva aunque su estado cambie.
- Que un pago pertenezca al conjunto capturado **no** lo hace elegible para liquidación (§3.2) ni permite confirmar la cita: `confirmPaid` solo se llama con un pago `succeeded` verificado con la API.
- Un pago activo por cita raíz: índice parcial sobre `appointment_id` con estado en {`pending`, `processing`} ∪ capturado. Se permiten varios intentos fallidos (S6).
- Un rechazo de tarjeta marca el intento como `failed`. `markPaymentFailed` solo se llama cuando el intento es terminal (abandono o retención vencida), para no impedir el reintento S6.
- `AppointmentCanceled` no es durable (despacho después del commit). El suscriptor crea el reembolso de forma idempotente y una conciliación periódica detecta cancelaciones `full_refund` sin reembolso.

## 5. Fases

| Fase | Contenido | Condición |
|---|---|---|
| 0 | Matriz, CC-PAY-1, consistencia y dependencias externas | Cerrada documentalmente; pendiente la revisión del Maestro |
| 1 | Esquema: referencias genéricas, idempotencia, eventos, ledger, comisión fija, `payout_schedule_configuration`, snapshots, `numeric(12,2)`, estados internos y C-4 | Autorización explícita |
| 2 | Dominio Payments, puertos y adaptador MP (sandbox) | F1 |
| 3 | Pago de consultas: checkout, confirmación, webhooks, M08, `RootPaymentLookup`/AP-27a | F2 |
| 4 | Checkout Bricks web y móvil; sustitución de `pago.tsx` | F3 |
| 5 | Reembolsos (RF-46), `AppointmentCanceled`, parciales con aprobación | F3 |
| 6 | Ledger y liquidaciones (RF-47 a RF-50), transferencias manuales, ajustes, contracargos y conciliación | F5; PAY-19 decidido |
| 7 | Checkout de medicamentos y PrEP **en sandbox** | F3; ventas reales condicionadas a RP-1 a RP-6 |
| 8 | Automatización de liquidaciones | Mecanismo validado |

## 6. Requisitos para producción

- **RP-1**: confirmación de MP del modelo de cuenta (PAY-01) y de la tarifa y liberación contractuales (PAY-08).
- **RP-2**: clasificación comercial y MCC de telemedicina y de venta de medicamentos (PAY-21). No se inventan códigos.
- **RP-3**: autorización expresa y por escrito de MP para vender medicamentos y PrEP (PAY-20).
- **RP-4**: validaciones legales y sanitarias aplicables a la venta de medicamentos y PrEP (PAY-20).
- **RP-5**: revisión fiscal y contable (PAY-22) de:
  - cobros de consultas;
  - comisiones de MP absorbidas;
  - comisión fija de PEI;
  - importes de médicos;
  - liquidaciones y transferencias;
  - reembolsos y comisiones no devueltas;
  - contracargos;
  - medicamentos y PrEP;
  - CFDI y retenciones.
- **RP-6**: revisión legal de la recepción y transferencia de fondos a terceros (PAY-01, PAY-05).

**Desarrollar y probar el checkout de medicamentos y PrEP en sandbox no significa que PEI tenga autorización
para venderlos.** No se habilitan ventas reales sin cumplir RP-2 a RP-5.

## 7. Fase 1 implementada (2026-11-11): migración 0017, sin aplicar

Estado: **0017 está escrita, registrada en el journal (idx 17) y probada de forma estática. No se aplicó en ninguna base.**
Los ejecutores `scripts/c2-migrate-core.ts` y `scripts/dev-migrate-core.ts` no la autorizan: la rechazan como
pendiente no autorizada hasta que se apruebe aplicarla.

> **Actualización 2026-11-15:** la responsable del producto autorizó aplicar 0017 **solo en C2** (§7.4). Desde esa
> fecha `c2-migrate-core.ts` la admite con sus protecciones; `dev-migrate-core.ts` la sigue rechazando. Al
> 2026-11-15 sigue **sin aplicarse** en ninguna base.

Archivos:
- `apps/backend/src/db/proposals/payments-f1/0017_payments_f1.up.sql`: la migración.
- `apps/backend/src/db/migrations/0017_payments_f1.sql`: copia idéntica byte a byte de la anterior, con LF.
- `apps/backend/src/db/proposals/payments-f1/0017_payments_f1.down.sql`: la reversión. Es una copia literal de
  0000/0001, generada por script.
- `meta/0017_snapshot.json`: generado con `generateDrizzleJson`, sin conexión y sin preguntas interactivas.
- `meta/_journal.json`: entrada 17.
- Esquema Drizzle:
  - `src/db/schema/payment.ts`: `processor_fee_schedule`, `payment`, `refund`, `provider_webhook_event`,
    `idempotency_key`.
  - `src/db/schema/payout.ts`: `pei_fee_configuration`, `payout_schedule_configuration`, `doctor_payout*`.
  - `src/db/schema/ledger.ts` (nuevo): `doctor_ledger_entry`.
  - `enums.ts` y `relations.ts`.

### 7.1 Cómo se implementó cada decisión

| Decisión | Implementación en 0017 |
|---|---|
| Camino directo (§3.7, 0.e) | Una guarda inicial aborta si cualquiera de las 10 tablas de pagos tiene filas, sin modificar nada. Como están vacías, las tablas financieras se **recrean** en lugar de alterarse. **No hay camino de backfill**: un destino con datos necesita su preflight y una migración de datos aprobada aparte |
| PAY-02/03 | Se eliminan `stripe_connect_account`, `stripe_payment_method`, `stripe_webhook_event` y sus enums. En su lugar: `provider` (`payment_provider_enum` = `mercado_pago`), `provider_payment_id`, `provider_refund_id`, `provider_transfer_id` y `provider_status` |
| PAY-04/06, T-5 | `pei_fee_configuration` (`fixed_fee` sin DEFAULT, sin filas iniciales) y `payout_schedule_configuration`, ambas versionadas con las guardas de 0013 y EXCLUDE de solapamiento. Se elimina `consultation_commission_configuration` |
| PAY-07/08 | `processor_fee_schedule` versionada; solapamiento por proveedor controlado por trigger, porque no está instalado `btree_gist`. Sin filas iniciales. Snapshot en `payment`: `processor_fee_schedule_id`, `provider_fee_estimated`, `provider_fee_actual`, `net_received_amount`, `money_release_date`, `fee_reconciled_at`. La comisión del proveedor **no** interviene en `doctor_net_amount` |
| PAY-10 | `payment_doctor_net_nonnegative_chk`, más `doctor_net_amount = amount − pei_fixed_fee` en consultas y `= 0` en medicamentos |
| PAY-11 | `payment_status_enum` con los 9 estados internos; transiciones validadas por `payment_guard` |
| PAY-13 | `numeric(12,2)` en todas las tablas financieras y en las variables locales de sus funciones. `appointment.price` y `consultation_price_configuration.price` no cambian |
| PAY-14/15 | `idempotency_key` (UNIQUE `scope, key`), `provider_webhook_event` (UNIQUE `provider, topic, data_id, request_id`; recibido inmutable), un pago activo por cita raíz y por pedido, un reembolso `payment_error` activo por pago, y la clave I-10 del ledger |
| PAY-17/18, I-8 | `refund.pei_fee_share` y `refund.doctor_share` con prorrata acumulativa validada por `refund_guard`. Un parcial no avanza sin `approved_by`. `provider_fee_returned` y `unrecovered_provider_fee` se fijan una sola vez |
| PAY-05 | `doctor_payout.transfer_method` (`manual`), `transfer_reference`, `transferred_by_user_id` y `transfer_evidence_ref`. Un payout `paid` exige esos datos y `transferred_amount = net_amount` |
| C-4, I-1 a I-10 | `doctor_ledger_entry` (§3.5), `ledger_entry_id` en items y ajustes, `revocation_ledger_entry_id`, `source_payout_id` nulo, `ledger_entry_has_unit` (diferido), `payout_paid_requires_adjustments` (I-6), reglas de revocación y ajustes, y la función de solo lectura `gst_doctor_ledger_reconciliation()` (I-1 en sus dos formas) |

### 7.2 Desviaciones y puntos para revisión

1. **Nombres de columnas.** Las comisiones del proveedor se llaman `provider_fee_*`, no `mercado_pago_fee_*`, por
   PAY-02. `payment.amount` se mantiene como bruto. `doctor_amount` pasa a `doctor_net_amount`. Se eliminan
   `platform_amount` y los porcentajes.
2. **Neto del médico igual a 0.** Si la comisión fija iguala el precio, el pago no genera asiento ni item: los CHECK
   exigen importes distintos de cero y `item.amount > 0`. **Pendiente de confirmar.**
3. **Matriz de transiciones de pago.** Es una propuesta de diseño, no una decisión registrada:
   - `pending` → `processing`, `succeeded`, `failed` o `canceled`;
   - `processing` → `succeeded`, `failed` o `canceled`;
   - `succeeded` → `partially_refunded`, `refunded` o `in_dispute`;
   - `partially_refunded` → `refunded` o `in_dispute`;
   - `in_dispute` → `succeeded`, `partially_refunded` o `charged_back`;
   - `failed`, `canceled`, `refunded` y `charged_back` son terminales.

   **Pendiente de revisión.**
4. **Prorrata con reembolsos fallidos.** El acumulado excluye los reembolsos `failed` o `canceled`. Si un reembolso
   anterior falla después de registrarse otro, el siguiente se calcula con el nuevo acumulado. Es una limitación
   conocida.
5. **Retención por disputa.** `in_dispute` → `on_hold` del item no lo impone la base de datos; lo hará el servicio
   en F6. El asiento `chargeback` sí exige el pago en `charged_back`.
6. **`idempotency_key`.** No admite DELETE: la purga por vencimiento queda para F2.
7. **Prueba de M08.** En `test/appointments-architecture.spec.ts`, la aserción «0016 es la última entrada del
   journal» pasa a «la entrada 16 es 0016». Lo que verifica no cambia.
8. **Comentario de M08.** El comentario de `appointment-integration.services.ts` menciona `stripe_webhook_event`.
   No se modifica, porque es código de M08.

### 7.3 Pruebas

- **`test/payments-f1-schema.spec.ts`** (71 pruebas estáticas, sin base de datos; pasan):
  - migración idéntica a la propuesta, journal, snapshot encadenado, hashes de 0013–0016 sin cambios y LF;
  - guarda del camino directo y ausencia de escrituras;
  - sin comisión ni tarifa sembrada;
  - M08 intacto;
  - sincronía SQL ↔ Drizzle de columnas, tipos, nulabilidad, DEFAULT y nombres de CHECK, UNIQUE e índices;
  - `numeric(12,2)`;
  - inventario de triggers;
  - reversión literal.
- **`test/integration/payments-f1.int-spec.ts`** (PostgreSQL real en C2, transacciones revertidas; **no ejecutado**):
  - comportamiento de constraints y triggers: camino directo, pagos, precisión, prorrata, I-2, revocación, C-4
    antes y después de liquidar, I-6, webhooks, idempotencia y configuración versionada;
  - exige `PAYMENTS_F1_AUTHORIZED=0017` y la identidad de C2; sin esa variable se detiene al cargarse.
- **El comportamiento de los triggers no está verificado sobre PostgreSQL** hasta ejecutar ese spec con
  autorización.

### 7.4 Autorización de aplicación en C2 (2026-11-15)

La responsable del producto autorizó de forma expresa, el 2026-11-15, aplicar `0017_payments_f1` **exclusivamente**
en la base C2 de Neon:

| Componente | Valor |
|---|---|
| Proyecto | `royal-paper-10258990` |
| Rama | `br-shy-pond-b50a3m8f` |
| Endpoint | `ep-withered-block-b5e8v9ov` |
| Base | `neondb` |

**Alcance:**
- La autorización **no incluye** la base de desarrollo (`br-royal-recipe-b54s5hnn`, la del `.env` del repositorio),
  producción ni ningún otro entorno. Cada uno necesita su propia autorización expresa, su propia huella autorizada
  (§3.7, 0.c) y su propio preflight.
- Autoriza la aplicación; **no la ejecuta**. Al 2026-11-15, 0017 no está aplicada en ninguna base.
- Cubre exactamente el SQL con SHA-256 `5593858840293a7d46866dbd37ada7345c5616cda84db1c566a37b8f840944b1`. Cualquier
  cambio en el archivo exige una autorización nueva.

**Cómo se refleja en el código** (sin cambiar las protecciones):
- `scripts/c2-migrate-core.ts` incluye `0017_payments_f1` en `AUTHORIZED_MIGRATIONS` con ese SHA-256. Antes de
  migrar, el ejecutor comprueba la URL del endpoint directo de C2, la identidad real de Neon (proyecto, rama y endpoint)
  y, por ser una migración protegida (R-1), la huella completa de 8 componentes contra
  `C:\pei-c2\payments-preflight-c2.authorized.json`. Solo entonces define `pei.migration_authorized` en su sesión, y la
  retira al terminar.
- `scripts/dev-migrate-core.ts` no la incluye y la rechaza como pendiente no autorizada. Además, la huella autorizada
  de desarrollo no existe.
- `scripts/migration-authorization.spec.ts` y `scripts/c2-migrate-core.spec.ts` verifican ambas cosas.

**Antes de aplicarla en C2** (etapas pendientes, cada una con su propia autorización):
1. comprobar el estado actual de C2 (migraciones registradas y huella);
2. crear un respaldo (rama de Neon a partir de C2), porque la reversión `0017_payments_f1.down.sql` no está probada en
   PostgreSQL y no retira el registro de `drizzle.__drizzle_migrations`;
3. ejecutar el preflight de solo lectura (0.b) para confirmar que las 10 tablas de pagos siguen vacías;
4. decidir la aplicación efectiva.

Con este registro queda resuelta documentalmente la contradicción entre el comentario de `c2-migrate-core.ts`
(«autorizada para C2 el 2026-11-12»), que no tenía respaldo documental, y este documento (contingencia CT-21 de la
bitácora). Esa fecha del 12-nov no se toma como fecha de autorización: la autorización registrada es la del 2026-11-15.

### 7.5 Autorización y aplicación en la base principal de desarrollo (2026-11-15)

La responsable del producto autorizó de forma expresa, el 2026-11-15, aplicar `0017_payments_f1` **exclusivamente**
en la rama principal de desarrollo de Neon (la del `.env` del repositorio). Es una autorización **independiente** de
la de C2 (§7.4).

| Componente | Valor |
|---|---|
| Proyecto | `royal-paper-10258990` |
| Rama | `br-royal-recipe-b54s5hnn` |
| Endpoint | `ep-wandering-bonus-b5kxacor` |
| Base | `neondb` |
| SHA-256 autorizado | `5593858840293a7d46866dbd37ada7345c5616cda84db1c566a37b8f840944b1` |
| Respaldo previo | rama `br-curly-wind-b5bi0stw`, endpoint `ep-silent-tooth-b518kt75` |

**Alcance:**
- **No incluye** C2, producción ni ningún otro entorno. La autorización de C2 (§7.4) sigue siendo la única para C2 y
  sigue sin ejecutarse.
- Cubre solo el SQL con ese SHA-256. Cualquier cambio en el archivo exige una autorización nueva.
- La aplicación se hace solo con el ejecutor oficial de desarrollo (`scripts/dev-migrate.ts --apply`), nunca con el
  SQL a mano.

**Precondiciones comprobadas (2026-11-15, solo lectura):**
- Identidad real de la conexión (`neon.*`): coincide con la tabla. El `.env` apunta al endpoint directo de desarrollo.
- Respaldo: la responsable confirmó en la consola de Neon que su rama padre es `br-royal-recipe-b54s5hnn`; por SQL
  no se puede ver la rama padre. Por conexión de solo lectura se comprobó que existe, que pertenece al mismo proyecto
  y que su estado es idéntico al de la principal: 17 migraciones con los mismos hashes y 63 tablas con los mismos
  conteos.
- 0000–0016 registradas con hashes y `created_at` iguales a los del journal; 0017 es la única pendiente.
- Las 10 tablas que 0017 elimina existen y están vacías, sin claves foráneas entrantes ni vistas dependientes.
- Precondiciones del SQL: no existe `doctor_ledger_entry`; existe `gst_versioned_config_guard()` (0013);
  `cancellation_policy` no tiene DEFAULT en L ni G (0016); no hay `pei.migration_authorized` persistente ni heredada.

**Huella autorizada de desarrollo (0.c):** `C:\pei-dev\payments-preflight-dev.authorized.json`, fuera del
repositorio, con rótulo `desarrollo`. Se construyó con dos identificaciones de solo lectura idénticas (huella SHA-256
`85479cab8fb19b75…`) y con los ids de Neon confirmados por la responsable en la consola; el rol (`neondb_owner`) se
comprobó contra `current_user_sha256_16`.

**Cómo se refleja en el código** (sin cambiar las protecciones de C2 ni de producción). Sustituye la línea de §7.4
según la cual el ejecutor de desarrollo no incluía 0017:
- `scripts/dev-migrate-core.ts` incluye `0017_payments_f1` en `DEV_AUTHORIZED_MIGRATIONS` con ese SHA-256. Por ser
  protegida (R-1), el ejecutor exige además la huella de 8 componentes contra el archivo de desarrollo; solo entonces
  define `pei.migration_authorized` en su sesión, y la retira al terminar.
- El respaldo `br-curly-wind-b5bi0stw` / `ep-silent-tooth-b518kt75` se añadió a los destinos prohibidos del ejecutor
  de desarrollo.
- `scripts/c2-migrate-core.ts` no cambia. Las dos listas son independientes: ninguna toma la del otro ejecutor.
- Pruebas con dobles: `scripts/dev-migrate-core.spec.ts` (TC-DEV-001, 004, 006, 015 a 018) y
  `scripts/migration-authorization.spec.ts`.

**Aplicación (2026-11-15):**
- Planificador sin escritura: 17 registradas; única pendiente, `0017_payments_f1`, con el SHA-256 autorizado.
- `scripts/dev-migrate.ts --apply`, entre las 23:10:36 y las 23:10:42 UTC: identidad verificada dos veces, huella de
  desarrollo verificada en la misma conexión, `pei.migration_authorized` definida en la sesión y retirada al terminar.
  Una sola transacción del migrador de Drizzle. Resultado: «aplicada 0017_payments_f1; 18 migraciones registradas».
- No se ejecutó el SQL a mano, no se tocaron C2 ni producción y no se ejecutaron pruebas contra la base durante la
  aplicación.

**Verificación posterior en PostgreSQL** (conexión de solo lectura a la principal de desarrollo, 2026-11-15):

| Comprobación | Resultado |
|---|---|
| `drizzle.__drizzle_migrations` | 18 registros. El último tiene el SHA-256 autorizado y `created_at` = `when` del journal (`1794425816408`) |
| Journal frente a la base | Las 18 entradas (0000–0017) coinciden en hash y `created_at`; los 17 registros anteriores no cambiaron |
| Tablas de 0017 | Existen las 12: `pei_fee_configuration`, `payout_schedule_configuration`, `processor_fee_schedule`, `payment`, `refund`, `provider_webhook_event`, `idempotency_key`, `doctor_payout`, `doctor_ledger_entry`, `doctor_payout_item`, `doctor_payout_adjustment`, `doctor_payout_adjustment_application`. Todas con 0 filas |
| Tablas retiradas | `stripe_webhook_event`, `stripe_payment_method`, `stripe_connect_account` y `consultation_commission_configuration` ya no existen |
| Objetos definidos por 0017 | Existen los 38 índices, las 65 restricciones con nombre, las 15 funciones y los 39 triggers |
| `gst_doctor_ledger_reconciliation()` | 0 filas (sin anomalías) |
| `pei.migration_authorized` | Sin valor persistente (`pg_db_role_setting`) ni en una sesión nueva |

Observación: 0017 no carga datos de configuración. `pei_fee_configuration`, `payout_schedule_configuration` y
`processor_fee_schedule` quedan vacías en desarrollo, así que el flujo de pago necesitará su configuración antes de
operar.

**Pruebas del 2026-11-15** (unitarias y de arquitectura, **con dobles**; ninguna toca PostgreSQL):
- Ejecutores y autorización (`scripts/`): todas pasan, incluidas las 8 nuevas de desarrollo.
- Suite completa del backend: 1793 aprobadas y 2 fallidas, ninguna relacionada con 0017:
  - `test/support/c2-target-guard.spec.ts` [TC-M02-247]: `test/integration/appointments-reschedule.int-spec.ts` no
    está clasificado en el inventario (fallo previo, CT-20);
  - `src/cli/payments-retry-webhooks.spec.ts`: el `.env` local tiene `MERCADO_PAGO_ALLOW_PRODUCTION=True` y la
    configuración solo admite `true` o `false`. Es configuración local, no código.
- No se ejecutó `test/integration/payments-f1.int-spec.ts` contra desarrollo: no hay autorización para pruebas con
  escritura en esa base.

Con esto, al 2026-11-15 0017 está **aplicada solo en la principal de desarrollo**. En C2 sigue autorizada (§7.4) y sin
aplicar. Lo que §7.4 dice sobre que 0017 no estaba aplicada en ninguna base valía hasta esta aplicación.

### 7.6 Preparación de la principal de desarrollo para Mercado Pago Sandbox (2026-11-15)

La responsable del producto autorizó el 2026-11-15 escrituras **solo en la principal de desarrollo**
(`royal-paper-10258990` / `br-royal-recipe-b54s5hnn` / `ep-wandering-bonus-b5kxacor` / `neondb`) para preparar la
primera prueba integral en Sandbox, con estos valores:

| Concepto | Valor autorizado |
|---|---|
| Comisión fija de PEI por consulta | 20.00 MXN |
| Comisión de Mercado Pago | 3.19 % + 4.00 MXN + IVA 16 %; liberación estimada a 14 días. Tarifa de **referencia** para Sandbox (PAY-08), **no contractual** (RP-1) |
| Precio de consulta (M08, AP-1) | 200.00 MXN |
| Política de citas (M08, AP-22 y tabla A.11) | 24 h, 2 reagendamientos, W 30, Tol 15, L 60, G 5 |
| `payout_schedule_configuration` | **No se carga**: las liquidaciones son la Fase 6 y la frecuencia no está decidida |

**Comprobaciones previas:** identidad real de la conexión igual a la autorizada; 0017 aplicada; `MERCADO_PAGO_ENV`
= `sandbox`; `MERCADO_PAGO_ALLOW_PRODUCTION` vacía (el cargador de configuración responde «Mercado Pago configurado
(sandbox)»).

**Configuraciones cargadas** (`created_by` = administrador de desarrollo `6d8387b8-a87a-45f5-8c96-1de1ccfd1877`):

| Tabla | id | Mecanismo | Valores |
|---|---|---|---|
| `pei_fee_configuration` | `b3b8e746-f80c-4e25-b22b-955d0c3b2015` | Script controlado de un solo uso, fuera del repositorio (no hay CLI ni endpoint de Payments para esta tabla): una transacción con identidad de Neon, administrador e idempotencia comprobados antes de escribir; simulación previa | 20.00 MXN, vigente desde 2026-11-15 23:34:58 UTC, sin fin |
| `processor_fee_schedule` | `fc29d051-beb5-452a-8149-95f44fd15aca` | El mismo script y la misma transacción | `mercado_pago`, 0.031900, 4.00, IVA 0.160000, 14 días, MXN; `source` indica que es la referencia del asistente de MP, solo para Sandbox y no contractual |
| `consultation_price_configuration` | `44c4d6c0-7cfc-4a40-ad5c-91484a573b91` | CLI oficial de M08 `appointments:seed-config` (con auditoría) | 200.00 MXN |
| `cancellation_policy` | `18d0b250-8631-4868-9798-1deb88128a86` | El mismo CLI (con auditoría) | 24, 2, 30, 15, 60, 5 |

Las dos filas de Payments no tienen evento de auditoría: no existe un servicio de Payments que las publique.

**Verificación con el código del backend** (solo lectura, sin crear pagos): los repositorios resuelven las cuatro
versiones vigentes. Para una consulta de 200.00 MXN el cálculo da comisión de PEI 20.00, neto del médico 180.00 y
comisión estimada de MP 12.04.

**Usuarios** (cuentas de QA existentes; no se crearon usuarios ni datos de identidad):
- Paciente `…+prueba03` (`user_profile` `161329b7-9eee-4625-bc28-2adbaba4d0db`, `patient_profile`
  `15997d0e-8386-4427-9a4b-89f536f38a58`): correo verificado y aceptadas las versiones vigentes de su régimen legal
  (`privacy_notice` 1 y `terms_and_conditions` 1, porque `patient_terms` no está publicado). **Listo.**
- Médico `…+prueba04` (`doctor_profile` `58ec97c3-7dbe-4743-b8b7-b7ce560ddd02`, CURP sintética): **no puede operar.**
  Le faltan la verificación de identidad (INE) y la de cédula, ambas sin solicitudes, y la disponibilidad de agenda. No
  se marcó nada como verificado.

**Requisitos pendientes:**
1. Que el médico de prueba envíe sus solicitudes de identidad y cédula desde el portal, con documentos sintéticos
   rotulados como de prueba, y que el administrador las revise y apruebe en el panel.
2. Que el médico configure su disponibilidad en la agenda (requiere `canOperate`).
3. Configurar el webhook en el panel de Mercado Pago (modo de prueba, «Pagos (legacy)», URL HTTPS pública hacia
   `/webhooks/mercado-pago`) y probarlo con «Simular». La clave secreta está definida en el `.env`; la configuración
   del panel no se puede verificar desde el repositorio.

**Pruebas ejecutadas:** ninguna con escritura. Solo comprobaciones de solo lectura de la configuración y de los usuarios.

**Pruebas no ejecutadas:** reserva, pago aprobado, rechazado o pendiente, webhooks reales, reembolsos y CLI de
recuperación. Al 2026-11-15 hay 0 citas, 0 pagos y 0 reembolsos en desarrollo.

## 8. Stripe sustituye a Mercado Pago como proveedor activo (2026-11-15)

Decisión de la responsable del producto: Stripe es el proveedor de **ambos checkouts** (consultas y medicamentos), solo
en **modo TEST**. Las decisiones PAY-01 a PAY-25 y las secciones 1 a 7 se conservan como historial; donde nombran a
Mercado Pago como proveedor activo, rige esta sección. Mercado Pago queda **desactivado, no eliminado**. Esta etapa
**no** deja Stripe listo para producción.

### 8.1 Migración 0018_payments_stripe_provider

- Único cambio estructural: `alter type payment_provider_enum add value 'stripe'`. Sin tablas, columnas, restricciones
  ni datos. 0017 no se modificó (SHA-256 `5593858840293a7d…944b1`).
- SHA-256 de 0018: `f15b342a27a8367b94b1be5dc62a550096891e6e9b8d8e786ab2dda25029be56`; journal idx 18, `when`
  `1794789319985`; snapshot 0018 encadenado con 0017.
- Protegida (R-1): exige `pei.migration_authorized = '0018'` y la huella de 8 componentes de cada destino.
- Reversión: PostgreSQL no retira valores de un enum; exigiría recrear el tipo con una migración aprobada aparte. No se
  creó respaldo (rama de Neon) previo.

### 8.2 Aplicación en C2 (autorización propia)

Nota: §7.4 y §7.5 dicen que 0017 seguía sin aplicarse en C2. Al verificar C2 el 2026-11-15 ya tenía 18 migraciones
registradas, con 0017 incluida y su hash correcto; esa aplicación no está documentada en este archivo.

`royal-paper-10258990` / `br-shy-pond-b50a3m8f` / `ep-withered-block-b5e8v9ov` / `neondb`. Ejecutor oficial
`scripts/c2-migrate.ts --apply`: identidad verificada, 18 registradas (0017 ya estaba aplicada), única pendiente 0018
con el SHA autorizado, huella de C2. Resultado: aplicada; 19 registradas. Verificación de solo lectura: último hash =
SHA de 0018, enum = `mercado_pago, stripe`, sin `pei.migration_authorized` en sesión ni persistente.

### 8.3 Aplicación en desarrollo (autorización propia e independiente)

`royal-paper-10258990` / `br-royal-recipe-b54s5hnn` / `ep-wandering-bonus-b5kxacor` / `neondb`. Ejecutor oficial
`scripts/dev-migrate.ts --apply`, con su propia lista y la huella de desarrollo. Resultado: aplicada; 19 registradas;
mismas verificaciones posteriores que en C2. `processor_fee_schedule` solo tiene una fila de `mercado_pago`.

### 8.4 Arquitectura

- **PaymentIntents confirmados en el servidor** (no Checkout Sessions): conserva el puerto síncrono, el pago creado
  antes de cobrar y `payment.id` como clave de idempotencia. El cliente solo envía el id de un PaymentMethod (`pm_…`).
- Adaptador `infrastructure/stripe/stripe-payment-provider.ts` (sin SDK): importes en centavos enteros de MXN;
  `Idempotency-Key = payment.id`; `metadata.pei_payment_id`; `provider_payment_id = pi_…`; sin Connect ni split.
- Comisión real, neto y fecha de disponibilidad: del `balance_transaction` del cargo, solo si está en MXN.
- Estados: `succeeded`→succeeded; `requires_action`/`processing`→processing; rechazo→failed (el intento se cancela en
  Stripe); reembolsos→partially_refunded/refunded; disputa→in_dispute (su resolución es F6, PAY-19).
- Medicamentos: `PayMedicationOrderUseCase` cobra `medication_order.total`; 100 % PEI, sin comisión fija, neto del
  médico 0. **Supuesto de diseño (no definido en el Maestro):** solo se cobra un pedido en `order_received`. Payments no
  crea pedidos ni cambia su estado.
- Rutas: `POST /me/patient/appointments/:id/payment`, `POST /me/patient/medication-orders/:id/payment`,
  `POST /me/patient/payments/:paymentId/sync`. El importe nunca viaja desde el cliente.

### 8.5 Webhook

- `POST /webhooks/stripe`. Firma `Stripe-Signature` (HMAC-SHA256 de `t.cuerpo`) verificada sobre el cuerpo original
  (`req.rawBody`, conservado solo en esa ruta); tolerancia 300 s; se rechaza un evento de otro modo (livemode).
- `provider_webhook_event`: `topic = payment`, `action` = tipo del evento, `data_id` = PaymentIntent, `request_id` =
  id del evento (`evt_…`); una reentrega choca con la clave única.
- Eventos: `payment_intent.succeeded`, `.payment_failed`, `.processing`, `.requires_action`, `.canceled`,
  `charge.refunded`, `charge.refund.updated`, `refund.updated`, `refund.failed`, `charge.dispute.created`,
  `charge.dispute.closed`. El evento solo avisa: el estado se consulta siempre en la API antes de confirmar la cita.
- 200 al registrar; 401 con firma inválida; 503 sin secreto. Procesamiento en segundo plano.
- Documentación técnica completa: `docs/arquitectura/Payments-webhook-stripe.md`.

### 8.6 Configuración y tarifas

- Variables (solo backend): `STRIPE_ENV`, `STRIPE_SECRET_KEY`, `STRIPE_ALLOW_LIVE`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_WEBHOOK_TOLERANCE_SECONDS`. La clave publicable es del frontend. Las `MERCADO_PAGO_*` ya no se leen.
- `processor_fee_schedule` necesita una fila `provider = 'stripe'` (porcentaje, fijo, IVA, días de liberación, fuente).
  **No se cargó ni se inventó ninguna tarifa.** Sin esa fila ningún cobro se crea.

### 8.7 Pruebas (2026-11-15, con dobles; ninguna toca PostgreSQL ni Stripe)

- Nuevas: `infrastructure/stripe/*.spec.ts`, `presentation/stripe-webhook.http.spec.ts`,
  `test/payments-stripe-checkout.spec.ts` (ambos checkouts, importes manipulados, éxito, fallo, pendiente, firmas,
  duplicados, idempotencia, cita sin pago aprobado, un pago activo por cita y por pedido).
- Suite completa del backend (116 suites): 1952 aprobadas y 1 fallida, previa y ajena a Payments
  (`c2-target-guard.spec.ts` TC-M02-247: `appointments-reschedule.int-spec.ts` y `m08-0014-verify.int-spec.ts` sin
  clasificar en el inventario, CT-20). `nest build`: correcto. Detalle en `docs/testing/payments-stripe.md`.
- Las pruebas del módulo se aíslan del `.env` local (retiran las variables `STRIPE_*` del proceso).
- No ejecutadas: integración con escritura en BD y cualquier prueba contra Stripe TEST.

### 8.8 Pendiente para la primera prueba en Stripe TEST

1. Credenciales TEST y secreto del webhook en el `.env`; endpoint público HTTPS (o `stripe listen`).
2. Fila de `processor_fee_schedule` para `stripe` (requiere autorización y la tarifa real).
3. Frontends:
   - **Web: migrado a Stripe Elements** (`apps/web/src/features/payments/stripe-card-form.tsx`, `stripe-sdk.ts`).
     Stripe.js se carga desde `js.stripe.com`; el cliente envía solo `token` (`pm_…`) y completa 3-D Secure con
     `handleNextAction`; el resultado que se muestra es siempre el del backend. Requiere
     `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`). Probado con Stripe.js simulado (248 pruebas del web); **no
     probado en el navegador contra Stripe**. El código de Card Payment Brick se conserva sin uso.
   - **Móvil: sin migrar.** Sigue con Card Payment Brick y no puede pagar.
   - El checkout de medicamentos no tiene interfaz: solo existe la ruta del backend.
4. No existe un módulo que cree `medication_order`: el checkout de medicamentos necesita un pedido de prueba.
5. Médico de QA sin verificación ni agenda (§7.6). Verificar en TEST el mapeo de la cancelación tras un rechazo.

### 8.9 Primera prueba integral en Stripe TEST (2026-11-16)

Pago de consulta de 200.00 MXN en la base principal de desarrollo, con Stripe en modo TEST:
- PaymentIntent `pi_3UcJ827E5qvo4iCt0qa2xx5K` en `succeeded`;
- `payment` `98c9d9e1-654d-47d0-a4a9-4ff7c03483a3` con proveedor `stripe`, comisión de PEI de 20.00 y neto del médico de 180.00;
- cita `5b7e511d-a084-4785-88a9-78789f214149` confirmada por `system` con motivo `payment_succeeded`.

La confirmación llegó por el camino síncrono (confirmación en el servidor). Quedan pendientes:
- **Webhook:** `provider_webhook_event` vacía; Stripe reporta `pending_webhooks = 1` para `evt_3UcJ827E5qvo4iCt0pCvhwBV`.
- **Conciliación de la comisión real:** Stripe informa 12.99 MXN y la estimada fue 12.04 MXN; los campos reales siguen nulos.
- **Tarifa:** la fila de tarifa `stripe` reutiliza la tarifa de referencia de Mercado Pago.

El flujo de pago de consultas **no** se considera validado de extremo a extremo hasta comprobar el webhook. Detalle en `docs/testing/payments-stripe.md` §7.
El webhook quedó comprobado después (§8.10).

### 8.10 Webhook de Stripe TEST comprobado (2026-11-16)

- **Causa de la falla:** el endpoint `we_1UcIxX7E5qvo4iCtuKLqvCE5` apuntaba a la raíz del túnel, sin `/webhooks/stripe`.
  Stripe recibió 404 de NestJS y el controlador no se ejecutó. El secreto configurado sí correspondía al endpoint.
- **Corrección:** se actualizó la URL del mismo endpoint (mismo ID y mismo signing secret) a
  `https://glibbest-isobathythermal-nikole.ngrok-free.dev/webhooks/stripe`, y se reenvió solo
  `evt_3UcJ827E5qvo4iCt0pCvhwBV`. Sin pagos ni reembolsos nuevos.
- **Resultado:**
  - el backend respondió 200 y Stripe quedó con `pending_webhooks = 0`;
  - hay una sola fila en `provider_webhook_event` (`9e1bd5a1-7f56-49d4-b9e6-77f82cd9d9cb`), con
    `signature_valid = true` y `status = processed`;
  - las referencias son correctas: `request_id` es el evento, `data_id = pi_3UcJ827E5qvo4iCt0qa2xx5K` y
    `payment_id = 98c9d9e1-654d-47d0-a4a9-4ff7c03483a3`;
  - no hubo pagos duplicados, cambios en la cita (sigue `confirmed`, sin historial nuevo) ni reembolsos.
- **Importes reales:** se cobraron 200.00 MXN; la comisión de PEI es de 20.00 y el neto del médico de 180.00. La comisión
  real del procesador fue de 12.99 MXN, PEI recibió un neto de 187.01 MXN y la disponibilidad es el 2026-11-23. El
  procesamiento del webhook guardó en `payment` la comisión real, el neto y la fecha.
- **Pendientes:**
  - `fee_reconciled_at` sigue vacío porque ningún código lo establece;
  - la tarifa `stripe` configurada reutiliza los valores de referencia de Mercado Pago y no es una tarifa contractual ni
    definitiva de Stripe;
  - la estimación (12.04 MXN) difirió de la real (12.99 MXN) en 0.95 MXN. PEI absorbe la diferencia y el neto del médico
    permanece en 180.00 MXN;
  - un segundo reenvío no se probó en real (la idempotencia solo está cubierta con dobles).

Con esto quedan comprobados en Stripe TEST el cobro síncrono, la confirmación de la cita y la recepción, validación y
procesamiento del webhook. Detalle en `docs/testing/payments-stripe.md` §8.

### 8.11 Suscripciones del webhook de Stripe TEST (2026-11-16)

- **Cambio:** se actualizaron solo las suscripciones del endpoint TEST existente `we_1UcIxX7E5qvo4iCtuKLqvCE5`.
  Conserva su ID, su URL `/webhooks/stripe` y su signing secret, y no se creó otro endpoint.
- **Resultado:** el endpoint tiene exactamente los 11 eventos de `STRIPE_PAYMENT_EVENT_TYPES`, los mismos de §8.5.
- **Agregados:** `charge.refunded`, `charge.refund.updated`, `charge.dispute.created` y `charge.dispute.closed`.
- **Retirados (sin uso en el backend):** `payment_intent.created`, `payment_intent.amount_capturable_updated`,
  `payment_intent.partially_funded` y `refund.created`.
- **Verificación con la API de Stripe (GET antes y después):** sigue `enabled` y en modo TEST, con la misma URL y
  `api_version`. Los eventos coinciden con el código y en la cuenta sigue habiendo un solo endpoint.
- **Sin otros cambios:** no se modificó código, base de datos ni configuración LIVE.
- **Alcance:** recibir eventos de disputa no implica que su resolución esté implementada. Una disputa solo lleva el pago
  a `in_dispute`, y la resolución sigue pendiente de F6 (PAY-19).

Detalle en `docs/testing/payments-stripe.md` §9.

### 8.12 Idempotencia de webhooks en PostgreSQL real: hallazgo H5-1 corregido (2026-11-16)

- **Problema:** con PostgreSQL real (suite H-5 en C2, ejecución `c2-20261116071451-5767`), una entrega repetida del
  mismo evento terminaba en error. `DrizzleWebhookEventRepository.insert` se ejecuta fuera de una unidad de trabajo y
  devolvía el 23505 de `provider_webhook_event_uq` sin traducir, así que `ReceiveProviderWebhookUseCase` no lo reconocía
  como duplicado: HTTP 500 para Stripe, y sin redespacho de un evento `failed`. Nunca hubo dos filas ni efectos
  repetidos. Las pruebas con dobles no lo detectaban.
- **Corrección:** solo `drizzle-webhook-events.repository.ts`. `insert` relanza `translatePostgresError(error) ??
  error`, como `DrizzleUnitOfWork`. Otros errores de PostgreSQL conservan su error de dominio y los demás se relanzan sin
  cambios. Sin cambios de esquema ni migraciones.
- **Pruebas unitarias:** 7 nuevas (H5-1-U1 a U7). Contra el código original fallan 6 (U4 ya pasaba); con la corrección
  pasan las 7. Payments y la infraestructura de pruebas: 927 de 927; el build es correcto.
- **Validación en C2** (ejecución `c2-20261116160945-ede2`): WH-PG-01, 02, 07 y 08, todas PASS.
  - Cinco primeras entregas simultáneas: 1 `accepted`, 4 `duplicate`, 0 errores y 1 fila.
  - El evento fallido (`provider:unavailable`) se reconoció en la segunda entrega, se redespachó y terminó `processed`:
    1 pago `succeeded` y 1 confirmación.
  - Las reentregas de eventos procesados devolvieron `duplicate`, sin redespacho ni cambios.
- **Datos:** se reutilizaron los fixtures de la ejecución anterior. Solo se añadieron los 5 registros autorizados (1
  cita, 1 pago, 1 evento, 1 historial y 1 auditoría), marcados `wh-h5-c2-20261116160945-ede2`. La huella de 8
  componentes es idéntica antes y después, y las filas preexistentes no cambiaron en ninguna de las 65 tablas.
- **Estado:**
  - **H5-1 queda corregido y validado.**
  - **H-5 queda cubierto para los escenarios probados** (WH-PG-01 a 13), sin que eso demuestre todas las condiciones de
    concurrencia posibles.
  - **H-6** (reintentos automáticos y despacho durable) **sigue pendiente**.
  - Los registros sintéticos de las dos ejecuciones (64 + 5) permanecen en C2, porque sus triggers impiden borrarlos.

Detalle en `docs/testing/payments-stripe.md` §10 y §11.

### 8.13 H-6: recuperación automática de webhooks, etapas 1 y 2 (2026-11-16)

**Etapa 1: worker periódico** (`infrastructure/webhook-retry.worker.ts`)
- **Qué hace:** reutiliza `RetryProviderWebhookEventsUseCase` al arrancar y después cada 60 s (configurable de 5 a 3600
  s). `InProcessWebhookDispatcher` sigue siendo la vía rápida.
- **Desactivado por defecto:** `PAYMENTS_WEBHOOK_RETRY_WORKER_ENABLED=true` lo activa; no se activa en ningún entorno.
- **Exclusión:**
  - un turno a la vez por instancia;
  - entre instancias, `pg_try_advisory_xact_lock` en una transacción de una conexión dedicada (se libera solo y sirve
    tras un pooler en modo transacción);
  - el reclamo atómico de cada evento sigue como segunda capa.
- **Errores y apagado:** un error no detiene el worker. El apagado es ordenado (`beforeApplicationShutdown`, con
  `enableShutdownHooks` en `main.ts`).
- **Validado en C2** (`c2-20261116172436-2f12`): un evento `received` abandonado se recuperó con la ejecución inicial
  del worker, sin CLI, y el candado real impidió un segundo barrido.

**Etapa 2: política de reintento sin migraciones** (`application/use-cases/webhook-retry-policy.ts`)
- **R-3 · Backoff:** espera acumulada desde `received_at` según los intentos (1, 2, 5, 15, 30, 60 y 120 min). No hay
  hora del último intento en el esquema.
  - Se descartó reutilizar `processed_at` o codificar la hora en `last_error`.
  - Limitación: un primer fallo muy posterior a `received_at` queda espaciado solo por el intervalo del worker. La
    solución completa es `next_attempt_at` (R-6, requiere migración).
- **R-4 · Errores permanentes:** el barrido no reintenta los `last_error` permanentes, justificados uno a uno:
  - identidad de la cita, cita o pago inexistentes;
  - 404 y 4xx de Stripe;
  - los conflictos concretos de snapshot (otro proveedor, otra referencia, importe, otro PaymentIntent, transición
    imposible, dato fijado distinto).

  Los transitorios (red, 5xx, 409, 429, credenciales, respuesta inesperada, fallos de M08 o del reembolso, `internal`) y
  **cualquier código desconocido** conservan el reintento. No se fuerza el estado ni los intentos.
- **R-5 · Avisos:** `[PAYMENTS-WEBHOOK-PERMANENT]` y `[PAYMENTS-WEBHOOK-EXHAUSTED]` en `logger.error`, con el id del
  evento y el código, sin datos personales. Es solo un registro: una notificación externa sería una decisión aparte.
- **CLI:** los tres CLI de pagos desactivan el worker antes de crear su contexto (`disablePeriodicWebhookWorker`).
- **Validado en C2** (`c2-20261116174256-96d5`), con 4 eventos sintéticos sin pago, después neutralizados con
  `processing_attempts = 8`: solo el transitorio fuera de su espera fue elegible; el permanente, nunca.
- **Pruebas:** 118 suites, 2040 de 2040; el build es correcto.
- **Sin migraciones ni dependencias:** sin cambios de esquema y sin cambios en pagos, reembolsos ni confirmación de
  citas.

**Estado**
- R-3 está resuelto con la limitación indicada; R-4 y R-5 (en registros), resueltos.
- **R-6 sigue pendiente.**
- El worker **sigue desactivado**: activarlo en un entorno requiere una decisión explícita.

Detalle en `docs/testing/payments-stripe.md` §12.

### 8.14 H-2 / H-3: conciliación de la comisión real y `fee_reconciled_at` (2026-11-16)

- **Definición (decisión de la responsable del producto):** una comisión está conciliada cuando el backend obtuvo de
  Stripe la comisión real del pago, verificó que corresponde al pago y a la moneda esperados y persistió el importe.
  - Nunca por la tarifa estimada, ni solo por `succeeded`, ni sin `balance_transaction` válido.
  - La fecha de disponibilidad no interviene.
  - La comisión real es `balance_transaction.fee`, con IVA incluido.
- **Validación de `balance_transaction`:** expandido, tipo del cobro (`charge` o `payment`), MXN, mismo importe que el
  cargo y el PaymentIntent, y `net = amount − fee`. Si no, la comisión no se toma (`providerFeeVerified = false`).
- **Regla de `fee_reconciled_at`:**
  - solo en el flujo bloqueado (`applyProviderSnapshot` → `decideSnapshot`);
  - con el snapshot verificado y la comisión y el neto iguales a los persistidos o fijados en la misma escritura;
  - las rutas sin bloqueo persisten la comisión sin marcarla;
  - los importes nunca se sobrescriben;
  - `payment_guard` y `payment_fee_reconciled_chk` se mantienen.
- **Barrido y CLI:**
  - `ReconcileProviderFeesUseCase` toma los pagos sin marca (con o sin comisión guardada) y aísla los fallos;
  - el CLI `payments-reconcile-fees` solo funciona con `STRIPE_ENV=test`, nunca en producción, sin worker y sin
    programación.
- **Validación:**
  - suite de 120 suites, 2071 de 2071, y build correcto;
  - C2 `c2-20261116180614-8590`: conciliación de pagos sintéticos (comisión nueva, backfill y comisión tardía) y
    protecciones reales de PostgreSQL;
  - revalidación sin escrituras `c2-20261116181552-47b1` (H2-PG-01R y 03R PASS; huellas idénticas).
- **Backfill en desarrollo:** solo el pago TEST `98c9d9e1-654d-47d0-a4a9-4ff7c03483a3`.
  - `fee_reconciled_at` pasó de nulo a `2026-11-16T18:12:25.354Z`.
  - La comisión (12.99), el neto (187.01), el neto del médico (180.00) y los demás importes no cambiaron.
  - Los demás pagos tienen el mismo hash.
  - Evidencia en `C:\pei-dev-evidencias\2026-11-16\h2-backfill`.
- **Pendiente:**
  - programación del barrido;
  - habilitación en producción, que exige la tarifa contractual de Stripe (H-4);
  - comisión de los reembolsos (F5/F6);
  - la sincronización del paciente sigue sin bloqueo (sin riesgo de datos incorrectos).

H-2 y H-3 quedan resueltos. Detalle en `docs/testing/payments-stripe.md` §13.

### 8.15 H-8: versiones de la API de Stripe distintas e intencionales (2026-11-16)

- **Decisión:** el endpoint de webhooks TEST usa `2026-06-24.dahlia` intencionalmente; el backend fija
  `STRIPE_API_VERSION = 2024-06-20` en sus solicitudes. No se igualan.
- **Qué controla cada una:**
  - la del endpoint, la forma de los eventos entregados;
  - la del backend, la de las respuestas de la API: PaymentIntent, cargo, `balance_transaction` y reembolsos.
- **Por qué son independientes:** el backend solo lee del evento `id`, `type`, `livemode`, `created`, `api_version` y,
  de `data.object`, `id`, `object` y `payment_intent`. Todo lo demás (estado, importes, comisión, referencia) lo consulta
  en la API con su propia versión (PAY-15).
- **Verificado sin cambios de configuración:**
  - los eventos dahlia reales capturados se autentican y se mapean bien con el código del backend;
  - los eventos `charge.*` dahlia traen `payment_intent`;
  - el cargo y su `balance_transaction` son iguales en los campos usados con ambas versiones;
  - el adaptador con `2024-06-20` obtiene el pago, la comisión verificada y la referencia correctos.
- **No verificado con datos reales:** el campo `payment_intent` de los objetos `refund` y `dispute` en dahlia (aún no
  hay reembolsos ni disputas en TEST). Si faltara, el evento quedaría ignorado sin efectos incorrectos. Se comprobará en
  H-7.
- **H-8 queda cerrado** sin cambios de código ni de configuración. Detalle en `docs/testing/payments-stripe.md` §14.

### 8.16 H-4: tarifas y configuración financiera por proveedor (2026-11-16)

- **Decisión:** las tarifas actuales se conservan tal como están, sin modificar ni sustituir los valores provisionales
  usados en las pruebas.
- **Las tarifas de procesamiento dependen del proveedor.** Comisión, cargo fijo, impuestos, plazo de disponibilidad y
  demás parámetros se configuran en `processor_fee_schedule` (versionada por proveedor) según las condiciones de cada
  proveedor.
- **Los valores actuales de Stripe son provisionales para pruebas.** Reutilizan la referencia de Mercado Pago (PAY-08)
  y no son una tarifa contractual definitiva de Stripe.
- **Producción:** antes de habilitar un proveedor deben revisarse sus condiciones comerciales reales y configurarse en
  una versión nueva de su tarifa.
- **El cálculo sigue diferenciando** la comisión del proveedor (costo de PEI, estimada y conciliada con la real), la
  comisión fija de PEI y el neto del médico, que no depende de la comisión del proveedor (PAY-07).
- **H-4 queda documentado y cerrado** sin cambios de código, tarifas, base de datos ni configuración. Detalle en
  `docs/testing/payments-stripe.md` §15.

### 8.17 H-7: reembolsos administrativos y validación real en Stripe TEST (2026-11-16)

- **Endpoints `admin`:**
  - solicitar: `POST /admin/payments/:paymentId/refunds`, con `Idempotency-Key`;
  - listar: `GET` en la misma ruta;
  - aprobar y rechazar: `POST /admin/refunds/:refundId/approve` y `/reject`.

  Se apoyan en el motor existente (`RefundsUseCases`), sin reimplementar RF-46 ni PAY-17.
- **Decisiones de producto:**
  - motivos `exceptional_refund`, `payment_error` y `other`;
  - la aprobación de un parcial es una acción aparte;
  - el mismo administrador puede solicitar y aprobar, y ambas acciones se auditan.
- **Auditoría dentro de una UnitOfWork:** cada evento se registra en su propia transacción, después del motor; la
  llamada a Stripe nunca queda dentro de una transacción. Corrige el HTTP 500 del escenario 1.
- **Aprobaciones repetidas:** solo la transición real de `approved_by` se audita. Corrige la entrada duplicada del
  escenario 2. La fila histórica `408928f7-3c83-4bf9-b153-1db8fb1a90c6` se conserva como artefacto.
- **Recuperación histórica de auditoría:** el escenario 1 quedó trazado con `payments.refund.audit_recovered`, con actor
  `system`, la fecha real de recuperación y los datos originales en `metadata`.
- **Recuperación de reembolsos:** `payments-recover-refunds` reenvía los reembolsos abiertos inactivos más de 60 s con la
  **misma clave de idempotencia**. Así Stripe devuelve el reembolso ya creado en lugar de duplicarlo. Se comprobó en
  real en el escenario 6.
- **Resultados en Stripe TEST:**
  - escenarios 1 a 4 y 6 correctos, con un reembolso por pago en Stripe y en PostgreSQL;
  - el pago no confirmable solo está cubierto por pruebas automatizadas con dobles, sin 3DS manual;
  - los objetos `refund` y `charge` de dahlia traen `payment_intent`, lo que cierra ese punto de H-8; disputas sin
    verificar.
- **Pendiente:** no se probaron en real la reentrega de cancelaciones por el feed durable ni
  `payments-reconcile-cancellations`.
- **Fuera de alcance:** PAY-18, ledger, payouts, ajustes, disputas y F6.

Detalle, identificadores y evidencias en `docs/testing/payments-stripe.md` §16.
