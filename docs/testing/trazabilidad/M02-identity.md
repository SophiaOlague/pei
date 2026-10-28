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
**Pendientes formales:** evidencia formal (etapa D) y tag de cierre. `admin:bootstrap` ya se ejecutó en `production` (informado por la responsable del producto el 2026-10-18; sin evidencia versionada; ver «Preparación de `admin:bootstrap`»). La etapa D
requiere además un procedimiento de ejecución seguro, pendiente de autorización; `0007` ya está aplicada en la BD
configurada en `.env` desde el 2026-10-17 (ver «Incremento controlado»).

| Aspecto | Estado |
|---|---|
| Implementación | **Técnicamente implementado y validado** (código, esquema, migraciones 0004/0005 aplicadas y regresión) |
| Pruebas de M02 | **178/178 PASS** |
| Validación post-migración (etapa A) | 374/374 PASS, **validación interna** sin salida versionada; no es evidencia formal |
| Corridas de evidencia B y C | **Descartadas** (timeouts por latencia; ver sus `DESCARTADA.md`) |
| Evidencia formal (etapa D) | **Pendiente** por latencia de red hacia Neon |
| `admin:bootstrap` real | **Ejecutado** en `production`: administrador creado, contraseña definida, correo verificado y acceso a `/admin` (informado por la responsable del producto el 2026-10-18; sin evidencia versionada). Implementación versionada en `5d57830`. Sigue pendiente la evidencia formal; ver «Preparación de `admin:bootstrap`» |
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
| DP-12 | Editables: teléfono, dirección, contacto de emergencia y foto; CURP, nombre legal y fecha de nacimiento, no. Coherente con RN-138 ampliada por C-16 (2026-10-28), que extiende la restricción al médico |
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
| DP-5 | DP | Rol no asignable; bootstrap por CLI | DTO sin rol, CLI, trigger | TC-M02-073, 082, 092, 112, 114, 223 | PASS | Bootstrap real ejecutado en `production` (informado por la responsable del producto el 2026-10-18; sin evidencia versionada) |
| DP-8 | DP | Estado del registro derivado | `computeRegistrationStatus`, lector, política | TC-M02-010–014, 090, 097, 210, 211 | PASS | Completa |
| DP-11 | DP | Un solo `pending`; reenvío tras `rejected` | Índice parcial, `nextSubmissionAttempt` | TC-M02-022, 023, 105, 106 | PASS | Completa |
| DP-12 | DP | Solo campos editables | DTO de `PATCH`, `UpdatePatientProfile` | TC-M02-083, 084, 094, 206, 221, 222 (221 comprueba desde C-16 que el perfil no cambia) | PASS | Completa |
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
| DT-10 | DT | Destinos de los enlaces configurables | `loadAuthConfig` | TC-M02-008 | PASS | `APP_WEB_URL` aún no definida (dependencia). Destino y validación del enlace de contraseña: TC-M02-230 a 233, validación unitaria interna (ver «Preparación de `admin:bootstrap`») |
| DT-11 | DT | Contraseña de 8 a 128 caracteres | `createAuth` | TC-M02-009, 205 | PASS | Completa |
| DT-12 | DT | Bootstrap que falla cerrado | `BootstrapAdminUseCase`, CLI | TC-M02-051, 092, 093, 112, 113 | PASS | Ejecución real hecha en `production` (informado por la responsable del producto el 2026-10-18; sin evidencia versionada). Validación previa de la configuración y manejo de errores del CLI: TC-M02-233 y 234, validación unitaria interna (ver «Preparación de `admin:bootstrap`») |
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

## Preparación de `admin:bootstrap` (posterior a A1–A3)

Cambios en `feat/m03-doctors` posteriores a `0551f9e`, versionados en `5d57830` (`feat(m02): add controlled admin bootstrap
and setup flow`). Los casos de esta sección son **validaciones unitarias internas**: no se generaron con
`pnpm test:evidence`, su salida no está versionada y **no constituyen evidencia formal de cierre** (etapa D).

Estado, por separado:

