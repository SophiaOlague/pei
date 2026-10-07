# Trazabilidad M02: Identity / Access Completion de PEI (BORRADOR)

> **Borrador.** La evidencia formal y reproducible será la **etapa D**: la tercera corrida de `pnpm test:evidence M02`,
> pendiente de una red con latencia normal hacia Neon. Mientras tanto, los resultados de esta página provienen de la
> **etapa A** (validación post-migración, 374/374 PASS), que **no es evidencia formal**: su salida no está versionada y no
> se generó con el script de evidencia. Las etapas B y C están **descartadas** (ver "Ejecuciones").

Gestinnovo es la empresa; PEI es la aplicación.
Fuente del detalle: [resumen de evidencia de M02](../ejecuciones/2026-10-07_M02-validacion/resumen-de-evidencia.md).

## Estado de M02 (sin cierre formal todavía)

| Aspecto | Estado |
|---|---|
| Implementación | **Técnicamente implementado y validado** (código, esquema, migraciones 0004/0005 aplicadas y regresión) |
| Pruebas de M02 | **178/178 PASS** |
| Validación post-migración (etapa A) | 374/374 PASS, **validación interna** sin salida versionada; no es evidencia formal |
| Corridas de evidencia B y C | **Descartadas** (timeouts por latencia; ver sus `DESCARTADA.md`) |
| Evidencia formal (etapa D) | **Pendiente** por latencia de red hacia Neon |
| `admin:bootstrap` real | **Pendiente** por dependencia del frontend (pantalla para establecer la contraseña) y de `APP_WEB_URL` |
| R2 real (`pei-documents-dev`) | **PASS** 10/10 |
| Resend real | **PASS** |
| Cierre formal (tag) | Pendiente de la etapa D |

## Alcance

M02 completa la identidad y el acceso del **paciente** en PEI:
- verificación de correo y recuperación de contraseña con Resend;
- perfil de paciente (alta, consulta, edición limitada y foto privada);
- aceptación de los documentos legales vigentes;
- envío, revisión y reenvío del INE, con eliminación de las imágenes al resolverse;
- estado del registro derivado y la política `assertCanBookAppointments` para M08;
- rate limit siempre activo;
- CLI de bootstrap del primer administrador y CLI de purga de documentos.

Migraciones: `0004_m02_identity` y `0005_m02_identity_guards`.

## Ejecuciones

| Etapa | Corrida | Resultado | Estado |
|---|---|---|---|
| A | Validación post-migración (2026-10-06, `jest --json` fuera del script de evidencia) | 374/374 PASS (unitarias 240, integración 56, E2E 78) | **Validación interna, no evidencia formal.** Su salida no está versionada ni es reproducible desde el repositorio; respalda provisionalmente los resultados de este borrador |
| B | [`2026-10-07T17-54-22_da65914-dirty_M02`](../ejecuciones/2026-10-07T17-54-22_da65914-dirty_M02/DESCARTADA.md) | 373/374: TC-M01-204 por timeout E2E de 5 s | **Descartada (diagnóstico)** |
| C | [`2026-10-07T18-07-48_da65914-dirty_M02`](../ejecuciones/2026-10-07T18-07-48_da65914-dirty_M02/DESCARTADA.md) | 373/374: TC-M02-117 por timeout de integración de 60 s, debido a latencia de red | **Descartada (diagnóstico)** |
| D | Tercera corrida de `pnpm test:evidence M02` | Pendiente | Será la **evidencia formal y definitiva**; esta matriz se actualizará con sus resultados |

## Decisiones de M02

Son decisiones aprobadas de M02: DP (producto) y DT (técnicas). No son requisitos del Documento Maestro.

| ID | Decisión |
|---|---|
| DP-2 | Verificación de correo y recuperación de contraseña con Resend, detrás de `EmailSender` |
| DP-5 | `admin` no es asignable por el cliente; primer administrador por CLI que falla cerrado |
| DP-8 | Cuenta ≠ registro completo ≠ habilitado para agendar; estado derivado, sin bloqueo global |
| DP-11 | INE obligatorio para completar el registro; un solo `pending`; reenvío solo tras `rejected` |
| DP-12 | Editables: teléfono, dirección, contacto de emergencia y foto; CURP, nombre legal y fecha de nacimiento, no |
| DP-15 | Bucket privado; el administrador ve el INE solo si el envío está `pending`, transmitido por el backend con `no-store` y auditado |
| DT-1 a DT-22 | Ver el diseño técnico aprobado. En esta matriz se citan DT-1 a DT-18, DT-21 y DT-22 |

## Matriz

Tipo: **RF** requisito funcional · **RN** regla de negocio · **RNF** requisito no funcional · **DP/DT** decisión aprobada de M02.

