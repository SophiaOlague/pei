# Trazabilidad M02: Identity / Access Completion de PEI (BORRADOR)

> **Borrador.** La evidencia formal y reproducible será la **etapa D**: la tercera corrida de `pnpm test:evidence M02`,
> pendiente de una red con latencia normal hacia Neon. Mientras tanto, los resultados de esta página provienen de la
> **etapa A** (validación post-migración, 374/374 PASS), que **no es evidencia formal**: su salida no está versionada y no
> se generó con el script de evidencia. Las etapas B y C están **descartadas** (ver "Ejecuciones").

Gestinnovo es la empresa; PEI es la aplicación.
Fuente del detalle: [resumen de evidencia de M02](../ejecuciones/2026-10-07_M02-validacion/resumen-de-evidencia.md).

## Estado de M02 (sin cierre formal todavía)

**Cierre técnico:** cumplido para el alcance técnico original de M02, previo al incremento controlado A1–A3
(implementación, migraciones 0004/0005 aplicadas, regresión e infraestructura real).
**Pendientes formales:** evidencia formal (etapa D), ejecución real de `admin:bootstrap` y tag de cierre. La etapa D
requiere además un procedimiento de ejecución seguro, pendiente de autorización; `0007` ya está aplicada en la BD
configurada en `.env` desde el 2026-10-17 (ver «Incremento controlado»).

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
| D | Tercera corrida de `pnpm test:evidence M02` | Pendiente | Será la **evidencia formal y definitiva**; esta matriz se actualizará con sus resultados. Desde A3 requiere una BD con `0007` aplicada (lo está en `production` desde el 2026-10-17) y un procedimiento de ejecución seguro (pendiente de autorización) |

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
| DT-18 | DT | Bucket privado; claves sin datos personales | `R2PrivateObjectStorage` (`modules/private-storage`, desde A1; antes `R2DocumentStorage`), `object-keys` | TC-M02-041, 087–089, 098 | PASS | R2 real PASS 10/10 con el adaptador anterior (`R2DocumentStorage`); smoke test de R2 OK con `R2PrivateObjectStorage` (commit A1, `a176934`) |
| DT-21 | DT | `canBook = registrationComplete && patient` | `CanBookAppointmentsPolicy` | TC-M02-015, 097, 211 | PASS | M08 debe llamar la política |
| DT-22 | DT | CURP obligatoria, en mayúsculas, con formato y única | `Curp`, DTO, CHECK, UNIQUE. Desde A3 (`0007`): fuente de verdad en `user_profile.curp`, `user_profile_curp_unique` (única **entre roles**, D-20/D-35), `user_profile_curp_upper_chk`, `user_profile_curp_format_chk` y `user_profile_curp_required_chk` (obligatoria para paciente y médico); `patient_profile` ya no tiene CURP | TC-M02-001–006, 074, 080, 081, 101, 102, 116, 224; desde A3 también TC-M03-050–059 ([M03](M03-doctors.md)) | PASS (etapa A, esquema anterior) | El dígito verificador se valida solo en la aplicación. Los resultados de esta fila son de la etapa A, con la CURP en `patient_profile`; el estado posterior a A3 está en «Incremento controlado» |

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

## Incremento controlado A1–A3 (posterior a la etapa A)

M03 modifica M02 como incremento controlado (M02-1 a M02-5; ver el [registro de decisiones de M03](../../arquitectura/M03-decisiones.md)).
Los resultados históricos de esta página (etapa A, corridas B y C) **no cambian**: describen el código y el esquema
anteriores al incremento.

