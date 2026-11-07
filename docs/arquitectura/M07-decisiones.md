# M07 Agenda médica: arquitectura y registro de decisiones

Registro versionado del diseño y de las decisiones de implementación de M07 (RF-10 y RF-11). PEI es la aplicación;
Gestinnovo, la empresa.

> **Estas decisiones no son requisitos del Documento Maestro.** RF-10 y RF-11 proceden del Documento Maestro, que es la
> fuente normativa. Las decisiones D-1 a D-6 los concretan y se aprobaron en la revisión de diseño de M07 (2026-11-07).
> No modifican el Documento Maestro.

Matriz de pruebas: [trazabilidad de M07](../testing/trazabilidad/M07-agenda.md). Evidencia académica:
[M07 en docs/academico](../academico/M07-agenda.md).

## 1. Estado

| Aspecto | Estado (2026-11-07) |
|---|---|
| Implementación | Backend y web completos en el árbol de trabajo; **sin commit** |
| Pruebas con dobles | Unitarias, de casos de uso, E2E con dobles en memoria y web: en verde (ver la matriz) |
| Integración con PostgreSQL | **Pendiente.** Se hará con C2 cuando se reanude; ninguna prueba de M07 se ha ejecutado contra una base real |
| Migraciones | Ninguna. M07 usa tablas que ya existían |
| `production` | Sin desplegar |

## 2. Alcance

- Dentro: horario semanal recurrente, duración de la consulta, periodos no disponibles (días libres, vacaciones,
  ausencias) y vista previa de los horarios libres del propio médico.
- Fuera: citas y reservas (M08), pagos y videoconsulta. El directorio público de médicos sigue fuera (D-36 de M03).
- Alcance geográfico inicial confirmado: médicos de Durango y de la zona centro de México.

## 3. Decisiones aprobadas

| ID | Decisión |
|---|---|
| D-1 | Zona horaria única de la plataforma: `America/Mexico_City`. La interfaz indica que los horarios son de la hora del centro de México. Las franjas semanales se guardan como hora local (`time`); los periodos no disponibles y los horarios generados, como instantes UTC (`timestamptz`) |
| D-2 | Solo un médico con `canOperate` (D-38 de M03) puede modificar su agenda. Cualquier médico puede consultarla |
| D-3 | Duración de la consulta: de 15 a 120 minutos, en múltiplos de 5; 30 por omisión (el `DEFAULT` de la columna) |
| D-4 | El horario semanal se reemplaza completo en una transacción. Sin solapamientos dentro de un día y como máximo 6 franjas por día. Se respeta el orden de bloqueo de la sección 7 |
| D-5 | Una consulta de horarios abarca como máximo 31 días y no pasa de 90 días a partir de hoy (hora del centro de México) |
| D-6 | Los periodos no disponibles ya terminados se conservan como historial: no se listan ni se pueden eliminar |
| Medianoche | Un horario que cruza la medianoche se representa con dos franjas independientes (fin `24:00` y otra desde `00:00` del día siguiente), respetando el CHECK `end_time > start_time` |

Reglas complementarias de implementación (no cambian las decisiones):
- Un periodo no disponible debe terminar después de ahora, empezar como máximo a 365 días y tener un motivo de 200
  caracteres o menos.
- Si una duración guardada quedara fuera de rango (la columna no tiene CHECK), se usa 30 al generar horarios.

## 4. Arquitectura interna

Módulo NestJS `apps/backend/src/modules/agenda/`, con la misma separación de capas que los demás módulos:

| Capa | Contenido |
|---|---|
| `domain/` | Lógica pura sin Nest ni BD: conversión de zona horaria (`agenda-time.ts`), duración (`appointment-duration.ts`), horario semanal (`weekly-schedule.ts`), periodos no disponibles (`time-off.ts`), generación de horarios (`slot-generator.ts`) y errores de dominio (`agenda.errors.ts`) |
| `application/` | Casos de uso, `AgendaWriteGuard` (candado y política), `AgendaService` (para M08), eventos de auditoría y puertos `AGENDA_REPOSITORY` y `BUSY_INTERVALS_PROVIDER` |
| `infrastructure/persistence/` | `DrizzleAgendaRepository`, el único que conoce Drizzle y las tablas |
| `presentation/` | `MeAgendaController` y DTO con `class-validator` |

Los errores de dominio usan los `kind` comunes (`validation` → 400, `forbidden` → 403, `not_found` → 404,
`business_rule` → 422), que traduce `DomainExceptionFilter`. Los DTO rechazan propiedades desconocidas
(`whitelist` + `forbidNonWhitelisted`). El `doctorProfileId` sale siempre de la sesión.

## 5. Dependencia de M03

- `AgendaModule` importa `DoctorsModule` y usa de M03 **solo** `DoctorOperationalPolicy` (`assertActorCanOperate`).
  No duplica la lógica de habilitación: la aprobación administrativa, el registro completo y la aceptación legal
  vigente (RN-140) se evalúan en M03.
- Una prueba de arquitectura (RT-M07-01) impide que agenda importe otras partes de doctors y que doctors dependa de agenda.
  RT-M07-02 impide que agenda importe módulos de citas, pagos o videoconsulta.
- M03 no se modificó. En la web solo se añadió en el portal del médico el enlace «Gestionar mi agenda», con autorización
  expresa (2026-11-07), sin cambiar la lógica de M03.
- Comunes reutilizados: `UNIT_OF_WORK` y `CLOCK` (CommonModule), `AUDIT_TRAIL` (AuditModule), `SessionGuard`,
  `RolesGuard` y `@Roles('doctor')` (AuthModule).