| Requisito o decisión | Tipo | Regla | Componentes | Casos de prueba | Resultado | Cobertura |
|---|---|---|---|---|---|---|
| RF-01 | RF | La cuenta crea su perfil de paciente | `RegisterPatientProfileUseCase` | TC-M02-073, 100, 200 | PASS | Completa |
| RF-02 | RF | Permisos por rol; `/me` con rol, perfil y estado | `MeController`, guards de M00 | TC-M02-210, 212, 219 (y los de M00 y M01) | PASS | Completa |
| RF-03, RF-04 | RF | Documentos legales vigentes; aceptar solo la versión vigente | `GetCurrentLegalDocuments`, `AcceptLegalDocuments` | TC-M02-085, 096, 103, 227 | PASS | Completa |
| RF-07 | RF | Envío y revisión del INE | Casos de uso de envío y revisión | TC-M02-024–026, 075, 086, 111, 217 | PASS | Completa |
| RN-001 | RN | Rol único e inmutable | Trigger `user_profile_role_immutable` | TC-M02-114 (y M00) | PASS | Completa frente a UPDATE; el rol dueño de la BD puede desactivar el trigger (D7) |
| RN-002 | RN | Un solo `user_profile` por cuenta | UNIQUE `user_profile.user_id` | TC-M02-223 (y M00) | PASS | Completa |
| RN-006, RNF-12 | RN/RNF | Evidencia legal de solo inserción, también frente a TRUNCATE | Triggers de 0001 y 0005 | TC-M02-103, 104, 115 | PASS | Completa |
| RN-122 | RN | Sin datos clínicos ni personales en `metadata` | `IdentityAuditEvents` | TC-M02-053 | PASS | Completa para los eventos de M02 |
| RNF-01 | RNF | Rutas de M02 sin sesión → 401 | `SessionGuard` | TC-M02-229 | PASS | Completa |
| RNF-08 | RNF | Acciones sensibles auditadas en la misma UoW | `AuditTrail` (M01) | TC-M02-079, 100, 108, 216 | PASS | Completa para los eventos de DT-14 |
| RNF-10 | RNF | Validación de entrada y respuestas sin datos sensibles | DTO, pipe de M00, plantillas | TC-M02-007, 061, 201, 208, 220 | PASS | Completa |
| DP-2 | DP | Verificación y recuperación | `createAuth`, `ResendEmailSender` | TC-M02-009, 060, 200–204 | PASS | La caducidad se probó con el token de recuperación, no con el de verificación |
| DP-5 | DP | Rol no asignable; bootstrap por CLI | DTO sin rol, CLI, trigger | TC-M02-073, 082, 092, 112, 114, 223 | PASS | El bootstrap real está **pendiente** (dependencia del cliente web) |
| DP-8 | DP | Estado del registro derivado | `computeRegistrationStatus`, lector, política | TC-M02-010–014, 090, 097, 210, 211 | PASS | Completa |
| DP-11 | DP | Un solo `pending`; reenvío tras `rejected` | Índice parcial, `nextSubmissionAttempt` | TC-M02-022, 023, 105, 106 | PASS | Completa |
| DP-12 | DP | Solo campos editables | DTO de `PATCH`, `UpdatePatientProfile` | TC-M02-083, 084, 094, 206, 221, 222 | PASS | Completa |
| DP-15 | DP | Acceso del administrador solo con `pending` | `OpenIdentityDocument` | TC-M02-027, 079, 108, 216, 219 | PASS | Transmisión probada con almacenamiento falso; R2 real se validó con el adaptador |
| DT-1 | DT | Transmisión por el backend, sin URLs | `privateImageResponse`, claves | TC-M02-043, 216 | PASS | Completa |
| DT-2 | DT | Un registro por envío, con `attempt` | `UNIQUE(patient_id, attempt)` | TC-M02-020, 105, 117 | PASS | Completa |
| DT-3 | DT | Solo claves de objetos en la BD | Columnas `*_object_key`, `object-keys` | TC-M02-040, 042, 075, 091 | PASS | Completa |
| DT-4 | DT | JPEG o PNG por firma binaria, 5 MB | `validateImage`, Multer | TC-M02-030–034, 213, 214 | PASS | Completa |
| DT-5 | DT | Eliminación de imágenes al aprobar o rechazar | `IdentityDocumentPurger` | TC-M02-077, 078, 109, 110, 117, 218 | PASS | Completa con almacenamiento falso; eliminación real comprobada en el smoke test de R2 |
| DT-6 | DT | Compensación y CLI de purga | Envío, purga | TC-M02-076, 078, 106, 107, 110 | PASS | Conciliación de huérfanos sin fila: deuda |
| DT-7 | DT | Foto privada | Casos de uso de foto | TC-M02-095, 225 | PASS | Completa |
| DT-8 | DT | Rate limit siempre activo | Better Auth y `RateLimitGuard` | TC-M02-009, 070–072, 207, 208, 215 | PASS | En memoria: solo una instancia (deuda) |
| DT-9 | DT | Resend por REST | `ResendEmailSender` | TC-M02-062–064 | PASS | Envío real PASS (resumen de evidencia, sección 5) |
| DT-10 | DT | Destinos de los enlaces configurables | `loadAuthConfig` | TC-M02-008 | PASS | `APP_WEB_URL` aún no definida (dependencia) |
| DT-11 | DT | Contraseña de 8 a 128 caracteres | `createAuth` | TC-M02-009, 205 | PASS | Completa |
| DT-12 | DT | Bootstrap que falla cerrado | `BootstrapAdminUseCase`, CLI | TC-M02-051, 092, 093, 112, 113 | PASS | **Ejecución real pendiente** |
| DT-13 | DT | Endpoints antiguos eliminados | — | TC-M02-226, 228 | PASS | Completa |
| DT-14 | DT | Eventos de auditoría aprobados | `IDENTITY_AUDIT_ACTIONS` | TC-M02-050, 052 | PASS | Completa |
| DT-16 | DT | Sin límite de intentos; control por estado y rate limit | Transiciones, rate limit | TC-M02-021, 105, 215 | PASS | Completa |
| DT-18 | DT | Bucket privado; claves sin datos personales | `R2DocumentStorage`, `object-keys` | TC-M02-041, 087–089, 098 | PASS | R2 real PASS 10/10 |
| DT-21 | DT | `canBook = registrationComplete && patient` | `CanBookAppointmentsPolicy` | TC-M02-015, 097, 211 | PASS | M08 debe llamar la política |
| DT-22 | DT | CURP obligatoria, en mayúsculas, con formato y única | `Curp`, DTO, CHECK, UNIQUE | TC-M02-001–006, 074, 080, 081, 101, 102, 116, 224 | PASS | El dígito verificador se valida solo en la aplicación |

