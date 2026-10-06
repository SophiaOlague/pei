# Ejecución de pruebas 2026-10-06T03-53-14_727ea2a_M01

| Campo | Valor |
|---|---|
| Inicio | 2026-10-06T03:53:14.609Z |
| Fin | 2026-10-06T03:54:01.572Z |
| Commit | 727ea2a |
| Etiqueta | M01 |
| Node.js | v24.19.0 |
| Sistema operativo | Windows_NT 10.0.26200 (x64) |
| Base de datos | PostgreSQL en Neon (BD de desarrollo; host omitido) |

## Totales por suite

| Suite | Total | PASS | FAIL | NO EJECUTADA |
|---|---|---|---|---|
| Unitarias | 131 | 131 | 0 | 0 |
| Integración (BD de desarrollo, rollback) | 36 | 36 | 0 | 0 |
| E2E / API | 32 | 32 | 0 | 0 |

## Resultado por requisito

| Requisito | Casos de prueba | Resultado |
|---|---|---|
| RF-02 | TC-M00-040, TC-M00-041, TC-M00-042, TC-M00-043, TC-M00-046, TC-M00-150, TC-M00-210, TC-M00-211, TC-M00-220, TC-M00-221, TC-M00-224, TC-M00-225, TC-M00-242, TC-M00-243, TC-M01-202 | PASS |
| RF-52 | TC-M01-001, TC-M01-005, TC-M01-006, TC-M01-011, TC-M01-100, TC-M01-105, TC-M01-200, TC-M01-204 | PASS |
| RN-001 | TC-M00-040, TC-M00-051, TC-M00-150, TC-M00-222 | PASS |
| RN-002 | TC-M00-043, TC-M00-052, TC-M00-150, TC-M00-151, TC-M00-211 | PASS |
| RN-006 | TC-M00-121 | PASS |
| RN-119 | TC-M00-120, TC-M01-106 | PASS |
| RN-120 | TC-M01-002, TC-M01-003, TC-M01-004, TC-M01-008, TC-M01-011, TC-M01-100, TC-M01-102, TC-M01-105, TC-M01-107, TC-M01-109, TC-M01-114, TC-M01-200, TC-M01-204 | PASS |
| RN-121 | TC-M00-051, TC-M00-060, TC-M00-061, TC-M00-062, TC-M00-063, TC-M00-064, TC-M00-222, TC-M01-008, TC-M01-011, TC-M01-100, TC-M01-200, TC-M01-204 | PASS |
| RN-122 | TC-M01-007 | PASS |
| RNF-01 | TC-M00-044, TC-M00-050, TC-M00-200, TC-M00-201, TC-M00-233, TC-M00-240, TC-M00-241, TC-M01-201 | PASS |
| RNF-05 | TC-M00-111 | PASS |
| RNF-08 | TC-M00-120, TC-M01-106 | PASS |
| RNF-10 | TC-M00-002, TC-M00-030, TC-M00-031, TC-M00-032, TC-M00-033, TC-M00-045, TC-M00-065, TC-M00-066, TC-M00-071, TC-M00-073, TC-M00-130, TC-M00-212, TC-M00-223, TC-M00-230, TC-M00-231, TC-M00-232 | PASS |
| RNF-12 | TC-M00-121, TC-M00-122 | PASS |
| RNF-17 | TC-M00-113, TC-M00-140 | PASS |
| RT-M00-01 | TC-M00-001, TC-M00-070 | PASS |
| RT-M00-02 | TC-M00-020, TC-M00-022, TC-M00-100, TC-M00-101, TC-M00-102, TC-M00-103, TC-M00-104, TC-M00-106, TC-M00-107 | PASS |
| RT-M00-03 | TC-M00-002, TC-M00-003, TC-M00-010, TC-M00-011, TC-M00-012, TC-M00-013, TC-M00-014, TC-M00-015, TC-M00-021, TC-M00-071, TC-M00-072, TC-M00-105, TC-M00-110, TC-M00-111, TC-M00-112, TC-M00-113, TC-M00-120, TC-M00-121, TC-M00-122, TC-M00-130 | PASS |
| RT-M00-04 | TC-M00-023 | PASS |
| RT-M00-05 | TC-M00-140, TC-M00-141 | PASS |
| RT-M01-01 | TC-M01-010, TC-M01-013, TC-M01-101, TC-M01-102, TC-M01-103, TC-M01-104, TC-M01-203 | PASS |
| RT-M01-02 | TC-M01-110 | PASS |
| RT-M01-03 | TC-M01-108, TC-M01-204 | PASS |

## Resultado por caso de prueba

