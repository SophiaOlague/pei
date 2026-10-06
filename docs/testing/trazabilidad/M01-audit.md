# Trazabilidad M01: Audit Trail de PEI

Ejecución de referencia: [`2026-10-06T03-25-17_b622ecc-dirty_M01`](../ejecuciones/2026-10-06T03-25-17_b622ecc-dirty_M01/resumen.md)
(commit base `b622ecc` con los cambios de M01 sin commit). Los resultados de esta página se copiaron de esa ejecución.
Validación y aplicación de las migraciones: [`2026-10-06_M01-migraciones`](../ejecuciones/2026-10-06_M01-migraciones/validacion-y-aplicacion.md).

## Alcance

M01 entrega la infraestructura transversal de auditoría de PEI: `AuditEvent`, `AuditActor`, el puerto `AuditTrail`, el adaptador
`DrizzleAuditTrail`, `AuditModule` y la integridad de `audit_log` en PostgreSQL (migraciones `0002_audit_log_actor` y `0003_audit_log_guards`).
Los eventos concretos (aprobaciones, canjes, cierres, soporte, etc.) los registra cada módulo de PEI con este puerto.

## Requisitos técnicos derivados (RT)

No son requisitos del Documento Maestro: son condiciones de diseño aprobadas para M01.

| ID | Requisito técnico | Decisión |
|---|---|---|
| RT-M01-01 | La auditoría forma parte de la transacción de la operación: se confirma o revierte con ella, y `record()` falla fuera de una `UnitOfWork`. | D1, D6 |
| RT-M01-02 | Dos operaciones concurrentes auditan sin esperarse entre sí. | Diseño de concurrencia |
| RT-M01-03 | PostgreSQL fija `created_at` con `now()` (inicio de la transacción); la aplicación no puede establecerlo. No se garantiza un orden total de eventos. | D3 |

## Matriz

Tipo: **RF** requisito funcional · **RN** regla de negocio · **RNF** requisito no funcional · **RT** requisito técnico.