| Aspecto | Estado |
|---|---|
| Implementación | Versionada en `5d57830` (CLI, provisioner, flujo de correos, `/admin` provisional y pruebas) |
| Ejecución real | `admin:bootstrap` se ejecutó en Neon `production`: el administrador inicial se creó, definió su contraseña, verificó su correo e ingresó a `/admin` (informado por la responsable del producto el 2026-10-18; sin evidencia versionada) |
| Validación técnica disponible | Pruebas unitarias internas (abajo) y la ejecución real anterior. Las pruebas de integración y E2E del flujo siguen como se indica en esta sección |
| Evidencia formal y cierre de M02 | **Pendientes**: etapa D y revisión de los criterios pendientes antes del tag de cierre |

| Cambio | Código |
|---|---|
| El enlace para definir la contraseña apunta a `/restablecer-contrasena`, la pantalla real del cliente web (antes `/reset-password`, inexistente) | `PASSWORD_SETUP_PATH`, `better-auth-admin-account.provisioner.ts` |
| Una sola regla construye y valida el destino: `APP_WEB_URL` http(s), sin credenciales, query ni fragmento, y destino aceptado por los orígenes de confianza **efectivos** de Better Auth (`isTrustedOrigin`). El error no incluye el valor | `passwordSetupRedirect`, `PasswordSetupNotConfiguredError` |
| `assertPasswordSetupConfigured()` en el puerto, como **primera operación** de `BootstrapAdminUseCase.execute`: si la configuración falta o es inválida, no hay lecturas, cuenta, perfil, auditoría ni correos | `AdminAccountProvisioner`, `bootstrap-admin.use-case.ts` |
| CLI: la creación del contexto de Nest entra en el manejo de errores (`abortOnError: false`); códigos 0 (creado), 1 (abortado por regla o configuración), 2 (argumentos), 3 (fallo inesperado, con tipo y traza y las URLs ocultas); los fallos de cierre se informan como aviso | `admin-bootstrap.ts`, `admin-bootstrap.run.ts` |
| Correos: Better Auth 1.7.5 espera el callback de envío, pero el de PEI (`sendInBackground`) devuelve antes de que Resend responda (para que el tiempo de respuesta HTTP no revele si la cuenta existe), y Better Auth atrapa y solo registra los errores del callback. Un registro opcional (`EMAIL_DISPATCHES`) recibe cada envío; solo el CLI lo activa, espera los envíos **antes** de cerrar el contexto y salir, e informa por correo «Resend aceptó» (HTTP 2xx, no entrega en el buzón) o el motivo del fallo. Código 4: administrador creado, pero algún correo falló o no consta. La API no cambia: sigue sin esperar y, sin registro activo, no guarda nada | `email-dispatches.ts`, `auth.config.ts`, `auth.module.ts`, `admin-bootstrap.run.ts` |
| Opción C: la cuenta del administrador se crea con `internalAdapter.createUser` (solo la fila `user`, `emailVerified: false`, sin credencial ni correo de verificación); `resetPassword` crea la credencial. El CLI espera solo el correo `password_reset`. `beforeEmailVerification` rechaza la verificación de cuentas sin contraseña | `better-auth-admin-account.provisioner.ts`, `auth.config.ts`, `admin-bootstrap.run.ts` |
| Reanudación segura: una cuenta existente con ese correo solo se reanuda si no tiene perfil **ni contraseña** (`hasPasswordCredential`, mismo criterio que el inicio de sesión). Con contraseña (por ejemplo, creada por el registro público), el bootstrap aborta con `BootstrapAccountHasCredentialError` (código 1) antes de asignar el rol, crear el perfil o enviar correos | `bootstrap-admin.use-case.ts`, `identity.errors.ts`, puerto y provisioner |
| Fallo al solicitar el enlace después de crear el administrador: `AdminPasswordSetupRequestFailedError` (con el `user_profile` creado y la causa). El CLI lo traduce al código 4, indica «Olvidé mi contraseña» y no recomienda repetir el bootstrap (abortaría) | `bootstrap-admin.use-case.ts`, `admin-bootstrap.run.ts` |

