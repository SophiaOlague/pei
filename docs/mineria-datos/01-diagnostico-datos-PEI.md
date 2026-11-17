# PEI — Diagnóstico de datos para Minería de Datos

**Fase 1 · Auditoría técnica de solo lectura**  
**Fecha de revisión:** 2026-11-16  
**Alcance:** evidencia estática del repositorio. No se consultaron bases de datos ni datos personales.

## Resumen ejecutivo

PEI persiste citas en PostgreSQL mediante **Drizzle ORM** (no se encontró Prisma Schema). El modelo ya ofrece identificadores de paciente/cita, creación y hora programada, cancelación, especialidad vía médico, médico, estado y su historial. Incluye estados explícitos de inasistencia y una integración interna que registra resultados de videoconsulta. Por ello, es viable construir un objetivo histórico de inasistencia usando `appointment.status = 'no_show_patient'`, sujeto a validar la calidad y cobertura de los resultados históricos.

La marca final no es una predicción ni una medición independiente: el resultado lo reporta un módulo externo/integrador y puede corregirse desde estados `no_show_*` a `completed`. Para modelar presencia y ausencias con mayor trazabilidad, el esquema contempla `meeting.patientJoinedAt`, `meeting.doctorJoinedAt` y eventos de sesión; su cobertura operacional debe verificarse con pruebas/telemetría del módulo de videoconsulta.

Hay dos tablas analíticas visibles: `appointment_no_show_prediction` y `patient_adherence_segment`. En `apps/backend/src/db/schema/analytics.ts` ambas están comentadas como **propuestas pendientes de aprobación**; sin embargo, aparecen en la migración inicial `0000_init.sql`. No se encontró lógica de aplicación que las escriba ni una implementación de reportes o Data Warehouse. Se deben tratar como almacenamiento propuesto/no integrado, y revisar estado real de despliegue únicamente en un entorno autorizado cuando corresponda.

## Método y fuentes revisadas

- Esquema: `apps/backend/src/db/schema/appointment.ts`, `patient.ts`, `doctor.ts`, `specialty.ts`, `identity.ts`, `configuration.ts`, `analytics.ts`, `enums.ts`, `relations.ts`.
- Migraciones: `apps/backend/src/db/migrations/0000_init.sql` y `0001`–`0018`, más propuestas en `apps/backend/src/db/proposals/` y snapshots/journal.
- Aplicación: `apps/backend/src/modules/appointments/`, `agenda/`, `payments/`, y `appointments/presentation/appointments.controllers.ts`.
- Diseño/operación: `docs/arquitectura/M08-diseno.md`, `docs/arquitectura/Maestro-V2.3.md`, `docs/academico/M07-agenda.md`, `docs/testing/trazabilidad/M08-appointments.md`, `M07-agenda.md`, y pruebas backend `appointments.e2e-spec.ts`, `test/integration/appointments*.int-spec.ts`, `test/concurrency/appointments.conc-spec.ts` y unitarias bajo `src/modules/appointments/` y `agenda/`.
- Se buscaron archivos de reportes/analytics en backend; no se encontró un módulo productivo de informes de citas.

## Modelo y migraciones

La definición vigente del ORM es Drizzle (`apps/backend/src/db/schema/`); no se encontró `schema.prisma`. La tabla `appointment` está en la migración inicial `apps/backend/src/db/migrations/0000_init.sql`; la migración `0013_m08_m1_core.sql` está bajo `src/db/proposals`, documentada expresamente como propuesta no aplicada por `db:migrate`. Las migraciones numeradas `0013` en adelante sí existen también bajo `src/db/migrations/` y el journal; para campos concretos manda el esquema exportado actual y la migración aplicada correspondiente, no el archivo homónimo de propuestas.

La relación principal es `appointment.patient_id → patient_profile.id`, `appointment.doctor_id → doctor_profile.id`, y `doctor_profile.specialty_id → specialty.id`. `patient_profile.user_profile_id` y `doctor_profile.user_profile_id` enlazan con `user_profile`. La cita enlaza con historial (`appointment_status_history`), reunión (`meeting`, 0..1), política de cancelación, pagos, solicitudes de soporte y predicciones analíticas; los nombres y cardinalidades se reflejan en `apps/backend/src/db/schema/relations.ts`.

