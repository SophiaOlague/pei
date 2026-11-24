# Videoconsulta e inasistencias (RF-18 a RF-22): diseño y primera entrega

Estado al 2026-11-22: **primera entrega implementada sin commit y validada contra PostgreSQL en C2**. Migración 0019
aplicada en C2 y, desde el 2026-11-22, en desarrollo (Etapa 3 móvil).
Proveedor de video **sin confirmar**: la entrega usa un proveedor sin configurar que falla cerrado.

Fuentes: Maestro V2.3 vivo (RF-19, RF-20, RN-025, RN-026, RN-030, RN-140; C-26, C-30, C-33), Maestro V2.4 (RF-18,
RF-21, RF-22, RN-022 a RN-033) y `M08-diseno.md` (A.9.2, A.9.5, A.10.3, A.11.2, A.11.3, A.12.1; AP-6, AP-15, AP-22 a
AP-25).

## 1. Decisiones

| # | Decisión | Estado |
|---|---|---|
| 1 | Plazo de R5 frente al límite total (hueco A) | **Pendiente**. Se conserva la regla de N13; el caso límite queda sin resultado |
| 2 | Pacientes tardíos fuera de N8–N10 (hueco B) | **Pendiente**. No se clasifican ni se cierran |
| 3 | La sala de espera la gestiona PEI; el proveedor solo transporta audio y video desde la admisión | Aprobada |
| 4 | `meeting.room_id` admite nulos: la sala de espera no depende del proveedor | Aprobada |
| 5 | Presencia por latido cada 15 s, con corte a los 45 s; columnas `*_last_seen_at` | Aprobada |
| 6 | Webhooks del proveedor pospuestos | Aprobada |
| 7 | Revocación de acceso al finalizar | Aprobada con condición: su eficacia se comprueba con una llamada real antes de darla por cerrada |
| 8 | `meeting_session_event` definitiva y de solo inserción; tipo `left_voluntarily` | Aprobada |
| 9 | Valores `no_show_doctor` y `no_show_both` en `refund_reason_enum` | Aprobada |
| 10 | Evento y consulta duradera de resultados en M08, con el `refundOutcome` decidido por M08 | Aprobada |
| 11 | Excepción a RN-140: finalizar una consulta activa propia sin `canOperate` | Aprobada (C-33) |
| 12 | Consulta que nunca se finaliza: sin cierre automático ni plazo | Aprobada |
| 13 | Proveedor simulado; aviso de RF-19 solo en pantalla; rutas de la sección 3 | Aprobada |

## 2. Responsabilidades

| Módulo | Qué hace |
|---|---|
| M08 (citas) | Estado de la cita, transiciones, historial y auditoría. Expone `AppointmentSessionService` (`getForSession`, `markCompleted`, `markNoShow`), el evento `AppointmentOutcomeRecorded` y la consulta duradera `OutcomeRecordedFeedService` |
| Videoconsulta (`modules/video`) | Sala de espera, presencia, admisión, finalización, duración real, evaluación de inasistencias, credenciales del proveedor |
| Pagos | Reembolso total por `no_show_doctor` y `no_show_both`, por evento y por barrido duradero |
| M03 (médicos) | Habilitación del médico (`DoctorOperationalPolicy`, `canOperate`) |

Videoconsulta solo usa de M08 `AppointmentSessionService`, sus errores y el módulo (RT-VID-01). M08 no conoce a
videoconsulta ni a pagos (RT-M08-03).

## 3. Contrato de API

Todas las rutas usan `SessionGuard` y `RolesGuard`. Ninguna recibe cuerpo ni horas del cliente: la hora es la del
servidor. La cita de otra persona responde 404, igual que en M08.