| Caso | Prueba | Qué valida | Resultado (2026-10-18) |
|---|---|---|---|
| TC-M02-230 | `better-auth-admin-account.provisioner.spec.ts` (2 ejecuciones) | Con `APP_WEB_URL` válida (con y sin barra final), el correo lleva el enlace del backend con `callbackURL=…/restablecer-contrasena`, y el `GET` de ese enlace responde 302 a `/restablecer-contrasena?token=…` con el mismo token | PASS, interna |
| TC-M02-231 | ídem (2) | `APP_WEB_URL` ausente o vacía: fallan la validación previa y el envío, y no sale ningún correo. Sustituye a la versión anterior de este caso, que aceptaba `redirectTo` sin definir | PASS, interna |
| TC-M02-232 | ídem (9) | Ocho valores inválidos (no URL, `ftp:`, `javascript:`, credenciales, query, fragmento, origen y puerto no confiables): fallo sin correo y sin el valor en el mensaje. Además, la ruta base se conserva y la comprobación de orígenes se aplica al destino final | PASS, interna |
| TC-M02-233 | `identity-use-cases.spec.ts` (2) | Con configuración inválida, la validación es la única operación (sin `adminExists`, cuenta, perfil, auditoría ni correos); con configuración válida, es la primera y el enlace la última | PASS, interna |
| TC-M02-234 | `admin-bootstrap.run.spec.ts` (9) | Argumentos; códigos de salida 0, 1, 2 y 3; espera de los correos y después cierre del contexto y de la BD; fallo de arranque y error de programación informados como inesperados con traza; URLs ocultas en los mensajes | PASS, interna |
| TC-M02-235 | ídem (5) | El CLI no declara enviados los correos: no cierra mientras esperan y solo informa «Resend aceptó»; correo fallido o que no consta → código 4 con el motivo sin URLs; solo se espera el correo de contraseña, también al reanudar una cuenta; si el resultado no puede comprobarse → código 4; si el bootstrap falla después de pedir correos, se esperan e informan antes de cerrar | PASS, interna |
| TC-M02-236 | `email-dispatches.spec.ts` (3) | Sin registro activo no se guarda nada; con registro, `settle` espera envíos demorados (también los pedidos mientras espera) y nunca rechaza; de un error ajeno a `EmailDeliveryError` solo se conserva el tipo | PASS, interna |
| TC-M02-237 | ídem (1) | Con Better Auth real: `signUpEmail` y `requestPasswordReset` terminan con los envíos aún pendientes (el riesgo de cortar el proceso) y el registro espera ambos y recoge el éxito y el fallo | PASS, interna |
| TC-M02-238 | `admin-bootstrap.run.spec.ts` (5) | `contextFromApp`: si falla la obtención de un proveedor del contexto de Nest, la aplicación se cierra y se propaga el error original (y un fallo de ese cierre se informa sin URLs); si falla el cierre del contexto, la BD se cierra igualmente | PASS, interna |
| TC-M02-239 | `better-auth-admin-account.provisioner.spec.ts` (4) | Opción C, recorrido completo: la cuenta se crea sin credencial, sesión ni correo; sin contraseña, el inicio de sesión responde 401 y no envía nada; el único correo del bootstrap es el enlace de contraseña; restablecer crea la credencial sin sesión ni cambio de `emailVerified`; el inicio de sesión responde 403 `EMAIL_NOT_VERIFIED` y envía la verificación; al verificar, 302 a `/completar-registro` con sesión. Con el caso de uso: un solo correo y reintento sin efectos (`AdminAlreadyExistsError`); envío del enlace fallido recogido por el registro y recuperable con «Olvidé mi contraseña»; reanudación de una cuenta sin perfil | PASS, interna |
| TC-M02-240 | `email-verification-guard.spec.ts` (4) | Bloqueo en `beforeEmailVerification`: un enlace de verificación pedido a `/send-verification-email` (público) para una cuenta sin contraseña se rechaza **sin crear sesión ni cookie y sin cambiar `emailVerified`**: con `callbackURL`, 302 al cliente web con `?error=EMAIL_VERIFICATION_REQUIRES_PASSWORD`; sin él, 403. Comprobado sobre las filas de sesión y usuario, no sobre la posición del hook. Una vez definida la contraseña, el mismo enlace vigente sí verifica | PASS, interna |
| TC-M02-241 | ídem (4) | Pacientes sin cambios: registro → verificación con sesión automática y vuelta al `callbackURL`; inicio de sesión sin verificar (403 y reenvío) y verificado (200); recuperación de contraseña (sin sesión tras restablecer y nuevo inicio de sesión); un paciente ya verificado que vuelve a abrir el enlace no se ve afectado | PASS, interna |
| TC-M02-242 | `identity-use-cases.spec.ts` (2), `better-auth-admin-account.provisioner.spec.ts` (2), `admin-bootstrap.run.spec.ts` (1) | Una cuenta existente **con** contraseña (dobles y Better Auth real con una cuenta del registro público) aborta con `BootstrapAccountHasCredentialError` antes de asignar el rol, crear el perfil, auditar o pedir el enlace; el mensaje no incluye datos de la cuenta y el CLI sale con código 1. Una cuenta **sin** contraseña ni perfil se reanuda. `hasPasswordCredential` es falso para la cuenta que crea el bootstrap y verdadero tras definir la contraseña | PASS, interna |
| TC-M02-243 | `identity-use-cases.spec.ts` (1), `better-auth-admin-account.provisioner.spec.ts` (1), `admin-bootstrap.run.spec.ts` (1) | Si falla la solicitud del enlace después de crear el administrador (doble y `requestPasswordReset` de Better Auth fallando): `AdminPasswordSetupRequestFailedError` con el perfil y la auditoría ya creados, sin correo solicitado, y repetir el bootstrap aborta. El CLI sale con código 4, muestra la causa sin URLs ni traza, indica «Olvidé mi contraseña», no recomienda repetir el bootstrap y no afirma ningún envío | PASS, interna |
| TC-M02-244 | `email-verification-guard.spec.ts` (2) | B1: si la consulta de la credencial falla dentro del bloqueo, la verificación se rechaza con 500, sin sesión, cookie ni redirección, sin cambiar `emailVerified` y sin exponer el error en la respuesta (cuenta sin contraseña y paciente); al recuperarse la consulta, el mismo enlace vuelve a decidir correctamente | PASS, interna |
| TC-M02-245 | `origin-check.spec.ts` (5) | B2 con `originCheck` **activo**: Better Auth lo desactiva cuando `NODE_ENV=test`, así que la suite carga una instancia aislada con `NODE_ENV=development` y comprueba primero que `skipOriginCheck` es falso. Un `callbackURL` no confiable se rechaza (403 `INVALID_CALLBACK_URL`) antes del bloqueo, sin redirigir a ese origen, sin sesión ni verificación, en `/verify-email`, `/send-verification-email` y `/sign-up/email`; con un origen de confianza, el comportamiento normal | PASS, interna |
| TC-M02-246 | `test/support/c2-target-guard.spec.ts` (12) | Salvaguarda de destino de los specs que solo deben ejecutarse contra la rama temporal mediante C2: sin identidad esperada, con la de la rama original, con un `DATABASE_URL` de otro endpoint o con Resend o R2 sin neutralizar, falla antes de cualquier consulta y sin mostrar valores. Además se comprobó en el propio spec de integración, con un host `.invalid`, que se detiene al cargarse | PASS, interna |
| TC-M02-247 | `test/support/c2-target-guard.spec.ts` (23) | Inventario completo: los 13 specs que requieren PostgreSQL (10 de integración, `audit-db`, `me` y `app`) llaman a la salvaguarda en el nivel superior del módulo, antes de cualquier `describe`; los 6 E2E con dobles no la llevan ni importan `src/db`; las tres configuraciones de Jest cargan el interceptor `db-tripwire`. Ejecutados con Jest sin identidad de C2 y con la URL del endpoint de `production` (hosts `.invalid`), los 13 se detienen al cargar (0 pruebas, ningún intento de red); los 6 con dobles pasan sin C2 (65/65) sin ningún intento de conexión | PASS, interna |
| TC-M02-248 | `test/support/db-tripwire.spec.ts` (5) | Interceptor de conexiones (`setupFiles` de las tres configuraciones): sin identidad de C2 válida (ejecución manual, URL de la rama original o Resend sin neutralizar), `connect` y `query` de `Pool` y `Client` del driver de Neon fallan antes de abrir la red y sin mostrar valores; con la identidad de la rama temporal no intercepta nada | PASS, interna |
| TC-M02-118 a 121 | `test/integration/admin-bootstrap-better-auth.int-spec.ts` | Provisioner real con el esquema de Drizzle y Better Auth sobre la transacción de la prueba (todo revertido): alta sin credencial, recorrido completo, enlace prematuro, caso de uso con Drizzle y H1 | **Ejecución interna, sin evidencia versionada**: C2 v9 `probar-bootstrap` en la rama temporal `rama` (2026-10-19 UTC), sobre el árbol de trabajo previo a A4 (no sobre un commit identificable), paso `test-int-bootstrap`: `admin-bootstrap-better-auth.int-spec.ts` PASS (con `identity.int-spec.ts`, 26/26 en 2 suites; la salida no desglosa los casos). En esa corrida el paso final `estado-despues` se detuvo por una desconexión (código 1); una huella posterior separada coincide con la previa. El registro está fuera del repositorio (`probar-bootstrap-2026-10-19.log` del espacio de trabajo de C2) y debe verificarse antes de usarlo como evidencia. El código del bootstrap y este spec no cambiaron después de esa ejecución; aun así, no valida el HEAD actual ni es evidencia formal de cierre. Evidencia formal pendiente |