| Caso | Requisitos | Script | Ejecuciones | Resultado |
|---|---|---|---|---|
| (sin TC: prueba previa a M00) | — | src/app.controller.spec.ts<br>src/common/filters/domain-exception.filter.spec.ts<br>src/modules/identity/identity.controller.spec.ts<br>test/app.e2e-spec.ts | 19/19 PASS | PASS |
| TC-M00-001 | RT-M00-01 | src/common/domain/domain-error.spec.ts | 1/1 PASS | PASS |
| TC-M00-002 | RNF-10, RT-M00-03 | src/common/domain/domain-error.spec.ts | 6/6 PASS | PASS |
| TC-M00-003 | RT-M00-03 | src/common/domain/domain-error.spec.ts | 1/1 PASS | PASS |
| TC-M00-010 | RT-M00-03 | src/common/infrastructure/postgres-error-translator.spec.ts | 9/9 PASS | PASS |
| TC-M00-011 | RT-M00-03 | src/common/infrastructure/postgres-error-translator.spec.ts | 1/1 PASS | PASS |
| TC-M00-012 | RT-M00-03 | src/common/infrastructure/postgres-error-translator.spec.ts | 1/1 PASS | PASS |
| TC-M00-013 | RT-M00-03 | src/common/infrastructure/postgres-error-translator.spec.ts | 1/1 PASS | PASS |
| TC-M00-014 | RT-M00-03 | src/common/infrastructure/postgres-error-translator.spec.ts | 5/5 PASS | PASS |
| TC-M00-015 | RT-M00-03 | src/common/infrastructure/postgres-error-translator.spec.ts | 1/1 PASS | PASS |
| TC-M00-020 | RT-M00-02 | src/common/infrastructure/drizzle-unit-of-work.spec.ts | 1/1 PASS | PASS |
| TC-M00-021 | RT-M00-03 | src/common/infrastructure/drizzle-unit-of-work.spec.ts | 1/1 PASS | PASS |
| TC-M00-022 | RT-M00-02 | src/common/infrastructure/drizzle-unit-of-work.spec.ts | 1/1 PASS | PASS |
| TC-M00-023 | RT-M00-04 | src/common/infrastructure/drizzle-unit-of-work.spec.ts | 1/1 PASS | PASS |
| TC-M00-030 | RNF-10 | src/common/validation/create-validation-pipe.spec.ts | 1/1 PASS | PASS |
| TC-M00-031 | RNF-10 | src/common/validation/create-validation-pipe.spec.ts | 1/1 PASS | PASS |
| TC-M00-032 | RNF-10 | src/common/validation/create-validation-pipe.spec.ts | 4/4 PASS | PASS |
| TC-M00-033 | RNF-10 | src/common/validation/create-validation-pipe.spec.ts | 1/1 PASS | PASS |
| TC-M00-040 | RF-02, RN-001 | src/auth/roles.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-041 | RF-02 | src/auth/roles.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-042 | RF-02 | src/auth/roles.guard.spec.ts | 3/3 PASS | PASS |
| TC-M00-043 | RF-02, RN-002 | src/auth/roles.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-044 | RNF-01 | src/auth/roles.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-045 | RNF-10 | src/auth/roles.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-046 | RF-02 | src/auth/roles.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-050 | RNF-01 | src/auth/session.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-051 | RN-001, RN-121 | src/auth/session.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-052 | RN-002 | src/auth/session.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-053 | — | src/auth/session.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-054 | — | src/auth/session.guard.spec.ts | 1/1 PASS | PASS |
| TC-M00-060 | RN-121 | src/auth/authenticated-request.spec.ts | 1/1 PASS | PASS |
| TC-M00-061 | RN-121 | src/auth/authenticated-request.spec.ts | 1/1 PASS | PASS |
| TC-M00-062 | RN-121 | src/auth/authenticated-request.spec.ts | 1/1 PASS | PASS |
| TC-M00-063 | RN-121 | src/auth/authenticated-request.spec.ts | 1/1 PASS | PASS |
| TC-M00-064 | RN-121 | src/auth/authenticated-request.spec.ts | 1/1 PASS | PASS |
| TC-M00-065 | RNF-10 | src/auth/authenticated-request.spec.ts | 1/1 PASS | PASS |
| TC-M00-066 | RNF-10 | src/auth/authenticated-request.spec.ts | 1/1 PASS | PASS |
| TC-M00-067 | — | src/auth/authenticated-request.spec.ts | 1/1 PASS | PASS |
| TC-M00-070 | RT-M00-01 | src/common/filters/domain-exception.filter.spec.ts | 6/6 PASS | PASS |
| TC-M00-071 | RNF-10, RT-M00-03 | src/common/filters/domain-exception.filter.spec.ts | 1/1 PASS | PASS |
| TC-M00-072 | RT-M00-03 | src/common/filters/domain-exception.filter.spec.ts | 1/1 PASS | PASS |
| TC-M00-073 | RNF-10 | src/common/filters/domain-exception.filter.spec.ts | 1/1 PASS | PASS |
| TC-M00-100 | RT-M00-02 | test/integration/unit-of-work.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-101 | RT-M00-02 | test/integration/unit-of-work.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-102 | RT-M00-02 | test/integration/unit-of-work.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-103 | RT-M00-02 | test/integration/unit-of-work.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-104 | RT-M00-02 | test/integration/unit-of-work.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-105 | RT-M00-03 | test/integration/unit-of-work.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-106 | RT-M00-02 | test/integration/unit-of-work.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-107 | RT-M00-02 | test/integration/unit-of-work.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-110 | RT-M00-03 | test/integration/postgres-errors.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-111 | RNF-05, RT-M00-03 | test/integration/postgres-errors.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-112 | RT-M00-03 | test/integration/postgres-errors.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-113 | RNF-17, RT-M00-03 | test/integration/postgres-errors.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-120 | RN-119, RNF-08, RT-M00-03 | test/integration/postgres-errors.int-spec.ts | 2/2 PASS | PASS |
| TC-M00-121 | RN-006, RNF-12, RT-M00-03 | test/integration/postgres-errors.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-122 | RNF-12, RT-M00-03 | test/integration/postgres-errors.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-130 | RNF-10, RT-M00-03 | test/integration/postgres-errors.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-140 | RNF-17, RT-M00-05 | test/integration/concurrency.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-141 | RT-M00-05 | test/integration/concurrency.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-150 | RF-02, RN-001, RN-002 | test/integration/actor-profile-reader.int-spec.ts | 4/4 PASS | PASS |
| TC-M00-151 | RN-002 | test/integration/actor-profile-reader.int-spec.ts | 1/1 PASS | PASS |
| TC-M00-200 | RNF-01 | test/auth-guards.e2e-spec.ts | 3/3 PASS | PASS |
| TC-M00-201 | RNF-01 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-210 | RF-02 | test/auth-guards.e2e-spec.ts | 3/3 PASS | PASS |
| TC-M00-211 | RF-02, RN-002 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-212 | RNF-10 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-220 | RF-02 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-221 | RF-02 | test/auth-guards.e2e-spec.ts | 2/2 PASS | PASS |
| TC-M00-222 | RN-001, RN-121 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-223 | RNF-10 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-224 | RF-02 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-225 | RF-02 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-230 | RNF-10 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-231 | RNF-10 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-232 | RNF-10 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-233 | RNF-01 | test/auth-guards.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-240 | RNF-01 | test/me.e2e-spec.ts | 3/3 PASS | PASS |
| TC-M00-241 | RNF-01 | test/me.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-242 | RF-02 | test/me.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M00-243 | RF-02 | test/me.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M01-001 | RF-52 | src/modules/audit/domain/audit-event.spec.ts | 3/3 PASS | PASS |
| TC-M01-002 | RN-120 | src/modules/audit/domain/audit-actor.spec.ts | 1/1 PASS | PASS |
| TC-M01-003 | RN-120 | src/modules/audit/domain/audit-event.spec.ts<br>src/modules/audit/domain/audit-actor.spec.ts | 2/2 PASS | PASS |
| TC-M01-004 | RN-120 | src/modules/audit/domain/audit-event.spec.ts<br>src/modules/audit/domain/audit-actor.spec.ts | 7/7 PASS | PASS |
| TC-M01-005 | RF-52 | src/modules/audit/domain/audit-event.spec.ts | 7/7 PASS | PASS |
| TC-M01-006 | RF-52 | src/modules/audit/domain/audit-event.spec.ts | 4/4 PASS | PASS |
| TC-M01-007 | RN-122 | src/modules/audit/domain/audit-event.spec.ts | 13/13 PASS | PASS |
| TC-M01-008 | RN-120, RN-121 | src/modules/audit/domain/audit-actor.spec.ts | 1/1 PASS | PASS |
| TC-M01-009 | — | src/modules/audit/domain/audit-event.spec.ts<br>src/modules/audit/domain/audit-actor.spec.ts | 2/2 PASS | PASS |
| TC-M01-010 | RT-M01-01 | src/modules/audit/infrastructure/drizzle-audit-trail.spec.ts | 1/1 PASS | PASS |
| TC-M01-011 | RF-52, RN-120, RN-121 | src/modules/audit/infrastructure/drizzle-audit-trail.spec.ts | 2/2 PASS | PASS |
| TC-M01-012 | — | src/modules/audit/domain/audit-event.spec.ts | 1/1 PASS | PASS |
| TC-M01-013 | RT-M01-01 | src/modules/audit/infrastructure/drizzle-audit-trail.spec.ts | 1/1 PASS | PASS |
| TC-M01-100 | RF-52, RN-120, RN-121 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-101 | RT-M01-01 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-102 | RN-120, RT-M01-01 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-103 | RT-M01-01 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-104 | RT-M01-01 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-105 | RF-52, RN-120 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-106 | RN-119, RNF-08 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-107 | RN-120 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-108 | RT-M01-03 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-109 | RN-120 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-110 | RT-M01-02 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-114 | RN-120 | test/integration/audit-trail.int-spec.ts | 1/1 PASS | PASS |
| TC-M01-200 | RF-52, RN-120, RN-121 | test/audit.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M01-201 | RNF-01 | test/audit.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M01-202 | RF-02 | test/audit.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M01-203 | RT-M01-01 | test/audit.e2e-spec.ts | 1/1 PASS | PASS |
| TC-M01-204 | RF-52, RN-120, RN-121, RT-M01-03 | test/audit-db.e2e-spec.ts | 1/1 PASS | PASS |