| Método y ruta | Rol | Habilitación del médico | Qué hace |
|---|---|---|---|
| `GET /me/patient/appointments/:id/session` | patient | — | Estado (evalúa inasistencias) |
| `POST /me/patient/appointments/:id/session/enter` | patient | — | Entra a la sala desde T0 − 15; también reconecta |
| `POST /me/patient/appointments/:id/session/presence` | patient | — | Latido; no reabre una presencia cerrada |
| `POST /me/patient/appointments/:id/session/leave` | patient | — | Salida voluntaria; no cancela la cita |
| `POST /me/patient/appointments/:id/session/token` | patient | — | Credencial del proveedor, solo con la consulta activa |
| `GET /me/doctor/sessions` | doctor | No exige | Sus salas en espera o en curso (solo lectura) |
| `GET /me/doctor/appointments/:id/session` | doctor | No exige | Estado |
| `POST /me/doctor/appointments/:id/session/enter` | doctor | Exige | Entra a la sala de la cita |
| `POST /me/doctor/appointments/:id/session/presence` | doctor | Exige | Latido |
| `POST /me/doctor/appointments/:id/session/leave` | doctor | Exige | Sale de la sala |
| `POST /me/doctor/appointments/:id/session/admit` | doctor | Exige | Admite al paciente |
| `POST /me/doctor/appointments/:id/session/end` | doctor | **No exige** (C-33) | Finaliza una consulta activa propia |
| `POST /me/doctor/appointments/:id/session/token` | doctor | Exige | Credencial del proveedor |

Respuesta de estado: `appointmentId`, `appointmentStatus`, `phase` (`not_open`, `waiting`, `active`, `ended`, `closed`),
`serverTime`, `scheduledAt`, `opensAt`, `patient` y `doctor` (`present`, `joinedAt`; el médico también
`busyWithAnotherConsultation`), `deadlines` (`patientToleranceEndsAt`, `doctorDeadlineAt`, `reconnectGraceEndsAt`),
`startedAt`, `endedAt`, `durationSeconds` y `pendingResolution`. Respuesta de `token`: `{ provider, authToken }`.

| Código | Error | Cuándo |
|---|---|---|
| 401 / 403 | Guards | Sin sesión o con otro rol |
| 403 | `PatientProfileRequiredError`, `DoctorProfileRequiredError` | El actor no tiene perfil |
| 404 | `AppointmentNotFoundError` | La cita no existe o es de otra persona |
| 409 | `InvalidAppointmentStateError` | La cita no está `confirmed` o ya tiene resultado |
| 409 | `SessionNotOpenError` (con `details.opensAt`) | Entrada antes de T0 − 15 |
| 409 | `DoctorNotInRoomError`, `PatientNotWaitingError`, `DoctorBusyError` | Condiciones de admisión |
| 409 | `SessionNotActiveError`, `SessionEndedError` | Credencial o finalización sin consulta activa; entrada a una consulta terminada |
| 422 | `DoctorNotOperationalError` | Médico sin `canOperate` en una operación protegida |
| 422 | `VideoProviderUnavailableError` | Proveedor sin configurar o caído. Es 422 y no 503 porque el filtro de errores no tiene un tipo para 503 |

## 4. Flujo

1. El paciente entra a la sala desde T0 − 15 (`enter`). Se crea la `meeting` (`scheduled`) y el evento `joined`.
2. El cliente envía latidos cada 15 s. Sin latido durante más de 45 s se registra `left` con la hora del último latido.
3. El médico entra a la sala de la cita (`enter`). Si tiene otra consulta activa, recibe `DoctorBusyError`.
4. El médico admite (`admit`): la `meeting` pasa a `active` y se fija `started_at`.
5. Los dos piden su credencial (`token`). La sala del proveedor se crea con el primer token.
6. El médico finaliza (`end`): `ended_at`, `completed` en M08 y revocación de las credenciales después del COMMIT.
7. En cada llamada y en el barrido `video-evaluate-sessions` se evalúan las inasistencias. Lo que una regla determina
   lo registra M08, y pagos reembolsa `no_show_doctor` y `no_show_both`.

Cada operación bloquea en este orden: médico (`doctor_profile FOR UPDATE`, el mismo candado que M08), `meeting` y,
al registrar un resultado, la cita (lo hace M08). Así una operación de sala y una cancelación concurrente se serializan
en el médico.

## 5. Reglas del evaluador

Valores de la política aplicada a la cita (AP-22): W = 30, Tol = 15, L = 60, G = 5. Plazo del médico
`D = min(max(T0, F) + W, T0 + L)` (AP-24); mientras el médico sigue ocupado, solo rige `T0 + L`.

| Regla | Instante | Condición | Resultado | Fuente |
|---|---|---|---|---|
| R1 | T0 + Tol | Paciente nunca conectado y médico en la sala de esta cita | `no_show_patient` | RN-026 |
| R2 | Entrada del médico, entre T0 + Tol y D | Paciente nunca conectado | `no_show_patient` | RN-026, RN-030 |
| R3 | D | Paciente no puntual y el médico no entró antes de D | `no_show_both` | RN-030, AP-25 |
| R4 | D | Paciente puntual, sin admisión, y disponible o con el médico sin entrar | `no_show_doctor` | RN-025, RN-032, AP-24 |
| R5 | Llegada del médico + W | Paciente puntual que se retiró y no volvió; el médico entró antes de D | `no_show_patient` | RN-033 (N13) |
| R6 | — | Ambos presentes antes de D | Consulta normal, por la admisión | AP-25 (N8) |

