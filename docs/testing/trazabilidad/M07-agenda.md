# M07 Agenda médica — decisiones y trazabilidad

Estado: implementado (backend, web y pruebas con dobles), 2026-11-07. Sin commit. Sin pruebas contra PostgreSQL real.
Alcance geográfico inicial confirmado: médicos de Durango y la zona centro de México.
Arquitectura completa: [M07-decisiones](../../arquitectura/M07-decisiones.md); evidencia académica: [M07-agenda](../../academico/M07-agenda.md).

## Decisiones aprobadas

| Id | Decisión | Dónde se aplica |
|---|---|---|
| D-1 | Zona horaria única `America/Mexico_City`; la interfaz indica "hora del centro de México". Franjas semanales en hora local (`time`), periodos y horarios en UTC (`timestamptz`). | `agenda/domain/agenda-time.ts`, campo `timeZone` de las respuestas, web `agenda-time.ts` |
| D-2 | Solo un médico con `canOperate` modifica su agenda; los demás la consultan (solo lectura). | `AgendaWriteGuard` → `DoctorOperationalPolicy.assertActorCanOperate` |
| D-3 | Duración 15–120 min en múltiplos de 5, 30 por omisión. | `appointment-duration.ts` |
| D-4 | Reemplazo transaccional completo de franjas, sin solapamientos, máximo 6 por día. Orden de bloqueo: `FOR UPDATE` del perfil y después el `FOR SHARE` de la política. Un horario que cruza medianoche son dos franjas (fin `24:00` + franja desde `00:00`), respetando el CHECK `end_time > start_time`. | `weekly-schedule.ts`, `ReplaceWeeklyAvailabilityUseCase`, `DrizzleAgendaRepository.lockDoctorByUserProfileId` |
| D-5 | Consulta de horarios de máximo 31 días y horizonte de 90 días. | `slot-generator.ts` (`resolveSlotRange`) |
| D-6 | Los periodos no disponibles pasados se conservan: no se listan ni se pueden eliminar (422). | `RemoveTimeOffUseCase`, `listTimeOffEndingAfter` |

Sin migraciones: se usan `doctor_availability`, `doctor_time_off` y `doctor_profile.appointment_duration_minutes`.

## API (`/me/doctor/agenda`, rol `doctor`)

| Método y ruta | Uso | Errores |
|---|---|---|
| `GET /` | Agenda: zona, `canOperate`, duración, franjas, periodos vigentes | 401, 403 |
| `PUT /availability` `{ windows }` | Reemplaza el horario semanal | 400, 422 |
| `PUT /duration` `{ minutes }` | Cambia la duración | 400, 422 |
| `POST /time-off` `{ startsAt, endsAt, reason? }` | Agrega un periodo no disponible | 400, 422 |
| `DELETE /time-off/:id` | Elimina un periodo vigente propio | 400, 404, 422 |
| `GET /slots?from&to` | Vista previa de horarios libres | 400 |

Auditoría: `agenda.availability.replaced`, `agenda.duration.changed`, `agenda.time_off.created`, `agenda.time_off.removed`.
Para M08: `AgendaService.generateSlots(doctorProfileId, from, to)` y el puerto `BUSY_INTERVALS_PROVIDER` (hoy vacío).

## Matriz

| Requisito | Casos |
|---|---|
| RF-10 (horario de atención y duración) | TC-M07-003, 006, 011, 020, 021, 025, 028, 040, 042, 043, 046, 061, 062 |
| RF-11 (días libres / no disponibilidad) | TC-M07-010, 012, 026, 028, 044, 046, 061, 063 |
| D-1 | TC-M07-001, 060, 040 |
| D-2 | TC-M07-023, 045, 064, RT-M07-01 |
| D-3 | TC-M07-003, 004, 005, 025, 043 |
| D-4 | TC-M07-007, 008, 009, 014, 021, 022, 024, 042 |
| D-5 | TC-M07-015, 046 |
| D-6 | TC-M07-027, 044 |
| Alcance (sin M08/pagos/video) | RT-M07-02 |

Ubicación: unitarias `src/modules/agenda/**/*.spec.ts` (TC-001–030), E2E con dobles `test/agenda.e2e-spec.ts` (TC-040–046),
web `apps/web/src/features/professionals/agenda/doctor-agenda.test.tsx` (TC-060–065), arquitectura `test/architecture.spec.ts`.

## Pendiente

- Integración con PostgreSQL real (`DrizzleAgendaRepository`, `24:00:00` en `time`, candados) — requiere C2, en pausa.
- Evidencia de ejecución formal (`pnpm test:evidence`).
- M08 debe sustituir `BUSY_INTERVALS_PROVIDER` y definir qué pasa con citas existentes al cambiar horario o duración.
