# Trazabilidad M00: Fundaciones

Ejecución de referencia: [`2026-10-06T00-05-22_58eb4ac-dirty_M00`](../ejecuciones/2026-10-06T00-05-22_58eb4ac-dirty_M00/resumen.md)
(commit base `58eb4ac` con los cambios de M00 sin commit). Los resultados de esta tabla se copiaron de esa ejecución;
al volver a ejecutar `pnpm test:evidence -- M00`, el `resumen.md` nuevo es la fuente.

## Requisitos técnicos derivados (RT)

No son requisitos del Documento Maestro: son condiciones de diseño que M00 necesita para que los módulos cumplan los suyos.

| ID | Requisito técnico |
|---|---|
| RT-M00-01 | Los errores de dominio no dependen de HTTP; la presentación los traduce de forma central según su tipo. |
| RT-M00-02 | La unidad de trabajo es atómica, anidable (SAVEPOINT) y nunca escapa de una transacción activa. |
| RT-M00-03 | Los errores de PostgreSQL (constraints y triggers) se traducen a errores de dominio sin exponer SQL ni nombres de constraints. |
| RT-M00-04 | La hora actual se obtiene de un puerto (`Clock`) para poder probar reglas temporales. |
| RT-M00-05 | La protección contra operaciones concurrentes se delega a constraints de PostgreSQL: una transacción espera a otra sobre el mismo recurso. |

## Matriz

Tipo: **RF** requisito funcional · **RN** regla de negocio · **RNF** requisito no funcional · **RT** requisito técnico.
Cobertura: **Completa** para lo que M00 implementa; **Parcial** cuando M00 solo aporta el mecanismo y el módulo dueño debe completar.