| Fase | Commit | Cambio en M02 | Migración | Pruebas de M02 modificadas o trasladadas* |
|---|---|---|---|---|
| A1 | `a176934` | M02-5: el almacenamiento pasa al puerto `PRIVATE_OBJECT_STORAGE` (`modules/private-storage`); `R2DocumentStorage` se sustituye por `R2PrivateObjectStorage`. Mismos nombres de error y mismo comportamiento HTTP (DC-1) | — | Modificadas: TC-M02-088, 089, 098. Trasladadas sin cambios en su bloque: TC-M02-030, 031, 032, 033, 034 (`image-file.spec` → `file-signature.spec`) y 087 (`r2-document-storage.spec` → `r2-private-object-storage.spec`) |
| A2 | `b40058f` | M02-3 y M02-4: aceptación legal auditada (R-8) y requisitos legales por rol (D-32, N1) | `0006_m02_legal_document_types_by_role` (aplicada el 2026-10-12 en la BD configurada en `.env`: rama `production` de Neon; entorno por confirmar) | Modificadas: TC-M02-050, 052, 053, 096, 097 |
| A3 | `779b13b` | M02-1 y M02-2: la CURP pasa a `user_profile` con unicidad entre roles; `DuplicateCurpError` se sustituye por `RegistrationDataConflictError` (409 genérico, causa interna, log `warn`, sin evento de auditoría por P2) | `0007_m02_user_profile_curp` (sha256 `fc9ce8379a6c9d2c4ea5efc90f8c4cf7124d7f7ced0b0429d7e8526c5d849ac1`) | Modificadas: TC-M02-073, 074, 093, 100, 101, 116. Además, sin etiqueta TC: el `it.each` «excepciones de dominio de Identity» de `domain-exception.filter.spec.ts` (`DuplicateCurpError` pasa a `RegistrationDataConflictError`) |

\* Contrastadas bloque `it()` por bloque en el diff de cada commit, con detección de archivos renombrados: «modificada»
significa que cambió el título o el cuerpo de la prueba; las pruebas sin etiqueta TC se nombran por su descripción.
Además, los commits cambiaron código de apoyo de las pruebas
(fixtures, el doble en memoria de Identity y funciones auxiliares), que no se atribuye a una prueba concreta. Las
pruebas nuevas del incremento se numeran como TC-M03 y RT-M03 y se documentan en [M03](M03-doctors.md).

**TC-M02-116 (A3).** Antes esperaba el código `23514` para la CURP en minúsculas y `patient_profile_curp_format_chk`
para el formato inválido. Desde `779b13b` espera `user_profile_curp_format_chk` en ambos casos: los CHECK están en
`user_profile` y PostgreSQL evalúa los CHECK de una tabla por orden alfabético de nombre, así que una CURP en
minúsculas incumple primero `format_chk`. Confirmado en PostgreSQL 17 local y en la validación interna sobre la rama
temporal de Neon (PostgreSQL 18.6). El resultado PASS de la etapa A corresponde a la versión anterior de la prueba.

**Estado de `0007`.**
- Primero se aplicó y validó en la rama temporal de Neon `rama` (`br-autumn-sun-b52qoep4`), creada a partir de `production` (rama
  principal de Neon, marcada como `Default`; entorno por confirmar), con postcondiciones Q1–Q9 PASS.
  Pruebas en esa rama: unitarias 305/305, integración 69/69, E2E 83/83, sin residuos. Es **validación interna**, no
  evidencia formal: la salida no está versionada ni se generó con `pnpm test:evidence`.
- **Aplicada en `production`:** `0007` se aplicó el 2026-10-17 (05:10–05:11 UTC) en la rama `production` de Neon (branch ID `br-royal-recipe-b54s5hnn`, endpoint `ep-wandering-bonus-b5kxacor`; la BD configurada en `.env`; entorno por confirmar), con autorización explícita y
  mediante `drizzle-kit migrate`. Se verificó directamente en esa BD, con consultas de solo lectura: identidad de la
  rama, registro de la migración 8 con el hash de `0007` y postcondiciones Q1–Q9 **PASS**. Punto de recuperación
  registrado antes de aplicarla: LSN `0/2CB7398`. Distinciones:
  - el ensayo y el inverso lógico se validaron en `rama`, **no** en `production`;
  - la viabilidad de una restauración de Neon a ese punto **no está confirmada** (P1 sigue pendiente);
  - no se ha confirmado si la rama `production` corresponde al entorno de producción organizacional;
  - después de la aplicación no se ejecutó ninguna prueba de integración ni E2E contra `production`.

  Evidencia fuera del repositorio. No es evidencia formal.