Condiciones de la última ejecución: solo la configuración unitaria de Jest, sin `DATABASE_URL`, `RESEND_API_KEY`,
`EMAIL_FROM`, las variables `R2_*`, `APP_WEB_URL` ni `BETTER_AUTH_SECRET` en el entorno. Better Auth real con el
adaptador en memoria y un `EmailSender` falso; CLI con dependencias falsas. Ningún spec unitario importa `src/db`,
`AppModule` ni los módulos de Nest que lo cargan (`auth.module.ts` solo se compiló). Resultado: la suite unitaria
completa del backend, **38 suites, 410/410 PASS** (con TC-M02-244 a 248), igual sin C2 y con un entorno de C2 simulado. Desde TC-M02-247 y 248, ninguna prueba con PostgreSQL puede ejecutarse fuera de C2: `pnpm test:int`, `pnpm test:e2e` (en sus specs con BD) y `pnpm test:evidence` manuales se detienen antes de conectar; las pruebas unitarias y los E2E con dobles siguen funcionando sin C2. No se
ejecutaron suites de integración ni E2E (en particular, `auth-flows.e2e-spec.ts` no se ejecutó con el bloqueo); el
doble `TxAdminAccountProvisioner` de integración solo se compiló.

> **Antecedente técnico interno posterior (no es evidencia formal ni validación del HEAD actual).** C2 v9, plan
> `probar-bootstrap`, rama temporal `rama`, el 2026-10-19 UTC (la noche del 2026-10-18 en hora local UTC−6):
> - paso `test-e2e-auth`: `auth-flows`, `me` y `app`, **24/24 PASS** con el tripwire activo. `auth-flows` usó dobles;
>   `me` y `app` usaron la BD de `rama`;
> - se ejecutó sobre un árbol de trabajo previo a A4, no sobre un commit identificable. Después, A4 modificó
>   `me.controller.ts` y `registration-status.use-cases.ts`, que afectan a `GET /me`;
> - la salida no desglosa los resultados por caso, y el registro (`probar-bootstrap-2026-10-19.log`) está fuera del
>   repositorio;
> - el paso `estado-despues` terminó con código 1 por una desconexión. Una huella posterior, tomada aparte, coincidió
>   con las anteriores; por sí sola no demuestra la integridad total de la ejecución.
>
> **Pendiente:** la ejecución formal mediante C2 y `pnpm test:evidence` sobre el HEAD vigente, con la integración del
> bootstrap (TC-M02-118 a 121) y las suites E2E `auth-flows`, `me` y `app`.