«Puntual»: primera entrada en `[T0 − 15, T0 + Tol]`. «Disponible»: puntual y conectado, o desconectado sin querer hace
menos de G. Tras una salida voluntaria no está disponible hasta que vuelve.

La evaluación es histórica: cada regla mira los eventos hasta su propio instante. El resultado no depende de cuándo se
evalúe. La matriz N1–N13 y E5–E11 está en `no-show-evaluator.spec.ts` (TC-VID-001 a TC-VID-017).

**Duración real (RF-22):** `ended_at − started_at`, de la admisión a la finalización. El bloque de agenda no interviene
(TC-VID-133).

## 6. Casos pendientes (sin regla en el Maestro)

El evaluador devuelve `pending` con un motivo. La cita sigue `confirmed`, el estado lo muestra en `pendingResolution` y el
barrido lo lista. Nunca se registra un resultado por ellos.

| Motivo | Caso |
|---|---|
| `r5_beyond_total_limit` | Hueco A: el plazo de R5 pasa de `T0 + L` |
| `late_patient_left_before_doctor` | Hueco B: el paciente tardío sale antes de que llegue el médico |
| `late_patient_not_admitted` | Hueco B: el paciente tardío está presente y el médico no lo admite (el médico todavía puede admitirlo) |
| `no_rule` | Cualquier otra combinación que ninguna regla cubre (por ejemplo, N13 con un regreso del paciente sin admisión) |

**Consulta que nunca se finaliza (decisión 12):** sigue `active` sin plazo. El barrido la lista con su hora de inicio
(TC-VID-134, RT-VID-06).

## 7. Presencia y proveedor

- La presencia lógica de PEI es la única base de las inasistencias. La conexión al proveedor solo existe después de la
  admisión, cuando ya no cabe inasistencia.
- Las horas son del servidor. Un latido solo avanza `*_last_seen_at` y nunca reabre una presencia cerrada: para volver
  está `enter`. Un `left` solo se registra si el último evento era `joined`.
- Webhooks del proveedor: no se procesan en esta entrega (decisión 6).
- **Revocación (decisión 7):** al finalizar se llama a `revokeAccess` para cada participante con credencial, después del
  COMMIT; un fallo se registra en el log y no deshace la finalización. Después, `token` responde 409.
  **Pendiente de verificar con una llamada real** si la revocación expulsa a quien sigue conectado; el cliente del médico
  debería además llamar a `kickAll()` del SDK.

## 8. Modelo de datos: migración 0019

Escrita en `src/db/proposals/video-v1/` y en `src/db/migrations/0019_video_v1.sql` (idénticas), registrada en el journal
y protegida (`pei.migration_authorized = '0019'`). Autorizada **solo para C2** (2026-11-22) y aplicada con
`scripts/c2-migrate.ts --apply`: C2 tiene las 20 migraciones del journal. En desarrollo se autorizó y aplicó el
2026-11-22 con `scripts/dev-migrate.ts --apply` (identidad `br-royal-recipe-b54s5hnn`); también tiene las 20.

| Cambio | Reversión |
|---|---|
| `meeting_session_event_type_enum` + `left_voluntarily` | No se puede retirar el valor |
| `refund_reason_enum` + `no_show_doctor`, `no_show_both` | No se pueden retirar los valores |
| `meeting.room_id` admite nulos (se conserva la unicidad) | Sí, si no hay filas con nulo |
| `meeting.patient_last_seen_at`, `doctor_last_seen_at` | Sí |
| `meeting.patient_provider_participant_id`, `doctor_provider_participant_id` | Sí |
| Triggers de solo inserción en `meeting_session_event` (`gst_append_only`, `gst_no_truncate`) | Sí |

La reversión (`0019_video_v1.down.sql`) solo procede sin videoconsultas ni reembolsos por inasistencia. En desarrollo,
mientras no se aplique 0019, el módulo de videoconsulta no funciona contra la base de datos; el resto de la API no se ve
afectado.

