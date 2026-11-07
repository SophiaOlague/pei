# M08 Citas médicas: diseño técnico (v3; implementación parcial sin commit)

Estado: **borrador para revisión** (2026-11-07). No hay código, migraciones ni commits. Ninguna decisión de este documento
está aprobada. La fuente normativa es el Documento Maestro V2.4 (versión 2026-10-28). Este documento no lo modifica: las
discrepancias se proponen como control de cambios en la sección 13.

El documento tiene dos partes:
- **Parte A (v3)**: la revisión vigente de CC-1 a CC-9 y de DA-1 a DA-12. Donde contradice a la parte B, prevalece la
  parte A.
- **Parte B (v2)**: el diseño anterior, que se conserva. Se marcan las secciones que la parte A sustituye.

---

# Parte A: revisión v3 (actualizada el 2026-11-07 con las respuestas recibidas)

## A.0 Registro de decisiones tomadas

Solo se registran aquí las decisiones comunicadas de forma expresa por la persona responsable del proyecto en la revisión
de diseño de M08. Las demás siguen pendientes (A.7).

| ID | Fecha | Decisión | Quién la toma | Efecto en el diseño |
|---|---|---|---|---|
| AP-1 | 2026-11-07 | El precio inicial de la consulta es de **200.00 MXN** | Responsable del proyecto | Primera versión de `consultation_price_configuration` (A.2 CC-5) |
| AP-2 | 2026-11-07 | El precio global se configura desde el panel administrativo, en versiones nuevas que no alteran las anteriores, con auditoría; sin precio por médico ni por especialidad (RN-007) | Responsable del proyecto | Entra en el alcance de M08 (A.2 CC-5, A.8) |
| AP-3 | 2026-11-07 | Aprueba usar las estructuras propuestas `appointment.cancellation_policy_id` y `consultation_price_configuration`, respetando el versionado, la integridad histórica y la trazabilidad | Responsable del proyecto, que declaró tener la autoridad para aprobar las estructuras propuestas del proyecto | Desbloquea la dependencia de esquema de DA-10 |

| AP-4 | 2026-11-07 | CC-1, opción A: los parámetros operativos se administran en versiones de `cancellation_policy` (RF-16, RN-021). Pide además evaluar la opción C | Responsable del proyecto | DA-10b y DA-8 se desbloquean; evaluación de C en A.9.1 |
| AP-5 | 2026-11-07 | CC-2: espera protegida **con un límite máximo configurable** (no ilimitada). 60 min es solo una propuesta inicial, **no aprobada** | Responsable del proyecto | Diseño en A.9.2; el valor y la fórmula siguen pendientes |
| AP-6 | 2026-11-07 | CC-2: una desconexión temporal no es abandono; los eventos se conservan; la salida voluntaria tiene un tratamiento explícito; no hay inasistencia sin verificar las dos ventanas | Responsable del proyecto | Criterios de A.9.2 |
| AP-7 | 2026-11-07 | CC-3: estado `rescheduled`, sujeto a su control de cambios y a su migración. La original conserva su historial y su relación con la nueva; pago y precio continúan según RN-018, sin segundo cobro ni reembolso | Responsable del proyecto | DA-6 queda aprobada en diseño |
| AP-8 | 2026-11-07 | CC-4: reembolso automático e idempotente de todo pago que no pueda confirmar la cita; registro para conciliación; una cita `expired` no se reactiva; protección ante webhooks duplicados o retrasados | Responsable del proyecto | Contrato de A.2 CC-4 |
| AP-9 | 2026-11-07 | Precio: vigencia inmediata, sin precios programados (P-8); el reagendamiento conserva el precio original | Responsable del proyecto | DA-10a completa |
| AP-10 | 2026-11-07 | Autoriza la sección de precio y el enlace «Precio de consulta» en el panel administrativo (web de M03) | Responsable del proyecto | A.8 |
| AP-11 | 2026-11-07 | Producción: dejar **preparada** la carga de 200.00 MXN, **sin ejecutarla** hasta identificar la cuenta de administrador real (`created_by`) y autorizar el despliegue | Responsable del proyecto | Bloqueo de despliegue, no de implementación |
| AP-12 | 2026-11-07 | CC-6: solo médicos con `canOperate` **y** con disponibilidad de horario. La foto, solo si ya existe un campo y un mecanismo autorizado para mostrarla; sin requisitos nuevos de perfil público | Responsable del proyecto | DA-12; la foto queda fuera (A.9.4) |
| AP-13 | 2026-11-07 | CC-7: el médico puede cancelar aunque haya perdido `canOperate`, con reembolso total | Responsable del proyecto | DX-1; aclaración de RN-140 (C-27) |
| AP-14 | 2026-11-07 | CC-8: fuera del alcance de M08, sin implementación ni dependencias innecesarias | Responsable del proyecto | DX-2 |
| AP-15 | 2026-11-07 | CC-9: propone que el paciente entre a la sala de espera 15 min antes; la admisión es de videoconsulta; M08 conserva el estado y registra el resultado final | Responsable del proyecto | A.9.5 |
| AP-16 | 2026-11-07 | DA-1: desplegar con la reserva desactivada en producción mediante una bandera, hasta integrar y probar pagos. Ninguna ruta puede confirmar citas reales sin un pago exitoso | Responsable del proyecto | DA-1 |
| AP-17 | 2026-11-07 | Aprueba DA-2, DA-5, DA-7 y DA-9. DA-3 queda pendiente de ajuste | Responsable del proyecto | A.3; DA-3 en A.9.3 |
| AP-18 | 2026-11-07 | Registrar CC-5 y CC-10 como propuestas de control de cambios a partir de C-23 | Responsable del proyecto | C-23 y C-24 (A.5) |

| AP-19 | 2026-11-07 | CC-1, opción C (variante C2): la cita conserva la referencia a la aceptación legal de M02, sin duplicar información | Responsable del proyecto | M-1 #3. El cambio en M02 (el lector) sigue pendiente de autorización |
| AP-20 | 2026-11-07 | Aprueba DA-3 (guardar el fin del bloque solo para la ocupación, sin limitar la videoconsulta), DA-4 (sin transiciones automáticas desde `confirmed`) y DA-8 (un solo plazo). Aclara que el fin oficial de la videoconsulta es distinto del fin del bloque | Responsable del proyecto | A.10.2: el nombre se corrige a `agenda_block_ends_at` |
| AP-21 | 2026-11-07 | Propuestas (aprobadas después en AP-22): límite total L = 60 min desde la hora programada, gracia G = 5 min, ventana del médico W = 30 min, tolerancia del paciente Tol = 15 min | Responsable del proyecto | Escenarios en A.10.3, pendientes de aprobación |

| AP-22 | 2026-11-07 | Aprueba los valores iniciales W = 30, Tol = 15, L = 60 y G = 5 como **configuración inicial versionada** (no como constantes del código) | Responsable del proyecto | A.11.1 |
| AP-23 | 2026-11-07 | Confirma `agenda_block_ends_at` como fin del bloque, independiente de `meeting.ended_at`; nunca se envía a videoconsulta como límite ni se usa para cortar una consulta | Responsable del proyecto | A.10.2 |
| AP-24 | 2026-11-07 | E7: al alcanzar el límite porque el médico sigue en otra consulta, `no_show_doctor` con reembolso total y sin pago al médico, sin duplicar la ventana ordinaria | Responsable del proyecto | La fórmula T1 (A.11.2) |
| AP-25 | 2026-11-07 | E14: N9 y N10 `no_show_both` solo cuando se cumplen las condiciones de ambas ventanas; N8 consulta normal. Autoriza preparar M-1 (cambios 1 a 5, sin el 6) sin ejecutarla, las cuatro consultas de solo lectura, formalizar C-23 a C-32 y la implementación sin M-1. El cambio en M02 sigue pendiente | Responsable del proyecto | A.12 |
| — | 2026-11-07 | **Pendientes expresamente**: E14; la ejecución de M-1; la modificación aditiva de M02. C-23 a C-32 siguen como propuestas | — | A.7 |

Notas:
- **AP-3 no se atribuye al líder técnico.** El Maestro V2.4 (sección de modelo de datos, «estructura propuesta»; y la
  lista de pendientes) dice que esa aprobación correspondía al líder técnico. Actualizarlo es el control de cambios
  CC-10. Hasta que se registre, el Maestro y este diseño difieren en este punto.
- AP-3 aprueba **las estructuras**, no el contenido de la política de cancelación (CC-1 sigue pendiente). Tampoco aprueba
  migraciones: los endurecimientos de DA-11 siguen requiriendo su propia aprobación.
- AP-1 aprueba **el valor**. Cargarlo en cada entorno es una escritura en la base de datos, y en producción requiere una
  autorización de ejecución aparte (A.7).

## A.1 Resumen ejecutivo de los cambios respecto a v2

1. **CC-1 se invierte.** La v2 llevaba los parámetros de cancelación a los Términos y eliminaba la configuración del
   administrador. Eso contradecía RF-16 y RN-021, que tienen como actor al administrador y exigen versiones con vigencia.
   La v3 separa dos cosas: la **aceptación legal** (M02, `user_legal_acceptance`) y los **parámetros operativos**
   (`cancellation_policy`, configurados por el administrador, en versiones que no se modifican y que se copian por
   referencia en cada cita). La alternativa recomendada no requiere modificar RF-16 ni RN-021.
2. **CC-2**: hay cuatro alternativas para calcular la ventana del médico cuando una consulta anterior se prolonga. La
   recomendada (B) es compatible con RF-19, RF-20, RN-024 y RN-025 si se aprueba como aclaración de RN-025. La
   implementación es de videoconsulta, no de M08.
3. **CC-3**: recomiendo el estado `rescheduled`. Requiere control de cambios en el Maestro (6.1) y una migración del enum
   y del trigger.
4. **CC-4**: una cita `expired` nunca se confirma. El pago tardío se reembolsa de forma automática e idempotente.
5. **CC-5 (resuelto en el diseño por AP-1 y AP-2)**: el precio inicial es de 200.00 MXN y se administra desde el panel.
   Como no hay un RF que lo respalde, se propone **RF-66** mediante control de cambios. Es el próximo identificador
   libre según el Maestro.
6. **CC-7**: interpretación recomendada: cancelar no es una «operación que requiere un médico habilitado» (RN-140).
   Requiere aclaración documental.
7. **CC-8**: fuera de M08. No hay ninguna dependencia técnica indispensable.
8. **CC-9**: la admisión es responsabilidad de videoconsulta; M08 expone contratos de consulta y de resultado.
9. **Hallazgo**: según el Maestro, `appointment.cancellation_policy_id` y `consultation_price_configuration` eran
   estructuras propuestas sin aprobar. **Las aprobó la persona responsable del proyecto (AP-3).** Falta reflejarlo en el
   Maestro (CC-10).
10. **Estados de DA**: solo DA-10a (el precio) está «Aprobada», por AP-1 a AP-3. Las demás esperan tu aprobación
    expresa. La matriz A.3
    distingue las decisiones técnicas de las de negocio.

## A.2 Análisis de CC-1 a CC-9

### CC-1 Política, Términos y configuración del administrador

**Respaldo en el Maestro:**
- RF-16: el actor es el administrador. Configura el plazo de anticipación, los reagendamientos, la ventana del médico y la
  tolerancia del paciente. Cada versión conserva su vigencia.
- RN-021: los parámetros son configurados por el administrador y versionados, y a cada cita se le aplican los vigentes al
  reservar.
- Rol de administrador (sección de actores): «configuración de políticas».
- RN-140: la aceptación de los legales vigentes es condición para agendar.

**Distinción:**

| Concepto | Qué es | Dónde vive | Quién lo cambia |
|---|---|---|---|
| Aceptación legal | El paciente acepta el texto de una versión de `patient_terms` (o de `terms_and_conditions` en el régimen anterior) | `legal_document` y `user_legal_acceptance` (solo inserción) | Publicación legal (M02) |
| Parámetros operativos | Valores numéricos que el sistema aplica | `cancellation_policy` (versiones con `effective_from` y `effective_until`) | El administrador (RF-16) |
| Condiciones aplicadas a una cita | La versión de los parámetros vigente al reservar | `appointment.cancellation_policy_id`; el trigger impide cambiarla | Nadie después de reservar |

**Alternativas:**

| Opción | Descripción | Compatibilidad | Consecuencias |
|---|---|---|---|
| **A (recomendada)** | El administrador configura las versiones (RF-16). Los Términos describen la política y remiten a «las condiciones vigentes al reservar, que se muestran antes de confirmar». La cita guarda la versión de los parámetros, y la auditoría de la reserva guarda también el `legal_document_id` aceptado | Total con RF-16 y RN-021 | No modifica requisitos. Hay que revisar que el texto legal no fije cifras que contradigan la configuración (es una tarea legal y documental, no de código) |
| B (v2) | Los parámetros se derivan de los Términos; no hay pantalla de administración | Contradice RF-16 y RN-021 | Requiere modificar ambos (control de cambios); cada ajuste operativo obliga a publicar Términos y a pedir reaceptación (RF-04) |
| C | A, más un vínculo formal `cancellation_policy.legal_document_id` | Compatible | Migración. Es útil si el área legal exige que cada versión de parámetros esté respaldada por una versión de los Términos |

**Inmutabilidad de la versión aplicada:**
1. Una versión publicada no se edita: los cambios se hacen con una versión nueva, que cierra la anterior en la misma
   transacción, con candado.
2. Riesgo: hoy **no existe** ningún trigger que impida un `UPDATE` o `DELETE` de `cancellation_policy`, a diferencia de
   `legal_document`. La v3 propone un trigger de solo inserción, salvo el cierre de `effective_until`, en la migración
   posterior (DA-11). Hasta entonces, la garantía depende de la aplicación.
3. La cita ya conserva su versión (trigger `appointment_guard`). El reagendamiento copia la misma versión (RN-018).

**¿Control de cambios?** Con la opción A, no para RF-16 ni para RN-021. Sí hace falta una nota documental que reconcilie
el acuerdo del mensaje anterior («no crear una política independiente») con RF-16. **Tu decisión es la que resuelve esta
contradicción.**

**Recomendación técnica:** opción A, más el trigger de inmutabilidad en DA-11. **Recomendación funcional:** antes de
confirmar, mostrar al paciente un resumen de los parámetros aplicables (plazo y número de reagendamientos).

### CC-2 Ventana de espera del médico y sala de espera

**Respaldo en el Maestro:**
- RF-19 y RN-024: si el médico sigue en otra consulta, el paciente permanece en espera y se notifica a ambos.
- RF-20 y RN-025: la ventana del médico se cuenta «desde la hora programada»; si vence «sin inicio», con el paciente
  disponible, la cita queda `no_show_doctor`.
- RN-026: la tolerancia del paciente.
- RN-030, RN-032 y RN-033: los abandonos y regresos.

**Conflicto:** si la consulta anterior dura más que la ventana del médico (por ejemplo 30 min), la lectura literal de
RN-025 produce `no_show_doctor` aunque RF-19 diga que el paciente debe esperar.

**Alternativas** (todas se implementan en videoconsulta; M08 solo da los parámetros):