## Detalle

| Suite | Prueba | Resultado | ms |
|---|---|---|---|
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 23505 → [Function UniqueConstraintViolationError] | PASS | 7 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 23P01 → [Function ExclusionConstraintViolationError] | PASS | 1 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 23503 → [Function ReferenceViolationError] | PASS | 3 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 23514 → [Function IntegrityConstraintViolationError] | PASS | 1 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 23502 → [Function IntegrityConstraintViolationError] | PASS | 1 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE P0001 → [Function BusinessRuleViolationError] | PASS | 1 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 40001 → [Function ConcurrencyConflictError] | PASS | 1 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 40P01 → [Function ConcurrencyConflictError] | PASS | 1 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 55P03 → [Function ConcurrencyConflictError] | PASS | 3 |
| unit | translatePostgresError [TC-M00-011][RT-M00-03] P0001 conserva el mensaje escrito por el trigger | PASS | 4 |
| unit | translatePostgresError [TC-M00-012][RT-M00-03] encuentra el error del driver directamente o a varios niveles de "cause" | PASS | 1 |
| unit | translatePostgresError [TC-M00-013][RT-M00-03] deja de buscar después de 5 niveles de "cause" | PASS | 1 |
| unit | translatePostgresError [TC-M00-014][RT-M00-03] error genérico → null (se trata como error interno) | PASS | 0 |
| unit | translatePostgresError [TC-M00-014][RT-M00-03] error de red de Node con code de 5 letras pero sin severity → null (se trata como error interno) | PASS | 0 |
| unit | translatePostgresError [TC-M00-014][RT-M00-03] SQLSTATE sin traducción (42P01 tabla inexistente) → null (se trata como error interno) | PASS | 0 |
| unit | translatePostgresError [TC-M00-014][RT-M00-03] valor que no es objeto → null (se trata como error interno) | PASS | 0 |
| unit | translatePostgresError [TC-M00-014][RT-M00-03] null → null (se trata como error interno) | PASS | 0 |
| unit | translatePostgresError [TC-M00-015][RT-M00-03] un DomainError no se vuelve a traducir | PASS | 1 |
| unit | AuditEvent [TC-M01-001][RF-52] evento completo: actor, acción, entidad y metadata | PASS | 10 |
| unit | AuditEvent [TC-M01-001][RF-52] la entidad y la metadata son opcionales | PASS | 1 |
| unit | AuditEvent [TC-M01-001][RF-52] tipo de entidad sin id (acción sobre un conjunto) | PASS | 0 |
| unit | AuditEvent [TC-M01-003][RN-120] el nombre del proceso del actor sistema queda en metadata.systemProcess | PASS | 0 |
| unit | AuditEvent [TC-M01-012] correlationId opcional (D8) se guarda en metadata.correlationId | PASS | 2 |
| unit | AuditEvent [TC-M01-004][RN-120] sin actor → InvalidAuditEventError | PASS | 50 |
| unit | AuditEvent [TC-M01-005][RF-52] acción "" fuera de la convención → InvalidAuditEventError | PASS | 2 |
| unit | AuditEvent [TC-M01-005][RF-52] acción "identity" fuera de la convención → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent [TC-M01-005][RF-52] acción "identity.doctor" fuera de la convención → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent [TC-M01-005][RF-52] acción "Identity.Doctor.Approved" fuera de la convención → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent [TC-M01-005][RF-52] acción "identity.doctor.approved!" fuera de la convención → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent [TC-M01-005][RF-52] acción "identity..approved" fuera de la convención → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent [TC-M01-005][RF-52] acción "identity.doctor.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" fuera de la convención → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent [TC-M01-006][RF-52] entity.type en mayúsculas → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent [TC-M01-006][RF-52] entity.type vacío → InvalidAuditEventError | PASS | 0 |
| unit | AuditEvent [TC-M01-006][RF-52] entity.id que no es UUID → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent [TC-M01-006] correlationId con caracteres no permitidos → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata con un arreglo → InvalidAuditEventError | PASS | 2 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata con una instancia de clase → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata con un valor undefined → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata con una función → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata con un Date anidado → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata con un número no finito → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata con un BigInt → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata con una referencia circular → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata con la clave reservada correlationId → InvalidAuditEventError | PASS | 1 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata con la clave reservada systemProcess → InvalidAuditEventError | PASS | 2 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] acepta JSON anidado: objetos, arreglos, null y booleanos | PASS | 1 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007][RN-122] metadata de exactamente 4096 bytes se acepta; un byte más se rechaza | PASS | 3 |
| unit | AuditEvent metadata (RN-122: límite técnico de forma y tamaño; no valida el significado) [TC-M01-007] el límite cuenta bytes UTF-8, no caracteres | PASS | 4 |
| unit | AuditEvent [TC-M01-009] el evento y su metadata son inmutables y no dependen del objeto original | PASS | 0 |
| unit | AuditActor [TC-M01-008][RN-120][RN-121] fromActor copia usuario, perfil, IP y user-agent del request | PASS | 8 |
| unit | AuditActor [TC-M01-002][RN-120] usuario autenticado sin user_profile → actor usuario con perfil nulo | PASS | 4 |
| unit | AuditActor [TC-M01-003][RN-120] actor sistema con nombre de proceso, sin IP ni user-agent | PASS | 1 |
| unit | AuditActor [TC-M01-004][RN-120] proceso vacío → InvalidAuditEventError | PASS | 39 |
| unit | AuditActor [TC-M01-004][RN-120] proceso en mayúsculas → InvalidAuditEventError | PASS | 2 |
| unit | AuditActor [TC-M01-004][RN-120] proceso de más de 100 caracteres → InvalidAuditEventError | PASS | 1 |
| unit | AuditActor [TC-M01-004][RN-120] usuario sin userId → InvalidAuditEventError | PASS | 1 |
| unit | AuditActor [TC-M01-004][RN-120] actor ausente → InvalidAuditEventError | PASS | 1 |
| unit | AuditActor [TC-M01-004][RN-120] userProfileId que no es UUID → InvalidAuditEventError | PASS | 1 |
| unit | AuditActor [TC-M01-009] el actor queda congelado | PASS | 6 |
| unit | DomainError [TC-M00-001][RT-M00-01] una subclase es Error y DomainError, con su nombre de clase y su kind | PASS | 3 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] UniqueConstraintViolationError tiene kind conflict y no expone la constraint en el mensaje | PASS | 1 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] ExclusionConstraintViolationError tiene kind conflict y no expone la constraint en el mensaje | PASS | 1 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] ReferenceViolationError tiene kind validation y no expone la constraint en el mensaje | PASS | 1 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] IntegrityConstraintViolationError tiene kind validation y no expone la constraint en el mensaje | PASS | 1 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] BusinessRuleViolationError tiene kind business_rule y no expone la constraint en el mensaje | PASS | 0 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] ConcurrencyConflictError tiene kind conflict y no expone la constraint en el mensaje | PASS | 1 |
| unit | DomainError errores de persistencia [TC-M00-003][RT-M00-03] BusinessRuleViolationError conserva el mensaje del trigger | PASS | 0 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-060][RN-121] toma la IP de request.ip y el user-agent del header | PASS | 3 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-061][RN-121] normaliza IPv4 representada como IPv6 | PASS | 1 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-062][RN-121] conserva IPv6 real | PASS | 0 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-063][RN-121] sin request.ip usa la dirección del socket | PASS | 1 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-064][RN-121] sin IP ni user-agent → null en ambos | PASS | 0 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-065][RNF-10] ignora X-Forwarded-For: la IP no se toma de headers del cliente | PASS | 1 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-066][RNF-10] trunca user-agents de más de 512 caracteres | PASS | 1 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-067] user-agent vacío → null | PASS | 0 |
| unit | SessionGuard (contexto del actor) [TC-M00-050][RNF-01] sin sesión → 401 y no consulta el perfil | PASS | 29 |
| unit | SessionGuard (contexto del actor) [TC-M00-051][RN-001][RN-121] con sesión y perfil → actor con perfil, rol, IP y user-agent | PASS | 3 |
| unit | SessionGuard (contexto del actor) [TC-M00-052][RN-002] con sesión pero sin perfil de dominio → autenticado, sin rol | PASS | 2 |
| unit | SessionGuard (contexto del actor) [TC-M00-053] conserva request.session tal como la entrega el proveedor (respuesta de /me sin cambios) | PASS | 1 |
| unit | SessionGuard (contexto del actor) [TC-M00-054] pasa los headers del request al proveedor de sesión | PASS | 1 |
| unit | RolesGuard [TC-M00-040][RF-02][RN-001] rol permitido → acceso | PASS | 6 |
| unit | RolesGuard [TC-M00-041][RF-02] cualquiera de varios roles permitidos → acceso | PASS | 1 |
| unit | RolesGuard [TC-M00-042][RF-02] rol patient en ruta de admin → 403 | PASS | 22 |
| unit | RolesGuard [TC-M00-042][RF-02] rol doctor en ruta de admin → 403 | PASS | 1 |
| unit | RolesGuard [TC-M00-042][RF-02] rol organization en ruta de admin → 403 | PASS | 1 |
| unit | RolesGuard [TC-M00-043][RF-02][RN-002] usuario autenticado sin perfil de dominio → 403 | PASS | 2 |
| unit | RolesGuard [TC-M00-044][RNF-01] sin actor (no pasó por SessionGuard) → 401 | PASS | 1 |
| unit | RolesGuard [TC-M00-045][RNF-10] ruta sin @Roles → 403 aunque el actor sea admin (falla cerrado) | PASS | 1 |
| unit | RolesGuard [TC-M00-046][RF-02] @Roles a nivel de clase aplica a sus handlers y el del handler tiene prioridad | PASS | 1 |
| unit | DrizzleUnitOfWork (sin BD) [TC-M00-020][RT-M00-02] con una transacción activa abre la unidad dentro de ella y la expone a los repositorios | PASS | 7 |
| unit | DrizzleUnitOfWork (sin BD) [TC-M00-021][RT-M00-03] traduce el error de PostgreSQL que sale de la transacción | PASS | 1 |
| unit | DrizzleUnitOfWork (sin BD) [TC-M00-022][RT-M00-02] un error que no es de PostgreSQL se propaga sin cambios | PASS | 1 |
| unit | SystemClock [TC-M00-023][RT-M00-04] devuelve la hora actual del sistema | PASS | 1 |
| unit | DrizzleAuditTrail (sin BD) [TC-M01-010][RT-M01-01] fuera de una UnitOfWork → AuditOutsideTransactionError | PASS | 6 |
| unit | DrizzleAuditTrail (sin BD) [TC-M01-011][RF-52][RN-121] inserta en audit_log el actor usuario con IP y user-agent, sin created_at | PASS | 3 |
| unit | DrizzleAuditTrail (sin BD) [TC-M01-011][RN-120] actor sistema → sin usuario, perfil, IP ni user-agent | PASS | 1 |
| unit | DrizzleAuditTrail (sin BD) [TC-M01-013][RT-M01-01] un error de PostgreSQL al insertar se traduce a error de dominio | PASS | 1 |
| unit | createValidationPipe [TC-M00-030][RNF-10] payload válido → instancia del DTO | PASS | 9 |
| unit | createValidationPipe [TC-M00-031][RNF-10] propiedad no declarada → 400 (protección contra asignación masiva) | PASS | 1 |
| unit | createValidationPipe [TC-M00-032][RNF-10] {"name":123,"quantity":2} → 400 con "name must be a string" | PASS | 1 |
| unit | createValidationPipe [TC-M00-032][RNF-10] {"name":"Truvada","quantity":1.5} → 400 con "quantity must be an integer number" | PASS | 0 |
| unit | createValidationPipe [TC-M00-032][RNF-10] {"name":"Truvada","quantity":0} → 400 con "quantity must not be less than 1" | PASS | 1 |
| unit | createValidationPipe [TC-M00-032][RNF-10] {"name":"Truvada"} → 400 con "quantity must be an integer number" | PASS | 1 |
| unit | createValidationPipe [TC-M00-033][RNF-10] un body tipado como objeto literal (sin clase DTO) no se valida: comportamiento previo de /me/complete-profile | PASS | 0 |
| unit | AppController root should return "Hello World!" | PASS | 330 |
| unit | DomainExceptionFilter excepciones HTTP de Nest UnauthorizedException → 401 con el cuerpo por defecto de Nest | PASS | 8 |
| unit | DomainExceptionFilter excepciones HTTP de Nest BadRequestException → 400 con el cuerpo por defecto de Nest | PASS | 1 |
| unit | DomainExceptionFilter excepciones HTTP de Nest HttpException con cuerpo en texto → { statusCode, message } | PASS | 1 |
| unit | DomainExceptionFilter excepciones HTTP de Nest HttpException con cuerpo personalizado → se conserva tal cual | PASS | 0 |
| unit | DomainExceptionFilter excepciones de dominio (comportamiento existente) [DuplicateCurpError: Ya existe un paciente registrado con el CURP PRUE900101HDFRRS03] → 400 | PASS | 1 |
| unit | DomainExceptionFilter excepciones de dominio (comportamiento existente) [TermsNotAcceptedError: Debes aceptar el aviso de privacidad y los términos y condiciones] → 400 | PASS | 0 |
| unit | DomainExceptionFilter excepciones de dominio (comportamiento existente) [ProfileAlreadyCompletedError: El perfil de este usuario ya fue completado] → 400 | PASS | 0 |
| unit | DomainExceptionFilter excepciones de dominio (comportamiento existente) [MissingIdentityDocumentsError: Debes subir ambos lados de tu INE para validar tu identidad] → 400 | PASS | 1 |
| unit | DomainExceptionFilter excepciones de dominio (comportamiento existente) [LegalDocumentsNotPublishedError: No hay aviso de privacidad o términos y condiciones publicados] → 409 | PASS | 0 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind validation → 400 | PASS | 4 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind unauthenticated → 401 | PASS | 0 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind forbidden → 403 | PASS | 1 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind not_found → 404 | PASS | 0 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind conflict → 409 | PASS | 1 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind business_rule → 422 | PASS | 0 |
| unit | DomainExceptionFilter errores de PostgreSQL que llegan sin traducir [TC-M00-071][RT-M00-03][RNF-10] 23505 → 409 sin exponer SQL ni el nombre de la constraint | PASS | 1 |
| unit | DomainExceptionFilter errores de PostgreSQL que llegan sin traducir [TC-M00-072][RT-M00-03] P0001 de un trigger → 422 con el mensaje del trigger | PASS | 1 |
| unit | DomainExceptionFilter errores de PostgreSQL que llegan sin traducir [TC-M00-073][RNF-10] SQLSTATE sin traducción → 500 genérico, sin el mensaje de PostgreSQL | PASS | 0 |
| unit | DomainExceptionFilter errores inesperados Error genérico → 500 sin exponer el mensaje y se registra en consola | PASS | 1 |
| unit | DomainExceptionFilter registrado como filtro global guard que lanza UnauthorizedException → 401 | PASS | 21 |
| unit | DomainExceptionFilter registrado como filtro global BadRequestException en el handler → 400 | PASS | 5 |
| unit | DomainExceptionFilter registrado como filtro global error de dominio → 400 con su nombre | PASS | 7 |
| unit | DomainExceptionFilter registrado como filtro global Error genérico → 500 | PASS | 4 |
| unit | DomainExceptionFilter registrado como filtro global ruta inexistente → 404 (NotFoundException de Nest) | PASS | 3 |
| unit | DomainExceptionFilter registrado como filtro global respuesta exitosa sin cambios | PASS | 4 |
| unit | IdentityController should be defined | PASS | 12 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) registro dentro de la UnitOfWork [TC-M01-100][RF-52][RN-120][RN-121] guarda actor, perfil, IP, user-agent, acción, entidad y metadata | PASS | 817 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) registro dentro de la UnitOfWork [TC-M01-105][RF-52][RN-120] actor sistema y metadata JSON anidada se guardan y se leen igual | PASS | 524 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) registro dentro de la UnitOfWork [TC-M01-114][RN-120] usuario autenticado sin user_profile queda identificado por actor_user_id | PASS | 910 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) modelo transaccional (D1, D6) [TC-M01-101][RT-M01-01] error después de auditar: se revierten la operación y el evento | PASS | 921 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) modelo transaccional (D1, D6) [TC-M01-102][RT-M01-01][RN-120] si la auditoría falla, la operación se revierte (perfil de otro usuario) | PASS | 1356 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) modelo transaccional (D1, D6) [TC-M01-103][RT-M01-01] fuera de una UnitOfWork falla sin escribir | PASS | 0 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) modelo transaccional (D1, D6) [TC-M01-104][RT-M01-01] UoW anidada que falla: solo se revierte su evento; la externa conserva el suyo | PASS | 883 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) protecciones de la BD (migración 0003) [TC-M01-106][RN-119][RNF-08] TRUNCATE audit_log → BusinessRuleViolationError | PASS | 452 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) protecciones de la BD (migración 0003) [TC-M01-107][RN-120] CHECK de actor y entidad: combinaciones inválidas → IntegrityConstraintViolationError | PASS | 1503 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) protecciones de la BD (migración 0003) [TC-M01-108][RT-M01-03] created_at lo fija PostgreSQL (now() de la transacción); el valor de la app se ignora | PASS | 412 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) protecciones de la BD (migración 0003) [TC-M01-109][RN-120] perfil que no pertenece al usuario actor → BusinessRuleViolationError (inserción directa) | PASS | 1023 |
| integration | AuditTrail contra PostgreSQL (BD de PEI, siempre con rollback) concurrencia [TC-M01-110][RT-M01-02] dos conexiones auditan a la vez sin esperarse; ambas terminan en ROLLBACK | PASS | 928 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-100][RT-M00-02] confirma todo el trabajo de la unidad de forma atómica | PASS | 600 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-101][RT-M00-02] si el trabajo falla, revierte todo lo que hizo la unidad | PASS | 475 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-102][RT-M00-02] una unidad anidada que falla solo revierte su parte (SAVEPOINT) | PASS | 726 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-103][RT-M00-02] la unidad anidada usa la misma conexión y la misma transacción (no escapa del rollback) | PASS | 658 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-106][RT-M00-02] UoW dentro de UoW: un error de PostgreSQL en la interna se revierte a su SAVEPOINT y la externa continúa y termina | PASS | 893 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-107][RT-M00-02] control: sin SAVEPOINT, un error de PostgreSQL aborta la transacción y la siguiente sentencia falla con 25P02 | PASS | 441 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-104][RT-M00-02] sin transacción activa, una unidad que falla no deja datos (no hay commit) | PASS | 667 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-105][RT-M00-03] un error de PostgreSQL dentro de la unidad se traduce y la transacción exterior sigue usable | PASS | 816 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) constraints del esquema [TC-M00-110][RT-M00-03] 23503 llave foránea inexistente → ReferenceViolationError | PASS | 490 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) constraints del esquema [TC-M00-111][RT-M00-03][RNF-05] 23514 inventario negativo → IntegrityConstraintViolationError (inventory_quantity_on_hand_chk) | PASS | 674 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) constraints del esquema [TC-M00-112][RT-M00-03] 23502 NOT NULL → IntegrityConstraintViolationError | PASS | 546 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) constraints del esquema [TC-M00-113][RT-M00-03][RNF-17] 23P01 vigencias solapadas de cancellation_policy → ExclusionConstraintViolationError | PASS | 887 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) triggers reales de 0001_triggers.sql (P0001) [TC-M00-120][RT-M00-03][RN-119][RNF-08] audit_log es de solo inserción: update → BusinessRuleViolationError | PASS | 452 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) triggers reales de 0001_triggers.sql (P0001) [TC-M00-120][RT-M00-03][RN-119][RNF-08] audit_log es de solo inserción: delete → BusinessRuleViolationError | PASS | 467 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) triggers reales de 0001_triggers.sql (P0001) [TC-M00-121][RT-M00-03][RN-006][RNF-12] una versión publicada de legal_document no se modifica | PASS | 440 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) triggers reales de 0001_triggers.sql (P0001) [TC-M00-122][RT-M00-03][RNF-12] una aceptación legal registrada no se elimina | PASS | 692 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) error real del driver que llega al filtro HTTP sin pasar por la unidad de trabajo [TC-M00-130][RT-M00-03][RNF-10] el filtro reconoce el error real de @neondatabase/serverless y responde 422 con el mensaje del trigger | PASS | 463 |
| integration | Concurrencia a nivel PostgreSQL (dos conexiones, sin commits) [TC-M00-140][RT-M00-05][RNF-17] exclusion constraint: un rango sin confirmar de A bloquea el rango solapado de B (lock_timeout → ConcurrencyConflictError) | PASS | 3289 |
| integration | Concurrencia a nivel PostgreSQL (dos conexiones, sin commits) [TC-M00-141][RT-M00-05] índice único: B espera a A; si A se revierte, B continúa sin falso conflicto | PASS | 585 |
| integration | DrizzleActorProfileReader (BD de desarrollo, siempre con rollback) [TC-M00-150][RF-02][RN-001][RN-002] devuelve el user_profile y el único rol de un usuario patient | PASS | 429 |
| integration | DrizzleActorProfileReader (BD de desarrollo, siempre con rollback) [TC-M00-150][RF-02][RN-001][RN-002] devuelve el user_profile y el único rol de un usuario doctor | PASS | 427 |
| integration | DrizzleActorProfileReader (BD de desarrollo, siempre con rollback) [TC-M00-150][RF-02][RN-001][RN-002] devuelve el user_profile y el único rol de un usuario admin | PASS | 404 |
| integration | DrizzleActorProfileReader (BD de desarrollo, siempre con rollback) [TC-M00-150][RF-02][RN-001][RN-002] devuelve el user_profile y el único rol de un usuario organization | PASS | 421 |
| integration | DrizzleActorProfileReader (BD de desarrollo, siempre con rollback) [TC-M00-151][RN-002] usuario sin perfil de dominio → null | PASS | 83 |
| e2e | Auditoría desde HTTP con PostgreSQL real y rollback (E2E) [TC-M01-204][RF-52][RN-120][RN-121][RT-M01-03] la fila real de audit_log tiene el actor, IP y user-agent del request y created_at de la BD | PASS | 535 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-240][RNF-01] get /me sin cookie de sesión → 401 | PASS | 22 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-240][RNF-01] post /me/complete-profile sin cookie de sesión → 401 | PASS | 5 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-240][RNF-01] post /me/upload sin cookie de sesión → 401 | PASS | 6 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-242][RF-02] la ruta pública GET / sigue accesible sin sesión | PASS | 5 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-243][RF-02] las rutas de Better Auth (/api/auth/*) no quedan bloqueadas por los guards | PASS | 15 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-241][RNF-01] GET /me con una cookie de sesión falsificada → 401 | PASS | 6 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 401 sin sesión válida [TC-M00-200][RNF-01] /probe/actor sin sesión → 401 | PASS | 24 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 401 sin sesión válida [TC-M00-200][RNF-01] /probe/admin sin sesión → 401 | PASS | 4 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 401 sin sesión válida [TC-M00-200][RNF-01] /probe/clinical sin sesión → 401 | PASS | 4 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 401 sin sesión válida [TC-M00-201][RNF-01] sesión inválida → 401 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 403 por rol [TC-M00-210][RF-02] user-patient en ruta de admin → 403 | PASS | 4 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 403 por rol [TC-M00-210][RF-02] user-doctor en ruta de admin → 403 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 403 por rol [TC-M00-210][RF-02] user-organization en ruta de admin → 403 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 403 por rol [TC-M00-211][RF-02][RN-002] usuario autenticado sin perfil de dominio → 403 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 403 por rol [TC-M00-212][RNF-10] ruta con RolesGuard pero sin @Roles → 403 incluso para admin | PASS | 4 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) acceso permitido con el rol correcto [TC-M00-220][RF-02] admin en ruta de admin → 200 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) acceso permitido con el rol correcto [TC-M00-221][RF-02] user-doctor en ruta doctor/admin → 200 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) acceso permitido con el rol correcto [TC-M00-221][RF-02] user-admin en ruta doctor/admin → 200 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) acceso permitido con el rol correcto [TC-M00-222][RN-001][RN-121] el handler recibe el actor con perfil, rol, IP y user-agent | PASS | 4 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) acceso permitido con el rol correcto [TC-M00-223][RNF-10] X-Forwarded-For enviado por el cliente no cambia la IP registrada | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) rutas públicas [TC-M00-224][RF-02] una ruta sin @UseGuards responde 200 sin sesión aunque AuthModule esté cargado | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) rutas públicas [TC-M00-225][RF-02] la ruta pública no exige rol: responde igual con una sesión de cualquier rol | PASS | 2 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) validación de entrada global [TC-M00-230][RNF-10] payload válido → 201 y el controller recibe una instancia del DTO | PASS | 15 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) validación de entrada global [TC-M00-231][RNF-10] propiedad no declarada → 400 | PASS | 5 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) validación de entrada global [TC-M00-232][RNF-10] tipo inválido → 400 | PASS | 4 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) validación de entrada global [TC-M00-233][RNF-01] la validación no se ejecuta antes de la autenticación: sin sesión → 401 | PASS | 3 |
| e2e | AppController (e2e) / (GET) | PASS | 52 |
| e2e | Auditoría desde una acción HTTP (E2E con dobles, sin BD) [TC-M01-200][RF-52][RN-120][RN-121] acción autenticada → un evento con el actor, perfil, IP y user-agent del request | PASS | 14 |
| e2e | Auditoría desde una acción HTTP (E2E con dobles, sin BD) [TC-M01-201][RNF-01] sin sesión → 401 y ningún evento | PASS | 5 |
| e2e | Auditoría desde una acción HTTP (E2E con dobles, sin BD) [TC-M01-202][RF-02] rol sin permiso → 403 y ningún evento | PASS | 5 |
| e2e | Auditoría desde una acción HTTP (E2E con dobles, sin BD) [TC-M01-203][RT-M01-01] el caso de uso falla después de auditar → 422 y el evento no se confirma | PASS | 15 |
