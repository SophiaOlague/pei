# Ejecución de pruebas 2026-10-06T00-05-22_58eb4ac-dirty_M00

| Campo | Valor |
|---|---|
| Inicio | 2026-10-06T00:05:22.041Z |
| Fin | 2026-10-06T00:06:14.376Z |
| Commit | 58eb4ac + cambios sin commit en el árbol de trabajo |
| Etiqueta | M00 |
| Node.js | v24.19.0 |
| Sistema operativo | Windows_NT 10.0.26200 (x64) |
| Base de datos | PostgreSQL en Neon (BD de desarrollo; host omitido) |

## Totales por suite

| Suite | Total | PASS | FAIL | NO EJECUTADA |
|---|---|---|---|---|
| Unitarias | 86 | 86 | 0 | 0 |
| Integración (BD de desarrollo, rollback) | 24 | 24 | 0 | 0 |
| E2E / API | 27 | 27 | 0 | 0 |

## Resultado por requisito

| Requisito | Casos de prueba | Resultado |
|---|---|---|
| RF-02 | TC-M00-040, TC-M00-041, TC-M00-042, TC-M00-043, TC-M00-046, TC-M00-150, TC-M00-210, TC-M00-211, TC-M00-220, TC-M00-221, TC-M00-224, TC-M00-225, TC-M00-242, TC-M00-243 | PASS |
| RN-001 | TC-M00-040, TC-M00-051, TC-M00-150, TC-M00-222 | PASS |
| RN-002 | TC-M00-043, TC-M00-052, TC-M00-150, TC-M00-151, TC-M00-211 | PASS |
| RN-006 | TC-M00-121 | PASS |
| RN-119 | TC-M00-120 | PASS |
| RN-121 | TC-M00-051, TC-M00-060, TC-M00-061, TC-M00-062, TC-M00-063, TC-M00-064, TC-M00-222 | PASS |
| RNF-01 | TC-M00-044, TC-M00-050, TC-M00-200, TC-M00-201, TC-M00-233, TC-M00-240, TC-M00-241 | PASS |
| RNF-05 | TC-M00-111 | PASS |
| RNF-08 | TC-M00-120 | PASS |
| RNF-10 | TC-M00-002, TC-M00-030, TC-M00-031, TC-M00-032, TC-M00-033, TC-M00-045, TC-M00-065, TC-M00-066, TC-M00-071, TC-M00-073, TC-M00-130, TC-M00-212, TC-M00-223, TC-M00-230, TC-M00-231, TC-M00-232 | PASS |
| RNF-12 | TC-M00-121, TC-M00-122 | PASS |
| RNF-17 | TC-M00-113, TC-M00-140 | PASS |
| RT-M00-01 | TC-M00-001, TC-M00-070 | PASS |
| RT-M00-02 | TC-M00-020, TC-M00-022, TC-M00-100, TC-M00-101, TC-M00-102, TC-M00-103, TC-M00-104, TC-M00-106, TC-M00-107 | PASS |
| RT-M00-03 | TC-M00-002, TC-M00-003, TC-M00-010, TC-M00-011, TC-M00-012, TC-M00-013, TC-M00-014, TC-M00-015, TC-M00-021, TC-M00-071, TC-M00-072, TC-M00-105, TC-M00-110, TC-M00-111, TC-M00-112, TC-M00-113, TC-M00-120, TC-M00-121, TC-M00-122, TC-M00-130 | PASS |
| RT-M00-04 | TC-M00-023 | PASS |
| RT-M00-05 | TC-M00-140, TC-M00-141 | PASS |

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

## Detalle