## Casos de prueba de M02 (etapa A, provisional hasta la etapa D)

| Suite | Casos | Ejecuciones | Resultado |
|---|---|---|---|
| Unitarias | TC-M02-001 a 098 | 110 | 110/110 PASS |
| Integración (BD de PEI, siempre con rollback) | TC-M02-100 a 117 | 20 | 20/20 PASS |
| E2E (Better Auth en memoria; PEI con dobles; `AppModule` real sin sesión) | TC-M02-200 a 229 | 48 | 48/48 PASS |
| **Total M02** | | **178** | **178/178 PASS** |

Hay saltos de numeración que no son pruebas omitidas: TC-M02-016–019, 028–029, 035–039, 044–049, 054–059, 065–069,
099 y 209 no existen.

## Regresión

| Módulo | Resultado |
|---|---|
| M00 | 116/116 PASS |
| M01 | 62/62 PASS |
| Anteriores a M00 (sin etiqueta) | 18/18 PASS |

**Sustituidas por M02** (DT-13):

| Ejecución anterior | Reemplazo |
|---|---|
| `identity.controller.spec` ("should be defined") | E2E de los controllers nuevos (TC-M02-210 a 229) |
| TC-M00-240 para `POST /me/complete-profile` | TC-M02-228 (404) |
| TC-M00-240 para `POST /me/upload` | TC-M02-228 (404) |

En `domain-exception.filter.spec`, los 5 casos que usaban los errores antiguos de Identity se reescribieron con los
de M02.

**Cambio de configuración de pruebas:** `"testTimeout": 30000` en `test/jest-e2e.json`, por TC-M01-204 (corrida
descartada B). No se modificó la prueba.

## Infraestructura real

| Validación | Resultado |
|---|---|
| R2 `pei-documents-dev` | PASS 10/10 |
| Resend | PASS (HTTP 200) |
| `admin:bootstrap` | **Pendiente**: depende de `APP_WEB_URL` y de la pantalla del cliente web para establecer la contraseña |

## Límites de cobertura

1. La caducidad se probó con el token de recuperación (reloj controlado), no con el de verificación de correo.
2. La transmisión del INE por el endpoint del administrador se probó con almacenamiento falso. R2 real se validó con el
   adaptador directamente.
3. El acceso por `r2.dev` del bucket nuevo no se comprobó: está desactivado según el panel.
4. El bootstrap real no se ejecutó; solo con dobles y con rollback.
5. Las carreras entre dos conexiones que requieren datos confirmados (el mismo paciente) se simulan en una conexión.
   La garantía final la dan el índice parcial y el `UPDATE … WHERE status = 'pending'`.

## Deuda técnica y dependencias (no bloquean M02)

| # | Elemento | Estado |
|---|---|---|
| 1 | `APP_WEB_URL` y la pantalla del cliente web para establecer la contraseña | Dependencia que desbloquea `admin:bootstrap` |
| 2 | Rate limit distribuido (Better Auth `secondary-storage` y adaptador de `RateLimiter`) | Obligatorio antes de tener varias instancias |
| 3 | Conciliación de objetos huérfanos sin fila en la BD | Deuda (DT-6) |
| 4 | `trust proxy` e IP detrás de un proxy | Deuda M00 #3 |
| 5 | Rol de BD de mínimo privilegio | Deuda D7 |
| 6 | La fila `pending` de desarrollo conserva URLs `example.test` en lugar de claves | El sistema la trata como sin documentos (DT-3) |
| 7 | `pnpm test:evidence -- <etiqueta>` en el README | Deuda de documentación conocida; usar `pnpm test:evidence M02` |