**Cliente web (`apps/web`):** `/completar-registro` consulta primero el rol (`GET /me`) y envía al administrador a
`/admin`, una pantalla provisional sin funciones de administración, sin consultar `registration-status` ni mostrar el
registro de pacientes; `RequireRegistration` hace lo mismo. Pacientes, cuentas sin perfil y otros roles conservan el
comportamiento anterior. Pruebas unitarias del cliente web (vitest, `fetch` simulado, sin etiqueta TC): 6 archivos,
73/73 PASS, validación interna.

**Flujo del administrador (opción C, aprobada):** el bootstrap crea la cuenta sin contraseña y envía un solo correo,
el enlace para definirla. Después, el primer inicio de sesión envía la verificación y, al verificar, el cliente web
lleva al administrador a `/admin`. El hook `beforeEmailVerification` de `createAuth` rechaza la verificación de una
cuenta sin contraseña antes de marcar el correo y de crear la sesión. Es un hook global; los pacientes siempre tienen
contraseña, así que no les afecta (TC-M02-241), salvo una consulta más por verificación (`findCredentialAccount`).

**Riesgos y límites conocidos:**
- Las ramas de cambio de correo de `/verify-email` (`updateTo`) crean sesión sin pasar por el hook. Solo se alcanzan
  con tokens que emiten `/update-user` y `/change-email`, desactivadas en PEI (`disabledPaths`). Si se activan, hay
  que revisar el bloqueo.