## Inventario de variables observadas

La disponibilidad indica cuándo sería válido conocer el dato para una fila de cita, no que el campo esté disponible mediante un endpoint analítico hoy. “Histórico” requiere reconstrucción temporal desde el historial y evitar información posterior al corte.

| Variable analítica | Modelo o tabla | Campo real | Tipo de dato | Disponibilidad | Uso analítico y observaciones |
|---|---|---|---|---|---|
| Identificador de cita | `appointment` | `id` (`id`) | UUID | Al crear | Clave de hecho y unión; `apps/backend/src/db/schema/appointment.ts`. |
| Identificador de paciente | `appointment` → `patient_profile` | `patient_id` (`patientId`) | UUID, FK | Al reservar | Agrupamiento y agregados históricos; pseudonimizar en dataset analítico. Mismo archivo y `patient.ts`. |
| Identificador de médico | `appointment` → `doctor_profile` | `doctor_id` (`doctorId`) | UUID, FK | Al reservar | Segmentación operativa; proteger/pseudonimizar. `appointment.ts`, `doctor.ts`. |
| Fecha de creación | `appointment` | `created_at` (`createdAt`) | `timestamptz` | Al crear | Base para anticipación y partición temporal. `appointment.ts`. |
| Fecha/hora programada | `appointment` | `scheduled_at` (`scheduledAt`) | `timestamptz` | Al reservar | Día de semana, hora, estacionalidad; `appointment.ts`. Zona horaria debe normalizarse con la convención de agenda M07. |
| Fin de bloque de agenda | `appointment` | `agenda_block_ends_at` (`agendaBlockEndsAt`) | `timestamptz` | Al reservar | Duración/ocupación; no implica fin de consulta. NOT NULL y > scheduled_at (`appointment.ts`, migraciones 0013–0015). |
| Fecha de cancelación | `appointment` | `cancelled_at` (`cancelledAt`) | `timestamptz`, nullable | Después de cancelación | Tiempo hasta cancelar; fuga si predicción ocurre antes. `appointment.ts`. |
| Actor de cancelación | `appointment` | `cancelled_by_type` (`cancelledByType`) | Enum nullable: patient/doctor/admin/system | Después de cancelación | Distinguir cancelaciones por actor; posterior al corte para predicción. `enums.ts`, `appointment.ts`. |
| Motivo de cancelación | `appointment` | `cancellation_reason` (`cancellationReason`) | `text`, nullable | Después de cancelar | Calidad/categorización, texto potencialmente sensible; no usar sin revisión y temporalidad. `appointment.ts`. |
| Estado actual | `appointment` | `status` | Enum | Evoluciona; resultado al cierre | Etiqueta candidata: `no_show_patient`; otros estados deben separarse. Enum en `enums.ts`. |
| Historial de estado | `appointment_status_history` | `appointment_id`, `status`, `created_at`, `changed_by_type`, `reason` | UUID, enum, `timestamptz`, enum, text | Cada transición | Reconstruye estado a fecha de corte y latencia; puede corregir `no_show_*` a `completed` conforme reglas DB/diseño. `appointment.ts`, `appointment-status.ts`. |
| Confirmación | `appointment` | `status='confirmed'` y transición en historial | Enum + evento temporal | Tras pago exitoso | No es confirmación de asistencia ni recordatorio confirmado por paciente. Confirmación interna por pago (`appointment-integration.services.ts`). |
| Evidencia de conexión de paciente | `meeting` | `patient_joined_at` (`patientJoinedAt`) | `timestamptz`, nullable | Durante/después de cita | Señal directa de presencia; campo existe en schema/migración inicial. Ausencia de timestamp no prueba ausencia si no hubo reunión o telemetría. `appointment.ts`. |
| Evidencia de conexión de médico | `meeting` | `doctor_joined_at` (`doctorJoinedAt`) | `timestamptz`, nullable | Durante/después | Permite distinguir no-show de paciente/médico; misma limitación de cobertura. `appointment.ts`. |
| Eventos de conexión/desconexión | `meeting_session_event` | `participant`, `event_type`, `occurred_at`, `meeting_id` | Enums + `timestamptz` + UUID | Durante sesión | Secuencias, reconexiones y duración; schema lo marca como propuesta. `appointment.ts`, `enums.ts`; confirmar despliegue/captura. |
| Confirmación de asistencia | — | No se identificó campo de check-in/confirmación explícita por paciente | — | No disponible como tal | El estado `confirmed` denota cita confirmada/pagada, no que el paciente haya confirmado asistencia. Recordatorios aparecen como tipos de notificación, no como recibos de respuesta. |
| Tipo de cita | `appointment` | `type` | Enum: `scheduled`, `emergency` | Al reservar | Estratificación del análisis. `appointment.ts`, `enums.ts`. |
| Especialidad | `doctor_profile` → `specialty` | `specialty_id` (`specialtyId`), `code`, `name` | UUID, varchar | Al reservar / catálogo mutable-desactivable | Unir por médico; para análisis histórico usar dimensión SCD o snapshot porque la especialidad actual puede cambiar. `doctor.ts`, `specialty.ts`. |
| Precio reservado | `appointment` | `price` | `numeric(10,2)` | Al reservar | Posible factor/contexto; sensible y potencial proxy. Inmutable tras la reserva (M08 diseño/migración propuesta). |
| Motivo clínico/consulta | `appointment` | `reason` | `varchar` | Al reservar | No recomendado para modelo inicial: texto potencialmente clínico/personal; excluir o transformar bajo gobernanza. `appointment.ts`. |
| Anticipación | Derivada de `appointment` | `scheduled_at - created_at` | Duración calculada | Al reservar | Disponible al crear; calcular con zona horaria y revisar citas de emergencia/retención. |
| Citas anteriores del paciente | `appointment` | `patient_id`, `scheduled_at`, `status`, `created_at` | UUID, timestamps, enum | Sólo hechos previos al instante de predicción | Agregado as-of: conteos/tasas por ventanas; excluir la cita actual y datos futuros. |
| Cancelaciones/inasistencias previas | `appointment` + `appointment_status_history` | `status`, `cancelled_at`; historial de transición | Enum/timestamps | Sólo hechos previos | Agregados por paciente y actor; distinguir cancelación de no-show, excluir correcciones posteriores al corte. |
| Edad aproximada (opcional) | `user_profile` | `birth_date` (`birthDate`) | `date`, nullable | Perfil actual | No es necesaria para el prototipo; dato personal. Si se autoriza, derivar edad al día de cita sin exportar fecha de nacimiento. |
| Segmento de adherencia almacenado | `patient_adherence_segment` | `patient_id`, `segment`, `model_version`, `assigned_at` | UUID, varchar, varchar, `timestamptz` | Propuesta | No es variable fuente; tabla comentada propuesta en `analytics.ts`, sin pipeline identificado. |
| Predicción de inasistencia almacenada | `appointment_no_show_prediction` | `appointment_id`, `probability`, `risk_level`, `model_version`, `predicted_at` | UUID, numeric, enum, varchar, `timestamptz` | Propuesta | Persistencia sugerida, no evidencia de modelo operativo ni predicción histórica. `analytics.ts`. |