| Opción | Regla | Consecuencias |
|---|---|---|
| A (literal) | La ventana corre desde `scheduled_at` sin excepción | Sencilla; el paciente puede perder la consulta (con reembolso) porque el médico se prolongó; contradice el espíritu de RF-19 |
| **B (recomendada)** | **Espera protegida**: mientras el médico tiene una `meeting` `active` de otra cita, la ventana no corre. Plazo = max(`scheduled_at`, fin de la consulta anterior) + `doctor_wait_minutes` | Compatible con RF-19 y RN-024, y con RN-025 interpretando «sin inicio» como «sin inicio estando libre». Riesgo: una prolongación sin límite deja al paciente esperando indefinidamente |
| C | B, con un tope máximo de espera protegida; al superarlo se aplica `no_show_doctor` | Protege al paciente de una espera indefinida. Requiere un parámetro nuevo (migración y RF-16) |
| D | La ventana corre desde `scheduled_at`, pero `no_show_doctor` no se declara mientras el médico siga en consulta; al terminar, tiene `doctor_wait_minutes` para admitir | Equivale casi a B; es más difícil de explicar y de probar |

**Abandono, desconexión y regreso del paciente durante la espera protegida** (propuesta, no regla definitiva):
1. *Disponibilidad*: el paciente cuenta como «disponible» si se conectó dentro de su tolerancia (RN-026, contada desde
   `scheduled_at`). Entrar a la sala de espera es conectarse: queda en `patient_joined_at` y `meeting_session_event`.
2. *Se desconecta y regresa antes de que el médico quede libre*: sigue disponible, y la desconexión se registra (RN-031,
   RN-034).
3. *Se desconecta y no regresa cuando el médico queda libre*: se aplica el criterio de RN-033. El médico espera dentro de
   su ventana (que empieza a correr al quedar libre); si el paciente no vuelve, `no_show_patient`.
4. *El paciente nunca se conectó*: RN-026 sin cambios.
5. Durante la espera protegida, **no** se declara `no_show_doctor` ni `no_show_both`.

**¿Control de cambios?** Sí: una aclaración de RN-025 y RF-20, más el comportamiento de B o C. **Tu decisión.**

### CC-3 Estado de una cita reagendada

| Impacto | (a) `canceled` con la marca `cancellation_reason='rescheduled'` | (b) estado `rescheduled` |
|---|---|---|
| Base de datos | Sin migración; el trigger ya permite `confirmed → canceled`. La marca es texto libre y no tiene CHECK | `ALTER TYPE … ADD VALUE 'rescheduled'` (no puede usarse en la misma transacción que lo crea); actualizar `gst_appointment_guard` (solo `confirmed → rescheduled`; terminal) |
| Historial | La fila dice `canceled`; hay que leer el motivo | La fila dice `rescheduled`, sin ambigüedad |
| Consultas e índices | Cada consulta de «cancelaciones» debe excluir la marca | Filtros directos por estado |
| Reportes y analítica | Riesgo de inflar las cancelaciones y de mezclarse con el historial de reagendamientos que usa la analítica | Métricas limpias |
| Pagos y liquidación | **Riesgo financiero**: RN-061 hace elegible el importe ante una «cancelación del paciente con menos de 24 h», y RN-019 da reembolso total con 24 h o más. Una cita reagendada que se lee como cancelada podría disparar un reembolso o una elegibilidad | No hay ambigüedad; la tabla de liquidación del Maestro ya trata la «cita reagendada» como un caso propio |
| Pruebas | Pruebas negativas en cada consumidor | Prueba del trigger, más el mapeo del estado |
| Maestro | Contradice 6.1 («canceled = confirmada y después cancelada») | Requiere añadir `rescheduled` a 6.1 (control de cambios) |

**Recomendación:** (b). Requiere control de cambios en 6.1, una migración del enum y del trigger, y la aprobación del
líder técnico. Mientras tanto, el reagendamiento queda **bloqueado**. No conviene implementar (a) de forma transitoria por
el riesgo financiero.

### CC-4 Pago exitoso después del vencimiento

**Escenarios:**

| Esc. | Situación | Resultado propuesto |
|---|---|---|
| S1 | El pago tuvo éxito antes del vencimiento, pero `confirmPaid` llega cuando ya venció (el webhook se retrasó) | La cita está `expired`: no se confirma (el trigger lo impide). Se reembolsa el 100 % y se avisa al paciente |
| S2 | El pago tuvo éxito después del vencimiento | Igual que S1 |
| S3 | Webhook duplicado | Idempotente: `stripe_webhook_event.stripe_event_id` es único; `confirmPaid` sobre una cita ya `confirmed` con el mismo pago no hace nada |
| S4 | Cita `expired` y el horario sigue libre | **No** se reactiva ni se crea otra cita automáticamente: se reembolsa. El paciente puede volver a reservar (evita confirmaciones sin la validación de RB-1) |
| S5 | Cita `expired` y el horario ya está tomado | Reembolso |
| S6 | Pago fallido y después reintento exitoso dentro de la retención | Se confirma si sigue en `pending_payment` y el monto coincide |
| S7 | Pago de un monto distinto de `appointment.price`, o de otro paciente | Se rechaza, se registra el error de conciliación y se reembolsa |

**Mitigación preventiva (en pagos):** cancelar el PaymentIntent al vencer la retención, para que S2 sea casi imposible.
S1 sigue siendo posible y queda cubierto por el reembolso.

**Contrato:**
- `confirmPaid(appointmentId, paymentId, amount)` se ejecuta con el candado de la cita y devuelve `Confirmed`,
  `AlreadyConfirmed` o `NotConfirmable{reason: expired | amount_mismatch | patient_mismatch}`.
- Pagos, ante `NotConfirmable`, crea el reembolso (motivo `payment_error` del enum existente) de forma idempotente: un solo
  reembolso por pago y por esa causa.
- **Conciliación**: un evento `appointment.payment.not_confirmable` en la auditoría, con `appointmentId`, `paymentId` y el
  motivo.

**¿Control de cambios?** Sí: el Maestro no trata este caso. RN-012 es compatible con la propuesta.

### CC-5 Precio de consulta

**Respaldo:**
- RN-007: el precio es global, lo configura «la plataforma» y se copia en `appointment.price`.
- Modelo de datos: `consultation_price_configuration` aparece en la lista de tablas de configuración.
- Pero la misma sección la marca como **estructura propuesta pendiente del líder técnico**.
- El rol de administrador incluye «precios» (descripción del actor, no un RF).
- **No existe ningún RF que defina la administración del precio de consulta.** RF-13 solo dice que el pago conserva el
  precio aplicado.

**Estado: decidido (AP-1, AP-2, AP-3).** Falta formalizarlo en el Maestro (CC-5 y CC-10).

**Comprobación de la estructura**: `consultation_price_configuration` tiene `price numeric(10,2)`, `currency` (por omisión
`MXN`), `effective_from`, `effective_until`, `created_by` y `created_at`. No tiene columnas de médico ni de especialidad:
**representa un precio global**, y el historial se conserva con las versiones. No hay discrepancia con RN-007.

**Control de cambios propuesto (CC-5): RF-66 «Configuración del precio global de consulta»**, actor administrador,
prioridad Must, dependencias RF-12 y RF-13, reglas RN-007 y RN-021. Criterio:
> El administrador configura el precio global de consulta, único para toda la plataforma (sin precio por médico ni por
> especialidad). Cada cambio crea una versión nueva con su vigencia; las versiones anteriores no se modifican. La cita
> conserva en `appointment.price` el precio vigente al reservar; los cambios posteriores no modifican las citas
> existentes ni los pagos. Se audita quién hizo el cambio, cuándo, y los precios anterior y nuevo. Precio inicial:
> 200.00 MXN.

Este texto es una **propuesta**: la redacción definitiva se registra en el Maestro mediante el control de cambios.

**Reglas de diseño:**

| # | Regla |
|---|---|
| P-1 | En cada instante hay exactamente una versión vigente: `effective_from <= ahora` y (`effective_until` nulo o `> ahora`) |
| P-2 | Publicar una versión nueva = en la misma transacción, cerrar la vigente (`effective_until = ahora`) e insertar la nueva (`effective_from = ahora`). Nunca se modifica `price`, `currency` ni `effective_from` de una versión existente |
| P-3 | Serialización: `pg_advisory_xact_lock` con una clave fija de configuración de precio, al inicio de la transacción. Funciona también con la tabla vacía. Dos publicaciones simultáneas quedan en orden y la segunda cierra la que acaba de crear la primera |
| P-4 | Validación: `price > 0`, como máximo 2 decimales y dentro del rango de `numeric(10,2)`; `currency = 'MXN'` (única moneda). Si el precio es igual al vigente, 422 sin crear versión |
| P-5 | La reserva lee la versión vigente **dentro** de su transacción y copia `price` en `appointment.price`. El reagendamiento copia el precio de la cita original (RN-018), no el vigente |
| P-6 | `payment.amount` lo fija el módulo de pagos a partir de `appointment.price`. Un cambio de precio no modifica ni las citas ni los pagos existentes |
| P-7 | Sin versión vigente → la reserva responde 422 «Reservas no disponibles» |
| P-8 | Vigencia inmediata: no se programan precios futuros. Es la opción mínima; ver la pregunta de A.7 |

**Auditoría** (`AUDIT_TRAIL`, en la misma transacción; si falla, se revierte):

| Acción | Entidad | Actor y fecha | Metadata |
|---|---|---|---|
| `consultation_price.version.published` | `consultation_price_configuration` (id nuevo) | El administrador de la sesión (y `created_by` en la fila); `occurred_at` | `previousVersionId`, `previousPrice`, `newPrice`, `currency`, `effectiveFrom` |
| `consultation_price.version.seeded` | Ídem | El administrador indicado al procedimiento inicial | `newPrice: 200.00`, `currency: MXN`, `source: initial_setup` |

**Integridad histórica en la base de datos**: hoy ninguna restricción impide un `UPDATE` o `DELETE` sobre
`consultation_price_configuration`, ni que haya dos versiones abiertas a la vez. En la migración de DA-11, que requiere
su propia aprobación, se proponen:
- un índice único parcial `WHERE effective_until IS NULL`;
- un trigger de solo inserción que solo permita fijar `effective_until` una vez.

Hasta entonces, la integridad depende de P-2 y P-3 y de sus pruebas.

**Configuración inicial frente a administración posterior:**

| Etapa | Mecanismo |
|---|---|
| Inicial (AP-1) | Procedimiento controlado e idempotente (`pnpm price:seed`, en la línea de `admin:bootstrap`). Inserta 200.00 MXN si no hay ninguna versión y falla de forma segura si ya hay una. `created_by` (que es `NOT NULL`) debe ser un `user_profile` administrador existente. Se ejecuta en cada entorno; en producción, solo con una autorización de ejecución expresa |
| Posterior (AP-2) | Panel administrativo (A.8) |

### CC-6 Listado de médicos para reservar

- **Respaldo:** RF-12 implica elegir un médico. D-36 (M03) excluye el directorio, el perfil público y la búsqueda en M03,
  y el Maestro no define un directorio.
- **Médicos que aparecen:** solo los que cumplen `canOperate` (aprobación administrativa, registro completo y legales
  vigentes; D-38 y RN-140). Opción: exigir además al menos una franja de disponibilidad, para no mostrar médicos sin
  horarios.
- **Datos:** `doctorProfileId`, nombre para mostrar y especialidades. Opcionalmente la foto, si M03 la expone. Sin CURP,
  sin cédula, sin datos de contacto y sin biografía.
- **Acceso:** solo con una sesión de paciente. No es público, no se indexa y no tiene búsqueda de texto. El único filtro
  es la especialidad.
- **¿Control de cambios?** Sí, una aclaración de RF-12. No es una función nueva.

### CC-7 Cancelación del médico sin `canOperate`

- **RN-013**: si el médico no puede atender, la cita se cancela con reembolso total, sin reasignación.
- **RN-140**: al médico se le rechazan «las operaciones que requieren un médico habilitado».
- Interpretaciones:

| Opción | Consecuencia |
|---|---|
| **I1 (recomendada)**: cancelar no requiere estar habilitado | El médico puede liberar al paciente de inmediato con reembolso total. Riesgo bajo: cancelar no expone datos clínicos ni genera cobro |
| I2: cancelar sí requiere estar habilitado | Las citas de un médico que perdió `canOperate` (por ejemplo, por una reaceptación legal pendiente) quedan sin poder cancelarse: no hay cancelación administrativa en el alcance (CC-8) y el paciente quedaría con una cita que no se atenderá |

- **Límites de I1:** solo cancelar (no reagendar ni consultar el expediente), solo sus propias citas `confirmed`, con
  motivo obligatorio y reembolso total, y la auditoría marca `doctorCanOperate=false`.
- **¿Control de cambios?** Sí: una aclaración de RN-140 que enumere la cancelación protectora como una excepción.
- **Pendiente fuera de M08:** qué pasa con las citas futuras de un médico suspendido o devuelto a `pending` (M03 o
  administración).

### CC-8 Cancelación administrativa

- **Respaldo:** RN-014; Maestro 6.1 («por la plataforma por causa operativa»); RN-062; `refund_reason_enum.admin_cancellation`
  y `cancellation_actor_type_enum.admin`. **No hay un RF** que la asigne (RF-12: paciente; RF-15: paciente y médico).
- **Dependencia técnica indispensable:** ninguna. La función de transición del dominio de M08 acepta el actor `admin` sin
  exponer un endpoint, de modo que un módulo posterior pueda reutilizarla sin modificar M08.
- **Decisión de alcance:** fuera de M08 y registrada como cambio de alcance (RF nuevo o actor añadido a RF-15).

### CC-9 Admisión desde la sala de espera

**Respaldo:**
- RF-18: el médico controla la finalización.
- RF-19: sala de espera y aviso a ambos.
- RF-20: la ventana del médico.
- RF-51: notificaciones In-App y Push, con historial.
- `notification_type` ya tiene `appointment_waiting`.
- La admisión explícita **no está formalizada**.

**Responsable:** videoconsulta. La admisión crea o activa la `meeting` de la cita, registra `started_at` (RF-22) y pone en
espera al siguiente paciente.

**Condiciones de admisión** (las valida videoconsulta usando M08):
1. La cita está `confirmed`, según `AppointmentQueryPort.getForSession`.
2. El médico que admite es el `doctorId` de la cita (sesión de médico).
3. El médico no tiene otra `meeting` `active`: debe terminar la anterior (RF-18).
4. El paciente está conectado en la sala de espera.
5. La cita no tiene ya una inasistencia determinada.

Pregunta abierta: desde cuándo puede entrar el paciente a la sala (por ejemplo, N minutos antes de `scheduled_at`). El
Maestro no lo dice.

**Contrato entre módulos:**

| Productor | Evento o puerto | Consumidor | Uso |
|---|---|---|---|
| M08 | `AppointmentQueryPort.getForSession(id)`: estado, participantes, `scheduledAt`, `doctorWaitMinutes` y `patientToleranceMinutes` de la versión aplicada | Videoconsulta | Validar la admisión y calcular las ventanas (CC-2) |
| M08 | `AppointmentOutcomePort.markCompleted / markNoShow(id, tipo, actor)` | Videoconsulta | La única salida de `confirmed` hacia los resultados; el historial y la auditoría quedan en M08 |
| Videoconsulta | `PatientWaiting {appointmentId, doctorId, since}` | Notificaciones | `appointment_waiting` al médico y al paciente (RF-19) |
| Videoconsulta | `PatientAdmitted {appointmentId}` | Notificaciones (opcional) | Avisar al paciente |
| M08 | `AppointmentConfirmed / Canceled / Rescheduled / Expired` | Notificaciones | Avisos transaccionales (RF-51) |