| Requisito | Tipo | Componente | Casos de prueba | Script | Resultado | Cobertura |
|---|---|---|---|---|---|---|
| RF-02 Roles y permisos | RF | `SessionGuard` + `RolesGuard` + `@Roles`, `DrizzleActorProfileReader` | TC-M00-040 a 043, 046, 150, 210, 211, 220, 221, 224, 225, 242, 243 | `src/auth/roles.guard.spec.ts`, `test/integration/actor-profile-reader.int-spec.ts`, `test/auth-guards.e2e-spec.ts`, `test/me.e2e-spec.ts` | PASS | Parcial: mecanismo listo; los permisos de cada ruta se declaran en su módulo |
| RN-001 Un único rol | RN | `SessionGuard`, `Actor`, `DrizzleActorProfileReader` | TC-M00-040, 051, 150, 222 | `src/auth/*.spec.ts`, `test/integration/actor-profile-reader.int-spec.ts`, `test/auth-guards.e2e-spec.ts` | PASS | Completa (lectura del rol) |
| RN-002 Un único user_profile | RN | `SessionGuard`, `RolesGuard` | TC-M00-043, 052, 150, 151, 211 | ídem | PASS | Parcial: el alta del perfil es de M02 |
| RN-006 Versiones legales se conservan | RN | Trigger `legal_document_append_only` + traductor | TC-M00-121 | `test/integration/postgres-errors.int-spec.ts` | PASS | Parcial: verifica la protección en BD; la reaceptación (RF-04) es de M02 |
| RN-119 audit_log append-only | RN | Trigger `audit_log_append_only` + traductor | TC-M00-120 | `test/integration/postgres-errors.int-spec.ts` | PASS | Parcial: UPDATE/DELETE bloqueados; TRUNCATE no (riesgo D7, M01) |
| RN-121 IP y user-agent | RN | `extractRequestMetadata`, `SessionGuard` | TC-M00-051, 060 a 064, 222 | `src/auth/authenticated-request.spec.ts`, `src/auth/session.guard.spec.ts`, `test/auth-guards.e2e-spec.ts` | PASS | Parcial: se capturan; se persisten en M01 |
| RNF-01 Autenticación | RNF | `SessionGuard`, `BetterAuthSessionProvider` | TC-M00-044, 050, 200, 201, 233, 240, 241 | `src/auth/*.spec.ts`, `test/auth-guards.e2e-spec.ts`, `test/me.e2e-spec.ts` | PASS | Completa para rutas protegidas |
| RNF-05 Inventario no negativo | RNF | Check `inventory_quantity_on_hand_chk` + traductor | TC-M00-111 | `test/integration/postgres-errors.int-spec.ts` | PASS | Parcial: la reserva atómica es de M13 |
| RNF-08 Auditoría append-only | RNF | Trigger `audit_log_append_only` | TC-M00-120 | `test/integration/postgres-errors.int-spec.ts` | PASS | Parcial (ver RN-119) |
| RNF-10 Seguridad de API | RNF | `createValidationPipe`, `DomainExceptionFilter`, `RolesGuard`, `extractRequestMetadata` | TC-M00-002, 030 a 033, 045, 065, 066, 071, 073, 130, 212, 223, 230 a 232 | `src/common/**/*.spec.ts`, `src/auth/*.spec.ts`, `test/auth-guards.e2e-spec.ts` | PASS | Parcial: validación, autorización y errores sin fuga; faltan controles perimetrales |
| RNF-12 Trazabilidad legal | RNF | Triggers `legal_document_append_only`, `user_legal_acceptance_append_only` | TC-M00-121, 122 | `test/integration/postgres-errors.int-spec.ts` | PASS | Parcial: IP/UA en la aceptación es de M02 |
| RNF-17 Configuración sin solapamiento | RNF | Exclusion constraint `cancellation_policy_no_overlap` | TC-M00-113, 140 | `test/integration/postgres-errors.int-spec.ts`, `test/integration/concurrency.int-spec.ts` | PASS | Parcial: probada en `cancellation_policy`; las otras tres familias, en sus módulos |
| RT-M00-01 | RT | `DomainError`, `DomainExceptionFilter` | TC-M00-001, 070 | `src/common/domain/domain-error.spec.ts`, `src/common/filters/domain-exception.filter.spec.ts` | PASS | Completa |
| RT-M00-02 | RT | `DrizzleUnitOfWork`, `transactionStorage` | TC-M00-020, 022, 100 a 104, 106, 107 | `src/common/infrastructure/drizzle-unit-of-work.spec.ts`, `test/integration/unit-of-work.int-spec.ts` | PASS | Completa |
| RT-M00-03 | RT | `translatePostgresError`, `persistence.errors` | TC-M00-002, 003, 010 a 015, 021, 071, 072, 105, 110 a 113, 120 a 122, 130 | `src/common/**/*.spec.ts`, `test/integration/*.int-spec.ts` | PASS | Completa |
| RT-M00-04 | RT | `Clock`, `SystemClock` | TC-M00-023 | `src/common/infrastructure/drizzle-unit-of-work.spec.ts` | PASS | Completa |
| RT-M00-05 | RT | Constraints de PostgreSQL | TC-M00-140, 141 | `test/integration/concurrency.int-spec.ts` | PASS | Completa como mecanismo; la doble reserva se prueba en Citas |

## Convención de autorización

Las rutas protegidas usan `@UseGuards(SessionGuard, RolesGuard)` con `@Roles(...)`, en ese orden: `SessionGuard` construye el actor y
`RolesGuard` lo evalúa. Los guards **no son globales** (no hay `APP_GUARD` ni `useGlobalGuards`); una ruta sin `@UseGuards` es pública.

| Situación | Resultado | Casos |
|---|---|---|
| Sin sesión | 401 | TC-M00-044, 200, 201, 240 |
| Sesión sin perfil de dominio | 403 | TC-M00-043, 211 |
| Rol no permitido | 403 | TC-M00-042, 210 |
| Rol permitido | 200 | TC-M00-040, 041, 220, 221 |
| `RolesGuard` sin `@Roles` | 403 (falla cerrada) | TC-M00-045, 212 |
| Ruta sin `@UseGuards`, con `AuthModule` cargado | 200 con o sin sesión | TC-M00-224, 225 |
| Rutas públicas reales de `AppModule` (`GET /`, `/api/auth/*`) | 200 sin sesión | TC-M00-242, 243 |