`meeting_session_event.created_at` se escribe con `clock_timestamp()` (no con el `now()` de la transacción): dos eventos
con la misma hora se ordenan por su inserción real. Lo detectó la validación en C2 (TC-VID-301).

## 9. Habilitación médica (RN-140, C-33)

Todas las operaciones del médico en la sala exigen `canOperate`, salvo la lectura del estado y **finalizar una consulta
que ya está activa y es suya**. La excepción no abre nada más: sin `canOperate` el médico no entra, no admite, no envía
latidos y no obtiene credenciales (TC-VID-140 a TC-VID-143, RT-VID-05). La auditoría de la finalización registra
`doctorCanOperate`.

Si el médico pierde la habilitación antes de admitir, el paciente sigue esperando y en D se aplica R4 (`no_show_doctor`
con reembolso total). Antes de eso, el médico puede cancelar con reembolso total (C-27).

## 10. Reembolsos por inasistencia

- M08 decide `refundOutcome` (`outcome-rules.ts`): `full_refund` para `no_show_doctor` y `no_show_both`, `no_refund` para
  `no_show_patient` y `completed`. Lo audita en la misma transacción y lo publica en `AppointmentOutcomeRecorded`.
- Pagos (`AppointmentNoShowRefundHandler`) reembolsa el saldo del pago de la raíz con el ámbito
  `refund.appointment_no_show` y el id del pago como clave. El evento en memoria y el barrido duradero
  (`ReconcileNoShowRefundsUseCase`, CLI `payments-reconcile-no-shows`) construyen la misma solicitud: uno crea el
  reembolso y el otro lo encuentra (TC-VID-172).
- Un pago no se reembolsa dos veces: cancelación e inasistencia son estados finales que se excluyen, y el saldo restante
  se calcula con el pago bloqueado (TC-VID-173).
- El flujo de cancelaciones no cambia: su manejador, su listener, su consulta duradera y su CLI siguen igual.

## 11. Pruebas de la entrega

| Grupo | Archivo | Qué cubre |
|---|---|---|
| Dominio | `video/domain/no-show-evaluator.spec.ts`, `presence.spec.ts` | N1–N13, E5–E11, casos pendientes, plazos, latidos |
| Casos de uso | `video/application/video-sessions.spec.ts` | Sala, admisión, finalización, RN-140 y C-33, barrido, pendientes, candados |
| HTTP | `video/presentation/video.http.spec.ts` | Guards, roles, UUID, traducción de errores |
| M08 | `appointments.use-cases.spec.ts`, `outcome-recorded-feed.spec.ts` | Evento, auditoría, consulta duradera |
| Pagos | `refunds.use-cases.spec.ts`, `appointment-canceled-refund.listener.spec.ts` | Reembolso por inasistencia, concurrencia, convivencia con cancelaciones |
| CLI | `cli/video-cli.spec.ts` | Contextos sin conexión y resúmenes |
| Esquema y arquitectura | `test/video-0019-schema.spec.ts`, `test/video-architecture.spec.ts` | Migración protegida y aditiva; dependencias permitidas |

| PostgreSQL (C2, rollback) | `test/integration/video.int-spec.ts` (TC-VID-300 a TC-VID-308) | 0019, sala, eventos de solo inserción, admisión y finalización, C-33, inasistencias, consulta duradera, reembolso idempotente |

Ejecutado en C2 el 2026-11-22: `video.int-spec.ts` 9/9 (evidencia `c2-20261123004756-e2ec`), y sin regresión
`appointments.int-spec.ts` 15/15 y `appointments-reschedule.int-spec.ts` 5/5. Todo con rollback: ningún dato quedó en C2.

No ejecutadas: llamada real al proveedor (revocación incluida); concurrencia real entre el evento y el barrido con dos
conexiones (cubierta con dobles y por la restricción única de `idempotency_key`); el evento en memoria y la revocación
después del COMMIT (con rollback nunca se confirma).

## 12. Siguientes pasos

1. ~~Aplicar 0019 en desarrollo~~ (hecho el 2026-11-22).
2. Confirmar el proveedor e implementar su adaptador; verificar la revocación con una llamada real.
3. Móvil (Etapa 3): `joincall.tsx` ya usa `enter`, latidos, salida, reconexión, `pendingResolution` y `token` (sin commit). Falta probarlo en dispositivo contra el backend local y con el proveedor real.
4. Web del médico (Etapa 4): lista de salas, entrar, admitir, llamada y finalizar.
5. Resolver los huecos A y B, y definir la periodicidad de los dos barridos.