### Estados, asistencia y transiciones

`appointmentStatusEnum` define `pending_payment`, `expired`, `confirmed`, `completed`, `canceled`, `no_show_patient`, `no_show_doctor`, `no_show_both` y `rescheduled` (`apps/backend/src/db/schema/enums.ts`). `appointment-status.ts` modela transiciones desde `confirmed` a cancelación, reprogramación, completada o tipos de inasistencia. El diseño de M08 describe la llegada a no-show desde los tiempos de conexión y ventanas de espera (`docs/arquitectura/M08-diseno.md`, sección de resultados de videoconsulta); `AppointmentSessionService.markNoShow()` y `markCompleted()` escriben el resultado vía repositorio/historial y auditoría (`apps/backend/src/modules/appointments/application/integration/appointment-integration.services.ts`).

La aplicación no expone un endpoint público/admin de reporte ni de captura manual de asistencia en `appointments.controllers.ts`; la integración de videoconsulta es interna. El historial de estados sí permite reconocer fecha de transición y actor, pero un estado actual no conserva necesariamente la etiqueta originalmente reportada si se corrige.

## Viabilidad y riesgos analíticos

1. **Identificar una inasistencia real:** sí, en términos operativos, con estado `no_show_patient` o historial de transición a ese estado. Es preferible diferenciar `no_show_doctor` y `no_show_both`. La definición del producto asigna el estado con lógica de sala/ventanas, por lo que se debe auditar cobertura de reuniones, eventos y correcciones antes de afirmar que la etiqueta es completa o infalible.
2. **Información previa a la cita:** al reservar están disponibles paciente, médico/especialidad, `created_at`, `scheduled_at`, tipo, precio y motivo. Configuración/política aplicada también puede recuperarse por FK. Derivados válidos: anticipación, día/hora, conteos históricos as-of (mediante historial) y tasas anteriores. Perfil actual puede no equivaler a snapshot conocido al predecir.
3. **Fuga de información:** estado final, transición a `no_show_*`/`completed`, `cancelled_at`, actor/motivo de cancelación, timestamps de reunión/eventos, pagos/resultados posteriores, y cualquier dato actualizado después del instante de predicción. Para modelos de riesgo pre-cita debe fijarse un `prediction_at` explícito y construir todas las características con corte temporal estricto. `status='confirmed'` sólo es admisible si ya ocurrió antes del corte.
4. **Datos faltantes para entrenar/evaluar:** no se encontró evidencia de check-in explícito, captura de confirmación de asistencia del paciente, razones normalizadas para no-show, versión de modelo en ejecución ni historial de predicciones integrado. Hay que confirmar cobertura de `meeting` y `meeting_session_event`, calidad de los estados históricos, volumen de etiquetas, datos de recordatorios entregados/respondidos y tratamiento de citas sin videollamada. También faltaría una política aprobada de retención, anonimización y uso de atributos personales/clínicos.
5. **Agrupamiento:** tasas de asistencia, cancelación y reprogramación anteriores; anticipación mediana, frecuencia, variabilidad entre horarios, recencia y rachas, todas calculadas a fecha de corte. Usar mínimos de observaciones y una ventana temporal definida; separar patrón del paciente de disponibilidad/efectos de médico y especialidad. `patient_adherence_segment` sólo es un destino propuesto.
6. **Anomalías:** citas superpuestas por paciente/médico, duraciones/bloques atípicos, reservas de último minuto, tasas inusuales de cancelación/no-show por médico/especialidad/periodo, secuencias de transición inesperadas, discordancia entre estado y marcas de conexión, reuniones ausentes o duplicadas, y múltiples reprogramaciones relacionadas. Respetar estados válidos y horario/zona horaria para evitar falsos positivos.
7. **Data Warehouse:** claves foráneas y timestamps permiten hechos de cita, transiciones, reuniones, pagos y dimensiones paciente, médico, especialidad, tipo, estado, fecha/hora y política. Las dimensiones históricas son necesarias porque catálogos/perfiles mutan; preservar identificadores sustitutos/snapshots y considerar cadena de reprogramación (`rescheduled_from_appointment_id`). Auditoría y pagos amplían análisis si se autoriza su uso.