Límite conocido de la convención: `@Roles` sin `RolesGuard` no restringe nada, porque el decorador solo agrega metadatos.
Cada módulo debe declarar ambos; se revisará en las rutas protegidas de cada módulo.

## Regresión

### Línea base antes de M00 (commit `58eb4ac`)

| Archivo | Pruebas | Estado en la línea base |
|---|---|---|
| `src/app.controller.spec.ts` | 1 | PASS |
| `src/common/filters/domain-exception.filter.spec.ts` | 16 (11 `it` + 5 de un `it.each`) | PASS |
| `src/modules/identity/identity.controller.spec.ts` | 1 | PASS |
| `src/modules/identity/identity.service.spec.ts` | 1 | No ejecutable: la suite fallaba al importar un archivo inexistente |
| `test/app.e2e-spec.ts` | 1 | No ejecutada en la línea base (solo se corrió la suite unitaria) |

Las **18 pruebas** reportadas en el diagnóstico inicial eran solo las unitarias que pasaban (1 + 16 + 1).
Las **19 pruebas previas** que se reportan ahora son esas 18 más `test/app.e2e-spec.ts`, que existía pero no se había ejecutado.
La prueba de `identity.service.spec.ts` se eliminó (ver abajo) y no forma parte de ninguna de las dos cifras.

En la ejecución de referencia, las 19 pruebas previas pasan: **19/19 PASS** (18 unitarias + 1 E2E). El resto son pruebas agregadas por M00.

Se eliminó `src/modules/identity/identity.service.spec.ts` como limpieza de una prueba obsoleta: importaba
`identity.service.ts`, archivo eliminado en el commit `996c8a1` (era una clase vacía) y sin referencias en el código productivo.
No es una corrección funcional.

## Deuda técnica conocida

| # | Observación | Estado tras la revisión final |
|---|---|---|
| 1 | `POST /me/complete-profile` recibe un tipo en línea, no un DTO: la validación global no le aplica. | Sin cambio en M00 (alcance de M02); en M00 solo cambió la ruta de importación de `UnitOfWork`. Verificado: `ValidationPipe` omite `Object` y primitivos, y `@Body('folder')` de `/me/upload` no se transforma (TC-M00-033). |
| 2 | `DuplicateCurpError` y `ProfileAlreadyCompletedError` responden 400. | Sin cambio en M00 para no alterar la API. Inconsistencia: si la misma condición ocurre por carrera, la detecta la constraint única y responde 409 (`UniqueConstraintViolationError`). Antes de M00 ese caso respondía 500. Se decide en M02; no se modifica en M00. |
| 3 | `trust proxy` no está configurado. | Sin cambio: depende del despliegue, aún no definido. Hoy la IP es la del socket y `X-Forwarded-For` se ignora (TC-M00-065, 223). Detrás de un proxy se registraría la IP del proxy. |
| 4 | Las pruebas de integración dependen de la BD de desarrollo en Neon. | Corregido un riesgo: TC-M00-113 y TC-M00-140 usaban fechas de 2999, que una política real con vigencia abierta cubriría (falso FAIL). Ahora usan fechas anteriores a cualquier política existente (`policyDatesBeforeExisting`, solo lectura). Sin Neon, las pruebas fallan; no se omiten en silencio. |
| 5 | La evidencia contenía rutas absolutas. | Corregido: dos títulos de `it.each` imprimían el stack completo de un `Error` (TC-M00-002 y una prueba previa del filtro); y el script reescribe como relativas las rutas restantes del JSON de Jest. |

## No ejecutado o fuera de alcance de M00

| Elemento | Motivo |
|---|---|
| E2E con sesión real de Better Auth (403/200 con usuarios reales) | Crearía usuarios y sesiones confirmados en la BD de desarrollo. Se cubre con proveedores simulados (TC-M00-200 a 233). |
| Carrera de dos peticiones HTTP que confirman datos | Decisión pendiente para Citas. |