| Requisito | Tipo | Regla / caso de uso | Componente | Casos de prueba | Script | Resultado | Cobertura |
|---|---|---|---|---|---|---|---|
| RF-52 Acciones sensibles registradas con actor, acción, recurso, fecha, IP y user-agent | RF | Registrar un evento con todos sus campos | `AuditEvent`, `DrizzleAuditTrail`, `audit_log` | TC-M01-001, 005, 006, 011, 100, 105, 200, 204 | `src/modules/audit/**/*.spec.ts`, `test/integration/audit-trail.int-spec.ts`, `test/audit.e2e-spec.ts`, `test/audit-db.e2e-spec.ts` | PASS | Parcial: infraestructura completa; cada módulo debe registrar sus acciones sensibles |
| RNF-08 Auditoría append-only protegida | RNF | `audit_log` no admite UPDATE, DELETE ni TRUNCATE | Triggers `audit_log_append_only` (0001) y `audit_log_no_truncate` (0003) | TC-M00-120, TC-M01-106 | `test/integration/postgres-errors.int-spec.ts`, `test/integration/audit-trail.int-spec.ts` | PASS | Completa frente a UPDATE, DELETE y TRUNCATE; el rol dueño, que hoy usa el backend, aún puede desactivar los triggers (D7) |
| RN-119 `audit_log` transversal y append-only | RN | Ídem; el puerto solo permite agregar eventos | `AuditTrail`, triggers | TC-M00-120, TC-M01-106 | Ídem | PASS | Ídem |
| RN-120 Actor user o system | RN | Actor usuario (con o sin perfil) o sistema (con proceso); coherencia en la BD | `AuditActor`, `audit_log_actor_chk`, `gst_audit_log_before_insert` | TC-M01-002, 003, 004, 008, 011, 100, 102, 105, 107, 109, 114, 200, 204 | `src/modules/audit/**/*.spec.ts`, `test/integration/audit-trail.int-spec.ts`, `test/*.e2e-spec.ts` | PASS | Completa |
| RN-121 IP y user-agent | RN | Se copian del `Actor` del request al evento | `AuditActor.fromActor`, `extractRequestMetadata` (M00) | TC-M01-008, 011, 100, 200, 204 (y TC-M00 de captura) | Ídem | PASS | Completa para eventos de usuario con la IP del socket; detrás de un proxy depende de `trust proxy` (deuda M00 #3). Los eventos de sistema no tienen IP ni user-agent |
| RN-122 Sin contenido clínico completo en `audit_log` | RN | `metadata` JSON serializable de máximo 4 KB, con advertencia documentada | Validación de `AuditEvent` | TC-M01-007 | `src/modules/audit/domain/audit-event.spec.ts` | PASS | **Parcial por diseño**: la validación limita forma y tamaño, no detecta contenido clínico; el cumplimiento depende de cada módulo y de la revisión de código |
| RN-123 Los módulos conservan sus historiales | RN | M01 no crea triggers genéricos ni duplica historiales | Decisión D5 | — (revisión de diseño) | — | — | Límite de diseño, sin prueba automatizada |
| RF-02 Roles y permisos | RF | Una acción sin permiso no genera evento | `RolesGuard` (M00) + `AuditTrail` | TC-M01-202 | `test/audit.e2e-spec.ts` | PASS | Complementa M00 |
| RNF-01 Autenticación | RNF | Una acción sin sesión no genera evento | `SessionGuard` (M00) + `AuditTrail` | TC-M01-201 | `test/audit.e2e-spec.ts` | PASS | Complementa M00 |
| RT-M01-01 | RT | Atomicidad con la operación; transacción obligatoria | `DrizzleAuditTrail`, `UnitOfWork` (M00) | TC-M01-010, 013, 101, 102, 103, 104, 203 | `src/modules/audit/infrastructure/drizzle-audit-trail.spec.ts`, `test/integration/audit-trail.int-spec.ts`, `test/audit.e2e-spec.ts` | PASS | Completa |
| RT-M01-02 | RT | Inserciones concurrentes sin bloqueo | `audit_log` | TC-M01-110 | `test/integration/audit-trail.int-spec.ts` | PASS | Completa para actor sistema; actor usuario no probado (los locks de las FK son compartidos) |
| RT-M01-03 | RT | `created_at` fijado por PostgreSQL | `gst_audit_log_before_insert` | TC-M01-108, 204 | `test/integration/audit-trail.int-spec.ts`, `test/audit-db.e2e-spec.ts` | PASS | Completa |

Casos sin etiqueta de requisito: TC-M01-009 (inmutabilidad del actor y del evento) y TC-M01-012 (`correlationId` opcional, decisión D8).

## Casos de prueba de M01

| Suite | Casos | Ejecuciones | Resultado |
|---|---|---|---|
| Unitarias | TC-M01-001 a 013 | 45 | 45/45 PASS |
| Integración (BD de PEI, siempre con rollback) | TC-M01-100 a 110 y TC-M01-114 | 12 | 12/12 PASS |
| E2E con dobles (sin BD) | TC-M01-200 a 203 | 4 | 4/4 PASS |
| E2E con PostgreSQL real y rollback forzado | TC-M01-204 | 1 | 1/1 PASS |
| **Total M01** | | **62** | **62/62 PASS** |

**TC-M01-111, TC-M01-112 y TC-M01-113 no existen.** No son pruebas omitidas ni pendientes: la numeración de integración salta de 110 a 114.
No se renumeró para conservar la correspondencia con la evidencia ya generada.

## Regresión

En la misma ejecución, las 137 pruebas anteriores a M01 (M00 y las previas a M00) pasan 137/137. Total de la corrida: **199/199 PASS**
(unitarias 131, integración 36, E2E 32), 0 FAIL, 0 NO EJECUTADA.

TC-M00-120 y TC-M00-130 fallaron mientras el esquema de Drizzle ya tenía `actor_user_id` y la BD no (Drizzle inserta todas las columnas del esquema);
después de aplicar `0002` y `0003` pasan.

## Deuda técnica y límites conocidos

| # | Elemento | Estado |
|---|---|---|
| 1 | Rol de BD de mínimo privilegio: el backend usa el rol dueño, que puede desactivar los triggers | Fuera de M01 (D7), trabajo de infraestructura separado |
| 2 | `TRUNCATE` en las otras tablas de solo inserción (`appointment_status_history`, `order_status_history`, `legal_document`, `user_legal_acceptance`, `doctor_payout_*`) | Fuera de M01 (C7); en sus módulos o en un hardening posterior |
| 3 | Índice `(entity_type, entity_id)` | Diferido hasta que exista una consulta real (C6) |
| 4 | Eventos que deban sobrevivir al rollback (intentos fallidos) | Fuera de M01 (D2) |
| 5 | Contenido clínico en `metadata` | La validación no lo detecta (RN-122 parcial por diseño) |
| 6 | El código `42703` (columna inexistente) no tiene traducción y responde 500 | Sin cambio; solo ocurre si el esquema y la BD están desalineados |
| 7 | Eventos de módulos (Identity, Doctors, Agenda, Citas, Expediente, Soporte, Pagos, etc.) | Responsabilidad de cada módulo |