## Diseño analítico recomendado (propuesta)

### Dataset sintético futuro

Para fases posteriores, generar localmente una tabla tabular enteramente ficticia, sin muestrear datos reales ni copiar distribuciones identificables. Una fila representa una cita confirmada candidata a predicción, con UUID sintéticos y fechas controladas; incluir suficientes meses para cortes temporales, casos balanceados artificialmente y estados de cita cancelada, completada, no-show y reprogramada. Mantener explícita la etiqueta y variables post-cita sólo en un conjunto separado para evaluación/auditoría, nunca en las features de entrenamiento. El usuario indicó no generarlo en esta fase.

### Diccionario propuesto para prototipo

| Variable sintética | Tipo | Momento | Definición |
|---|---|---|---|
| `appointment_id` | string UUID ficticio | Reserva | Clave técnica, excluida del entrenamiento. |
| `patient_id` | string UUID ficticio | Reserva | Clave de agrupación; excluir como predictor directo. |
| `doctor_id`, `specialty_code` | categórico | Reserva | Profesional y especialidad ficticios. |
| `created_at`, `scheduled_at` | datetime ISO-8601 TZ | Reserva | Tiempos sintéticos coherentes. |
| `lead_time_hours` | float | Reserva | Diferencia programada menos creación. |
| `appointment_type` | categórico | Reserva | `scheduled`/`emergency`. |
| `weekday`, `hour`, `month` | categórico/entero | Derivadas pre-cita | Calendario en zona definida. |
| `prior_appointments_90d` | entero | Corte pre-cita | Citas anteriores en 90 días. |
| `prior_attended_rate`, `prior_patient_no_show_count`, `prior_cancel_count` | float/enteros | Corte pre-cita | Historial anterior; dividir por número de observaciones y definir mínimo. |
| `prior_reschedule_count` | entero | Corte pre-cita | Citas reprogramadas anteriores. |
| `y_patient_no_show` | boolean | Posterior | 1 sólo para etiqueta definida como inasistencia del paciente; excluir canceladas/reprogramadas y definir universo. |
| `final_status`, `patient_joined_at`, `cancelled_at` | categórico/datetime nullable | Posterior | Sólo auditoría/etiquetado, jamás features del modelo pre-cita. |