| Suite | Prueba | Resultado | ms |
|---|---|---|---|
| unit | DomainError [TC-M00-001][RT-M00-01] una subclase es Error y DomainError, con su nombre de clase y su kind | PASS | 7 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] UniqueConstraintViolationError tiene kind conflict y no expone la constraint en el mensaje | PASS | 1 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] ExclusionConstraintViolationError tiene kind conflict y no expone la constraint en el mensaje | PASS | 0 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] ReferenceViolationError tiene kind validation y no expone la constraint en el mensaje | PASS | 1 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] IntegrityConstraintViolationError tiene kind validation y no expone la constraint en el mensaje | PASS | 1 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] BusinessRuleViolationError tiene kind business_rule y no expone la constraint en el mensaje | PASS | 1 |
| unit | DomainError errores de persistencia [TC-M00-002][RT-M00-03][RNF-10] ConcurrencyConflictError tiene kind conflict y no expone la constraint en el mensaje | PASS | 0 |
| unit | DomainError errores de persistencia [TC-M00-003][RT-M00-03] BusinessRuleViolationError conserva el mensaje del trigger | PASS | 3 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-060][RN-121] toma la IP de request.ip y el user-agent del header | PASS | 7 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-061][RN-121] normaliza IPv4 representada como IPv6 | PASS | 1 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-062][RN-121] conserva IPv6 real | PASS | 0 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-063][RN-121] sin request.ip usa la dirección del socket | PASS | 0 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-064][RN-121] sin IP ni user-agent → null en ambos | PASS | 1 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-065][RNF-10] ignora X-Forwarded-For: la IP no se toma de headers del cliente | PASS | 0 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-066][RNF-10] trunca user-agents de más de 512 caracteres | PASS | 1 |
| unit | extractRequestMetadata (IP y user-agent) [TC-M00-067] user-agent vacío → null | PASS | 0 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 23505 → [Function UniqueConstraintViolationError] | PASS | 7 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 23P01 → [Function ExclusionConstraintViolationError] | PASS | 0 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 23503 → [Function ReferenceViolationError] | PASS | 0 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 23514 → [Function IntegrityConstraintViolationError] | PASS | 1 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 23502 → [Function IntegrityConstraintViolationError] | PASS | 1 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE P0001 → [Function BusinessRuleViolationError] | PASS | 0 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 40001 → [Function ConcurrencyConflictError] | PASS | 1 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 40P01 → [Function ConcurrencyConflictError] | PASS | 0 |
| unit | translatePostgresError [TC-M00-010][RT-M00-03] SQLSTATE 55P03 → [Function ConcurrencyConflictError] | PASS | 1 |
| unit | translatePostgresError [TC-M00-011][RT-M00-03] P0001 conserva el mensaje escrito por el trigger | PASS | 1 |
| unit | translatePostgresError [TC-M00-012][RT-M00-03] encuentra el error del driver directamente o a varios niveles de "cause" | PASS | 0 |
| unit | translatePostgresError [TC-M00-013][RT-M00-03] deja de buscar después de 5 niveles de "cause" | PASS | 2 |
| unit | translatePostgresError [TC-M00-014][RT-M00-03] error genérico → null (se trata como error interno) | PASS | 1 |
| unit | translatePostgresError [TC-M00-014][RT-M00-03] error de red de Node con code de 5 letras pero sin severity → null (se trata como error interno) | PASS | 0 |
| unit | translatePostgresError [TC-M00-014][RT-M00-03] SQLSTATE sin traducción (42P01 tabla inexistente) → null (se trata como error interno) | PASS | 1 |
| unit | translatePostgresError [TC-M00-014][RT-M00-03] valor que no es objeto → null (se trata como error interno) | PASS | 0 |
| unit | translatePostgresError [TC-M00-014][RT-M00-03] null → null (se trata como error interno) | PASS | 0 |
| unit | translatePostgresError [TC-M00-015][RT-M00-03] un DomainError no se vuelve a traducir | PASS | 4 |
| unit | SessionGuard (contexto del actor) [TC-M00-050][RNF-01] sin sesión → 401 y no consulta el perfil | PASS | 22 |
| unit | SessionGuard (contexto del actor) [TC-M00-051][RN-001][RN-121] con sesión y perfil → actor con perfil, rol, IP y user-agent | PASS | 2 |
| unit | SessionGuard (contexto del actor) [TC-M00-052][RN-002] con sesión pero sin perfil de dominio → autenticado, sin rol | PASS | 1 |
| unit | SessionGuard (contexto del actor) [TC-M00-053] conserva request.session tal como la entrega el proveedor (respuesta de /me sin cambios) | PASS | 1 |
| unit | SessionGuard (contexto del actor) [TC-M00-054] pasa los headers del request al proveedor de sesión | PASS | 1 |
| unit | RolesGuard [TC-M00-040][RF-02][RN-001] rol permitido → acceso | PASS | 5 |
| unit | RolesGuard [TC-M00-041][RF-02] cualquiera de varios roles permitidos → acceso | PASS | 0 |
| unit | RolesGuard [TC-M00-042][RF-02] rol patient en ruta de admin → 403 | PASS | 19 |
| unit | RolesGuard [TC-M00-042][RF-02] rol doctor en ruta de admin → 403 | PASS | 1 |
| unit | RolesGuard [TC-M00-042][RF-02] rol organization en ruta de admin → 403 | PASS | 1 |
| unit | RolesGuard [TC-M00-043][RF-02][RN-002] usuario autenticado sin perfil de dominio → 403 | PASS | 1 |
| unit | RolesGuard [TC-M00-044][RNF-01] sin actor (no pasó por SessionGuard) → 401 | PASS | 0 |
| unit | RolesGuard [TC-M00-045][RNF-10] ruta sin @Roles → 403 aunque el actor sea admin (falla cerrado) | PASS | 1 |
| unit | RolesGuard [TC-M00-046][RF-02] @Roles a nivel de clase aplica a sus handlers y el del handler tiene prioridad | PASS | 1 |
| unit | DrizzleUnitOfWork (sin BD) [TC-M00-020][RT-M00-02] con una transacción activa abre la unidad dentro de ella y la expone a los repositorios | PASS | 7 |
| unit | DrizzleUnitOfWork (sin BD) [TC-M00-021][RT-M00-03] traduce el error de PostgreSQL que sale de la transacción | PASS | 1 |
| unit | DrizzleUnitOfWork (sin BD) [TC-M00-022][RT-M00-02] un error que no es de PostgreSQL se propaga sin cambios | PASS | 0 |
| unit | SystemClock [TC-M00-023][RT-M00-04] devuelve la hora actual del sistema | PASS | 0 |
| unit | createValidationPipe [TC-M00-030][RNF-10] payload válido → instancia del DTO | PASS | 8 |
| unit | createValidationPipe [TC-M00-031][RNF-10] propiedad no declarada → 400 (protección contra asignación masiva) | PASS | 1 |
| unit | createValidationPipe [TC-M00-032][RNF-10] {"name":123,"quantity":2} → 400 con "name must be a string" | PASS | 1 |
| unit | createValidationPipe [TC-M00-032][RNF-10] {"name":"Truvada","quantity":1.5} → 400 con "quantity must be an integer number" | PASS | 0 |
| unit | createValidationPipe [TC-M00-032][RNF-10] {"name":"Truvada","quantity":0} → 400 con "quantity must not be less than 1" | PASS | 1 |
| unit | createValidationPipe [TC-M00-032][RNF-10] {"name":"Truvada"} → 400 con "quantity must be an integer number" | PASS | 0 |
| unit | createValidationPipe [TC-M00-033][RNF-10] un body tipado como objeto literal (sin clase DTO) no se valida: comportamiento previo de /me/complete-profile | PASS | 0 |
| unit | AppController root should return "Hello World!" | PASS | 279 |
| unit | DomainExceptionFilter excepciones HTTP de Nest UnauthorizedException → 401 con el cuerpo por defecto de Nest | PASS | 7 |
| unit | DomainExceptionFilter excepciones HTTP de Nest BadRequestException → 400 con el cuerpo por defecto de Nest | PASS | 1 |
| unit | DomainExceptionFilter excepciones HTTP de Nest HttpException con cuerpo en texto → { statusCode, message } | PASS | 1 |
| unit | DomainExceptionFilter excepciones HTTP de Nest HttpException con cuerpo personalizado → se conserva tal cual | PASS | 0 |
| unit | DomainExceptionFilter excepciones de dominio (comportamiento existente) [DuplicateCurpError: Ya existe un paciente registrado con el CURP PRUE900101HDFRRS03] → 400 | PASS | 0 |
| unit | DomainExceptionFilter excepciones de dominio (comportamiento existente) [TermsNotAcceptedError: Debes aceptar el aviso de privacidad y los términos y condiciones] → 400 | PASS | 1 |
| unit | DomainExceptionFilter excepciones de dominio (comportamiento existente) [ProfileAlreadyCompletedError: El perfil de este usuario ya fue completado] → 400 | PASS | 0 |
| unit | DomainExceptionFilter excepciones de dominio (comportamiento existente) [MissingIdentityDocumentsError: Debes subir ambos lados de tu INE para validar tu identidad] → 400 | PASS | 0 |
| unit | DomainExceptionFilter excepciones de dominio (comportamiento existente) [LegalDocumentsNotPublishedError: No hay aviso de privacidad o términos y condiciones publicados] → 409 | PASS | 1 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind validation → 400 | PASS | 0 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind unauthenticated → 401 | PASS | 1 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind forbidden → 403 | PASS | 0 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind not_found → 404 | PASS | 1 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind conflict → 409 | PASS | 0 |
| unit | DomainExceptionFilter mapeo por kind de DomainError [TC-M00-070][RT-M00-01] kind business_rule → 422 | PASS | 0 |
| unit | DomainExceptionFilter errores de PostgreSQL que llegan sin traducir [TC-M00-071][RT-M00-03][RNF-10] 23505 → 409 sin exponer SQL ni el nombre de la constraint | PASS | 1 |
| unit | DomainExceptionFilter errores de PostgreSQL que llegan sin traducir [TC-M00-072][RT-M00-03] P0001 de un trigger → 422 con el mensaje del trigger | PASS | 1 |
| unit | DomainExceptionFilter errores de PostgreSQL que llegan sin traducir [TC-M00-073][RNF-10] SQLSTATE sin traducción → 500 genérico, sin el mensaje de PostgreSQL | PASS | 0 |
| unit | DomainExceptionFilter errores inesperados Error genérico → 500 sin exponer el mensaje y se registra en consola | PASS | 1 |
| unit | DomainExceptionFilter registrado como filtro global guard que lanza UnauthorizedException → 401 | PASS | 15 |
| unit | DomainExceptionFilter registrado como filtro global BadRequestException en el handler → 400 | PASS | 3 |
| unit | DomainExceptionFilter registrado como filtro global error de dominio → 400 con su nombre | PASS | 3 |
| unit | DomainExceptionFilter registrado como filtro global Error genérico → 500 | PASS | 4 |
| unit | DomainExceptionFilter registrado como filtro global ruta inexistente → 404 (NotFoundException de Nest) | PASS | 3 |
| unit | DomainExceptionFilter registrado como filtro global respuesta exitosa sin cambios | PASS | 3 |
| unit | IdentityController should be defined | PASS | 12 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) constraints del esquema [TC-M00-110][RT-M00-03] 23503 llave foránea inexistente → ReferenceViolationError | PASS | 636 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) constraints del esquema [TC-M00-111][RT-M00-03][RNF-05] 23514 inventario negativo → IntegrityConstraintViolationError (inventory_quantity_on_hand_chk) | PASS | 1540 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) constraints del esquema [TC-M00-112][RT-M00-03] 23502 NOT NULL → IntegrityConstraintViolationError | PASS | 940 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) constraints del esquema [TC-M00-113][RT-M00-03][RNF-17] 23P01 vigencias solapadas de cancellation_policy → ExclusionConstraintViolationError | PASS | 3621 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) triggers reales de 0001_triggers.sql (P0001) [TC-M00-120][RT-M00-03][RN-119][RNF-08] audit_log es de solo inserción: update → BusinessRuleViolationError | PASS | 1071 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) triggers reales de 0001_triggers.sql (P0001) [TC-M00-120][RT-M00-03][RN-119][RNF-08] audit_log es de solo inserción: delete → BusinessRuleViolationError | PASS | 1432 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) triggers reales de 0001_triggers.sql (P0001) [TC-M00-121][RT-M00-03][RN-006][RNF-12] una versión publicada de legal_document no se modifica | PASS | 1865 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) triggers reales de 0001_triggers.sql (P0001) [TC-M00-122][RT-M00-03][RNF-12] una aceptación legal registrada no se elimina | PASS | 1811 |
| integration | Errores reales de PostgreSQL → errores de dominio (BD de desarrollo, siempre con rollback) error real del driver que llega al filtro HTTP sin pasar por la unidad de trabajo [TC-M00-130][RT-M00-03][RNF-10] el filtro reconoce el error real de @neondatabase/serverless y responde 422 con el mensaje del trigger | PASS | 781 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-100][RT-M00-02] confirma todo el trabajo de la unidad de forma atómica | PASS | 616 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-101][RT-M00-02] si el trabajo falla, revierte todo lo que hizo la unidad | PASS | 1142 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-102][RT-M00-02] una unidad anidada que falla solo revierte su parte (SAVEPOINT) | PASS | 1911 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-103][RT-M00-02] la unidad anidada usa la misma conexión y la misma transacción (no escapa del rollback) | PASS | 1747 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-106][RT-M00-02] UoW dentro de UoW: un error de PostgreSQL en la interna se revierte a su SAVEPOINT y la externa continúa y termina | PASS | 2553 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-107][RT-M00-02] control: sin SAVEPOINT, un error de PostgreSQL aborta la transacción y la siguiente sentencia falla con 25P02 | PASS | 1234 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-104][RT-M00-02] sin transacción activa, una unidad que falla no deja datos (no hay commit) | PASS | 715 |
| integration | DrizzleUnitOfWork contra PostgreSQL (BD de desarrollo, siempre con rollback) [TC-M00-105][RT-M00-03] un error de PostgreSQL dentro de la unidad se traduce y la transacción exterior sigue usable | PASS | 2655 |
| integration | Concurrencia a nivel PostgreSQL (dos conexiones, sin commits) [TC-M00-140][RT-M00-05][RNF-17] exclusion constraint: un rango sin confirmar de A bloquea el rango solapado de B (lock_timeout → ConcurrencyConflictError) | PASS | 4469 |
| integration | Concurrencia a nivel PostgreSQL (dos conexiones, sin commits) [TC-M00-141][RT-M00-05] índice único: B espera a A; si A se revierte, B continúa sin falso conflicto | PASS | 1124 |
| integration | DrizzleActorProfileReader (BD de desarrollo, siempre con rollback) [TC-M00-150][RF-02][RN-001][RN-002] devuelve el user_profile y el único rol de un usuario patient | PASS | 1230 |
| integration | DrizzleActorProfileReader (BD de desarrollo, siempre con rollback) [TC-M00-150][RF-02][RN-001][RN-002] devuelve el user_profile y el único rol de un usuario doctor | PASS | 1167 |
| integration | DrizzleActorProfileReader (BD de desarrollo, siempre con rollback) [TC-M00-150][RF-02][RN-001][RN-002] devuelve el user_profile y el único rol de un usuario admin | PASS | 1343 |
| integration | DrizzleActorProfileReader (BD de desarrollo, siempre con rollback) [TC-M00-150][RF-02][RN-001][RN-002] devuelve el user_profile y el único rol de un usuario organization | PASS | 857 |
| integration | DrizzleActorProfileReader (BD de desarrollo, siempre con rollback) [TC-M00-151][RN-002] usuario sin perfil de dominio → null | PASS | 475 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-240][RNF-01] get /me sin cookie de sesión → 401 | PASS | 22 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-240][RNF-01] post /me/complete-profile sin cookie de sesión → 401 | PASS | 11 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-240][RNF-01] post /me/upload sin cookie de sesión → 401 | PASS | 5 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-242][RF-02] la ruta pública GET / sigue accesible sin sesión | PASS | 4 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-243][RF-02] las rutas de Better Auth (/api/auth/*) no quedan bloqueadas por los guards | PASS | 10 |
| e2e | Rutas protegidas reales sin sesión (E2E, AppModule) [TC-M00-241][RNF-01] GET /me con una cookie de sesión falsificada → 401 | PASS | 4 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 401 sin sesión válida [TC-M00-200][RNF-01] /probe/actor sin sesión → 401 | PASS | 8 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 401 sin sesión válida [TC-M00-200][RNF-01] /probe/admin sin sesión → 401 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 401 sin sesión válida [TC-M00-200][RNF-01] /probe/clinical sin sesión → 401 | PASS | 2 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 401 sin sesión válida [TC-M00-201][RNF-01] sesión inválida → 401 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 403 por rol [TC-M00-210][RF-02] user-patient en ruta de admin → 403 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 403 por rol [TC-M00-210][RF-02] user-doctor en ruta de admin → 403 | PASS | 2 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 403 por rol [TC-M00-210][RF-02] user-organization en ruta de admin → 403 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 403 por rol [TC-M00-211][RF-02][RN-002] usuario autenticado sin perfil de dominio → 403 | PASS | 2 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) 403 por rol [TC-M00-212][RNF-10] ruta con RolesGuard pero sin @Roles → 403 incluso para admin | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) acceso permitido con el rol correcto [TC-M00-220][RF-02] admin en ruta de admin → 200 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) acceso permitido con el rol correcto [TC-M00-221][RF-02] user-doctor en ruta doctor/admin → 200 | PASS | 2 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) acceso permitido con el rol correcto [TC-M00-221][RF-02] user-admin en ruta doctor/admin → 200 | PASS | 2 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) acceso permitido con el rol correcto [TC-M00-222][RN-001][RN-121] el handler recibe el actor con perfil, rol, IP y user-agent | PASS | 2 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) acceso permitido con el rol correcto [TC-M00-223][RNF-10] X-Forwarded-For enviado por el cliente no cambia la IP registrada | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) rutas públicas [TC-M00-224][RF-02] una ruta sin @UseGuards responde 200 sin sesión aunque AuthModule esté cargado | PASS | 2 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) rutas públicas [TC-M00-225][RF-02] la ruta pública no exige rol: responde igual con una sesión de cualquier rol | PASS | 2 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) validación de entrada global [TC-M00-230][RNF-10] payload válido → 201 y el controller recibe una instancia del DTO | PASS | 13 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) validación de entrada global [TC-M00-231][RNF-10] propiedad no declarada → 400 | PASS | 3 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) validación de entrada global [TC-M00-232][RNF-10] tipo inválido → 400 | PASS | 2 |
| e2e | Autenticación, autorización y validación por HTTP (E2E) validación de entrada global [TC-M00-233][RNF-01] la validación no se ejecuta antes de la autenticación: sin sesión → 401 | PASS | 2 |
| e2e | AppController (e2e) / (GET) | PASS | 30 |