**¿Control de cambios?** Sí: ampliar el criterio de RF-19 con la admisión explícita por el médico y sus condiciones.

## A.3 Matriz de trazabilidad y estado de DA

Estados posibles:
- **Aprobada**: decidida expresamente en A.0.
- **Pendiente de aprobación**.
- **Bloqueada**: depende de un control de cambios o de una migración sin aprobar.
- **Fuera de alcance**.

«Aprobada en diseño» quiere decir que la decisión está tomada, pero que implementarla espera su control de cambios o su
migración.

| DA | Tema | RF/RN | CC (cambio) | Estado | Fuente |
|---|---|---|---|---|---|
| DA-1 | Confirmación solo con pago; bandera que desactiva la reserva en producción; sin ninguna ruta de confirmación sin pago | RF-13, RF-14, RN-008, RN-011, RN-012 | CC-4 | **Aprobada** | AP-16 |
| DA-2 | Candados y orden único | RF-12, RF-14 | — | **Aprobada** | AP-17 |
| DA-3 | Fin del bloque guardado en `agenda_block_ends_at`, solo para la ocupación (A.10.2) | RN-022, RN-023, RF-11 | — | **Aprobada**; implementarla requiere M-1 #2 (hasta entonces, O1 transitoria) | AP-20 |
| DA-4 | Sin transiciones automáticas desde `confirmed` en M08 | RF-19, RF-20, RN-024, RN-025 | CC-2 | **Aprobada** (la parte de M08). Las ventanas: fuera de alcance (videoconsulta) | AP-20 |
| DA-5 | Filtrar los ocupados sin tocar M07 | RF-11, RF-12 | — | **Aprobada** | AP-17 |
| DA-6 | Reagendamiento con `rescheduled`; el pago queda en la cita raíz | RF-12, RN-015, RN-017, RN-018, RF-46 | CC-3 (C-25) | **Aprobada en diseño**; implementarla requiere C-25 y la migración M-1 (A.9.6) | AP-7 |
| DA-7 | Contador por la cadena | RN-017 | — | **Aprobada** | AP-17 |
| DA-8 | Un solo plazo (`refund_deadline_hours` de la versión aplicada) para reembolso y reagendamiento | RN-016, RN-019, RF-16 | CC-1 | **Aprobada** | AP-4, AP-20 |
| DA-9 | Vencimiento perezoso; tres situaciones distintas | RF-14, RN-009, RN-010, RN-012 | CC-4 | **Aprobada** (el barrido programado, fuera de alcance) | AP-17 |
| DA-10a | Precio global en versiones, copia en la cita, panel, auditoría, vigencia inmediata | RN-007, RF-66 (propuesto) | CC-5 (C-23), CC-10 (C-24) | **Aprobada**; el registro en el Maestro está pendiente | AP-1, AP-2, AP-3, AP-9, AP-10 |
| DA-10b | Parámetros de cancelación en versiones de `cancellation_policy`, configuradas por el administrador | RF-16, RN-021 | CC-1 | **Aprobada** (opción A). La opción C (C2), aprobada | AP-4, AP-19 |
| DA-11 | Migraciones de endurecimiento y de estructura | — | C-25, C-26 | **Pendiente de aprobación** (contenido en A.9.6) | — |
| DA-12 | Listado de médicos: `canOperate` y con disponibilidad; sin foto | RF-12 | CC-6 (C-28) | **Aprobada** | AP-12 |
| DX-1 | Cancelación del médico sin `canOperate`, con reembolso total | RN-013, RN-140 | CC-7 (C-27) | **Aprobada**; aclaración de RN-140 pendiente de registro | AP-13 |
| DX-2 | Cancelación administrativa | RN-014, RN-062 | CC-8 | **Fuera de alcance** | AP-14 |

## A.4 Dependencias con pagos, videoconsulta y notificaciones

| Módulo | Necesita de M08 | M08 necesita de él | Bloquea a M08 |
|---|---|---|---|
| Pagos (RF-13, RF-46) | `confirmPaid`, `markPaymentFailed`, `rootOf`, `refundOutcome`, eventos | Nada en tiempo de compilación. Sin pagos no hay citas confirmadas en producción | La puesta en producción (DA-1), no la implementación |
| Videoconsulta (RF-18 a RF-22) | `getForSession`, `markCompleted`, `markNoShow`, parámetros de ventanas | Nada | No; CC-2 y CC-9 lo bloquean a él |
| Notificaciones (RF-51) | Los eventos de cita | Nada | No |

## A.5 Controles de cambios en el Maestro

Son **propuestas**. Este diseño no modifica el Maestro ni marca nada como aprobado en la bitácora. La numeración sigue la
del Maestro (el último registrado es C-22). C-23 y C-24 se asignan por AP-18; desde C-25 en adelante los números son
provisionales y su orden lo decide quien registre los cambios.

| C | CC | Cambio propuesto en el Maestro | Base de la decisión | Requiere migración |
|---|---|---|---|---|
| **C-23** | CC-5 | Nuevo **RF-66** «Configuración del precio global de consulta» (texto en A.2 CC-5), con precio inicial de 200.00 MXN y vigencia inmediata | AP-1, AP-2, AP-9 | No; los índices y triggers de integridad van en M-1 |
| **C-24** | CC-10 | Registrar como aprobadas `appointment.cancellation_policy_id` y `consultation_price_configuration` por la persona responsable del proyecto (2026-11-07), en la sección del modelo de datos y en la lista de pendientes | AP-3 | No |
| C-25 | CC-3 | Estado `rescheduled` en 6.1, con su transición `confirmed → rescheduled` (terminal) y su efecto en la tabla de importes | AP-7 | Sí (M-1) |
| C-26 | CC-2 | Aclaración de RF-19, RF-20 y RN-025: espera protegida con límite máximo configurable; nuevo parámetro en RF-16 | AP-5, AP-6; **valor y fórmula pendientes** | Sí (M-1: columna del límite) |
| C-27 | CC-7 | Aclaración de RN-140: la cancelación protectora del médico (RN-013) no exige estar habilitado | AP-13 | No |
| C-28 | CC-6 | Aclaración de RF-12: listado de médicos reservables solo con sesión de paciente (`canOperate` y disponibilidad; nombre y especialidad) | AP-12 | No |
| C-29 | CC-4 | Pago exitoso que no puede confirmar la cita → reembolso automático e idempotente; `expired` no se reactiva | AP-8 | No |
| C-30 | CC-9 | Ampliar RF-19: entrada a la sala 15 min antes, admisión explícita por el médico (videoconsulta) y resultado registrado en la cita | AP-15 | No |
| C-31 | CC-8 | Asignar la cancelación administrativa (RN-014) a un RF y a un módulo posterior | AP-14 (fuera de M08) | No en M08 |
| C-32 | CC-1 (opción C) | Solo si se aprueba la opción C: la cita conserva la referencia a la aceptación legal vigente al reservar | Pendiente | Sí (M-1) |

## A.6 Riesgos de implementar sin resolver lo pendiente

| Pendiente | Consecuencia |
|---|---|
| CC-2 (valor y fórmula) | Videoconsulta no puede implementar las ventanas. M08 sí puede avanzar, pero el parámetro del límite debe existir en la política antes de producción |
| Opción C de CC-1 | Si se decide después, la migración tendría que rellenar la referencia legal de las citas existentes (por derivación) |
| C-23 a C-30 sin registrar | Diferencias entre el código y el Maestro, que es la fuente de verdad; trazabilidad académica incompleta |
| M-1 sin aprobar | No se puede implementar el reagendamiento (DA-6), y la ocupación usa O1 transitoria: un cambio de duración del médico altera la ocupación de las citas ya reservadas |
| Carga de precio no ejecutada (AP-11) | No hay reservas en producción; no afecta a la implementación ni a las pruebas |

## A.7 Preguntas pendientes

Solo quedan las que no se han respondido. Las resueltas están en A.0.

1. **E14 (A.11.3)**: N9 y N10, ¿lectura (a) `no_show_both` o (b) `no_show_doctor`? N8, ¿lectura (b), consulta normal, o
   (a), `no_show_patient`?
2. **M-1 (A.11.4)**: ¿autorizas los cambios 1 a 5, con el 3 condicionado a M02? ¿Incluyes el 6, opcional?
3. **M02**: ¿apruebas el cambio aditivo (exportar el lector de la aceptación legal), después de revisar su impacto?
4. **Comprobaciones previas a M-1**: ¿autorizas las cuatro consultas de solo lectura en Neon?
5. **Controles de cambios**: ¿cuándo se registran C-23 a C-32 en el Maestro?
6. **Implementación**: ¿autorizas empezar el código de las partes que no dependen de M-1?

## A.8 Administración del precio en el panel (alcance añadido por AP-2)

**Backend** (dentro de `modules/appointments`, submódulo `pricing`):

| Capa | Contenido |
|---|---|
| `domain/` | `ConsultationPrice` (validación P-4), `selectCurrentVersion(versiones, ahora)` (P-1) |
| `application/` | Casos de uso `GetCurrentConsultationPrice`, `ListConsultationPriceVersions` y `PublishConsultationPrice` (P-2, P-3, auditoría); puerto `CONSULTATION_PRICE_REPOSITORY`. La reserva usa el mismo puerto (P-5) |
| `infrastructure/` | `DrizzleConsultationPriceRepository`; el procedimiento inicial `price:seed` |
| `presentation/` | `AdminConsultationPriceController`, con `@Roles('admin')`, `SessionGuard` y `RolesGuard` (los existentes) |

**Endpoints** (solo administrador):

| Método y ruta | Caso de uso | Errores |
|---|---|---|
| `GET /admin/consultation-price` | Versión vigente (`price`, `currency`, `effectiveFrom`, `createdBy`) | 401, 403, 404 (sin versión) |
| `GET /admin/consultation-price/versions` | Historial, de la más reciente a la más antigua | 401, 403 |
| `POST /admin/consultation-price/versions` `{ price: "250.00" }` | Publicar una versión nueva | 400 (formato), 403, 422 (igual al vigente o fuera de rango) |

Para el paciente, el precio solo aparece en el resumen de la reserva y en la cita, que es una copia: no hay un endpoint de
paciente para el precio vigente. El resumen lo obtiene de la propia operación de reserva.

**Web** (`apps/web/src/app/admin`, junto al panel de profesionales existente):
- Ruta `/admin/precio-consulta`.
- Tarjeta con el precio vigente («$200.00 MXN, vigente desde …»).
- Formulario «Nuevo precio» con un diálogo de confirmación que advierte: «aplica solo a las reservas nuevas; las citas y
  pagos existentes no cambian».
- Tabla de historial: precio, vigencia desde y hasta, y quién lo publicó.
- Un enlace en la navegación del panel de administración. Es un cambio en la web de administración de M03; no se toca su
  lógica. **Autorizado (AP-10).**

**Pruebas añadidas:**
- **Unitarias**: P-1 en los límites de vigencia y P-4 (cero, negativo, 3 decimales, desbordamiento).
- **Casos de uso**: P-2 (cierra la anterior y crea la nueva), igual al vigente → 422, reversión si falla la auditoría,
  metadata con los precios anterior y nuevo, y que la reserva copie el precio vigente y el reagendamiento el original.
- **E2E**: 403 para paciente y médico.
- **Concurrencia**: dos publicaciones simultáneas → una sola versión abierta; reserva mientras se cambia el precio → la
  cita lleva uno de los dos precios, nunca un valor intermedio.
- **Integración (C2)**: la carga inicial es idempotente.
- **Web**: el formulario y el diálogo de confirmación.


## A.9 Diseño resultante de la segunda ronda de decisiones

### A.9.1 CC-1: evaluación de la opción C (referencia legal formal)

**Objetivo**: que la cita apunte a la aceptación legal vigente al reservar sin copiar información de M02.

| Variante | Qué guarda | Ventajas | Inconvenientes |
|---|---|---|---|
| C1 `cancellation_policy.legal_document_id` | La versión legal bajo la que se publicó cada versión de parámetros | Relaciona el texto con los números | No registra qué aceptó **el paciente**. Con la opción A los parámetros cambian sin publicar Términos nuevos, así que el vínculo sería artificial |
| **C2 `appointment.legal_acceptance_id`** (FK a `user_legal_acceptance.id`) | La fila de aceptación de M02 que habilitó la reserva | Solo es una referencia, sin duplicar. Prueba exactamente qué versión aceptó el paciente, cuándo y desde qué IP y agente (datos que ya guarda M02). Junto con `cancellation_policy_id` da la pareja completa «legal aceptado + parámetros aplicados» | Migración. M08 necesita leer el id de la aceptación |
| Sin migración (situación actual) | Derivación por fecha, más `legal_document_id` en la auditoría de la reserva | No cambia el esquema | La derivación es frágil con el régimen anterior (`terms_and_conditions`) y la auditoría no es una relación de integridad |

**Recomendación: C2.**

Reglas:
- Se fija al crear la cita y no cambia: se amplía `gst_appointment_guard`, como ya se hace con `cancellation_policy_id`.
- El reagendamiento copia la referencia de la cita original (RN-018).
- Con el régimen anterior, se guarda la aceptación que cumplió el requisito.

**Implicación de módulos:** `CanBookAppointmentsPolicy` no devuelve el id de la aceptación. Las opciones son:
- **(i, recomendada)**: M02 exporta un lector de solo lectura `BookingLegalAcceptanceReader.currentFor(userProfileId)`.
  Es un cambio aditivo en M02 y **requiere tu autorización**, porque M02 está fuera del perímetro de M08.
- **(ii)**: M08 consulta las tablas legales directamente. Rompe la frontera entre módulos; no se recomienda.

### A.9.2 CC-2: espera protegida con límite

**Definiciones**, para una cita con hora programada `T0`:
- `W`: ventana de espera del médico (`doctor_wait_minutes`, RN-025).
- `Tol`: tolerancia del paciente (`patient_tolerance_minutes`, RN-026).
- `L`: límite máximo de espera protegida. Es un parámetro **nuevo** de `cancellation_policy`, con valor inicial propuesto
  de 60 min, **no aprobado**. Se valida que `L >= W`.
- `F`: momento en que el médico queda libre: el primer instante desde `T0` en que no tiene ninguna `meeting` `active` de
  otra cita. Si a `T0` ya está libre, `F = T0`.
- Espera protegida: el intervalo `[T0, F)` mientras `F > T0`.

**Cálculo del plazo del médico `D` (alternativas):**

| Opción | Fórmula | Sin consulta previa | Consulta previa termina en T0+20 | … en T0+50 | … nunca termina |
|---|---|---|---|---|---|
| **T1 (recomendada): límite total** | `D = min(max(T0, F) + W, T0 + L)` | T0+30 (igual que RN-025) | T0+50 | T0+60 | T0+60 |
| T2: límite de la espera protegida y después la ventana completa | `D = min(F, T0 + L) + W` (con `F ≥ T0`) | T0+30 | T0+50 | T0+80 | T0+90 |