## Propuesta de Data Warehouse

**Grano principal:** una fila por registro de cita de origen (`appointment_id`), incluyendo la fila original reprogramada y la nueva como hechos separados. Conservar `source_appointment_id`, marca de extracción y vigencia del snapshot.

| Objeto propuesto | Grano / campos clave | Fuente PEI sugerida |
|---|---|---|
| `fact_appointment` | Una fila por cita; claves de dimensiones, `created_at`, `scheduled_at`, precio opcional, duración, contadores y medidas derivadas | `appointment` + FK a patient, doctor, policy. |
| `fact_appointment_status_event` | Una fila por transición; cita, estado, timestamp, actor, motivo codificado | `appointment_status_history`. |
| `fact_meeting_session_event` | Una fila por evento de conexión/desconexión | `meeting`, `meeting_session_event`, sujeto a confirmar despliegue. |
| `fact_payment` (opcional) | Una fila por pago/refund/evento de pago | Tablas de pagos; necesario para estudiar confirmación/retención, con control de acceso. |
| `dim_date` / `dim_time` | Calendario/hora local y UTC, semana, mes, festivo si una fuente autorizada se incorpora | Derivada. |
| `dim_patient` | Clave sustituta, cohortes/atributos aprobados, vigencias; sin CURP/nombre/teléfono | `patient_profile` + `user_profile`, minimizados. |
| `dim_doctor` | Clave sustituta y vigencias | `doctor_profile`. |
| `dim_specialty` | Código/nombre y vigencia | `specialty`. |
| `dim_appointment_status`, `dim_type`, `dim_policy` | Etiquetas y versiones aplicables | Enums y `cancellation_policy`; snapshot para semántica histórica. |

El proceso de carga recomendado es ETL/ELT incremental desde una réplica o exportación autorizada de solo lectura hacia una zona de staging restringida; luego pseudonimizar y transformar a esquema analítico. Mantener linaje, fecha de extracción, control de acceso y reglas de retención. No conectar el prototipo a producción.

### Consultas SQL candidatas (diseño; no ejecutadas)

Los ejemplos ilustran lógica sobre PostgreSQL y deben validarse en un entorno sintético. Las consultas usan nombres físicos comprobados del schema. Para entrenamiento, definir un corte temporal por fila; evitar contar el evento actual o futuro.