- Con un enlace prematuro, el cliente web recibe `/completar-registro?error=EMAIL_VERIFICATION_REQUIRES_PASSWORD` sin
  sesión y envía a `/login` sin mostrar el motivo.
- En las pruebas automatizadas, la espera de los correos antes de salir y la experiencia completa del administrador
  están validadas solo con dobles y Better Auth en memoria. Con Resend, la BD y el navegador reales, el recorrido se
  completó en la ejecución en `production` (informado por la responsable del producto el 2026-10-18; sin evidencia
  versionada).

**Bootstrap real:** ejecutado en `production` (informado por la responsable del producto el 2026-10-18; sin evidencia versionada). Como el CLI exige `APP_WEB_URL` antes de cualquier operación, esa variable estaba definida en el entorno de ejecución, que no está versionado. El recorrido real del administrador no está documentado como evidencia formal.

## Infraestructura real

| Validación | Resultado |
|---|---|
| R2 `pei-documents-dev` | PASS 10/10 |
| Resend | PASS (HTTP 200) |
| `admin:bootstrap` | **Ejecutado** en `production` (informado por la responsable del producto el 2026-10-18; sin evidencia versionada); implementación en `5d57830`. Pendientes: evidencia formal y, si no constan, la integración del provisioner real y las E2E de autenticación con el flujo nuevo; ver «Preparación de `admin:bootstrap`» |

## Límites de cobertura

1. La caducidad se probó con el token de recuperación (reloj controlado), no con el de verificación de correo.
2. La transmisión del INE por el endpoint del administrador se probó con almacenamiento falso. R2 real se validó con el
   adaptador directamente.
3. El acceso por `r2.dev` del bucket nuevo no se comprobó: está desactivado según el panel.
4. El bootstrap real se ejecutó en `production` (informado por la responsable del producto el 2026-10-18; sin evidencia versionada); sus pruebas automatizadas son con dobles y con rollback.
5. Las carreras entre dos conexiones que requieren datos confirmados (el mismo paciente) se simulan en una conexión.
   La garantía final la dan el índice parcial y el `UPDATE … WHERE status = 'pending'`.

## Deuda técnica y dependencias (no bloquean M02)

| # | Elemento | Estado |
|---|---|---|
| 1 | La integración del provisioner real y las E2E de autenticación con el flujo nuevo | Validación técnica pendiente del flujo de `admin:bootstrap`, ya ejecutado en `production`; no bloquea la ejecución, sí la evidencia formal |
| 2 | Rate limit distribuido (Better Auth `secondary-storage` y adaptador de `RateLimiter`) | Obligatorio antes de tener varias instancias |
| 3 | Conciliación de objetos huérfanos sin fila en la BD | Deuda (DT-6) |
| 4 | `trust proxy` e IP detrás de un proxy | Deuda M00 #3 |
| 5 | Rol de BD de mínimo privilegio | Deuda D7 |
| 6 | La fila `pending` de desarrollo conserva URLs `example.test` en lugar de claves | El sistema la trata como sin documentos (DT-3) |
| 7 | `pnpm test:evidence -- <etiqueta>` en el README | Deuda de documentación conocida; usar `pnpm test:evidence M02` |