## 6. Endpoints y casos de uso

Prefijo `/me/doctor/agenda`; sesión obligatoria y rol `doctor`.

| Método y ruta | Caso de uso | Escribe | Respuestas de error |
|---|---|---|---|
| `GET /` | `GetMyAgendaUseCase` | No | 401, 403, 404 |
| `PUT /availability` `{ windows: [{ weekday, start, end }] }` | `ReplaceWeeklyAvailabilityUseCase` | Sí | 400, 422 |
| `PUT /duration` `{ minutes }` | `ChangeAppointmentDurationUseCase` | Sí | 400, 422 |
| `POST /time-off` `{ startsAt, endsAt, reason? }` | `AddTimeOffUseCase` | Sí | 400, 422 |
| `DELETE /time-off/:id` | `RemoveTimeOffUseCase` | Sí | 400, 404 (incluye el de otro médico), 422 (ya terminado) |
| `GET /slots?from&to` | `PreviewMySlotsUseCase` | No | 400 |

`GET /` devuelve `timeZone`, `canOperate`, `durationMinutes`, `availability` y los periodos vigentes. `weekday` va de 0
(domingo) a 6 (sábado), igual que la columna.

## 7. Control de concurrencia y auditoría

Toda escritura sigue este orden dentro de una sola transacción (`UnitOfWork`):

1. `SELECT … FROM doctor_profile WHERE user_profile_id = $1 FOR UPDATE` (`lockDoctorByUserProfileId`).
2. `DoctorOperationalPolicy.assertActorCanOperate`, que relee el perfil con `FOR SHARE`. Esto es compatible con el
   candado anterior, que pertenece a la misma transacción. El orden inverso podría bloquearse al intentar pasar de un
   candado compartido a uno exclusivo.
3. El cambio en la agenda.
4. El evento de auditoría.

Así, dos escrituras del mismo médico se serializan, y un cambio sensible concurrente de M03 (que toma `FOR UPDATE`) espera
o ve el estado ya actualizado. `DrizzleAuditTrail` escribe con la transacción activa y falla si no la hay: si la auditoría
falla, el cambio se revierte (probado con dobles, TC-M07-029).

| Acción auditada | Entidad | Metadata (sin datos personales) |
|---|---|---|
| `agenda.availability.replaced` | `doctor_profile` | número de franjas antes y después |
| `agenda.duration.changed` | `doctor_profile` | duración anterior y nueva; solo si cambia |
| `agenda.time_off.created` | `doctor_time_off` | `doctorProfileId` |
| `agenda.time_off.removed` | `doctor_time_off` | `doctorProfileId` |

Las lecturas no abren transacción ni exigen `canOperate`.

## 8. Tablas reutilizadas (sin migraciones)

| Tabla / columna | Uso en M07 |
|---|---|
| `doctor_availability` (`weekday`, `start_time`, `end_time`; CHECK `end_time > start_time`) | Franjas semanales. Reemplazo: `DELETE` de las del médico e `INSERT` de las nuevas. El fin de día se guarda como `24:00:00` |
| `doctor_time_off` (`starts_at`, `ends_at`, `reason`; CHECK `ends_at > starts_at`) | Periodos no disponibles; intervalo semiabierto `[starts_at, ends_at)` |
| `doctor_profile.appointment_duration_minutes` (`DEFAULT 30`, sin CHECK) | Duración. El trigger de revisiones de M03 (0012) no reacciona a esta columna (N2 de M03): cambiarla no devuelve al médico a `pending` |

Falta verificar contra PostgreSQL real que `24:00:00` se guarde y se lea igual (pendiente de C2).

## 9. Generación de horarios

`generateSlots` es una función pura:

1. Recorre cada día local del rango (fechas `AAAA-MM-DD`, inclusivas) y toma las franjas de su día de la semana.
2. Divide cada franja en bloques de la duración vigente. Solo cuentan los bloques que caben completos; un residuo menor
   que la duración se descarta.
3. Convierte cada bloque de la hora del centro de México a UTC con `Intl`, sin suponer el desfase.
4. Descarta los bloques que empiezan antes de ahora y los que se cruzan con un periodo no disponible o con un intervalo
   ocupado (intersección de intervalos semiabiertos). Un periodo contiguo no bloquea.
5. Devuelve los bloques ordenados con `startsAt`/`endsAt` en UTC y `date`/`start`/`end` en hora local.

`resolveSlotRange` valida el formato, el orden, el máximo de 31 días y el horizonte de 90 días (D-5).

## 10. Relación futura con M08

- `AgendaModule` exporta `AgendaService.generateSlots(doctorProfileId, from, to)`. M08 podrá ofrecer horarios al paciente
  sin duplicar la lógica, aplicando sus propias políticas (por ejemplo, `DoctorOperationalPolicy.assertCanOperate` del
  médico elegido).
- Punto de extensión `BUSY_INTERVALS_PROVIDER`. Hoy `NoBusyIntervalsProvider` no devuelve ningún intervalo; M08 lo
  sustituirá por las citas que ocupan horario, sin cambiar el generador.
- Le corresponde decidir a M08:
  - qué ocurre con las citas existentes si cambian el horario, la duración o los periodos no disponibles;
  - cómo evitar reservas dobles (la tabla `appointment` no tiene un índice único por médico y hora);
  - las consecuencias de que el médico vuelva a `pending`.

## 11. Pendientes

- Validar la integración con PostgreSQL mediante C2: repositorio Drizzle, `24:00:00`, candados reales y auditoría
  transaccional.
- Registrar la evidencia formal de ejecución.
- Integración con M08 (sección 10).