Ejemplos con W=30 y L=60. Con T1, el paciente nunca espera más de `L` desde su hora. Con T2, el médico siempre dispone de
su ventana completa al quedar libre, pero el paciente puede esperar hasta `L + W`.

**Cómo se aplica la ventana del médico:**
- Sin consulta previa en curso, `D = T0 + W`: es RN-025 literal.
- Si hay consulta previa, la ventana empieza a contar cuando el médico queda libre, dentro del límite.
- Durante la espera protegida **no** se determina `no_show_doctor` ni `no_show_both` (AP-6).

**Disponibilidad del paciente** (criterios de AP-6; los valores siguen pendientes):
1. *Se conectó a tiempo*: entró a la sala entre `T0 − 15 min` (AP-15) y `T0 + Tol`.
2. *Desconexión involuntaria* (se pierde la conexión, sin la acción «Salir»): no es abandono. Sigue disponible si
   reconecta dentro de un periodo de gracia `G` (se proponen 5 min) o si al llegar `D` está conectado.
3. *Salida voluntaria* (botón «Salir de la sala», con confirmación): deja de estar disponible desde ese instante.
   - Si regresa antes de la admisión, recupera la disponibilidad.
   - Salir **no cancela la cita**. La cancelación es una operación aparte de M08, con sus propias reglas (RN-019,
     RN-020).
4. *Eventos*: todas las entradas, salidas y reconexiones se guardan en `meeting_session_event` (RN-031), que hoy solo
   distingue `joined` y `left`. Para separar la salida voluntaria de la involuntaria hace falta un tipo nuevo, por ejemplo
   `left_voluntarily`. Esa migración es **de videoconsulta**, no de M08.

**Desenlace al llegar a `D` sin que el médico haya admitido al paciente** (propuesta):

| Paciente en `D` | Médico | Resultado | Regla |
|---|---|---|---|
| Disponible | No admitió | `no_show_doctor`, reembolso del 100 % | RN-025 |
| Nunca se conectó dentro de su tolerancia | No se conectó a esta cita | `no_show_both`, reembolso del 100 % | RN-030 |
| Nunca se conectó dentro de su tolerancia | Quedó libre y entró a la sala de esta cita | `no_show_patient`, que se determina en cuanto el médico entra, una vez vencida la tolerancia | RN-026 |
| Se conectó y salió voluntariamente o no regresó dentro de `G` | Quedó libre y esperó su ventana | `no_show_patient` al terminar la ventana del médico | RN-033 |
| Se conectó a tiempo y después salió (voluntariamente o sin regresar dentro de `G`) | Nunca llegó | `no_show_doctor`, reembolso del 100 % | RN-032 (**corrección de A.10**: la v3 omitía este caso) |

Al llegar al límite **no se concede ninguna espera adicional**. La determinación la hace videoconsulta y la registra M08
mediante `AppointmentOutcomePort.markNoShow`.

### A.9.3 DA-3 revisada: ocupación de la agenda sin cortar la consulta

**Principio (RN-022, RN-023):** el bloque es una unidad de **planeación de la agenda**, no una duración de la consulta.
- Ninguna parte del sistema finaliza ni limita una videoconsulta por el fin de su bloque.
- La duración real es `started_at → ended_at` (RF-22).
- Si una consulta se excede, la siguiente cita **no se mueve ni se bloquea**: su paciente entra a la espera protegida
  (A.9.2).

| Opción | Ocupación de una cita | Consistencia | Requiere |
|---|---|---|---|
| O1 (la DA-3 original) | `[scheduled_at, scheduled_at + duración vigente)` | Si el médico cambia su duración, cambia la ocupación de las citas ya reservadas: pueden aparecer cruces o huecos | Nada |
| **O2 (recomendada)** | `[scheduled_at, agenda_block_ends_at)`, con `agenda_block_ends_at` copiado del bloque reservado | Estable: la ocupación de una cita no cambia después de reservar. Se puede usar en una restricción `EXCLUDE` | Columna `appointment.agenda_block_ends_at` (M-1) |
| O3 | Recalcular el bloque con el generador de M07 | Depende del horario actual; frágil | Nada, pero es incorrecta si cambia el horario |

Con O2:
- `agenda_block_ends_at` solo se usa para la ocupación (DA-5) y para la `EXCLUDE` opcional. Videoconsulta no lo usa como límite.
- El reagendamiento toma el bloque nuevo.
- Hasta que exista la columna, se usa O1 como solución transitoria y se documenta como riesgo.

### A.9.4 CC-6: la foto del médico

`doctor_profile.photo_object_key` existe, y la foto se guarda en el almacenamiento privado (M03). Solo hay mecanismo de
lectura para el propio médico y la revisión administrativa (`OpenDoctorPhotoUseCase`); **no hay ningún mecanismo
autorizado para que un paciente la vea**. Por AP-12, la foto **no se incluye**. Mostrarla requeriría un cambio en M03 y
el acceso a R2, y queda fuera de alcance.

Listado final por médico:
- `doctorProfileId`;
- nombre para mostrar;
- especialidades;
- criterio de aparición: `canOperate` **y** al menos un horario libre en los próximos 31 días, calculado con
  `generateSlots` y el filtro de DA-5. El horizonte de 31 días es el máximo de M07 (D-5).

### A.9.5 CC-9: contrato entre citas, videoconsulta y notificaciones

| Responsabilidad | Módulo |
|---|---|
| Estado de la cita, sus transiciones, el historial y el resultado final registrado | **M08** |
| La sala de espera, la entrada del paciente (desde `T0 − 15 min`), la admisión por el médico, `meeting`, los eventos de sesión, el cálculo de `D` y la determinación de las inasistencias | **Videoconsulta** |
| Los avisos `appointment_waiting` al médico y al paciente (RF-19), y los avisos transaccionales de cita (RF-51) | **Notificaciones** |

**Condiciones para entrar a la sala** (las verifica videoconsulta con `getForSession`):
- la cita está `confirmed`;
- el actor es el paciente de la cita;
- ahora ≥ `T0 − 15 min`;
- la cita no tiene un resultado registrado.

Entrar antes de `T0` es puntual: no consume la tolerancia.

**Condiciones de admisión**: las de A.2 CC-9.

**Contrato que M08 expone:**
- `getForSession(appointmentId)` → `{ status, patientProfileId, doctorProfileId, scheduledAt,
  doctorWaitMinutes, patientToleranceMinutes, maxProtectedWaitMinutes }`, tomados de la versión de la política
  **aplicada a la cita**.
- `markCompleted(appointmentId)` y `markNoShow(appointmentId, 'patient' | 'doctor' | 'both', actor='system')`: solo
  desde `confirmed`; idempotentes ante el mismo resultado y con 409 ante uno distinto. Registran el historial y la
  auditoría.
- La corrección administrativa de una inasistencia (RN-027) queda fuera de M08.

### A.9.6 Contenido propuesto de la migración M-1 (DA-11; no se genera todavía)

| # | Cambio | Motivo | Estado |
|---|---|---|---|
| 1 | `appointment_status_enum` + `rescheduled`; `gst_appointment_guard` permite `confirmed → rescheduled` y lo trata como terminal; `appointment_lock_entries` lo incluye | CC-3 (AP-7) | Aprobado en diseño (C-25) |
| 2 | `appointment.agenda_block_ends_at timestamptz` con CHECK `> scheduled_at` | DA-3 O2 | Pendiente (DA-3) |
| 3 | `appointment.legal_acceptance_id` FK `user_legal_acceptance`, inmutable en el guard | CC-1 C2 | Pendiente (opción C) |
| 4 | `cancellation_policy.max_protected_wait_minutes` con CHECK `>= doctor_wait_minutes` | CC-2 | Pendiente (valor y fórmula) |
| 5 | Triggers de solo inserción en `cancellation_policy` y en `consultation_price_configuration` (solo se permite fijar `effective_until` una vez) e índice único parcial «una versión abierta» en cada una | Integridad histórica (AP-2, AP-3) | Pendiente de aprobar la migración |
| 6 | Opcional: `btree_gist` y `EXCLUDE (doctor_id WITH =, tstzrange(scheduled_at, agenda_block_ends_at) WITH &&) WHERE status = 'confirmed'` (las retenciones siguen protegidas por el candado de DA-2) | Defensa en profundidad | Pendiente; depende del punto 2 |

### A.9.7 Cargas iniciales preparadas (AP-1, AP-11; no se ejecutan)

| Procedimiento | Contenido | Protecciones |
|---|---|---|
| `price:seed` | Una versión de 200.00 MXN | Idempotente (falla si ya hay una versión); `--created-by <userProfileId>` obligatorio y verificado como administrador; por omisión, en modo de simulación (`--dry-run`); en producción exige `--confirm-production` y se ejecuta solo con autorización expresa, una vez identificada la cuenta real |
| `policy:seed` | La primera versión de `cancellation_policy`: plazo de 24 h (RN-016, RN-019), máximo de 2 reagendamientos (RN-017), ventana del médico de 30 min (el ejemplo de RF-20) y tolerancia del paciente **sin valor en el Maestro** | Las mismas. **Sin la tolerancia no se puede crear la versión** (es una columna `NOT NULL`) |

### A.9.8 Bloqueos reales para empezar la implementación

| Bloqueo | Afecta a | No afecta a |
|---|---|---|
| Aprobación del contenido de M-1 (A.9.6) | El reagendamiento (DA-6), `agenda_block_ends_at`, la referencia legal, la integridad de las versiones | El dominio, la retención, la cancelación, el precio y el listado (se pueden implementar antes) |
| Valor inicial de la tolerancia del paciente (`policy:seed`) | Crear la primera política. Sin ella no hay citas en ningún entorno con datos reales (sí en pruebas, con fixtures) | La implementación del código |
| Valor y fórmula de CC-2 (`L`) | El parámetro de la política y videoconsulta | La reserva, la cancelación y el reagendamiento |
| Autorización para modificar M02 (A.9.1 i), si se aprueba la opción C | La referencia legal en la cita | Lo demás |
| Registro de C-23 a C-30 en el Maestro | La conformidad documental (regla de trabajo: el Maestro es la fuente de verdad) | No es técnico; conviene registrarlos antes de cerrar M08 |

**Implementación que puede empezar sin esperar a los bloqueos** (si autorizas empezar):
1. Dominio puro.
2. Precio (DA-10a): backend y panel.
3. Política (DA-10b), con los parámetros actuales.
4. Retención y vencimiento.
5. Cancelación del paciente y del médico.
6. Listado de médicos y horarios.
7. Puertos de pagos y de videoconsulta.
8. Bandera de reserva.


## A.10 Fin del bloque, escenarios de inasistencia y explicación de M-1

### A.10.1 Dónde se registra hoy el fin oficial de la videoconsulta (verificado en el esquema)

| Concepto | Campo actual | Archivo | Uso |
|---|---|---|---|
| Inicio real de la videoconsulta | `meeting.started_at` | `apps/backend/src/db/schema/appointment.ts` (tabla `meeting`) | RF-22, RN-023 |
| **Fin oficial de la videoconsulta** | **`meeting.ended_at`** (`timestamptz`, puede ser nulo) | `apps/backend/src/db/schema/appointment.ts`, tabla `meeting` | RF-22, RN-023: duración real = `started_at → ended_at`; lo fija el médico al terminar (RF-18) |
| Hora programada de la cita | `appointment.scheduled_at` | Ídem, tabla `appointment` | Inicio del bloque reservado |
| Fin del bloque reservado | **No existe.** `appointment` no tiene ninguna columna de fin | — | — |
| `ends_at` | Solo existe en `doctor_time_off.ends_at` (fin de un periodo no disponible, M07) | `apps/backend/src/db/schema/doctor.ts` | Sin relación con citas ni con videoconsultas |

**Corrección:** la v2 (parte B, DA-3 y DA-11 y el riesgo R-2) llamaba `ends_at` al fin del bloque. Eso era ambiguo y
podía confundirse con el fin real de la consulta. La v3 lo llamaba `slot_ends_at`. Ambos nombres se sustituyen por
**`appointment.agenda_block_ends_at`**. `meeting.ended_at` no se reutiliza ni se sobrescribe nunca, y M08 no lo escribe
(es de videoconsulta).

### A.10.2 DA-3 corregida (aprobada por AP-20, con el nombre corregido)

**¿Se puede calcular en lugar de guardarlo?** La fórmula sería `scheduled_at + doctor_profile.appointment_duration_minutes`.