- **Antes de esa aplicación** (análisis que se conserva como registro): el código de HEAD no era compatible con la BD
  configurada en `.env` sin `0007` y no debía desplegarse contra ella. Efecto en
  las pruebas: las de integración y las E2E que dependen de PostgreSQL **no se ejecutaron** contra esa BD con el
  código de A3 y sin `0007`; para ellas solo hay conclusiones estáticas, deducidas del código y la configuración, no
  fallos observados en ejecución. Las E2E con dobles sí se ejecutaron en local con esa BD configurada en el entorno,
  pero con los proveedores de acceso a datos sustituidos por dobles (no se afirma que consultaran ni escribieran en
  ella):
  - **Incompatibles (conclusión estática del código; no es un fallo observado en ejecución):** 8 de las 9 suites de
    integración **contienen pruebas** con operaciones que nombran `user_profile.curp`, columna que no existe sin
    `0007` (PostgreSQL respondería 42703):
    - `curp-user-profile`: todas sus pruebas (SQL directo con `curp`; la suite declara que requiere `0007`).
    - `identity`, `legal-acceptance-audit` y `legal-regime`: las pruebas que crean pacientes con `createPatient`
      (`test/support/identity-integration.ts`) pasan por `RegisterPatientProfileUseCase` y el repositorio
      `DrizzleUserProfileRepository` (`existsByCurp` filtra por `user_profile.curp` y el alta inserta `curp`);
      además, `identity` lee `up.curp` con SQL directo y `legal-regime` usa la fixture `insertUserWithProfile`.
    - `audit-trail`: las pruebas que usan `insertUserWithProfile` (la mayoría, a través de `userActorFor`).
    - Solo en determinadas pruebas: `actor-profile-reader` (TC-M00-150; no TC-M00-151), `concurrency` (TC-M00-140,
      a través de `insertPolicy`; TC-M00-141 no acreditada) y `postgres-errors` (TC-M00-113 y TC-M00-122).

    La fixture `insertUserWithProfile` pasa `curp` de forma explícita. `unit-of-work.int-spec.ts` no tiene una
    dependencia equivalente: solo usa `insertMedication`, que inserta en `medication`.

    También la E2E `audit-db.e2e-spec.ts`, que inserta en `user_profile` con PostgreSQL real sin indicar `curp`: con
    Drizzle 0.45.3 (la versión instalada), `insert().values()` incluye todas las columnas insertables de la tabla y
    usa `default` para las omitidas (`drizzle-orm/pg-core/dialect.js`, `buildInsertQuery`), así que la sentencia
    nombra `curp`. No se generaliza a otras versiones de Drizzle.
  - **E2E con dobles:** `audit`, `auth-flows`, `auth-guards`, `auth-rate-limit`, `identity` y `legal-regime` importan
    `AuthModule` (directamente o a través de sus módulos de apoyo), que a su vez importa `db`; las pruebas sustituyen
    con dobles los proveedores que usan la BD. Cinco de ellas (`audit`, `auth-flows`, `auth-guards`,
    `auth-rate-limit` e `identity`) pasaron 61/61 en una corrida local con el código de A3, ejecutada con la configuración
    de `.env` presente en el entorno (BD sin `0007`) pero con los proveedores de acceso a datos sustituidos por dobles;
    no se afirma que consultaran ni escribieran en esa BD (**evidencia interna no versionada**, no formal). `legal-regime` no se ejecutó en esa corrida (la
    excluyó el patrón `me.e2e`); para ella, la ausencia de incompatibilidad es una conclusión estática.
  - **Pendiente de verificación:** las E2E `app.e2e-spec.ts` y `me.e2e-spec.ts` usan `AppModule` con la BD real, pero
    sus casos (rutas públicas o sin sesión válida) no muestran en el código una consulta que toque la CURP; que fallen
    o no sin `0007` no está demostrado.

**`scripts/dev-fix-curp-dt22.mjs`.** Lee y corrige `patient_profile.curp`; desde que
`0007` está aplicada en la BD configurada en `.env` (rama `production` de Neon; entorno por confirmar), su primera consulta
fallaría antes de cualquier escritura y revertiría la transacción (conclusión del código; el script no se ha ejecutado). Según P3, se conserva sin cambios hasta el cierre formal de M02; después se le añadirá una nota de
obsolescencia en un comentario. Su retiro requiere una decisión aparte.

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