```sql
-- Historial de resultado final por cita; estado actual y transiciones disponibles.
SELECT a.id, a.patient_id, a.doctor_id, a.created_at, a.scheduled_at,
       a.status, h.status AS historical_status, h.created_at AS status_at
FROM appointment a
LEFT JOIN appointment_status_history h ON h.appointment_id = a.id;

-- Resultado candidato de asistencia (requiere excluir citas no elegibles y auditar correcciones).
SELECT a.id AS appointment_id,
       (a.status = 'no_show_patient') AS y_patient_no_show
FROM appointment a
WHERE a.status IN ('completed', 'no_show_patient', 'no_show_doctor', 'no_show_both');

-- Anticipación y calendario; definir zona de negocio explícitamente al convertir desde timestamptz.
SELECT id, scheduled_at - created_at AS lead_time,
       extract(isodow FROM scheduled_at) AS weekday_utc,
       extract(hour FROM scheduled_at) AS hour_utc
FROM appointment;

-- Agregados históricos por paciente: ejemplo orientativo, no as-of.
-- En producción analítica se debe limitar cada agregado a citas con scheduled_at/status_at anteriores al corte.
SELECT patient_id,
       count(*) FILTER (WHERE status = 'completed') AS completed_count,
       count(*) FILTER (WHERE status = 'no_show_patient') AS patient_no_show_count,
       count(*) FILTER (WHERE status = 'canceled') AS canceled_count
FROM appointment
GROUP BY patient_id;

-- Ruta dimensional de especialidad por cita.
SELECT a.id, a.patient_id, a.doctor_id, s.id AS specialty_id, s.code, s.name
FROM appointment a
JOIN doctor_profile d ON d.id = a.doctor_id
JOIN specialty s ON s.id = d.specialty_id;
```

## Arquitectura del prototipo Python (propuesta)

```text
datos sintéticos versionados (CSV/Parquet)
        ↓
ingesta y validación de esquema (pandas/polars; reglas propias)
        ↓
features temporales as-of + diccionario/linaje
        ├── baseline supervisado de inasistencia + métricas temporales
        ├── agrupamiento de adherencia + perfiles de clúster
        └── reglas/modelos de anomalías + revisión de casos
        ↓
artefactos reproducibles (configuración, métricas, modelo, informe)
```

Separar módulos `data/` (generador futuro, loader, validaciones), `features/` (transformaciones sin fuga), `models/` (baselines/clustering/anomalías), `evaluation/` (partición temporal, métricas, calibración), `reports/` (tablas/gráficos), y `integration/` (contratos API futuros). Fijar semillas, versiones y particiones; usar split temporal y comparar contra baseline simple. En esta fase no se crearon carpetas ni dependencias.

### Integración futura por API

Exponer un endpoint versionado de inferencia que reciba atributos mínimos de una cita aún elegible y devuelva `model_version`, probabilidad, nivel de riesgo y `predicted_at`; separar inferencia de decisiones clínicas/operativas. La escritura de predicciones debe ir a una tabla aprobada y auditable, con control por rol, idempotencia y retención. Contrato existente sólo orientativo: `appointment_no_show_prediction` y su esquema en `analytics.ts`; no se encontró endpoint/modelo operativo que lo implemente. No exponer identificadores directos ni datos clínicos en el payload del prototipo.

## Limitaciones y pendientes de evidencia

- Esquema inspeccionado desde código/migraciones; no se comprobó el estado efectivo de una base concreta ni se conectó a ninguna BD.
- No se verificó cobertura de reuniones ni calidad de datos históricos; nombres de campos no prueban que siempre se escriban.
- El repositorio no contiene un pipeline de extracción analítica, warehouse, marts, modelo entrenado ni informes de asistencia identificados en la búsqueda.
- Tablas de analítica en schema/migración inicial parecen propuestas y no tienen servicio de persistencia localizado; esto no determina por sí solo qué existe en despliegues.
- Las pruebas cubren reglas de citas, estados, concurrencia e integración contractual; varios reportes de trazabilidad indican entornos/dobles concretos. No se ejecutaron pruebas en esta auditoría.
- Ciertos atributos de perfil y texto (CURP, nacimiento, contacto, condición de salud, razón de cita) son datos personales o clínicos y no son necesarios para el prototipo sintético inicial.
- La medición de no-show depende de la lógica y captura del módulo de videoconsulta, cuyos datos operativos deben verificarse por separado antes de tomar decisiones de modelado.

## Recomendaciones para fases siguientes

1. Aprobar definición de población objetivo y etiqueta: paciente no-show, cita elegible, tratamiento de cancelaciones, emergencias, reprogramaciones y correcciones.
2. Acordar momento de predicción (reserva, confirmación o recordatorio) y contrato de corte temporal.
3. Construir primero el prototipo con dataset exclusivamente sintético; no importar distribuciones ni registros de producción.
4. Validar esquema/relaciones y cobertura de eventos en ambiente no productivo con fixtures autorizados.
5. Diseñar gobernanza de atributos, pseudonimización, retención, evaluación de sesgo y métricas antes de integrar inferencia.