| Criterio | Calculado | Guardado (`agenda_block_ends_at`) |
|---|---|---|
| Estabilidad | **No es estable**: `appointment_duration_minutes` es la duración **vigente** del médico, que puede cambiar en M07 (D-3) después de reservar. La ocupación de citas ya reservadas cambiaría de forma retroactiva | Estable: es el fin del bloque que el paciente reservó |
| Consistencia con lo reservado | Puede no coincidir con el horario que vio el paciente | Coincide con el horario devuelto por `generateSlots` |
| Restricción `EXCLUDE` (M-1 #6) | **No es posible**: `timestamptz + interval` es `STABLE`, no `IMMUTABLE`, y PostgreSQL no lo admite en índices ni en restricciones de exclusión. Además requiere un dato de otra tabla | Posible: `tstzrange(scheduled_at, agenda_block_ends_at)` |
| Esquema | Sin cambios | Una columna nueva |

**Conclusión: hay que guardarlo.** Nombre: `appointment.agenda_block_ends_at timestamptz`, con
`CHECK (agenda_block_ends_at > scheduled_at)`.
- Se fija al reservar con el `endsAt` del bloque elegido. En un reagendamiento, la cita nueva toma el de su bloque.
- **No cambia** después: se amplía `gst_appointment_guard`.
- **Uso exclusivo**: la ocupación de la agenda (DA-5) y la `EXCLUDE` opcional.
- **Nunca** se expone a videoconsulta (se retiró de `getForSession`), no programa ningún corte ni recordatorio de fin y
  no se compara con `meeting.ended_at`.

**Compatibilidad:**
- RN-022: la duración del médico solo determina el tamaño aproximado del bloque. `agenda_block_ends_at` es ese tamaño
  guardado y no finaliza la llamada.
- RN-023: el médico controla la finalización, y la duración real es `meeting.started_at → meeting.ended_at`.
- Una consulta que se prolonga más allá de `agenda_block_ends_at` sigue sin interrupción. La siguiente cita no se mueve,
  y su paciente entra a la espera protegida (A.9.2).

**Mientras M-1 no exista:** M08 calcula la ocupación con la fórmula de arriba (O1, transitoria). La implementación
encapsula ese cálculo en una sola función, `occupancyOf(appointment)`, para sustituirlo sin tocar a quien lo usa.

### A.10.3 Escenarios de CC-2 con los parámetros propuestos (no aprobados)

Valores **propuestos** (AP-21): ventana del médico `W = 30`, tolerancia del paciente `Tol = 15`, límite total
`L = 60`, gracia de reconexión `G = 5`. La entrada a la sala es desde `T0 − 15` (AP-15).
- Fórmula T1: `D = min(max(T0, F) + W, T0 + L)`.
- «Disponible»: el paciente se conectó en `[T0 − 15, T0 + 15]`, y en el momento evaluado está conectado o lleva menos
  de `G` desconectado de forma involuntaria.
- Comprobación de coherencia: `Tol (15) <= W (30) <= L (60)`.

| # | Situación | Plazo del médico D | Resultado | Regla | ¿Compatible? |
|---|---|---|---|---|---|
| E1 | Sin consulta previa; el paciente entra en T0+5; el médico no entra | T0+30 | `no_show_doctor` en T0+30, reembolso del 100 % | RN-025 (literal) | Sí |
| E2 | Sin consulta previa; el médico entra en T0+2; el paciente no entra | T0+30 | `no_show_patient` en T0+15 (vence la tolerancia con el médico conectado) | RN-026 | Sí |
| E3 | Sin consulta previa; nadie entra | T0+30 | `no_show_both` en T0+30 (se esperan ambas ventanas) | RN-030 | Sí |
| E4 | La consulta previa termina en T0+20; el paciente espera desde T0−5; el médico admite en T0+25 | T0+50 | Consulta normal; ninguna transición en M08 hasta `completed` | RF-19, RN-024 | Sí |
| E5 | La consulta previa termina en T0+20; el médico no admite | T0+50 | `no_show_doctor` en T0+50 | RN-025, con la ventana contada desde que el médico queda libre (C-26) | Sí, con la aclaración C-26 |
| E6 | La consulta previa termina en T0+50 | T0+60 (tope) | Si admite antes de T0+60, consulta normal; si no, `no_show_doctor` en T0+60. El médico solo tuvo 10 min | RN-025 + límite | Sí, con C-26; es una consecuencia del límite total |
| E7 | La consulta previa sigue después de T0+60 | T0+60 | `no_show_doctor` en T0+60, aunque el médico siga atendiendo: reembolso del 100 % y el médico no cobra | RN-025 + límite | Sí, con C-26. **Decisión de negocio**: ¿es aceptable penalizar al médico en este caso? |
| E8 | El médico está ocupado en T0+15; el paciente nunca entra; el médico queda libre en T0+20 y entra | T0+50 | Sin determinación en T0+15 (el médico no estaba conectado a esta cita). `no_show_patient` en T0+20, cuando entra el médico | RN-026 y RN-030 | Sí |
| E9 | El médico está ocupado; el paciente nunca entra; el médico no queda libre antes de T0+60 | T0+60 | `no_show_both` en T0+60 | RN-030 | Sí |
| E10 | El paciente entra en T0; se desconecta sin querer en T0+10 y vuelve en T0+13 | — | Sigue disponible; la desconexión queda registrada | AP-6, RN-031, RN-034 | Sí |
| E11 | El paciente entra en T0 y se desconecta sin querer en T0+10 sin volver; el médico queda libre en T0+20 y entra | T0+50 | `no_show_patient` en T0+50, al terminar la ventana del médico | RN-033 | Sí |
| E12 | El paciente entra en T0 y sale voluntariamente en T0+10; el médico nunca llega | T0+30 o el tope | `no_show_doctor` | **RN-032** | Sí. **Corrección de A.9.2**: la v3 decía que la salida voluntaria dejaba al paciente «no disponible» en cualquier caso; RN-032 dice que, si el médico nunca llega, es `no_show_doctor` |
| E13 | El paciente sale voluntariamente en T0+10 y vuelve en T0+30; el médico queda libre en T0+20 | T0+50 | Disponible otra vez; admisión normal | AP-6 | Sí |
| E14 | El paciente entra por primera vez en T0+20 (fuera de su tolerancia); el médico no entra | T0+30 | **Sin regla en el Maestro**: el paciente se conectó tarde, pero se conectó. Propuesta: tratarlo como no conectado → `no_show_both` | RN-030 (interpretación) | **Requiere aclaración** (C-26) |
| E15 | El paciente entra en T0−20 | — | Videoconsulta lo rechaza; la sala abre en T0−15 | AP-15 | Sí |

**Interacción de los parámetros:**
- Con `Tol = 15` y `W = 30`, la inasistencia del paciente se puede determinar antes que la del médico (E2), como prevé
  RN-026.
- Con `L = 60 = 2 × W`, un médico que queda libre antes de T0+30 conserva su ventana completa (E5). A partir de ahí su
  ventana se recorta (E6, E7).
- `G = 5` protege frente a cortes breves (E10) sin alargar ninguna ventana: la gracia solo cambia si el paciente
  «está disponible», nunca el plazo `D`.

### A.10.4 M-1 explicada cambio por cambio

Antes de la migración hay que contar las filas existentes de `appointment` en cada entorno (en producción se espera que
no haya ninguna, porque nunca hubo código de citas). Esa consulta **no se ha hecho**: requiere conectarse a Neon, y esta
tarea no lo permite. Si hubiera filas, las columnas nuevas tendrían que nacer admitiendo nulos.

| # | Cambio | Para qué | Depende de | Si no se incluye |
|---|---|---|---|---|
| 1 | `appointment_status_enum` + `rescheduled`; `gst_appointment_guard`: solo `confirmed → rescheduled`, y `rescheduled` es terminal; `gst_appointment_lock_entries` incluye `rescheduled` | CC-3: cerrar la cita original sin que parezca una cancelación (RN-018, RN-061) | C-25. Técnica: `ALTER TYPE … ADD VALUE` en una migración separada, porque el valor nuevo no puede usarse en la misma transacción | No se puede implementar el reagendamiento sin el riesgo financiero de usar `canceled` con una marca |
| 2 | `appointment.agenda_block_ends_at timestamptz`, CHECK `> scheduled_at`, inmutable en el guard | DA-3 (A.10.2) | Ninguna normativa (DA-3 aprobada) | La ocupación depende de la duración vigente del médico (cruces o huecos si cambia), y la #6 no es posible |
| 3 | `appointment.legal_acceptance_id uuid` FK `user_legal_acceptance(id)`, inmutable en el guard | CC-1, opción C (AP-19): saber qué aceptación legal tenía el paciente al reservar, sin copiar datos de M02 | C-32. Técnica: un lector exportado por M02 (requiere tu autorización para modificar M02) | La trazabilidad legal queda en una derivación por fechas y en la metadata de auditoría; con el régimen anterior es frágil |
| 4 | `cancellation_policy.max_protected_wait_minutes integer`, CHECK `>= doctor_wait_minutes` (y CHECK `patient_tolerance_minutes <= doctor_wait_minutes`, si se aprueba) | CC-2: el límite `L` configurable desde RF-16 | C-26 y el valor de L | El límite quedaría fijo en el código, contra RF-16 y RN-021; o no habría límite |
| 5 | Triggers de solo inserción en `cancellation_policy` y en `consultation_price_configuration` (solo se permite fijar `effective_until` una vez, de nulo a un valor) e índice único parcial `WHERE effective_until IS NULL` en cada una | Integridad histórica (AP-2, AP-3, RN-021) | Ninguna | Las versiones aplicadas a citas y pagos se podrían editar o borrar; podrían quedar dos versiones abiertas a la vez |
| 6 | Opcional: extensión `btree_gist` y `EXCLUDE (doctor_id WITH =, tstzrange(scheduled_at, agenda_block_ends_at) WITH &&) WHERE status = 'confirmed'` | Defensa en profundidad contra reservas dobles confirmadas | #2; que la extensión esté disponible en Neon (por verificar) | La protección se queda en los candados de DA-2 (suficiente con un solo backend; sin red de seguridad en la base de datos) |

Fuera de M-1, la migración de videoconsulta añadiría el tipo de evento `left_voluntarily` (A.9.2).

### A.10.5 Estado de la implementación

**Sin cambios de código en esta ronda.** El primer mensaje autorizaba empezar las partes que no dependen de M-1. La
aclaración posterior pidió expresamente no modificar código todavía, y prevalece por ser la instrucción más reciente. La
lista de partes que no dependen de M-1 sigue siendo la de A.9.8, ajustada así:
- la ocupación usa `occupancyOf` con la fórmula O1 transitoria;
- no se implementa el reagendamiento ni la referencia legal.


## A.11 Cierre: parámetros, momentos de determinación y M-1 detallada

### A.11.1 Configuración inicial versionada (AP-22)

Los valores **no son constantes del código**: se cargan como la primera versión de `cancellation_policy` (RF-16,
RN-021), las cambia el administrador creando versiones nuevas y cada cita usa la versión aplicada al reservar.

| Parámetro | Columna | Valor inicial | ¿Existe la columna? |
|---|---|---|---|
| Plazo de anticipación (reembolso y reagendamiento, DA-8) | `refund_deadline_hours` | 24 | Sí |
| Máximo de reagendamientos | `max_reschedules` | 2 | Sí |
| Ventana del médico `W` | `doctor_wait_minutes` | 30 | Sí |
| Tolerancia del paciente `Tol` | `patient_tolerance_minutes` | 15 | Sí |
| Límite total de espera protegida `L` | `max_protected_wait_minutes` | 60 | **No** (M-1 #4) |
| Gracia de reconexión `G` | `reconnect_grace_minutes` | 5 | **No** (M-1 #4) |

Notas:
- **24 h y 2 reagendamientos** salen del Maestro (RN-016, RN-017, RN-019). W, Tol, L y G los fijó AP-22.
- **El código no tiene valores por omisión.** Si falta una versión vigente, la reserva responde 422. Las únicas constantes
  del código son los rangos de validación del formulario del administrador.
- **Validaciones de cada versión**: `Tol <= W <= L`, `G < Tol` y todos los valores mayores que cero.
- **Si `policy:seed` se ejecuta antes de M-1**, la versión solo tiene cuatro columnas. M-1 #4 añade `L` y `G` con
  `DEFAULT 60` y `DEFAULT 5`, lo que rellena la versión existente. Esto ocurre **antes** de crear el trigger de solo
  inserción (#5) en la misma migración, así que es la única escritura sobre una versión ya creada.

### A.11.2 Cálculo de la ventana del médico sin duplicarla (AP-24, E7)

Regla adoptada: la **fórmula T1**, `D = min(max(T0, F) + W, T0 + L)`.
- Sin consulta previa, `D = T0 + W`: es RN-025 sin cambios.
- Con consulta previa, la ventana ordinaria empieza a contar cuando el médico queda libre (`F`), pero el plazo nunca
  pasa de `T0 + L`.
- **No hay duplicación**: la espera protegida y la ventana ordinaria no se suman. El tope es absoluto desde `T0`. La
  fórmula T2 (`min(F, T0 + L) + W`), que sí podía sumarlas hasta `L + W`, se descarta.
- **Al alcanzar `T0 + L`** sin que el médico haya admitido al paciente, y con el paciente disponible, la cita queda
  `no_show_doctor`, con reembolso del 100 % y sin importe liquidable (RN-025, RN-062). Da igual que el médico siga
  atendiendo otra consulta.

### A.11.3 Momentos de determinación de inasistencia (para decidir E14)

Reglas del Maestro que se aplican:
- **RN-025**: si vence la ventana del médico con el paciente disponible y sin inicio, `no_show_doctor`.
- **RN-026**: la tolerancia del paciente se cuenta desde `T0`. Si el paciente no se conecta y el médico sí,
  `no_show_patient`. Si el médico ya está conectado al vencer la tolerancia, se determina de inmediato.
- **RN-030**: `no_show_both` solo después de que venzan las dos ventanas. Si vence la tolerancia y el médico no se ha
  conectado ni ha superado su ventana, todavía no se determina.
- **RN-032 y RN-033**: el paciente que se conectó y se retiró.

**Lo que el Maestro no define:** el estado del paciente que se conecta **después** de su tolerancia sin que nada se haya
determinado todavía.

Hay dos lecturas posibles de «paciente disponible» en RN-025:
- **(a) Estricta**: solo cuenta la conexión dentro de `[T0 − 15, T0 + Tol]`.
- **(b) Amplia**: también cuenta estar conectado cuando vence la ventana del médico.

Parámetros: W = 30, Tol = 15, sin consulta previa (`D = T0 + 30`). «Determina en» es el instante en que videoconsulta
registra el resultado mediante `markNoShow`.

| # | Paciente | Médico | Determina en | Resultado | Regla | ¿Lo resuelve el Maestro? |
|---|---|---|---|---|---|---|
| N1 | Nunca se conecta | Se conecta en T0+5 | T0+15 | `no_show_patient` | RN-026 (médico conectado al vencer la tolerancia: inmediato) | Sí |
| N2 | Nunca se conecta | Se conecta en T0+20 (dentro de W) | T0+20, al conectarse el médico | `no_show_patient` | RN-026 (no se conectó y el médico sí); RN-030 (no se determina en T0+15 porque el médico aún no estaba) | Sí |
| N3 | Nunca se conecta | Nunca se conecta | T0+30 | `no_show_both` | RN-030 | Sí |
| N4 | Nunca se conecta | Se conecta en T0+40 (fuera de W) | T0+30 | `no_show_both`; la conexión posterior del médico no lo cambia | RN-030 | Sí |
| N5 | A tiempo (T0+5) | Nunca se conecta | T0+30 | `no_show_doctor` | RN-025 | Sí |
| N6 | A tiempo (T0+5) | Se conecta en T0+40 (fuera de W) | T0+30 | `no_show_doctor`; la llegada tardía no lo revierte (solo la corrección administrativa, RN-027) | RN-025, RN-027 | Sí |
| N7 | Tarde, en T0+20 | A tiempo (T0+5) | T0+15 | `no_show_patient`, determinado antes de que llegue el paciente | RN-026 (inmediato) | Sí. Que el médico pueda atenderlo de todos modos **no está previsto** |
| N8 | **Tarde (T0+20), antes de que venza W** | Se conecta en T0+25 (dentro de W) | — | (a) `no_show_patient` en T0+25, porque el paciente está fuera de su tolerancia; (b) **consulta normal**, porque los dos están presentes y nada se había determinado | RN-030 impide determinar en T0+15; después, el Maestro no lo dice | **No**: requiere decisión |
| N9 | Tarde, en T0+20 | Nunca se conecta | T0+30 | (a) `no_show_both`; (b) `no_show_doctor` | RN-025 frente a RN-030 | **No** (este es el E14) |
| N10 | Tarde, en T0+20 (fuera de Tol) | Se conecta en T0+40 (fuera de W) | T0+30 | (a) `no_show_both`; (b) `no_show_doctor` | Igual que N9 | **No** |
| N11 | Tarde, en T0+35 (después de W) | Nunca se conecta | T0+30 | `no_show_both`: en T0+30 el paciente nunca se había conectado | RN-030 | Sí |
| N12 | A tiempo; sale voluntariamente en T0+10 | Nunca se conecta | T0+30 | `no_show_doctor` | RN-032 | Sí |
| N13 | A tiempo; sale en T0+10 y no vuelve | Se conecta en T0+20 | T0+50 (fin de la ventana del médico, contada desde que llega) | `no_show_patient` | RN-033 | Sí |

**Con espera protegida** (el médico está ocupado hasta `F`): se aplica la misma tabla, sustituyendo `T0 + 30` por `D`
(A.11.2). Durante `[T0, F)` el médico no cuenta como «conectado a esta cita», así que N1 se convierte en N2: se determina
cuando el médico entra.

**Recomendación** (no registrada como decisión): la lectura **(a)** en N9 y N10, porque la tolerancia es justamente el
criterio de puntualidad del paciente; y la lectura **(b)** en N8, porque si los dos están presentes antes de que se
determine nada, impedir la consulta perjudica a ambos sin que una regla lo exija.

**Una advertencia sobre esa combinación:** (a) en N9 junto con (b) en N8 significa que el resultado de un paciente que
llega tarde depende de si el médico llega. Es coherente con RN-030 (la tolerancia vencida «aún no se determina» mientras
el médico no llega), pero hay que registrarlo de forma explícita en C-26.

### A.11.4 M-1 en detalle (no autorizada)

**Antes de ejecutarla hay que hacer cuatro comprobaciones de solo lectura, que no se han hecho porque requieren conexión
a Neon:**
- cuántas filas tiene `appointment`;
- si `cancellation_policy` tiene versiones abiertas duplicadas;
- si `consultation_price_configuration` tiene versiones abiertas duplicadas;
- si la extensión `btree_gist` está disponible.

**Cambios indispensables:**

| # | Tabla y columna | Operación | Motivo funcional | Dependencias | Compatibilidad con datos existentes | Riesgo de reversión | Obligatorio |
|---|---|---|---|---|---|---|---|
| 1a | `appointment_status_enum` | `ALTER TYPE … ADD VALUE 'rescheduled'` (migración aparte: el valor no se puede usar en la misma transacción) | Cerrar la cita original al reagendar (CC-3, RN-018) | C-25 | Compatible: no toca filas | **Alto**: PostgreSQL no permite quitar un valor de un enum; revertirlo exige recrear el tipo, y no se puede si ya hay filas `rescheduled` | Sí (para el reagendamiento) |
| 1b | Función `gst_appointment_guard`, trigger `appointment_guard` | `CREATE OR REPLACE FUNCTION`: solo `confirmed → rescheduled`; `rescheduled` es terminal; `agenda_block_ends_at` y `legal_acceptance_id` no cambian | Integridad de estados y de las copias | 1a, 2, 3 | Compatible | Bajo: se restaura la función anterior | Sí |
| 1c | Función `gst_appointment_lock_entries` | `CREATE OR REPLACE`: incluir `rescheduled` en los estados de cierre | Cerrar las entradas clínicas de la cita original | 1a | Compatible | Bajo | Sí |
| 2 | `appointment.agenda_block_ends_at` (`timestamptz`) | `ADD COLUMN` + `CHECK (agenda_block_ends_at > scheduled_at)` | Ocupación estable de la agenda (DA-3); independiente de `meeting.ended_at` | DA-3 (aprobada) | Si hay 0 filas, `NOT NULL`. Si hay filas: admitir nulos y exigirlo en el `INSERT` mediante el trigger, o rellenarlo con `scheduled_at` + la duración vigente (aproximado) | Bajo (`DROP COLUMN`), pero se pierden los fines guardados | Sí |
| 3 | `appointment.legal_acceptance_id` (`uuid`, FK a `user_legal_acceptance.id`) | `ADD COLUMN` + FK + índice | Referencia a la aceptación legal al reservar (CC-1 C2) | C-32 y **la autorización de M02 (pendiente)** | Si hay 0 filas, `NOT NULL`; si no, admite nulos (las citas anteriores no tienen referencia) | Bajo (`DROP COLUMN`), con pérdida de la trazabilidad guardada | Sí, **condicionado** a la aprobación de M02. Sin ella, se saca de M-1 |
| 4 | `cancellation_policy.max_protected_wait_minutes` y `reconnect_grace_minutes` (`integer`) | `ADD COLUMN … NOT NULL DEFAULT 60` y `DEFAULT 5`; después `DROP DEFAULT`; `CHECK`: `patient_tolerance_minutes <= doctor_wait_minutes <= max_protected_wait_minutes`, `reconnect_grace_minutes < patient_tolerance_minutes`, todos `> 0` | L y G configurables y versionados (AP-22, RF-16) | C-26 | Las versiones existentes se rellenan con 60 y 5; el `CHECK` falla si una versión existente no cumple el orden (hay que comprobarlo antes) | Bajo | Sí |
| 5a | `cancellation_policy` | Trigger de solo inserción: prohíbe `DELETE`, `TRUNCATE` y `UPDATE`, salvo fijar `effective_until` de nulo a un valor una sola vez | Integridad histórica (RN-021) | Después de 4 | Compatible | Bajo (`DROP TRIGGER`) | Sí |
| 5b | `consultation_price_configuration` | El mismo trigger | Integridad histórica del precio (AP-2) | — | Compatible | Bajo | Sí |
| 5c | Las dos tablas | `CREATE UNIQUE INDEX … WHERE effective_until IS NULL` | Una sola versión abierta (P-1) | — | Falla si ya hay dos abiertas (hay que comprobarlo antes) | Bajo (`DROP INDEX`) | Sí |

**Cambio opcional:**

| # | Tabla y columna | Operación | Motivo | Dependencias | Compatibilidad | Riesgo de reversión | Obligatorio |
|---|---|---|---|---|---|---|---|
| 6 | `appointment` (`doctor_id`, `scheduled_at`, `agenda_block_ends_at`) | `CREATE EXTENSION btree_gist` + `EXCLUDE USING gist (doctor_id WITH =, tstzrange(scheduled_at, agenda_block_ends_at) WITH &&) WHERE (status = 'confirmed')` | Defensa en profundidad contra la reserva doble confirmada; los candados de DA-2 siguen siendo la protección principal | 2 (`NOT NULL`, o se excluyen los nulos); `btree_gist` disponible en Neon | Falla si ya hay citas confirmadas que se cruzan | Bajo (`DROP CONSTRAINT`) | **Opcional** |

**Fuera de M-1**: el tipo de evento `left_voluntarily` en `meeting_session_event_type_enum` pertenece a la migración de
videoconsulta.

### A.11.5 Bloqueos reales para empezar la implementación

| Bloqueo | Qué bloquea |
|---|---|
| E14 (N8, N9, N10) sin decidir | Solo la lógica de inasistencias de videoconsulta. **No bloquea M08** |
| M-1 sin autorizar | El reagendamiento; guardar `agenda_block_ends_at` (se usa O1 transitoria); L y G en la política; la integridad de las versiones en la base de datos |
| La modificación de M02 sin aprobar | La referencia legal en la cita (M-1 #3) |
| C-23 a C-32 sin registrar en el Maestro | La conformidad documental antes de cerrar M08 |
| Las comprobaciones de A.11.4 | Ejecutar M-1, no diseñarla |
| La autorización expresa para escribir código | Todo lo demás. El diseño de las partes que no dependen de M-1 está cerrado (A.9.8, A.10.5) |


## A.12 Etapa de implementación sin M-1 (2026-11-07)

### A.12.1 Escenarios N8, N9 y N10 (AP-25)

Se incorporan a C-26 (Maestro vivo, RN-030):
- **N9 y N10**: `no_show_both`, solo cuando se cumplen las condiciones de ambas ventanas.
- **N8**: consulta normal si el médico se conecta dentro de su ventana y los dos están presentes.

No se declara una inasistencia definitiva mientras las reglas de ambas ventanas no lo permitan. La lógica corresponde a
videoconsulta; M08 solo expone `markNoShow`.

### A.12.2 Consultas de solo lectura en Neon (autorizadas)

Se ejecutaron el 2026-11-07 sobre la rama del `.env`: `br-royal-recipe-b54s5hnn`, que es **producción**. La transacción
fue `READ ONLY` (`transaction_read_only = on`) y terminó con `ROLLBACK`; no hubo escrituras.

| # | Consulta | Resultado |
|---|---|---|
| 1 | Citas existentes (`appointment`) | **0** filas |
| 2 | Versiones de `cancellation_policy` (total / abiertas) | **0 / 0**: no hay duplicados; tampoco existe ninguna versión |
| 3 | Versiones de `consultation_price_configuration` (total / abiertas) | **0 / 0** |
| 4 | `btree_gist` | Disponible (versión 1.8), **no instalada** |

La rama C2 no se consultó.

### A.12.3 M-1: consumidores del enum, compatibilidad, reversión y recuperación

**Consumidores de `appointment_status_enum`** (búsqueda en `src`, `test`, migraciones y web):

| Consumidor | Uso | Impacto de `rescheduled` |
|---|---|---|
| `db/schema/enums.ts`, `db/schema/appointment.ts` (`appointment.status`, `appointment_status_history.status`) | Definición y columnas | Añadir el valor al enum de Drizzle |
| `0001_triggers.sql` `gst_appointment_guard` | Reglas de transición | Permitir `confirmed → rescheduled`; tratarlo como terminal |
| `0001_triggers.sql` `gst_appointment_lock_entries` | Cierra las entradas clínicas en estados finales | Incluir `rescheduled` |
| `modules/appointments/domain/appointment-status.ts` (M08) | Transiciones de la aplicación | Añadir el estado y la transición. RT-M08-06 impide usarlo antes de M-1 |
| `db/schema/analytics.ts` | Comentario: el objetivo del modelo es `no_show_patient` | Ninguno; la analítica futura debe excluir `rescheduled` de las cancelaciones |
| Web y móvil | **Ningún** uso de estados de cita | Ninguno |
| Módulos de pagos, videoconsulta, notificaciones y payouts | No existen | Su diseño debe contemplar `rescheduled` (sin reembolso ni cobro, RN-018) |

**Compatibilidad con los datos existentes** (A.12.2): hay 0 citas y 0 versiones en producción, así que todas las
columnas nuevas pueden nacer `NOT NULL` y los índices únicos parciales no encuentran conflictos. Hay que repetir la
comprobación justo antes de ejecutar M-1 y en la rama C2.

**Separación de cambios:**

| Tipo | Cambios |
|---|---|
| Obligatorios | 1a, 1b, 1c (`rescheduled`); 2 (`agenda_block_ends_at`); 4 (L y G); 5a, 5b, 5c (integridad de las versiones) |
| Obligatorio condicionado | 3 (`legal_acceptance_id`): requiere la aprobación del cambio de M02 (A.12.4). Sin ella, se saca de M-1 |
| Opcional, **excluido de esta etapa** | 6 (`btree_gist` + `EXCLUDE`) |

**Riesgo de reversión y estrategia de recuperación:**

| Cambio | Riesgo | Recuperación propuesta |
|---|---|---|
| 1a `ADD VALUE 'rescheduled'` | **Alto**: PostgreSQL no permite eliminar un valor de un enum | (1) Va en un archivo de migración propio, el primero. (2) Antes de usarlo, M-1 se prueba completa en C2. (3) Para revertir sin filas `rescheduled`: crear `appointment_status_enum_v2` sin el valor, `ALTER COLUMN … TYPE … USING status::text::…` en las dos columnas, renombrar y borrar el anterior; el script de reversión se escribe y se prueba en C2 junto con M-1. (4) Con filas `rescheduled` no se revierte: se corrige hacia adelante |
| 1b, 1c funciones | Bajo | El script de reversión restaura el texto anterior de las funciones (copiado de 0001) |
| 2, 3, 4 columnas | Bajo; se pierden los datos de esas columnas | `DROP COLUMN`; antes, exportar los valores si ya hubiera citas |
| 5 triggers e índices | Bajo | `DROP TRIGGER` / `DROP INDEX` |
| General | Una migración aplicada a medias | Cada archivo va en una transacción (salvo 1a, por la regla del enum). Respaldo: crear una rama de Neon desde producción justo antes (requiere autorización), que sirve de punto de restauración |

### A.12.4 Revisión de impacto del cambio en M02 (sin implementar)

| Pregunta | Respuesta |
|---|---|
| Qué se exporta | Un puerto nuevo de solo lectura en M02: `BOOKING_LEGAL_ACCEPTANCE_READER` con `currentFor(userProfileId): Promise<{ acceptanceId: string; legalDocumentId: string; type: 'patient_terms' \| 'terms_and_conditions' } \| null>`. Devuelve la fila de `user_legal_acceptance` que satisface el régimen legal vigente del paciente (`resolveLegalRegime`), con su implementación Drizzle en `identity/infrastructure` |
| Quién lo consume | Solo M08: `HoldSlotUseCase`, dentro de su transacción, después de `CanBookAppointmentsPolicy`, para guardar `appointment.legal_acceptance_id` |
| Aislamiento | M08 importa solo el puerto (y `IdentityModule`, que lo exporta). No lee tablas de consentimiento. RT-M08-01 amplía su lista permitida con ese archivo y nada más. M02 no conoce a M08 (RT-M08-02 lo comprueba) |
| Pruebas | En M02: pruebas unitarias del lector con `InMemoryIdentityStore` (método nuevo) y una prueba de integración en C2 (régimen actual y régimen anterior). En M08: la cita guarda la referencia y el reagendamiento la copia |
| Contratos existentes | **Ninguno cambia**: `CanBookAppointmentsPolicy`, `RegistrationStatusReader` y los endpoints de M02 quedan igual. Es un cambio aditivo (un puerto, un adaptador, un export y un método del doble de pruebas) |
| Riesgo | Bajo: solo lectura. El caso límite es una aceptación revocada por una versión nueva publicada entre la política y la lectura; dentro de la misma transacción se ven datos coherentes, y si no hay aceptación válida, la reserva se rechaza |

### A.12.5 Lo implementado en esta etapa (sin commit)

Se implementó todo lo que no depende de M-1:
- el dominio;
- el precio global y su panel;
- la política versionada;
- la retención y su vencimiento;
- las cancelaciones;
- el listado de médicos;
- los contratos con pagos y videoconsulta;
- la bandera `APPOINTMENTS_BOOKING_ENABLED` (desactivada si falta).

Quedó fuera lo que depende de M-1: el reagendamiento, `agenda_block_ends_at` (se usa O1 transitoria, encapsulada en
`occupancyOf`), la referencia legal y las restricciones de base de datos.

**Ninguna ruta confirma citas** (RT-M08-04, TC-M08-105). La carga inicial (`pnpm appointments:seed-config`) es por
omisión una simulación; **no se ejecutó**.

---

# Parte B: diseño v2 (se conserva; la parte A prevalece)

Secciones sustituidas por la parte A:
- **§3**: los estados de DA → A.3.
- **§7**: el modelo de «parámetros derivados de los Términos» → A.2 CC-1, opción A.
- **§10**: el contrato de `confirmPaid` → A.2 CC-4.
- **§13**: los CC → A.2.
- **§14**: la pantalla de precio se define en A.8 (AP-2); se restituye la pantalla de administración de la política
  conforme a RF-16, si se aprueba CC-1 en la opción A.

Nota sobre la numeración: el Maestro no numera los módulos posteriores a M03 (§ arquitectura: common, audit, identity,
private-storage, doctors). «M08», «M09 Pagos», «Videoconsulta» y «Notificaciones» son nombres de trabajo de este diseño, no
identificadores del Maestro. Los requisitos sí se citan con su número del Maestro.

## 1. Alcance y límites

| Dentro de M08 | Fuera de M08 (a cargo de) |
|---|---|
| RF-12: reservar, reagendar y cancelar (paciente); cancelación por el médico (RF-15, RN-013) | RF-13 pago, PaymentIntent y webhooks (módulo de pagos, «M09») |
| RF-14: retención de 5 min (`pending_payment`) y vencimiento a `expired` | RF-46 reembolsos: M08 solo **determina** el resultado (reembolso total o ninguno) |
| RF-15: reglas de cancelación y reagendamiento aplicadas a cada cita | RF-18 a RF-22: videoconsulta, sala de espera, ventanas, inasistencias (módulo de videoconsulta) |
| Lectura del precio global vigente y su copia en la cita (RN-007) | RF-51: notificaciones (módulo de notificaciones) |
| RF-16: **por definir** (ver DA-10 y CC-1) | RF-17: cita de emergencia |
| Contratos y eventos hacia pagos, videoconsulta y notificaciones | Cancelación administrativa (RN-014): ver DX-2 |

## 2. Dependencias

**Hacia atrás (solo se consumen; M00 a M07 no se modifican):**

| Módulo | Qué usa M08 | Qué no hace |
|---|---|---|
| M00 common | `UNIT_OF_WORK`, `CLOCK`, `DomainExceptionFilter`, contexto de transacción | — |
| M01 audit | `AUDIT_TRAIL` dentro de la transacción | — |
| M02 identity | `CanBookAppointmentsPolicy.assertCanBookAppointments`: registro completo, identidad aprobada y legales vigentes del paciente (RN-140) | No vuelve a implementar la comprobación legal |
| M03 doctors | `DoctorOperationalPolicy.assertCanOperate(doctorProfileId)` | No duplica la lógica de habilitación |
| M07 agenda | `AgendaService.generateSlots(doctorProfileId, from, to)` | No sustituye `BUSY_INTERVALS_PROVIDER` ni toca `AgendaModule` (DA-5) |

**Hacia adelante (consumen contratos de M08; ninguno se importa desde M08):** pagos, videoconsulta, notificaciones y
analítica (RF-64 y el historial de reagendamientos de la sección 3.x del Maestro). La dirección es única: los módulos
posteriores importan `AppointmentsModule` o escuchan sus eventos. M08 no importa a ninguno (prueba de arquitectura).

## 3. Decisiones DA-1 a DA-12 (revisadas)

Leyenda de estado: **Se mantiene** · **Se modifica** · **Pendiente de aprobación** · **Requiere aclaración**. Ninguna
está aprobada todavía. «Se mantiene» quiere decir que la propuesta original no cambia.

### DA-1 Confirmación solo con pago · Se mantiene (pendiente de aprobación)
- **Propone**: la reserva crea `pending_payment` con `payment_hold_expires_at = now + 5 min`. La confirmación entra por un
  puerto interno, `AppointmentConfirmationPort.confirmPaid`, que llama el módulo de pagos. No hay endpoint HTTP ni pago
  simulado en producción.
- **Maestro**: es consistente con RF-13, RN-008, RN-011 y RN-012, y con el trigger `appointment_guard`
  (`pending_payment → confirmed | expired`; `expired` es terminal).
- **Aclaraciones nuevas**:
  1. *La retención durante el pago*: el horario lo ocupa la cita mientras `pending_payment` y `hold > now` (DA-9). Pagos
     crea su PaymentIntent después de la retención, con `amount = appointment.price`.
  2. *Al vencer*: `expired`. Si llega un pago exitoso tarde, `confirmPaid` responde `HoldExpired`, porque el trigger impide
     `expired → confirmed`, y pagos deberá reembolsar (CC-4: el Maestro no define este caso).
  3. *Mientras pagos no exista*: ninguna cita real llega a `confirmed`, y una reserva solo crearía retenciones que vencen.
     Recomiendo que `POST /me/patient/appointments` esté **desactivado en producción** (bandera de configuración
     `APPOINTMENTS_BOOKING_ENABLED=false`) hasta desplegar pagos, o desplegar M08 y pagos juntos.
  4. *Pruebas sin pagos reales*: las citas `confirmed` se crean con fixtures (pruebas de integración con `withRollback` en
     la base de datos de pruebas, sin escribir en producción) y, en E2E con dobles, con un `FakeConfirmationCaller` que solo
     existe en `test/`. Una prueba de arquitectura impide que algo bajo `test/` se registre en un módulo de `src/`.
- **Decisión que necesito**: aprobar el puerto interno y la opción de despliegue del punto 3 (bandera o despliegue conjunto).

### DA-2 Prevención de reservas dobles sin migración · Se mantiene, con el orden de candados precisado
- **Propone**: candado del médico con `FOR UPDATE` y nueva comprobación de cruces dentro de la transacción.
- **Maestro y M07**: es consistente con M07 §7, que toma el mismo `doctor_profile FOR UPDATE` y después la política con
  `FOR SHARE`, compatible dentro de la misma transacción. Así, reservas y cambios de agenda del mismo médico se serializan.
- **Orden único para todas las escrituras de M08**:
  1. `doctor_profile FOR UPDATE`;
  2. `patient_profile FOR UPDATE`;
  3. `appointment FOR UPDATE` (las filas afectadas);
  4. las políticas (`DoctorOperationalPolicy` con `FOR SHARE` sobre el perfil ya bloqueado; `CanBookAppointmentsPolicy`
     solo lee);
  5. el cambio;
  6. el historial;
  7. la auditoría.
  Ningún módulo existente bloquea primero al paciente y después al médico (M02 solo bloquea al paciente), así que no hay
  ciclo de bloqueo.
- **Decisión**: aprobar este orden.

### DA-3 Fin de la cita = `scheduled_at` + duración vigente · Pendiente de aprobación (riesgo aceptado)
- **Maestro**: RN-022 dice que la duración es aproximada y no corta la consulta; es consistente.
- **Problema**: no hay columna para el fin de la cita. Si el médico cambia su duración, las citas existentes cambian su
  intervalo calculado, y puede aparecer un cruce con un horario nuevo. No afecta al estado de la cita.
- **Recomendación**: aceptar la aproximación ahora y añadir `agenda_block_ends_at` con DA-11 (corregido en A.10: no es `ends_at` ni el fin real de la consulta). **Decisión**: aceptar el riesgo.

### DA-4 Cambios de agenda no afectan citas confirmadas · Se mantiene y se amplía
- **Propone**: las citas confirmadas no se mueven ni se cancelan cuando cambian el horario, la duración o las ausencias.
- **Ampliación (acuerdo 2.3)**: tampoco cambia el estado de una cita cuando llega su hora. M08 **no tiene ninguna
  transición automática** desde `confirmed`. Todas las salidas de `confirmed` son explícitas:
  - paciente → `canceled`;
  - médico → `canceled`;
  - reagendamiento → `canceled` con la marca de reagendamiento (DA-6);
  - videoconsulta → `completed` o `no_show_*`.
  El retraso del médico no hace que la cita expire ni se cancele en M08.
- **Contradicción con el Maestro (CC-2)**: RN-025 y RF-20 dicen que, si vence la ventana de espera del médico «sin
  inicio», la cita queda `no_show_doctor`. Si el médico sigue en la consulta anterior más allá de esa ventana, el Maestro
  produce `no_show_doctor`, y el acuerdo 2.3 dice que el paciente sigue esperando. No lo resuelvo yo: hace falta aclarar si
  la ventana se suspende mientras el médico está en una consulta en curso.
- **Decisión**: aprobar «sin transiciones automáticas en M08» y resolver CC-2.

### DA-5 M08 filtra los horarios ocupados sin tocar M07 · Se mantiene
- **Propone**: `AgendaService.generateSlots` y luego un filtro puro `excludeBusy(slots, intervalosOcupados)` en M08.
- **Consistencia**: no modifica M07 ni crea una dependencia circular (M08 → M07, nunca al revés). El generador de M07 sigue
  recibiendo `NoBusyIntervalsProvider`, que es correcto para la vista previa del médico.
- **Nota**: la vista previa del médico en M07 seguirá mostrando como libres horarios ya reservados. Es un aviso, no un
  error. Se corregiría en una futura modificación de M07 con autorización expresa.

### DA-6 Reagendamiento y continuidad del pago · Se modifica
- **Proponía**: la original pasa a `canceled` («rescheduled»), la nueva nace `confirmed` y «el pago se transfiere».
- **Problemas detectados**:
  1. «Transferir el pago» no estaba definido. `payment.appointment_id` **no es único** (solo tiene índice) y `refund`
     apunta a `payment_id`. Reasignar `payment.appointment_id` a la cita nueva borraría la relación histórica.
  2. Maestro 6.1 define `canceled` como «cita confirmada y después cancelada por paciente, médico o plataforma». Usarlo
     para cerrar una cita reagendada fuerza su significado, y pagos o analítica podrían leerlo como una cancelación con
     reembolso. Es una contradicción semántica (CC-3).
  3. Para RN-018 no puede haber cobro nuevo ni reembolso, y un pago no puede confirmar dos citas.
- **Propuesta modificada**:
  - *El pago no se mueve.* El `payment` queda ligado a la **cita raíz** de la cadena (la primera, la única que pasó por
    `pending_payment → confirmed`). «Transferir» significa que pagos resuelve el pago de cualquier cita como el pago de su
    raíz: `rootOf(appointmentId)` recorre `rescheduled_from_appointment_id`.
  - *Un pago confirma una sola cita*: `confirmPaid` solo acepta citas `pending_payment`. La cita reagendada nace
    `confirmed` en la transacción de reagendamiento, **sin** llamar a pagos. Un mismo pago solo puede confirmar una vez,
    porque la cita raíz ya no está `pending_payment`.
  - *Trazabilidad*: `rescheduled_from_appointment_id` en la nueva; mismo `price` y `cancellation_policy_id` (el trigger
    impide cambiarlo, y RN-018 pide conservar las condiciones originales); historial y auditoría
    `appointment.rescheduled {fromId, toId, rootId, n}`.
  - *Concurrencia*: candado `FOR UPDATE` de la cita original. Dos reagendamientos simultáneos de la misma cita: el
    segundo encuentra la cita ya cerrada y recibe 409.
  - *Estado de la original*: dos opciones. **(a)** `canceled` con `cancellation_reason = 'rescheduled'` y un contrato
    explícito `isRescheduleClosure(cita)` que pagos y analítica deben usar (no requiere migración). **(b)** un nuevo
    estado `rescheduled` (migración del enum y del trigger, y cambio de 6.1 mediante CC-3). Recomiendo **(b)** como
    destino y **(a)** solo si M08 tiene que implementarse antes de esa migración.
- **Contrato que necesita pagos**: `PaymentLedgerPort.paymentForAppointment(id)`, que pagos implementa resolviendo la raíz.
  El reembolso de una cita reagendada y luego cancelada se hace sobre el pago de la raíz (RF-46: el acumulado no supera el
  monto).
- **Decisión**: elegir (a) o (b) y aprobar «el pago queda en la raíz».

### DA-7 Contador de reagendamientos calculado por la cadena · Se mantiene
- Es consistente con RN-017 («el contador se hereda»). El tope sale de la política aplicada a la cita (DA-10).

### DA-8 Un plazo único para reembolso y reagendamiento · Se modifica (depende de DA-10)
- **Proponía**: usar `refund_deadline_hours` para ambos.
- **Cambio**: el plazo no lo fija M08: sale de las condiciones de los Términos y Condiciones aplicadas a la cita
  (sección 7). Los RN-016 y RN-019 coinciden en 24 h, así que un solo parámetro sigue siendo suficiente. Si los Términos
  llegaran a fijar plazos distintos, haría falta un segundo parámetro (migración).
- **Decisión**: confirmar que los Términos usan el mismo plazo para cancelar con reembolso y para reagendar.

### DA-9 Vencimiento de la retención · Se mantiene y se aclara
Hay tres situaciones distintas que no deben confundirse:

| Situación | Estado | Quién actúa | Efecto |
|---|---|---|---|
| Retención sin pago que vence | `pending_payment` → `expired` | M08 (vencimiento perezoso: en la siguiente reserva del médico, o cuando el paciente libera; barrido programado opcional en el futuro) | El horario queda libre; terminal |
| Cita confirmada cuya hora ya llegó | Sigue `confirmed` | Nadie en M08 | No vence ni se cancela |
| Paciente esperando porque el médico se retrasó | Sigue `confirmed`; la sala de espera vive en `meeting` | Videoconsulta (RF-19) | Ninguno en M08; las ventanas de RF-20 y RF-21 las evalúa videoconsulta (sujeto a CC-2) |

`payment_hold_expires_at` solo tiene significado en `pending_payment`, y M08 nunca lo usa para una cita confirmada.

### DA-10 Precio y condiciones de cancelación · Se modifica
- **Proponía**: leer el precio y una política configurable por el administrador; 422 si falta alguna.
- **Precio (acuerdo 2.1), consistente con RN-007**:
  - `consultation_price_configuration` (`price`, `currency`, `effective_from`, `effective_until`, `created_by`) es
    **global**: no tiene columnas de médico ni de especialidad, así que no hay discrepancia con la segmentación. El historial
    se conserva con las versiones.
  - `appointment.price` es la copia del precio al reservar; un cambio posterior no modifica las citas existentes. No hace
    falta nada más.
  - La tabla está marcada **[PROPUESTO]** en el esquema (requiere el visto bueno del líder técnico).
  - No tiene restricción contra vigencias solapadas: la publicación de una versión nueva debe cerrar la anterior en la
    misma transacción, con candado.
  - Configuración por el administrador: el Maestro solo dice «lo configura la plataforma» (RN-007), y el rol administrador
    incluye «precios» (§ actores); no hay un RF propio (CC-5).
  - Propuesta mínima: `GET` y `POST /admin/consultation-price/versions`, solo un precio vigente, `effective_from >= now`,
    y auditoría.
- **Política de cancelación (acuerdo 2.2)**: ver la sección 7. M08 **no ofrece** una pantalla de política de cancelación.
- **Contradicción importante (CC-1)**: el acuerdo 2.2 contradice el texto actual de **RF-16** y **RN-021**. Ambos dicen que
  el administrador configura y versiona el plazo, los reagendamientos y las ventanas.
- **Restricción técnica**: `appointment.cancellation_policy_id` es `NOT NULL`, de modo que cada cita necesita una fila de
  `cancellation_policy`, aunque nadie la edite desde una pantalla.
- **Decisión**: (i) aprobar el diseño del precio, incluido sacar la tabla de [PROPUESTO] y dónde vive su pantalla;
  (ii) aprobar CC-1 y el modelo de la sección 7.

### DA-11 Endurecimiento futuro de la base de datos · Pendiente de aprobación (fuera de esta etapa)
- `agenda_block_ends_at` (corregido en A.10), `btree_gist` y una restricción `EXCLUDE` por médico sobre citas activas. Se agregarían el estado `rescheduled`
  (DA-6 b) y, si se aprueba, la referencia entre la política y los Términos (sección 7). No se hace ahora.
- **Problema adicional**: una restricción `EXCLUDE` con `WHERE status = 'pending_payment'` no puede tener en cuenta la hora
  de `hold > now()`. Las retenciones vencidas sin marcar seguirían bloqueando hasta que se marquen como `expired`, por lo
  que el vencimiento tendría que ser activo (barrido). Se decide en esa migración.

### DA-12 Listado de médicos reservables para el paciente · Requiere aclaración
- RF-12 presupone que el paciente elige un médico, pero ningún RF define cómo lo encuentra. D-36 lo excluyó de M03, no del
  producto.
- Propuesta mínima: `GET /doctors/bookable` con nombre, especialidad y médicos con `canOperate`; sin búsqueda pública ni
  perfil. Se registraría como aclaración de RF-12 (CC-6).
- **Decisión**: aprobar el listado mínimo y su registro.

## 4. Decisiones adicionales

### DX-1 Cancelación del médico sin `canOperate` · Pendiente de aprobación
- **Por qué**: RN-013 le garantiza al paciente un reembolso total cuando el médico no puede atender. Un médico que perdió
  `canOperate` (por falta de reaceptación legal, por estar en revisión o por suspensión) es precisamente quien puede tener
  citas que no podrá atender. Si no puede cancelarlas, el paciente queda con una cita que no se atenderá.
- **Implicación**: RN-140 dice que al médico no habilitado se le bloquean «las operaciones que requieren un médico
  habilitado». Habría que **interpretar** que cancelar no es una de ellas. Es una decisión sobre una regla normativa: hace
  falta tu aprobación y su registro (CC-7).
- **Recomendación**: permitirla solo para cancelar (no para reagendar), con motivo obligatorio y reembolso total, y
  auditar `doctorCanOperate=false`. Queda **pendiente fuera de M08**: qué pasa con las citas futuras de un médico
  suspendido (M03 o administración).

### DX-2 Cancelación administrativa · Fuera de M08; registrar el cambio de alcance
- **Comprobación**: sí tiene respaldo normativo: RN-014 (la plataforma cancela por causa operativa, con reembolso del
  100 %), Maestro 6.1 («por la plataforma por causa operativa»), RN-062 (sin importe liquidable cuando la plataforma
  cancela por causa operativa) y `refund_reason_enum.admin_cancellation`. Pero **ningún RF la asigna**: RF-12 tiene como actor al paciente
  y RF-15 al paciente y al médico.
- **Corrección respecto a la v1**: no es una función inventada, pero tampoco es alcance de M08. Se registra como CC-8. M08
  solo deja preparado `cancelledByType = 'admin'` en el contrato del dominio, sin endpoint.

## 5. Flujos

**Reserva y pago**

1. El paciente elige médico y horario.
2. `POST /me/patient/appointments` abre la transacción: candados (DA-2), `CanBookAppointmentsPolicy`, `assertCanOperate`,
   el horario ∈ `generateSlots` menos los ocupados, sin cruces (del médico y del paciente) y como máximo una retención
   vigente por paciente.
3. Se lee el precio vigente y la condición vigente (sección 7).
4. Se inserta la cita en `pending_payment` con `hold = now + 5 min`, junto con su historial y su auditoría.
5. Pagos crea el PaymentIntent.
6. Pago exitoso a tiempo → `confirmPaid` → `confirmed`, se emite `AppointmentConfirmed`.
7. Pago fallido o vencido → `expired` (por pagos o por el vencimiento perezoso), se emite `AppointmentExpired`.

**Cancelación del paciente**: solo desde `confirmed`.
`refundOutcome = horasRestantes >= plazo ? full_refund : no_refund`. La cita pasa a `canceled` y se emite
`AppointmentCanceled {actor, refundOutcome}`; pagos ejecuta el reembolso. Desde `pending_payment` no se cancela: el
paciente libera la retención → `expired`.

**Cancelación del médico**: desde `confirmed`, con motivo obligatorio y siempre `full_refund` (RN-013, DX-1).

**Reagendamiento**: desde `confirmed`, con al menos el plazo de anticipación y un contador por debajo del máximo. Mismo
médico y nuevo horario validado como en la reserva. La original se cierra (DA-6) y la nueva nace `confirmed` con el mismo
precio y la misma condición. Se emite `AppointmentRescheduled`. No hay cobro ni reembolso.

## 6. Precio global (resumen)

| Elemento | Dónde | Regla |
|---|---|---|
| Precio vigente | `consultation_price_configuration` (versiones con vigencia) | Uno solo para toda la plataforma |
| Precio aplicado | `appointment.price` (copia) | No cambia; el reagendamiento lo copia; pagos cobra `appointment.price` |
| Cambio de precio | Versión nueva, con auditoría | No afecta a las citas existentes |

## 7. Términos y Condiciones y condiciones de cancelación

**Lo que existe:**
- `legal_document` es de solo inserción y está versionado, con los tipos `patient_terms` y el anterior
  `terms_and_conditions`.
- `user_legal_acceptance` guarda qué versión aceptó el usuario, cuándo y desde qué IP y agente.
- M02 (`CanBookAppointmentsPolicy`) ya bloquea la reserva si el paciente no aceptó la versión vigente (RN-140, RF-04).

**Lo que falta:**
- Los Términos son texto. M08 necesita valores que una máquina pueda leer: el plazo, el número máximo de reagendamientos
  y, para videoconsulta, las ventanas.
- No existe ningún vínculo entre una versión de los Términos y esos valores.
- La cita guarda `cancellation_policy_id`, pero no qué versión de los Términos aceptó el paciente.

**Propuesta (sin una segunda configuración):**
1. `cancellation_policy` deja de ser una configuración del administrador y pasa a ser la **representación estructurada de
   las condiciones de una versión de los Términos**. Sus filas se crean solo al publicar una versión de `patient_terms`
   que cambie esas condiciones, mediante un procedimiento controlado (script, como `admin:bootstrap`). No hay pantalla en
   M08. Así hay una sola fuente: el texto legal, y su transcripción numérica, versionada con él.
2. **La trazabilidad de cada cita**:
   - `appointment.cancellation_policy_id` da las condiciones aplicadas.
   - La versión de los Términos aceptada se puede **derivar** sin migración, porque `user_legal_acceptance` es de solo
     inserción: es la versión de `patient_terms` (o de `terms_and_conditions` en el régimen anterior) que el paciente
     tenía aceptada en `appointment.created_at`. M02 garantiza que era la vigente.
   - Para no depender de esa derivación, M08 guarda en la auditoría de `appointment.hold.created` el `legal_document_id`
     de los Términos vigentes y el `cancellation_policy_id`. Son identificadores, no datos personales.
3. **Implicaciones y pendientes**:
   - Falta un vínculo formal entre la política y el documento legal (`cancellation_policy.legal_document_id`) y,
     opcionalmente, `appointment.legal_acceptance_id`. Las dos requieren migración (DA-11).
   - Mientras no exista ese vínculo, la coherencia entre el texto y los números depende del procedimiento de publicación.
     Es un riesgo (R-4).
   - `doctor_wait_minutes` y `patient_tolerance_minutes` están en la misma tabla. Si son condiciones de los Términos,
     encajan; si el administrador debe ajustarlas sin publicar Términos nuevos (RN-028 dice «configurables»), contradicen
     el acuerdo 2.2. Forma parte de CC-1.
   - El paciente que sigue en el régimen anterior (`terms_and_conditions`, RF-03) necesita también su fila de condiciones.

## 8. Integración futura: sala de espera, videoconsulta y notificaciones

**Requisitos que lo respaldan (comprobados en el Maestro V2.4):**
- **RF-19 «Sala de espera»** (Must, depende de RF-18): «Si el médico continúa en otra consulta, el siguiente paciente
  permanece en espera; se notifica al paciente y al médico».
- **RN-024**: el mismo comportamiento.
- **RF-18**: el médico controla la finalización de la consulta.
- **RF-20, RN-025, RN-026 y RN-028**: las ventanas.
- **RF-51**: notificaciones In-App y Push, con historial.
- El enum de notificaciones ya tiene `appointment_waiting`.

**Lo que no está formalizado:** que el médico **admita** explícitamente al paciente que espera, que la cita conserve su
estado aunque se supere la ventana del médico por estar en otra consulta (CC-2), y el mensaje concreto para el paciente.
Se propone en CC-9.

**Responsabilidades:**
- M07 sin cambios.
- M08 entrega la cita `confirmed`, inmutable ante el retraso (DA-4).
- Videoconsulta: `meeting`, sala de espera, admisión, `patient_joined_at` y `doctor_joined_at`, ventanas y `no_show_*`.
- Notificaciones: el aviso al médico y al paciente.

**Contratos que M08 deja definidos:**

| Contrato | Para | Contenido |
|---|---|---|
| `AppointmentQueryPort.getForSession(appointmentId)` | Videoconsulta | id, paciente, médico, `scheduledAt`, `status`, ventanas de la política aplicada |
| `AppointmentQueryPort.nextConfirmedForDoctor(doctorId, after)` | Videoconsulta | La siguiente cita, para avisar al médico de que hay alguien esperando |
| `AppointmentOutcomePort.markCompleted / markNoShow(id, tipo, actor)` | Videoconsulta | La única forma de salir de `confirmed` hacia `completed` o `no_show_*`; con historial y auditoría en M08 |
| Eventos `AppointmentConfirmed`, `Canceled`, `Rescheduled`, `Expired` | Notificaciones | Disparan `appointment_confirmed`, `_canceled`, `_rescheduled` |

`appointment_waiting` lo emite videoconsulta, no M08.

## 9. Estados y transiciones

| Desde | Hacia | Quién | Módulo |
|---|---|---|---|
| (nueva) | `pending_payment` | Paciente | M08 |
| `pending_payment` | `confirmed` | Sistema (pago exitoso) | M08, llamado por pagos |
| `pending_payment` | `expired` | Sistema (vencimiento o pago fallido) o paciente (libera) | M08 |
| (nueva por reagendamiento) | `confirmed` | Paciente | M08 |
| `confirmed` | `canceled` | Paciente o médico (admin: CC-8) | M08 |
| `confirmed` | `canceled` con marca de reagendamiento, o `rescheduled` (DA-6) | Paciente | M08 |
| `confirmed` | `completed`, `no_show_patient`, `no_show_doctor`, `no_show_both` | Sistema o médico | Videoconsulta, mediante el puerto de M08 |
| `no_show_*` | Corrección | Administrador (RN-027) | Fuera de M08 |

`expired`, `canceled` y `completed` son terminales en M08. Cada cambio queda en `appointment_status_history` con su actor.

## 10. Contratos con pagos («M09»)

- **M08 expone**:
  - `AppointmentConfirmationPort.confirmPaid(appointmentId, paymentId)`: idempotente si ya está `confirmed` con ese pago;
    `HoldExpired` (409) si está `expired`.
  - `AppointmentConfirmationPort.markPaymentFailed(appointmentId)` → `expired`.
  - `AppointmentQueryPort.rootOf(appointmentId)`.
  - `refundOutcome(appointmentId)` como dato del evento `AppointmentCanceled`.
- **Pagos expone (M08 no lo importa; solo lo documenta)**: `paymentForAppointment(id)` (resuelve la raíz) y la ejecución
  del reembolso (RF-46).
- **Invariantes**: un pago confirma como máximo una cita, y solo una en `pending_payment`; el reagendamiento no crea un
  `payment` ni un `refund`; el reembolso nunca supera `payment.amount`.

## 11. Riesgos y dependencias pendientes

| ID | Riesgo o dependencia | Mitigación |
|---|---|---|
| R-1 | No hay garantía en la base de datos contra la reserva doble | Candado del médico (DA-2); `EXCLUDE` más adelante (DA-11) |
| R-2 | El fin de la cita se calcula con la duración vigente | DA-3; `agenda_block_ends_at` más adelante (A.10) |
| R-3 | Sin pagos, ninguna cita se confirma | Bandera o despliegue conjunto (DA-1) |
| R-4 | Coherencia entre el texto de los Términos y la fila de condiciones | Procedimiento controlado; vínculo en DA-11 |
| R-5 | Pagos exitosos que llegan tarde sobre una cita `expired` | Reembolso automático por pagos (CC-4) |
| R-6 | `generateSlots` de M07 sin probar contra PostgreSQL (incluido `24:00:00`) | C2 de M07 antes de la integración de M08 |
| R-7 | `consultation_price_configuration` sigue en [PROPUESTO] | Visto bueno del líder técnico |
| R-8 | La vista previa del médico en M07 muestra horarios reservados como libres | Aceptado (DA-5) |

## 12. Pruebas previstas

- **Unitarias (dominio)**:
  - transiciones de estado, que reflejan el trigger;
  - cruces de intervalos semiabiertos;
  - límite exacto del plazo (24 h ± 1 ms) y de la retención (5 min ± 1 ms);
  - contador por la cadena;
  - `refundOutcome`;
  - `excludeBusy`;
  - selección de la versión vigente de precio y condiciones.
- **Casos de uso con dobles**:
  - orden de candados (como TC-M07-024);
  - políticas de M02 y M03 invocadas dentro de la transacción;
  - reversión si falla la auditoría;
  - idempotencia de la retención y de `confirmPaid`;
  - cita de otro usuario → 404;
  - el reagendamiento no llama a pagos.
- **E2E con dobles**: todos los endpoints y códigos de error, y la bandera de reserva desactivada.
- **Arquitectura**: M08 no importa pagos, videoconsulta ni notificaciones; M00 a M07 no importan M08; ningún
  `FakeConfirmationCaller` en `src/`.
- **Integración (C2, base de pruebas, `withRollback`)**: el trigger real (`expired → confirmed` rechazado, la política
  inmutable), el candado `FOR UPDATE` y la derivación de la versión de Términos aceptada.
- **Concurrencia (arnés `test/concurrency`)**: N reservas simultáneas del mismo horario → 1 éxito y N−1 409; reserva
  contra cambio de agenda del mismo médico; dos reagendamientos simultáneos; `confirmPaid` contra vencimiento.

## 13. Requisitos que necesitan aclaración o control de cambios (próximo libre: C-23)

| ID | Tema | Propuesta |
|---|---|---|
| CC-1 | RF-16 y RN-021 dicen que el administrador configura la política; el acuerdo 2.2 la coloca en los Términos | Reformular RF-16: las condiciones son las de la versión de los Términos aceptada, representadas de forma estructurada y versionadas con ellos; definir si las ventanas (RN-028) siguen siendo configurables por el administrador |
| CC-2 | RN-025 y RF-20 (`no_show_doctor` al vencer la ventana) frente a «el paciente no pierde la cita si el médico sigue en otra consulta» | Definir si la ventana del médico se suspende mientras tiene una consulta activa |
| CC-3 | 6.1 no contempla el cierre por reagendamiento | Añadir el estado `rescheduled` o definir el uso de `canceled` |
| CC-4 | Pago exitoso que llega después de `expired` | Reembolso automático del 100 % |
| CC-5 | Configuración del precio global por el administrador sin RF propio | Añadir un RF o un criterio a RN-007 |
| CC-6 | Listado de médicos reservables (DA-12) | Aclaración de RF-12 |
| CC-7 | Cancelación del médico sin `canOperate` (DX-1) | Aclaración de RN-140 y RN-013 |
| CC-8 | Cancelación administrativa (RN-014) sin RF ni módulo asignado | Asignarla a un RF y a un módulo |
| CC-9 | Admisión explícita del paciente por el médico en la sala de espera | Ampliar el criterio de RF-19 |

## 14. Diseño de frontend y endpoints

Los de la v1 se conservan, con dos cambios: se elimina la pantalla de administración de la política (DA-10) y se añade la
del precio, si se aprueba CC-5.

**Pantallas del paciente:**
- agendar;
- retención con cuenta regresiva (sin botón de pago mientras pagos no exista);
- mis citas;
- detalle, con cancelar y reagendar. El aviso de reembolso indica la versión de los Términos aplicada.

**Pantalla del médico:** mis citas y cancelar.

Sala de espera: pantalla del módulo de videoconsulta, no de M08.
