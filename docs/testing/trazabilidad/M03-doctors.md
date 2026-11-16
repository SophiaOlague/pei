# Trazabilidad M03: Médicos (registro y verificación) de PEI (EN CURSO)

> **Estado:** Implementación de M03 completa (A1–A4 y B1–B8, commit `35e205c` para B1–B8). Evidencia formal registrada: `docs/testing/ejecuciones/2026-10-20T09-32-22_35e205c_M03/` (588 unitarias, 94 de integración y 104 E2E, todas PASS) en la rama limpia `br-rough-truth-b5oc81xl`. `0009`–`0012` aplicadas en `rama` y en la rama limpia; **no en `production`**. Pendiente: aplicación en `production` (autorización aparte) y documento académico.

> **C-16 (2026-10-28, sin commit):** se retiró `PUT /me/doctor-profile/identity` (RN-138: ni el médico ni el paciente editan su CURP ni su nombre legal). Casos retirados: TC-M03-121 a 124, 140 a 143, 151 y 177. Nuevos: TC-M03-218 y 219. Ejecutado en local (2026-10-28): unitarias 625/625 y E2E con dobles 82/82, ambas PASS. Integración: solo TC-M03-178 y 179, **PASS** (2/2) el 2026-10-28 mediante C2 en la rama `br-shy-pond-b50a3m8f` / `ep-withered-block-b5e8v9ov`, creada por el usuario como hija de `production`. Antes de ejecutarlas se verificó en solo lectura la identidad y el esquema (13 migraciones iguales al journal). Las pruebas se ejecutaron dentro de transacciones revertidas y la huella de la rama quedó idéntica antes y después. `production` no recibió ninguna conexión. El resto de la integración de M03 no se volvió a ejecutar tras C-16. La evidencia formal de `35e205c` describe el código anterior a C-16.

> **D-37, RN-140 y C-22 (2026-10-30):** aprobadas documentalmente, **pendientes de implementación**. Los casos TC-M03-220 a 226 son escenarios previstos: no existen como pruebas ni se han ejecutado.

> **Publicación legal segura (pruebas del 2026-10-30; resultados y limitaciones documentados aquí):** TC-M03-227 a 272. Resultados locales, sin BD: unitarias 698/698 y E2E con dobles 86/86 (las E2E, sin las 3 suites que exigen BD). Build correcto; TypeScript de build sin errores; TypeScript completo con el error preexistente de `test/support/better-auth-memory.ts`; lint con el error preexistente de `src/main.ts` y un aviso nuevo en `src/cli/legal-publish.spec.ts`. Integración mediante C2 en `br-shy-pond-b50a3m8f`: TC-M03-044 y 244 a 248, 6/6 PASS en transacciones revertidas, con huella idéntica antes y después; TC-M03-268 a 272, 5/5 PASS con datos confirmados. **Limitaciones:** la protección de `production` se validó con dobles, nunca contra producción; la cadena completa `pnpm legal:publish` (`tsc && ts-node`) no se ha ejecutado; TC-M03-269 demuestra una ejecución concurrente, no todas las intercalaciones posibles; `br-shy-pond-b50a3m8f` conserva cuatro documentos sintéticos y sus eventos de auditoría; `dev-1` sigue pendiente de verificación; no se publicaron documentos legales reales; el resto de la integración de M03 no se volvió a ejecutar.

> **Infraestructura real en la rama C2 persistente (2026-11-03):** PostgreSQL de `br-shy-pond-b50a3m8f`, mediante el lanzador C2: concurrencia TC-M03-183 a 187 **5/5** (datos sintéticos persistentes autorizados); integración TC-M03-172 a 182 **10/10** (rollback); Better Auth **5 aprobadas y 2 pendientes** (bootstrap inicial no aplicable con administrador). Estas ejecuciones son anteriores a los paquetes de evidencias del lanzador (2026-11-06) y no tienen paquete propio (pendiente 27). Las pruebas de R2 se documentarán en la etapa de integración de R2. Detalle y limitaciones en «Validación con infraestructura real en la rama C2 persistente».

Gestinnovo es la empresa; PEI es la aplicación.
Decisiones: [registro de decisiones de M03](../../arquitectura/M03-decisiones.md). Incremento sobre M02: [M02](M02-identity.md#incremento-controlado-a1a3-posterior-a-la-etapa-a).

## Alcance y límites

M03 cubre el registro y la verificación del **médico**: INE, CURP, cédula, especialidad, aceptación legal por rol,
revisión por el administrador y estado derivado. Fuera de alcance:
- agenda y duración de la consulta (M07);
- citas, ocupación y consecuencias de volver a `pending` (M08);
- directorio, perfil público y búsqueda de médicos (D-36).

| Fase | Contenido | Commit | Estado |
|---|---|---|---|
| A1 | Almacenamiento privado compartido (R-11, M02-5) | `a176934` | Implementada |
| A2 | Legales por rol y aceptación auditada (D-32, N1, R-8, R-13; M02-3, M02-4); migración `0006` | `b40058f` | Implementada; `0006` aplicada en la BD configurada en `.env` (rama `production` de Neon; entorno por confirmar) |
| A3 | CURP en `user_profile`, única entre roles; conflicto genérico (R-12, D-20/D-35, D-17; M02-1, M02-2); migración `0007` | `779b13b` | Implementada; `0007` aplicada en la rama temporal `rama` (`br-autumn-sun-b52qoep4`, 2026-10-14) y en `production` (`br-royal-recipe-b54s5hnn`, 2026-10-17; Q1–Q9 PASS verificadas en esa BD; entorno por confirmar) |
| A4 | Coherencia de rol (R-10, `0008`) y `/me` por rol (M02-6, M02-7); decisiones D-A4-1 y D-A4-2 | `e37961f` | Implementada. `0008` ensayada y aplicada en la rama temporal `rama` (2026-10-20, C2 v10), con la integración de A4 8/8 **en `rama`** (C2 v10.1). `0008` aplicada en `production` (2026-10-20, C2 prod-0008) con controles previo y posterior PASS; en `production` **no** se ejecutó la suite de integración |
| B1 | Catálogo de especialidades (D-5, D-26, D-33, D-34, R-4, Z-2): dominio, casos de uso, API y migración `0009` | `35e205c` | Implementada en el árbol de trabajo, sin commit. `0009` (SHA-256 `c2960380f6a2349c59cb5435abb8468c29bb9d8ffa45339d4190102554fb319c`) ensayada en `rama` con C2 v11 `verificar-0009` (2026-10-20 04:22 UTC, PASS, transacción revertida) y **aplicada solo en `rama`** con C2 v11 `aplicar-0009` (2026-10-20 04:31 UTC, PASS; post Q1–Q10). **No aplicada en `production`**. Sin integración ni E2E con BD ejecutadas. Unitarias y E2E con dobles locales; sin integración |
| B2 | Evolución de `doctor_profile` (`0010`, solo eliminaciones con guard de 0 filas) y tablas `doctor_identity_verification` y `doctor_license_verification` (`0011`, solo adiciones) | `35e205c` | Schema y migraciones ensayados en `rama` con C2 v11 `verificar-b2` (2026-10-20 04:39 UTC, PASS, transacción revertida) y **aplicados solo en `rama`** con `aplicar-b2` (04:44 UTC, PASS; post Q1–Q9). **No aplicados en `production`**. Integración de A4 adaptada sin ejecutar. SHA-256: `0010` `e0dab493f514e55f056c018220d633078feed470063fd14f1589696dc29a55b2`; `0011` `4355a9d2c4a0d2dc9e2791d350c072fcb4d53e5b86d2c6f4db8f48c4a6feaba5`. `drizzle-kit check` OK y regeneración sin cambios. Pendiente PC-B2 |
| B3 | Reglas de la BD (`0012`, personalizada): catálogo sin DELETE/TRUNCATE y `code` inmutable; versiones del perfil de uno en uno y número o especialidad solo con versión nueva; revisiones creadas `pending`, con el intento siguiente y la versión y evidencia vigentes; transiciones solo desde `pending`; evidencia inmutable; purga de la INE solo en estado terminal; sin DELETE/TRUNCATE | `35e205c` | `0012` (SHA-256 `e5d24a0f8d403c1afb9f01e030242fbd6bb658c822a7af9a2ef48361ead65c68`) ensayada en `rama` con C2 v11 `verificar-0012` (2026-10-20 04:53 UTC, PASS, transacción revertida) y **aplicada solo en `rama`** con `aplicar-0012` (04:56 UTC, PASS; post Q1–Q9). **No aplicada en `production`** |
| B4 | Dominio puro: estado derivado (`deriveDoctorStatus`, revisión vigente, `registrationComplete`, `missing`), ciclo de revisión (`resolveReview`), matriz de cambios (E.3) y motivo deducido de la cédula (7bis.1); VOs `LicenseNumber`, `LegalName` y `RejectionReason` | `35e205c` | Implementado en `src/modules/doctors/domain/**`, sin BD ni consumidores todavía (los usa B5). Unitarias locales |
| B5 | Registro, perfil (bio, teléfono, foto), cambios sensibles (CURP, nombre legal, especialidad), envíos de INE y cédula, estado, historial y cédula propia; puerto restringido `DOCTOR_IDENTITY_GATEWAY` en Identity (resuelve DC-2) y espacios `doctor-*` del almacenamiento privado | `35e205c` | Implementado; unitarias con dobles y E2E con dobles locales. Adaptadores Drizzle **sin ejecutar contra PostgreSQL** (integración pendiente, vía C2 en `rama`) |
| B6 | Revisión del admin: lista y detalle de médicos con estado derivado, colas de INE y cédula, detalle con datos legales vigentes, documentos auditados (INE solo pendiente y vigente; cédula en cualquier estado), aprobar y rechazar con candados y comprobación de vigencia, purga de la INE tras el commit y en la CLI `identity:purge-documents` | `35e205c` | Implementado; unitarias y E2E con dobles locales. Adaptadores Drizzle sin ejecutar contra PostgreSQL. CLI no ejecutada |
| B7 | `DoctorOperationalPolicy` (exportada para M07 y M08; perfil con FOR SHARE en la transacción del llamador; solo `approved` opera) y sección del médico en `GET /me` mediante `RoleProfileSectionRegistry` de Identity (perfil, estado derivado y `canOperate`) | `35e205c` | Implementado; unitarias y E2E con dobles. M07 y M08 aún no la consumen |
| B8 | Integración de B5–B7 con adaptadores reales y triggers (`doctors.int-spec.ts`), A4 adaptada, concurrencia con dos conexiones (`doctors.conc-spec.ts`), seguridad (`doctors-security.e2e-spec.ts`) y arquitectura (RT-M03-14 a 16); plan C2 v11 `probar-m03` | `35e205c` | Integración, E2E con BD y regresión completa **ejecutadas en `rama`** con C2 v11 `probar-m03` (2026-10-20, intento 2 PASS: unitarias 588/588, integración 94/94 en 12 suites, E2E 104/104 en 12 suites, huellas idénticas). Concurrencia **ejecutada en `rama`** con C2 v11.1 `probar-concurrencia` (2026-10-20 09:01–09:02 UTC, 5/5), con datos de prueba **permanentes** aceptados por el usuario |
| B9 | Evidencia formal (`pnpm test:evidence M03`), matriz final y documento académico | — (evidencia sin commit) | Evidencia **formal** ejecutada con C2 v11.3 `evidencia-m03` en la rama limpia (2026-10-20 09:32–09:37 UTC): 588/588, 94/94 y 104/104 PASS, huellas antes y después idénticas. Pendiente: documento académico y commit de la evidencia |

## Fuentes funcionales

**Documento Maestro V2.2 (PDF, 03-10-2026)**, numeración del PDF (R-1). Requisitos relacionados con M03:

| ID | Contenido (resumen) |
|---|---|
| RF-01 | Registro y autenticación con Better Auth; al registrarse se crea el perfil de dominio |
| RF-02 | Cada usuario tiene un único rol y un único perfil de dominio; permisos según el rol |
| RF-03, RF-04 | Aceptación legal en el registro y reaceptación ante una versión nueva |
| RF-05 | El médico se registra, carga su cédula y queda `pending` para revisión |
| RF-06 | El administrador cambia el estado a `approved`/`rejected` y puede registrar el motivo; el médico no recibe citas hasta ser aprobado. (La obligatoriedad del motivo procede de D-25, no del Maestro) |
| RF-09 | Perfil y foto según el rol |
| RN-001, RN-002 | Un único rol de dominio; un único `user_profile` |
| RN-004 | Un médico no atiende nuevas citas hasta ser aprobado |
| RN-005 | La verificación de cédula es manual en esta fase |

Revisión **textual, no visual**: extracción del texto del PDF en el orden del flujo del documento (`pdftotext -raw`),
que alinea cada identificador con su texto. Páginas comprobadas: 4 (RF-01), 5 (RF-02 a RF-09) y 10 (RN-001 a RN-006).
La comprobación visual de esas páginas sigue pendiente.
**La CURP no aparece en el PDF V2.2**: su obligatoriedad, formato y unicidad provienen de decisiones (DT-22 de M02,
D-1, D-20/D-35, R-12), no de un requisito del Maestro.

## Matriz

Estado: **Interna** = pasó en ejecuciones locales o en la rama temporal, sin evidencia formal. **Formal** = corrida de
evidencia versionada (ninguna todavía).

| Requisito o decisión | Fase | Implementación | Pruebas | Evidencia | Estado |
|---|---|---|---|---|---|
| R-11 (RNF-09, RNF-10) | A1 | `src/modules/private-storage/**` (puerto `PRIVATE_OBJECT_STORAGE`, `R2PrivateObjectStorage`, firma de archivo, gramática de claves, respuesta privada) | Etiquetadas `[R-11]`: RT-M03-01 a 03 y 07 a 10. Asociación inferida por módulo: RT-M03-04 (`[DT-18]`), 05 y 06 (`[DT-1]`) | Unitarias locales; `probar` en la rama temporal | Interna |
| DC-1 | A1 | Errores y comportamiento HTTP de M02 sin cambios | Asociación inferida: TC-M02-088, 089, 098 (modificadas en A1; etiqueta `[DT-18]`) | Ídem | Interna |
| RF-04, D-32, N1 (RF-03 sin prueba etiquetada) | A2 | `legal-requirements.ts`, `legal-documents.use-cases.ts`, `0006` | TC-M03-002 a 012, 014 a 016, 019 a 025, 030, 031, 040 a 042 (etiquetas `[N1]`, `[D-32]` y, en 005, 008, 019, 031 y 041, `[RF-04]`). Ninguna prueba lleva `[RF-03]` | Integración en la BD configurada en `.env` (rama `production` de Neon; entorno por confirmar) durante A2, y `probar` | Interna |
| R-8 | A2 | Aceptación y publicación auditadas en la misma UoW | TC-M03-001, 013, 018, 026, 028, 029, 032, 043, 044, 046 a 049 | Ídem | Interna |
| R-13 | A2 | Versión nueva invalida la aceptación anterior | TC-M03-022, 027, 045 | Ídem | Interna |
| RF-02 | A2 | Solo paciente y médico aceptan documentos legales | TC-M03-017 | Ídem | Interna |
| DC-2, DC-3, DC-4 | A2 | Puerto diferido; una versión nueva por publicación; ids duplicados → 400 | Asociación inferida por contenido: DC-3 → TC-M03-022 (`[R-13]`); DC-4 → TC-M03-029, 048, 049 (`[R-8]`) | Ídem | Interna (DC-2 sin prueba: diferida a B5) |
| R-12 | A3 | `0007`, `src/db/schema/identity.ts`, `src/db/schema/patient.ts`, repositorios Drizzle | Etiquetadas `[R-12]`: TC-M03-055, 059. Asociación inferida: TC-M02-101 (`[DT-22][D-17]`), 116 (`[DT-22]`) | `post` Q1–Q9 y `probar` en la rama temporal; `post` Q1–Q9 en `production` (2026-10-17) | Interna |
| D-20, D-35 (RF-02, RN-001) | A3 | `user_profile_curp_unique`; `existsByCurp` en `RegisterPatientProfileUseCase` | TC-M03-053, 056 (`[D-20][D-35]`); 058 (`[D-20]`; D-35 inferida) | `probar` | Interna |
| D-1 | A3 | `user_profile_curp_required_chk` | TC-M03-057 | `probar` | Interna |
| D-17 | A3 | `RegistrationDataConflictError`, filtro de dominio | Etiquetadas `[D-17]`: TC-M03-050, 051, 054; TC-M02-101. Asociación inferida: TC-M02-074, 224 (`[DT-22]`) | `probar` | Interna |
| P2 (M01 D2) | A3 | Log `warn` sin datos; sin evento de auditoría | TC-M03-052 (`[D-17][M01-D2]`; P2 no figura como etiqueta) | `probar` | Interna |
| Concurrencia (23505 → 409) | A3 | Caso de uso de registro | Asociación inferida: TC-M02-102 (`[DT-22]`) | `probar` | Interna |
| `0007` (F1–F10, V1–V5, transaccional) | A3 | `src/db/migrations/0007_m02_user_profile_curp.sql` | Ensayo C2 en la rama temporal `rama` (`br-autumn-sun-b52qoep4`) (fallos provocados, introspección, inverso) | Resultados C2 fuera del repositorio (ensayo e inverso solo en `rama`); aplicación en `production` verificada con el registro de migración y Q1–Q9 PASS | Interna |
| M02-6 (D-24, D-30, D-31), D-A4-2 | A4 | `composeRegistrationStatus` en `domain/registration-status.ts`; `GetRegistrationStatusUseCase.executeForActor`; `GET /me` | TC-M03-060 a 067 (unitarias) | Unitarias locales (sin BD, `db-tripwire`) | Interna |
| R-10 (RN-001, RN-139), M02-7, D-A4-1 | A4 | `src/db/migrations/0008_m03_role_profile_coherence.sql` (precondiciones, `gst_profile_role_matches`, dos triggers) | TC-M03-068 a 074 (integración, solo en `rama`; adaptada a `specialty_id` y ejecutada de nuevo en `probar-m03`) | `rama`: ensayo C2 v10 `verificar-0008` (PASS), `aplicar-0008` (PASS, `post-0008` Q1–Q7) y C2 v10.1 `probar-a4` (8/8, huellas idénticas). `production`: aplicación con C2 prod-0008 (`previo`, `aplicar` y `posterior` PASS; T1–T6 en transacción revertida), sin la suite de integración. Ver «Ejecución de A4 en la rama temporal» y «Ejecución de `0008` en `production`» | Interna (no formal) |
| D-5, D-26, D-33, D-34, R-4, Z-2 (catálogo) | B1 | `src/modules/doctors/**` (dominio `specialty.ts`, `specialty.use-cases.ts`, `DrizzleSpecialtyRepository`, `GET /specialties`, `/admin/specialties`), `src/db/schema/specialty.ts`, `0009_m03_specialty_catalog.sql` | TC-M03-075 a 087 (unitarias), 088 a 092 (E2E con dobles); RT-M03-11 y 12 (arquitectura) | Unitarias y E2E con dobles locales (sin BD). `0009` sin aplicar ni ensayar; DELETE/TRUNCATE bloqueados y `code` inmutable en la BD llegan con `0012` (B3) | Interna (parcial) |
| R-7, N3, D-4, D-16, D-19, D-27, R-2 (estructura), R-6 (formato en la BD), C-4 (columnas) | B2 | `src/db/schema/doctor.ts`, `enums.ts`, `relations.ts`; `0010_m03_doctor_profile_drop_legacy.sql`, `0011_m03_doctor_verifications.sql` | TC-M03-093 a 100 (unitarias estáticas: schema de Drizzle y texto del SQL) | Unitarias locales, sin BD; ensayo C2 `verificar-b2` en `rama` con ROLLBACK (guard, postcondiciones y casos D1–D5, I1–I8, L1–L7); aplicación `aplicar-b2` en `rama` con post Q1–Q9. Sin integración | Interna (ensayo y aplicación en `rama`) |
| D-26, R-4 (en la BD), R-2 (transiciones), C-4 (versiones e inmutabilidad), D-4, D-16, E.5 | B3 | `src/db/migrations/0012_m03_doctor_guards.sql` | TC-M03-101 a 103 (unitarias estáticas); ensayo C2 `verificar-0012` (casos 1–18 de 0012.c) preparado | Ensayo C2 `verificar-0012` en `rama` con ROLLBACK, PASS (casos 1–18); aplicación `aplicar-0012` en `rama` con post Q1–Q9. Sin integración | Interna (ensayo y aplicación en `rama`) |
| R-7, N3, Z-1, D-24, D-30, D-31, R-2, D-25, E.5 (reglas), N4/E.3, 7bis.1, 7ter (efectos), R-6, D-28 (VOs; D-28 sustituida por C-16) | B4 | `src/modules/doctors/domain/doctor-status.ts`, `review.ts`, `sensitive-change.ts`, `license-number.ts`, `legal-name.ts` | TC-M03-104 a 129 (unitarias: escenarios 1–18 de D.5, las 32 combinaciones de Z-1, secuencias de D.4, E.3, E.4 y 7bis.1) | Unitarias locales, sin BD | Interna |
| RF-05, RF-09, D-1, D-3, D-4, D-9, D-16 (cédula propia), D-17, D-19, D-20, D-21, D-28 (sustituida por C-16: ruta retirada), D-29, D-33, D-35, R-5, R-6, R-14, 7bis, 7ter, DC-2 | B5 | `src/modules/doctors/application/**` (registro, perfil, cambios, envíos, estado), `presentation/me-doctor.controller.ts`, `infrastructure/persistence/drizzle-doctor-*.ts`; `src/modules/identity/application/ports/doctor-identity.gateway.ts` + `drizzle-doctor-identity.gateway.ts`; `private-storage/domain/object-key.ts` (espacios `doctor-*`) | TC-M03-130 a 146 (unitarias con dobles), 147 a 153 (E2E con dobles); RT-M03-13 | Unitarias y E2E con dobles locales; sin integración | Interna (sin BD) |
| D-37, RN-140, C-22 | Pendiente | Sin implementar. Políticas existentes sin llamadas: `CanBookAppointmentsPolicy`, `DoctorOperationalPolicy` | TC-M03-220 a 226 | Sin definir | **Pendiente de implementación y ejecución** |
| RF-06, RN-005, D-16 (admin), D-19 (purga), D-22, D-25, D-27, D-36, R-2 (revisión), E.5 (vigencia), Admin | B6 | `src/modules/doctors/application/use-cases/admin/**`, `presentation/admin-doctors.controller.ts`, `presentation/dto/admin-doctor.dto.ts`; `drizzle-doctor-review.repository.ts` y `drizzle-doctor-profile.repository.ts` (métodos de B6); `src/cli/identity-purge-documents.ts`, `src/cli/cli.module.ts` | TC-M03-154 a 163 (unitarias con dobles), 164 a 166 (E2E con dobles) | Unitarias y E2E con dobles locales; sin integración | Interna (sin BD) |
| RN-004, D-13, D-23 (política operativa), D-31 y D-A4-2 (`/me` del médico) | B7 | `src/modules/doctors/application/policies/doctor-operational.policy.ts`, `doctor-profile-section.provider.ts`; `src/modules/identity/application/role-profile-section.registry.ts`, `presentation/me.controller.ts` | TC-M03-167 a 170 (unitarias), 171 (E2E con dobles) | Unitarias y E2E con dobles locales | Interna (sin BD) |
| D-38 (estado administrativo, `legalAccepted`, `canOperate`) | D-38 | `src/modules/doctors/domain/doctor-status.ts`, `policies/doctor-operational.policy.ts`, `doctor-profile-section.provider.ts`; web `src/lib/api.ts`, `features/professionals/doctor-sections.tsx` | TC-M03-106, 108, 111, 112, 114, 167, 170, 273 a 275 (unitarias), 276 (E2E con dobles) | Unitarias, E2E con dobles locales y pruebas web (vitest) | Interna (sin BD) |
| Integración de B5–B7 (adaptadores Drizzle, gateway de Identity, triggers de 0012) | B8 | `test/integration/doctors.int-spec.ts`, `test/support/doctors-integration.ts` | TC-M03-172 a 182 | `probar-m03` en `rama` (intento 2): 94/94 de integración, sin residuos | Interna |
| E.5, R-2, E.1, plan v2 §9 (concurrencia con datos confirmados) | B8 | `test/concurrency/doctors.conc-spec.ts`, `test/jest-concurrency.json` | TC-M03-183 a 187 | C2 v11.1 `probar-concurrencia` en `rama`: 5/5 (datos confirmados, permanentes) | Interna |
| D-17 (enumeración), IDOR, DT-8, DT-4, RN-122 (seguridad) | B8 | `test/doctors-security.e2e-spec.ts` | TC-M03-188 a 192 | E2E con dobles locales | Interna (sin BD) |
| P.7, R-11 (arquitectura) | B8 | `test/architecture.spec.ts` | RT-M03-14 a 16 | Unitarias locales | Interna |
| E.5, R-2, E.1, plan v2 §9 (concurrencia; rama C2 persistente) | C2 | `test/concurrency/doctors.conc-spec.ts` (marca `c2-persistent-accepted`; régimen legal vigente reutilizado, sin publicar) | TC-M03-183 a 187 | Lanzador C2, modo `concurrency`, `c2-20261103212355-50d8`: 5/5; datos sintéticos persistentes; huellas de las filas preexistentes iguales | Interna |
| B5–B7 con adaptadores Drizzle y triggers de 0012 (rama C2 persistente) | C2 | `test/integration/doctors.int-spec.ts` | TC-M03-172 a 182 | Lanzador C2, modo `postgres` (`C2_RUN_ID` no conservado): 10/10; 13 tablas con recuentos y hashes iguales | Interna |
| DT-12 (Better Auth con el adaptador Drizzle; rama C2 persistente) | C2 | `test/integration/admin-bootstrap-better-auth.int-spec.ts` | TC-M02-118 a 120, TC-M03-293 (ejecutados); TC-M02-121 ×2 (pendientes) | Lanzador C2, modo `auth`, `c2-20261103214452-f673`: 5 aprobadas, 2 pendientes; 13 tablas con recuentos y hashes iguales | Interna (pendientes: no ejecutados) |
| Salvaguardas y lanzador C2, identificadores por ejecución y régimen legal reutilizable | C2 | `test/support/c2-*.ts`, `scripts/c2-run.ts`, `test/support/test-tag.ts`, `test/support/doctor-regime.ts`, `test/support/r2-run.ts` | TC-M03-277 a 292, 294 a 297; RT-M03-17 y 18 | Unitarias locales, sin BD (dobles) | Interna (sin BD) |
| Evidencias C2, manifiesto de R2 (etapa 2) y huella de PostgreSQL de 13 tablas | C2 | `test/support/c2-evidence.ts`, `test/support/r2-run.ts`, `test/support/c2-pg-fingerprint.ts`, `scripts/c2-run.ts` | TC-M03-307 a 334 | Unitarias locales, sin BD (dobles) | Interna (sin BD) |
| DT-18, R-11, D-16, D-19, DT-6 (almacenamiento privado con R2 real) | C2 | `test/r2/private-storage.r2-spec.ts`, `test/support/r2-run.ts`, `test/support/r2-verify.ts`, `test/jest-r2.json` | TC-M03-298 a 303 | Lanzador C2, modo `r2`, `c2-20261110235152-506c` (2026-11-10): 6/6; 13 tablas `equal`; bucket vacío al terminar (antes: `c2-20261104162631-70e6`, 6/6) | Interna (paquete de evidencias fuera del repositorio) |
| D-16, D-19, DT-6, D-17, D-22 (documentos del médico con PostgreSQL y R2 reales) | C2 | `test/r2/doctor-documents.r2-spec.ts` | TC-M03-304 a 306 | Lanzador C2, modo `r2`, `c2-20261110235308-76ca` (2026-11-10): 3/3; 13 tablas `equal`; bucket vacío al terminar (antes: `c2-20261104162955-f9c7`, 3/3) | Interna (paquete de evidencias fuera del repositorio) |
| Evidencia formal | B9 | `scripts/record-test-run.mjs` | Todas las suites (786 casos) | `docs/testing/ejecuciones/2026-10-20T09-32-22_35e205c_M03/` | **Formal** |

## Casos de prueba

77 casos: 67 TC-M03 (001–032 y 040–074; los números 033–039 no existen) y 10 RT-M03. A4: 8 unitarios (060–067) y 7 de integración (068–074, ejecutados en `rama` con C2 v10.1). Por fase y suite: A1, 10
unitarios; A2, 30 unitarios, 8 de integración y 4 E2E; A3, 4 unitarios, 5 de integración y 1 E2E.

**Ejecución:**
- **Unitarias locales (sin BD):** `pnpm test`, 305/305 en `779b13b`.
- **E2E locales con dobles:** las E2E con dobles (`audit`, `auth-flows`, `auth-guards`, `auth-rate-limit`, `identity`
  y `legal-regime`) importan `AuthModule`, directamente o a través de sus módulos de apoyo, y `AuthModule` importa
  `db`; las pruebas sustituyen con dobles los proveedores que usan la BD (ver
  [M02](M02-identity.md#incremento-controlado-a1a3-posterior-a-la-etapa-a), «Estado de `0007`»). En la corrida local
  con el código de A3, ejecutada con la configuración de `.env` presente en el entorno (BD sin `0007`) pero con los
  proveedores de acceso a datos sustituidos por dobles (no se afirma que consultaran ni escribieran en esa BD), cinco de ellas (`audit`, `auth-flows`, `auth-guards`,
  `auth-rate-limit` e `identity`, que incluye TC-M03-054) pasaron 61/61 (evidencia interna no versionada).
  `test/legal-regime.e2e-spec.ts` (TC-M03-030, 031, 032 y 049) **no se ejecutó en esa corrida**: el patrón de exclusión
  `me.e2e` lo excluyó. Constan en la validación interna en la rama temporal. La corrida de A2 dio E2E 82/82 en total (mensaje del commit
  `b40058f`), pero el mensaje no desglosa suites: que incluyera `legal-regime.e2e-spec.ts` queda **pendiente de
  revisión**.
- **Integración en la BD configurada en `.env` durante A2** (rama `production` de Neon; entorno por confirmar):
  integración 64/64 con rollback, según el mensaje del commit `b40058f`. El mensaje no indica la BD: que fuera la de
  `.env` se deduce de la configuración de pruebas de entonces. Salida no versionada.
- **Validación interna en la rama temporal** de Neon `rama` (`br-autumn-sun-b52qoep4`; creada a partir de `production`,
  la rama principal marcada como `Default`, entorno por confirmar), con `0007` aplicada, el 2026-10-14:
  unitarias 305/305, integración 69/69 (9 suites) y E2E 83/83 (9 suites), con residuos idénticos antes y después.
  Salida conservada fuera del repositorio; no generada con `pnpm test:evidence`.
- **Evidencia formal:** pendiente (procedimiento seguro en la rama temporal por autorizar).

Los resultados disponibles son **totales por suite** de cada corrida (sin fallos ni pruebas omitidas por Jest dentro
de las suites ejecutadas; el código no contiene `.skip`, `.only` ni `todo`). No todas las suites se ejecutaron en
todas las corridas: `legal-regime.e2e-spec.ts` se excluyó de la corrida local de E2E con dobles, y su resultado
consta en la validación interna en la rama temporal (su inclusión en la corrida de A2 está pendiente de revisión). La salida no lista cada caso, así que
ningún caso está acreditado individualmente.

Rutas relativas a `apps/backend`; la línea es la del primer uso del identificador en `779b13b`.

| Caso | Fase | Suite | Archivo | Etiquetas | Descripción |
|---|---|---|---|---|---|
| RT-M03-01 | A1 | Unitaria | `src/modules/private-storage/domain/file-signature.spec.ts:41` | [R-11] | PDF, JPEG y PNG se reconocen por su firma; otros formatos no |
| RT-M03-02 | A1 | Unitaria | `src/modules/private-storage/domain/file-signature.spec.ts:49` | [R-11] | la regla fija los formatos y el tamaño; el mensaje es el de la regla |
| RT-M03-03 | A1 | Unitaria | `src/modules/private-storage/domain/object-key.spec.ts:7` | [R-11] | acepta las claves que genera Identity |
| RT-M03-04 | A1 | Unitaria | `src/modules/private-storage/domain/object-key.spec.ts:22` | [DT-18] | rechaza %s |
| RT-M03-05 | A1 | Unitaria | `src/modules/private-storage/domain/object-key.spec.ts:26` | [DT-1] | el tipo de contenido sale de la extensión |
| RT-M03-06 | A1 | Unitaria | `src/modules/private-storage/presentation/private-file-response.spec.ts:14` | [DT-1] | imagen: inline, sin caché y nosniff |
| RT-M03-07 | A1 | Unitaria | `src/modules/private-storage/presentation/private-file-response.spec.ts:22` | [R-11] | PDF: attachment, CSP sandbox, sin caché y nosniff |
| RT-M03-08 | A1 | Unitaria | `test/architecture.spec.ts:26` | [R-11] | solo el adaptador de private-storage importa el SDK de AWS |
| RT-M03-09 | A1 | Unitaria | `test/architecture.spec.ts:34` | [R-11] | ningún módulo importa el adaptador R2 directamente; solo el módulo private-storage lo registra |
| RT-M03-10 | A1 | Unitaria | `test/architecture.spec.ts:42` | [R-11] | private-storage no depende de identity |
| TC-M03-001 | A2 | Unitaria | `src/modules/identity/application/identity-audit-events.spec.ts:54` | [R-8] | legal_document.published con actor sistema, tipo y versión |
| TC-M03-002 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:24` | [D-32] | %s |
| TC-M03-003 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:29` | [N1] | antes de publicar el régimen nuevo, el paciente con v1 aceptado sigue completo |
| TC-M03-004 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:34` | [N1] | una publicación parcial no cambia nada: privacy_policy sin patient_terms no se exige |
| TC-M03-005 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:39` | [N1][RF-04] | con el régimen nuevo publicado, el paciente debe aceptarlo; el legado ya no cuenta |
| TC-M03-006 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:51` | [D-32] | el médico sin régimen publicado no cumple (falla cerrado) y no tiene pendientes que aceptar |
| TC-M03-007 | A2 | Unitaria | `src/modules/identity/domain/legal-requirements.spec.ts:56` | [D-32] | el médico solo cuenta privacy_policy + doctor_terms; patient_terms no le afecta |
| TC-M03-008 | A2 | Unitaria | `src/modules/identity/domain/registration-status.spec.ts:63` | [N1][RF-04] | al publicarse el régimen nuevo, el paciente con v1 aceptado queda con missing legal |
| TC-M03-009 | A2 | Unitaria | `src/modules/identity/domain/registration-status.spec.ts:76` | [N1] | doctor_terms publicado no afecta al paciente |
| TC-M03-010 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:57` | [N1] | antes de publicar: el paciente ve el legado v1 y el médico no tiene documentos (409) |
| TC-M03-011 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:65` | [N1] | después de publicar cada conjunto, cada rol ve solo los documentos de su régimen |
| TC-M03-012 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:75` | [N1] | una publicación futura todavía no cambia el régimen |
| TC-M03-013 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:86` | [R-8] | el paciente acepta el legado vigente: guarda la evidencia y un evento por documento nuevo |
| TC-M03-014 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:101` | [N1] | después de la transición, un id de legado ya no es vigente para el paciente (409) |
| TC-M03-015 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:112` | [D-32] | el médico acepta privacy_policy + doctor_terms; patient_terms no le corresponde (409) |
| TC-M03-016 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:127` | [D-32] | sin régimen del médico publicado, su aceptación responde 409 |
| TC-M03-017 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:134` | [RF-02] | admin o una cuenta sin perfil no aceptan documentos legales |
| TC-M03-018 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:142` | [R-8] | si la transacción falla, no queda ni la aceptación ni el evento (misma UoW) |
| TC-M03-019 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:203` | [RF-04] | una versión inexistente u obsoleta invalida toda la petición |
| TC-M03-020 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:217` | [N1] | publica el conjunto completo del paciente con un published_at común y un evento por documento |
| TC-M03-021 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:244` | [N1] | rechaza %s sin escribir nada |
| TC-M03-022 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:273` | [R-13] | con el régimen vigente, se puede publicar una sola versión nueva (p. ej., doctor_terms v2) |
| TC-M03-023 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:284` | [N1] | el médico puede omitir privacy_policy si ya está vigente |
| TC-M03-024 | A2 | Unitaria | `src/cli/legal-publish.args.spec.ts:4` | [N1] | interpreta el rol, los documentos tipo@versión=ruta y la fecha común |
| TC-M03-025 | A2 | Unitaria | `src/cli/legal-publish.args.spec.ts:27` | [N1] | rechaza argumentos mal formados: %p |
| TC-M03-026 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:152` | [R-8] | si la auditoría falla, la aceptación tampoco se guarda (misma UoW) |
| TC-M03-027 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:162` | [R-13][RF-04] | una versión nueva de doctor_terms invalida la aceptación anterior del médico |
| TC-M03-028 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:257` | [R-8] | si la auditoría falla, no se publica ningún documento |
| TC-M03-029 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:178` | [R-8] | ids duplicados → 400 sin abrir la transacción, sin aceptaciones ni eventos |
| TC-M03-030 | A2 | E2E | `test/legal-regime.e2e-spec.ts:50` | [N1] | antes de publicar: el paciente ve y acepta el legado v1; el médico no tiene documentos |
| TC-M03-031 | A2 | E2E | `test/legal-regime.e2e-spec.ts:76` | [N1][RF-04] | después de publicar el conjunto del paciente: requisitos nuevos, historia intacta |
| TC-M03-032 | A2 | E2E | `test/legal-regime.e2e-spec.ts:95` | [D-32][R-8] | después de publicar doctor_terms, el médico acepta su régimen y cada aceptación queda auditada |
| TC-M03-040 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:51` | [N1] | sin documentos nuevos, el paciente con legado aceptado sigue completo y el médico no tiene régimen |
| TC-M03-041 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:63` | [N1][RF-04] | al publicar privacy_policy + patient_terms, el paciente pasa a missing legal; al aceptar vuelve a completo; v1 |
| TC-M03-042 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:85` | [N1] | una publicación parcial (solo privacy_policy) o futura no cambia los requisitos del paciente |
| TC-M03-043 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:96` | [D-32][R-8] | el médico acepta privacy_policy + doctor_terms y cada aceptación queda en audit_log |
| TC-M03-044 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:124` | [N1][R-8] | PublishLegalDocumentsUseCase (núcleo de legal:publish), con simulación y confirmación: mismo published_at, content_hash y evento de sistema por documento; rechaza el legado. Reejecutada mediante C2: PASS (rollback, huella idéntica). |
| TC-M03-045 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:144` | [R-13][RF-04] | una versión nueva de doctor_terms invalida la aceptación anterior del médico |
| TC-M03-046 | A2 | Integración | `test/integration/legal-acceptance-audit.int-spec.ts:28` | [R-8] | si la auditoría falla, el SAVEPOINT de la UoW revierte también la aceptación |
| TC-M03-047 | A2 | Integración | `test/integration/legal-acceptance-audit.int-spec.ts:48` | [R-8] | con la auditoría real, la aceptación y su evento se guardan juntos |
| TC-M03-048 | A2 | Unitaria | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts:189` | [R-8] | aunque el repositorio devolviera ids repetidos, cada documento genera a lo más un evento |
| TC-M03-049 | A2 | E2E | `test/legal-regime.e2e-spec.ts:66` | [R-8] | ids duplicados → 400 en el límite HTTP, sin aceptaciones ni eventos |
| TC-M03-050 | A3 | Unitaria | `src/common/filters/domain-exception.filter.spec.ts:112` | [D-17] | RegistrationDataConflictError: la respuesta es idéntica para cualquier causa y no la revela |
| TC-M03-051 | A3 | Unitaria | `src/modules/identity/domain/registration-data-conflict.spec.ts:4` | [D-17] | la causa es interna: no es enumerable, no está en details ni en la serialización |
| TC-M03-052 | A3 | Unitaria | `src/modules/identity/application/use-cases/identity-use-cases.spec.ts:112` | [D-17][M01-D2] | el conflicto se registra solo en un log warn sin datos personales; nada en audit_log |
| TC-M03-053 | A3 | Unitaria | `src/modules/identity/application/use-cases/identity-use-cases.spec.ts:133` | [D-20][D-35] | la CURP es única entre roles: la de un médico existente bloquea el registro de un paciente |
| TC-M03-054 | A3 | E2E | `test/identity.e2e-spec.ts:270` | [D-17] | el 409 por CURP duplicada es genérico: sin la causa ni el valor en el cuerpo |
| TC-M03-055 | A3 | Integración | `test/integration/curp-user-profile.int-spec.ts:47` | [R-12] | el registro guarda la CURP en user_profile y patient_profile ya no tiene la columna |
| TC-M03-056 | A3 | Integración | `test/integration/curp-user-profile.int-spec.ts:59` | [D-20][D-35] | una CURP de médico bloquea el registro de un paciente: 409 genérico, sin escribir ni auditar |
| TC-M03-057 | A3 | Integración | `test/integration/curp-user-profile.int-spec.ts:79` | [D-1] | paciente o médico sin CURP → 23514 user_profile_curp_required_chk |
| TC-M03-058 | A3 | Integración | `test/integration/curp-user-profile.int-spec.ts:84` | [D-20] | CURP repetida entre roles → 23505 user_profile_curp_unique |
| TC-M03-059 | A3 | Integración | `test/integration/curp-user-profile.int-spec.ts:95` | [R-12] | admin sin CURP se acepta, y varios NULL no chocan con la unicidad |
| TC-M03-060 | A4 | Unitaria | `src/modules/identity/domain/registration-status.spec.ts` | [M02-6][D-31] | paciente (%s): el estado compuesto es idéntico al del paciente |
| TC-M03-061 | A4 | Unitaria | `src/modules/identity/domain/registration-status.spec.ts` | [M02-6][D-A4-2] | médico → null hasta la fase B, aunque tenga legales aceptados |
| TC-M03-062 | A4 | Unitaria | `src/modules/identity/domain/registration-status.spec.ts` | [M02-6][D-A4-2] | %s → null: no tiene registro |
| TC-M03-063 | A4 | Unitaria | `src/modules/identity/domain/registration-status.spec.ts` | [M02-6] | solo el paciente y la cuenta sin perfil componen estado |
| TC-M03-064 | A4 | Unitaria | `src/modules/identity/application/use-cases/registration-status.use-cases.spec.ts` | [M02-6][D-31] | paciente: GET /me recibe exactamente el estado del paciente |
| TC-M03-065 | A4 | Unitaria | ídem | [M02-6] | cuenta sin perfil: recibe el estado del paciente |
| TC-M03-066 | A4 | Unitaria | ídem | [M02-6][D-A4-2] | %s: null sin consultar la BD |
| TC-M03-067 | A4 | Unitaria | ídem | [D-A4-2] | GET /me/registration-status sigue reservado al paciente |
| TC-M03-068 | A4 | Integración | `test/integration/role-profile-coherence.int-spec.ts` | [R-10] | los dos triggers existen y están habilitados |
| TC-M03-069 | A4 | Integración | ídem | [R-10][RN-139][D-A4-1] | patient_profile sobre un usuario médico → P0001 |
| TC-M03-070 | A4 | Integración | ídem | [R-10][RN-139][D-A4-1] | doctor_profile sobre un usuario paciente → P0001 |
| TC-M03-071 | A4 | Integración | ídem | [R-10][RN-001] | admin u organización no pueden tener perfil de paciente ni de médico |
| TC-M03-072 | A4 | Integración | ídem | [R-10] | UPDATE de user_profile_id hacia un rol incorrecto → P0001 |
| TC-M03-073 | A4 | Integración | ídem | [R-10] | cada rol con su perfil se acepta |
| TC-M03-074 | A4 | Integración | ídem | [R-10] | las precondiciones de 0008 pasan con los datos actuales (solo lectura) |
| TC-M03-075 | B1 | Unitaria | `src/modules/doctors/application/use-cases/specialties/specialty.use-cases.spec.ts` | [D-34] | catálogo inicial con tres activas; la lista pública no expone fechas ni estado |
| TC-M03-076 | B1 | Unitaria | ídem | [D-5] | el admin crea una especialidad con un evento `catalog.specialty.created` |
| TC-M03-077 | B1 | Unitaria | ídem | [D-5] | %s → 409 con el campo, sin escribir ni auditar |
| TC-M03-078 | B1 | Unitaria | ídem | [D-5] | %s → 400 sin abrir la transacción |
| TC-M03-079 | B1 | Unitaria | ídem | [R-4] | edición del nombre visible; `code` no cambia; el evento lleva solo `fields` |
| TC-M03-080 | B1 | Unitaria | ídem | [R-4] | mismo nombre sin evento; nombre de otra → 409; inexistente → 404 |
| TC-M03-081 | B1 | Unitaria | ídem | [D-26][Z-2] | desactivar oculta sin borrar; reactivar la devuelve; cada cambio se audita |
| TC-M03-082 | B1 | Unitaria | ídem | [Z-2] | repetir el estado → 409 sin evento |
| TC-M03-083 | B1 | Unitaria | ídem | [D-10] | si la auditoría falla, no queda el cambio (misma UoW) |
| TC-M03-084 | B1 | Unitaria | ídem | [Admin] | solo admin administra el catálogo (falla cerrado) |
| TC-M03-085 | B1 | Unitaria | `src/modules/doctors/domain/specialty.spec.ts` | [D-5] | formato de `code` válido e inválido |
| TC-M03-086 | B1 | Unitaria | ídem | [R-4] | nombre recortado de 1 a 100 caracteres |
| TC-M03-087 | B1 | Unitaria | ídem | [Z-2] | cambiar al mismo estado es un conflicto |
| TC-M03-088 | B1 | E2E | `test/specialties.e2e-spec.ts` | [D-34] | `GET /specialties`: 401 sin sesión; una cuenta sin perfil ve las activas |
| TC-M03-089 | B1 | E2E | ídem | [Admin] | `/admin/specialties`: 401 y 403 para un médico |
| TC-M03-090 | B1 | E2E | ídem | [D-5] | crear 201; duplicado 409; inválido o campos extra 400 |
| TC-M03-091 | B1 | E2E | ídem | [R-4] | PATCH solo el nombre; `code` → 400; inexistente → 404 |
| TC-M03-092 | B1 | E2E | ídem | [D-26][Z-2] | desactivar y reactivar; repetir el estado → 409 |
| RT-M03-11 | B1 | Unitaria | `test/architecture.spec.ts` | [P.7] | identity no depende de doctors |
| RT-M03-12 | B1 | Unitaria | ídem | [P.7] | doctors no importa la infraestructura ni la presentación de identity |
| TC-M03-093 | B2 | Unitaria | `src/db/schema/doctor.schema.spec.ts` | [R-7][N3] | `doctor_profile`: columnas finales, sin estado persistido ni columnas heredadas; `license_number` admite NULL |
| TC-M03-094 | B2 | Unitaria | ídem | [R-2][D-27] | enums: cuatro estados de revisión y seis motivos de cédula |
| TC-M03-095 | B2 | Unitaria | ídem | [D-19][D-27] | `doctor_identity_verification`: unicidad por intento, un pendiente, CHECK de claves, purga y revisión |
| TC-M03-096 | B2 | Unitaria | ídem | [D-4][D-16][C-4] | `doctor_license_verification`: número, especialidad y versión del momento; sin purga |
| TC-M03-097 | B2 | Unitaria | ídem | [R-6] | patrón del número de cédula |
| TC-M03-098 | B2 | Unitaria | ídem | [plan v2 §3] | `0010` solo elimina lo previsto, después del guard de 0 filas |
| TC-M03-099 | B2 | Unitaria | ídem | [plan v2 §3] | `0011` solo agrega; sin triggers ni funciones (son de `0012`) |
| TC-M03-100 | B2/B3 | Unitaria | ídem | [plan v2 §3] | el journal registra 0009–0012 en orden y sin huecos |
| TC-M03-101 | B3 | Unitaria | ídem | [plan v2 0012.b] | `0012` empieza con el guard de funciones existentes y solo crea funciones y triggers |
| TC-M03-102 | B3 | Unitaria | ídem | [D-26][R-4][D-4][D-16][R-2][C-4] | las 7 funciones y los 12 triggers del plan; todos los errores con `P0001` |
| TC-M03-103 | B3 | Unitaria | ídem | [plan v2 §3] | snapshot de `0012` con el mismo esquema que `0011` |
| TC-M03-104 | B4 | Unitaria | `src/modules/doctors/domain/doctor-status.spec.ts` | [R-7] | revisión vigente: mayor intento no superseded |
| TC-M03-105 | B4 | Unitaria | ídem | [R-2][E.5] | una revisión de versión anterior o superseded no cuenta |
| TC-M03-106 | B4 | Unitaria | ídem | [R-7][Z-1] | escenarios 1 a 18 de D.5 |
| TC-M03-107 | B4 | Unitaria | ídem | [R-2][E.5] | aprobación de la versión 4 no vigente → línea required |
| TC-M03-108 | B4 | Unitaria | ídem | [Z-1][D-38] | las 32 combinaciones de identidad × profesional × legales, con `legalAccepted` y `canOperate`; el estado administrativo no cambia con la aceptación legal |
| TC-M03-109 | B4 | Unitaria | ídem | [D-27][R-7] | secuencia rechazo, reenvío y aprobación (D.4) |
| TC-M03-110 | B4 | Unitaria | ídem | [Z-1] | secuencia de revisiones mixtas (D.4) |
| TC-M03-111 | B4 | Unitaria | ídem | [R-13][D-38] | versión legal nueva: sigue `approved`, sin `canOperate`; al aceptarla recupera la habilitación sin revisión nueva (antes: volvía a pending) |
| TC-M03-112 | B4 | Unitaria | ídem | [D-24][D-30] | rechazada cuenta como entregada; perfil incompleto → `profile` |
| TC-M03-113 | B4 | Unitaria | ídem | [D-31] | `missing` distingue primer envío de reenvío |
| TC-M03-114 | B4 | Unitaria | ídem | [D-31] | sin perfil de médico: solo `profile` y `legal` |
| TC-M03-115 | B4 | Unitaria | `src/modules/doctors/domain/review.spec.ts` | [R-2] | aprobar o rechazar desde pending vigente |
| TC-M03-116 | B4 | Unitaria | ídem | [R-2] | estados terminales |
| TC-M03-117 | B4 | Unitaria | ídem | [E.5] | pendiente no vigente no se revisa |
| TC-M03-118 | B4 | Unitaria | ídem | [D-25] | motivo de rechazo de 10 a 500 |
| TC-M03-119 | B4 | Unitaria | ídem | [R-6] | número de cédula |
| TC-M03-120 | B4 | Unitaria | ídem | [C-16] | nombre legal del registro (1 a 100 por parte, sin espacios extremos). Desde C-16 ya no prueba la detección de cambio |
| TC-M03-121 | B4 | Unitaria | `src/modules/doctors/domain/sensitive-change.spec.ts` | [D-28] | **Retirado (C-16, 2026-10-28)**: cambio de CURP (E.3); la función ya no existe |
| TC-M03-122 | B4 | Unitaria | ídem | [7ter] | **Retirado (C-16, 2026-10-28)**: cambio de nombre con la cédula approved/pending |
| TC-M03-123 | B4 | Unitaria | ídem | [7bis.1] | **Retirado (C-16, 2026-10-28)**: cambio de nombre con la cédula rejected/required. La regla de no reutilizar un documento rechazado sigue cubierta para la especialidad en TC-M03-125 |
| TC-M03-124 | B4 | Unitaria | ídem | [7ter.2] | **Retirado (C-16, 2026-10-28)**: CURP y nombre juntos |
| TC-M03-125 | B4 | Unitaria | ídem | [D-33][7bis.1] | cambio de especialidad |
| TC-M03-126 | B4 | Unitaria | ídem | [E.1][D-9] | INE nueva; campos libres |
| TC-M03-127 | B4 | Unitaria | ídem | [D-1] | envío inicial de cédula |
| TC-M03-128 | B4 | Unitaria | ídem | [D-4] | reenvío de cédula |
| TC-M03-129 | B4 | Unitaria | ídem | [D-21] | cambio de número o de documento de la cédula |
| TC-M03-130 | B5 | Unitaria | `src/modules/doctors/application/use-cases/doctor-b5.use-cases.spec.ts` | [RF-05] | registro: user_profile doctor + doctor_profile, líneas required, evento |
| TC-M03-131 | B5 | Unitaria | ídem | [D-33] | especialidad inactiva → 422 sin crear nada |
| TC-M03-132 | B5 | Unitaria | ídem | [D-17][D-20] | CURP de otra cuenta → 409 genérico; cuenta con perfil → 409 |
| TC-M03-133 | B5 | Unitaria | ídem | [D-10] | fallo de auditoría revierte el registro |
| TC-M03-134 | B5 | Unitaria | ídem | [D-19][E.1] | INE nueva con una pendiente: superseded y purga |
| TC-M03-135 | B5 | Unitaria | ídem | [R-14] | INE con tipo no permitido; compensación de objetos |
| TC-M03-136 | B5 | Unitaria | ídem | [D-1][7bis.1] | cédula inicial: número, versión 2 y documento obligatorio |
| TC-M03-137 | B5 | Unitaria | ídem | [D-17] | número de cédula de otro médico → 409 genérico |
| TC-M03-138 | B5 | Unitaria | ídem | [D-4][D-21] | reenvío, cambio de documento y de número; historial sin claves |
| TC-M03-139 | B5 | Unitaria | ídem | [D-24][R-7] | flujo hasta approved; registration.completed una vez |
| TC-M03-140 | B5 | Unitaria | ídem | [7ter.3] | **Retirado (C-16, 2026-10-28)**: cambio de nombre de un aprobado. Sustituido por TC-M03-218 |
| TC-M03-141 | B5 | Unitaria | ídem | [7bis.1] | **Retirado (C-16, 2026-10-28)**: cambio de nombre con la cédula rechazada. La regla se cubre en TC-M03-125 y 144 (especialidad) |
| TC-M03-142 | B5 | Unitaria | ídem | [D-28] | **Retirado (C-16, 2026-10-28)**: cambio de CURP. Sustituido por TC-M03-218 |
| TC-M03-143 | B5 | Unitaria | ídem | [D-17] | **Retirado (C-16, 2026-10-28)**: CURP de otra persona en el cambio. La unicidad en el registro sigue en TC-M03-132/148 (unitaria y E2E) y TC-M03-178 (integración) |
| TC-M03-144 | B5 | Unitaria | ídem | [D-33][E.3] | cambio de especialidad: specialty_changed; inactiva 422; misma 400 |
| TC-M03-145 | B5 | Unitaria | ídem | [D-9] | bio y teléfono sin versiones ni auditoría |
| TC-M03-146 | B5 | Unitaria | ídem | [Autorización] | paciente o cuenta sin perfil: falla cerrado |
| TC-M03-147 | B5 | E2E | `test/doctors.e2e-spec.ts` | [RF-05] | POST /me/doctor-profile: 401, 201, 400, 409 |
| TC-M03-148 | B5 | E2E | ídem | [D-17] | CURP repetida → 409 genérico sin la causa |
| TC-M03-149 | B5 | E2E | ídem | [D-13][R-7] | estado, envíos de INE y cédula, historial sin claves |
| TC-M03-150 | B5 | E2E | ídem | [D-3][H.3] | cédula sin archivo o GIF → 400; PDF propio como attachment con sandbox |
| TC-M03-151 | B5 | E2E | ídem | [D-28][7ter] | **Retirado (C-16, 2026-10-28)**: PUT /me/doctor-profile/identity. Sustituido por TC-M03-219 (la ruta responde 404) |
| TC-M03-152 | B5 | E2E | ídem | [D-33] | especialidad inválida o inactiva; GET y PATCH del perfil |
| TC-M03-153 | B5 | E2E | ídem | [Autorización] | paciente o cuenta sin perfil → 403 (desde C-16, con `PUT /me/doctor-profile/specialty` en lugar de la ruta retirada) |
| RT-M03-13 | B5 | Unitaria | `src/modules/private-storage/domain/object-key.spec.ts` | [R-11] | acepta las claves `doctor-*` |
| TC-M03-154 | B6 | Unitaria | `src/modules/doctors/application/use-cases/admin/doctor-b6.use-cases.spec.ts` | [D-27][RF-06] | aprobar ambas → approved; INE purgada, cédula conservada |
| TC-M03-155 | B6 | Unitaria | ídem | [D-25] | motivo obligatorio antes de la transacción; rechazo, reenvío y aprobación |
| TC-M03-156 | B6 | Unitaria | ídem | [R-2] | terminal o superseded → 409; inexistente → 404 |
| TC-M03-157 | B6 | Unitaria | ídem | [E.5] | pendiente de una versión anterior no se aprueba |
| TC-M03-158 | B6 | Unitaria | ídem | [Admin] | solo admin (falla cerrado) |
| TC-M03-159 | B6 | Unitaria | ídem | [D-19][RNF-08] | INE: un evento por lado; terminada → 409 |
| TC-M03-160 | B6 | Unitaria | ídem | [D-16][D-22] | cédula en cualquier estado, auditada |
| TC-M03-161 | B6 | Unitaria | ídem | [RF-06] | colas en orden y paginadas; detalle con datos legales vigentes |
| TC-M03-162 | B6 | Unitaria | ídem | [R-7][D-36] | lista filtrada por estado derivado; detalle con historial; 404 |
| TC-M03-163 | B6 | Unitaria | ídem | [D-19][DT-6] | purga fallida completada por la CLI de conciliación |
| TC-M03-164 | B6 | E2E | `test/doctors.e2e-spec.ts` | [RF-06][D-27] | revisión por HTTP hasta approved; INE no-store; 409 tras revisar |
| TC-M03-165 | B6 | E2E | ídem | [D-25][H.3] | rechazo sin motivo 400; cédula attachment con sandbox; detalle sin claves |
| TC-M03-166 | B6 | E2E | ídem | [Admin] | médico → 403; 400 y 404 |
| TC-M03-167 | B7 | Unitaria | `src/modules/doctors/application/policies/doctor-operational.policy.spec.ts` | [RN-004][D-38] | solo opera un médico habilitado (`canOperate`); pending → 422; inexistente → 404 |
| TC-M03-168 | B7 | Unitaria | ídem | [D-21][D-23] | un cambio sensible suspende la operación hasta la nueva aprobación |
| TC-M03-169 | B7 | Unitaria | ídem | [D-13] | assertActorCanOperate para el propio médico; otro rol falla cerrado |
| TC-M03-170 | B7 | Unitaria | ídem | [D-31] | la sección del médico se registra en Identity; paciente y admin no |
| TC-M03-171 | B7 | E2E | `test/doctors.e2e-spec.ts` | [D-31][D-A4-2] | GET /me del médico con perfil, estado y canOperate; paciente y admin sin cambios |
| TC-M03-172 | B8 | Integración | `test/integration/doctors.int-spec.ts` | [RF-05][R-10] | registro real: user_profile doctor y doctor_profile, triggers de 0008, auditoría |
| TC-M03-173 | B8 | Integración | ídem | [D-19][0012] | reenvío de INE: superseded, intento 2 y purga |
| TC-M03-174 | B8 | Integración | ídem | [7bis][C-4][0012] | cédula inicial (versión 2), reenvío y cambio de número aceptados por los triggers |
| TC-M03-175 | B8 | Integración | ídem | [D-17] | número de cédula duplicado → 409 genérico (23505) |
| TC-M03-176 | B8 | Integración | ídem | [RF-06][D-27][B7] | aprobación de ambas, purga, eventos y política operativa |
| TC-M03-177 | B8 | Integración | ídem | [7ter.3][0012] | **Retirado (C-16, 2026-10-28)**: cambio de nombre bajo el trigger de 0012. La reutilización de la clave pasa a TC-M03-179 |
| TC-M03-178 | B8 | Integración | ídem | [D-17][D-20] | CURP de otra cuenta en el registro → 409 (la parte del cambio se retiró con C-16). **PASS** el 2026-10-28 mediante C2 en `br-shy-pond-b50a3m8f`, hija de `production` |
| TC-M03-179 | B8 | Integración | ídem | [D-33][0012] | especialidad inactiva 422; specialty_changed. Desde C-16 comprueba también que la revisión automática reutiliza la clave del documento (antes TC-M03-177). **PASS** el 2026-10-28 mediante C2 en `br-shy-pond-b50a3m8f`, hija de `production` |
| TC-M03-180 | B8 | Integración | ídem | [E.5] | pendiente de versión anterior no se aprueba |
| TC-M03-181 | B8 | Integración | ídem | [D-19][D-22][RNF-08] | documentos auditados, INE terminada 409, colas y lista |
| TC-M03-182 | B8 | Integración | ídem | [D-19][DT-6] | purga fallida completada por la CLI |
| TC-M03-183 | B8 | Concurrencia | `test/concurrency/doctors.conc-spec.ts` | [E.5] | cambio sensible primero: la aprobación espera y recibe 409 |
| TC-M03-184 | B8 | Concurrencia | ídem | [E.5] | aprobación primero: el cambio espera y abre una revisión nueva |
| TC-M03-185 | B8 | Concurrencia | ídem | [R-2] | dos administradores: uno gana, el otro 409, un solo evento |
| TC-M03-186 | B8 | Concurrencia | ídem | [E.1] | dos envíos de INE simultáneos se serializan |
| TC-M03-187 | B8 | Concurrencia | ídem | [D-13][§9] | FOR SHARE de la política bloquea un cambio sensible |
| TC-M03-188 | B8 | E2E | `test/doctors-security.e2e-spec.ts` | [D-17] | CURP y número duplicados: mismo estado y cuerpo; log solo con el campo |
| TC-M03-189 | B8 | E2E | ídem | [IDOR] | documentos y revisiones ajenas solo para el admin |
| TC-M03-190 | B8 | E2E | ídem | [DT-8] | cuarto envío de INE en una hora → 429 |
| TC-M03-191 | B8 | E2E | ídem | [DT-4][R-5] | archivo mayor al límite 413; campo inesperado 400 |
| TC-M03-192 | B8 | E2E | ídem | [RN-122] | auditoría sin CURP, nombres, número, claves ni URLs |
| TC-M03-193 | Flujo | Unitaria | `test/flujo/flow-checks.spec.ts` | [D-13] | tras registrarse, canOperate=false leído de GET /me pasa |
| TC-M03-194 | Flujo | Unitaria | ídem | [D-13] | canOperate true, ausente, null o texto en GET /me → falla |
| TC-M03-195 | Flujo | Unitaria | ídem | [D-13] | sin registrationStatus en /me falla aunque /me/doctor/status trajera canOperate |
| TC-M03-196 | Flujo | Unitaria | ídem | [Z-1] | estado derivado distinto del esperado tras registrarse → falla |
| TC-M03-197 | Flujo | Unitaria | ídem | [D-31] | rol de /me distinto de doctor → falla |
| TC-M03-198 | Flujo | Unitaria | `test/flujo/review-checks.spec.ts` | [Z-1] | cada etapa de la revisión acepta exactamente su estado esperado |
| TC-M03-199 | Flujo | Unitaria | ídem | [D-13][D-30] | solo la etapa final opera; los rechazos cuentan como entregados |
| TC-M03-200 | Flujo | Unitaria | ídem | [Z-1] | estado, línea, registro o pendientes distintos → falla |
| TC-M03-201 | Flujo | Unitaria | ídem | [R-8] | cinco eventos de revisión, con la vuelta a pending, sin lecturas de documentos |
| TC-M03-202 | Flujo | Unitaria | ídem | [R-7] | detecta claves de objetos y URLs firmadas en una respuesta |
| TC-M03-203 | Flujo | Flujo (C2) | `test/flujo/doctor-registration.flow-spec.ts` | [RF-05][D-32] | registro HTTP de un médico de prueba con el régimen TEST-1 en la rama de pruebas (solo mediante C2 `flujo-registro`) |
| TC-M03-204 | Flujo | Flujo (C2) | `test/flujo/doctor-review.flow-spec.ts` | [RF-06][D-25][D-30] | revisión HTTP del admin: INE aprobada, cédula rechazada, reenviada y aprobada (solo mediante C2 `revision-admin`) |
| TC-M03-218 | C-16 | Unitaria | `src/modules/doctors/application/use-cases/doctor-b5.use-cases.spec.ts` | [RN-138][C-16] | ninguna operación del médico (bio, teléfono, especialidad, INE, cédula) cambia su CURP ni su nombre legal; sin eventos `doctor.curp.changed` ni `doctor.legal_name.changed` |
| TC-M03-219 | C-16 | E2E | `test/doctors.e2e-spec.ts` | [RN-138][C-16] | `PUT /me/doctor-profile/identity` → 404 con y sin sesión; `PATCH /me/doctor-profile` con `curp`, `firstName` o `lastName` → 400 sin cambiar el perfil; teléfono y bio siguen editándose |
| TC-M03-220 | D-37 | Por definir | Sin implementar | [D-37][RN-140] | acceso a la cuenta con una reaceptación pendiente, sin bloqueo global. Hoy `RequireRegistration` y `registration-gate.tsx` restringen toda la interfaz del paciente. **Pendiente de implementación y ejecución** |
| TC-M03-221 | D-37 | Por definir | Sin implementar | [D-37][RN-140] | consulta y aceptación de los documentos pendientes, por paciente y por médico. Hoy `GET /me/doctor/status` no identifica los documentos. **Pendiente de implementación y ejecución** |
| TC-M03-222 | D-37 | Por definir | Sin implementar | [D-37][RN-140] | agendamiento rechazado, sin efectos secundarios, a un paciente sin aceptación vigente. Depende de M08. **Pendiente de implementación y ejecución** |
| TC-M03-223 | D-37 | Por definir | Sin implementar | [D-37][RN-140] | el médico completa su registro (INE y cédula) sin aceptación vigente. **Pendiente de implementación y ejecución** |
| TC-M03-224 | D-37 | Por definir | Sin implementar | [D-37][RN-140] | operación que requiere un médico habilitado rechazada, sin efectos secundarios, si falta la aceptación legal, en cada área: agenda (M07), citas (M08), videoconsulta (`video`), expediente clínico (`clinical-record`) y prescripciones (`prescriptions`). **Pendiente de implementación y ejecución** |
| TC-M03-225 | D-37 | Por definir | Sin implementar | [D-37][RN-140] | operación que requiere un médico habilitado rechazada, sin efectos secundarios, si falta la aprobación administrativa, en las mismas áreas que TC-M03-224. **Pendiente de implementación y ejecución** |
| TC-M03-226 | D-37 | Por definir | Sin implementar | [D-37][RN-140] | una versión legal nueva conserva las revisiones administrativas aprobadas. Relacionada: TC-M03-027, que no sustituye este escenario. **Pendiente de implementación y ejecución** |
| TC-M03-227 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | identificador de producción igual al de la salvaguarda de C2 |
| TC-M03-228 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | clasifica desarrollo y producción solo si la BD confirma lo declarado (identidades simuladas) |
| TC-M03-229 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | rechaza destinos no verificables, declarados distintos o ambiguos (identidades simuladas) |
| TC-M03-230 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | evalúa ambos roles: términos del médico no afectan a pacientes |
| TC-M03-231 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | [riesgo 21] `patient_terms` con `privacy_policy` vigente: detecta la transición de todos los pacientes |
| TC-M03-232 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | política nueva con pacientes en legado: no los cambia y lo avisa |
| TC-M03-233 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | régimen incompleto: rechaza la publicación parcial |
| TC-M03-234 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | la primera publicación del régimen del médico es una transición |
| TC-M03-235 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | fechas inválidas, pasadas o anteriores a una versión del mismo tipo |
| TC-M03-236 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | una fecha pasada requiere motivo, que queda en el plan |
| TC-M03-237 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | versión duplicada |
| TC-M03-238 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | `dev-*` en producción exige autorización, también si el régimen activa uno vigente (destino simulado) |
| TC-M03-239 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | cada requisito exige su autorización |
| TC-M03-240 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | confirmación aceptada dentro de su vigencia |
| TC-M03-241 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | confirmación caducada, con formato inválido o con hash incorrecto |
| TC-M03-242 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | confirmación rechazada si cambian contenido, versión, fecha, destino, entorno, vigentes o futuras |
| TC-M03-243 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | el conteo de usuarios no invalida la confirmación |
| TC-M03-244 | Publicación legal | Integración (C2) | `test/integration/legal-publication.int-spec.ts` | [Publicación legal] | la simulación identifica la rama y no escribe. Reejecutada mediante C2: PASS (rollback, huella idéntica). |
| TC-M03-245 | Publicación legal | Integración (C2) | `test/integration/legal-publication.int-spec.ts` | [Publicación legal] | publicación con confirmación válida: un evento por documento con `publicationId`, destino Neon, resultado, audiencia, autorizaciones e impacto total de la operación; sin aceptaciones. Reejecutada mediante C2: PASS (rollback, huella idéntica). |
| TC-M03-246 | Publicación legal | Integración (C2) | `test/integration/legal-publication.int-spec.ts` | [Publicación legal] | contenido distinto del simulado rechazado sin escribir. Reejecutada mediante C2: PASS (rollback, huella idéntica). |
| TC-M03-247 | Publicación legal | Integración (C2) | `test/integration/legal-publication.int-spec.ts` | [Publicación legal] | destino declarado distinto del conectado rechazado. Reejecutada mediante C2: PASS (rollback, huella idéntica). |
| TC-M03-248 | Publicación legal | Integración (C2) | `test/integration/legal-publication.int-spec.ts` | [Publicación legal] | si la auditoría falla, la publicación se revierte por completo. Reejecutada mediante C2: PASS (rollback, huella idéntica). |
| TC-M03-249 | Publicación legal | Unitaria (caso de uso, dobles) | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts` | [Publicación legal] | la simulación no escribe documentos, aceptaciones ni auditoría |
| TC-M03-250 | Publicación legal | Unitaria (caso de uso, dobles) | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts` | [Publicación legal] | contenido vacío rechazado |
| TC-M03-251 | Publicación legal | Unitaria (caso de uso, dobles) | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts` | [Publicación legal] | sin confirmación vigente o con contenido distinto no se escribe |
| TC-M03-252 | Publicación legal | Unitaria (caso de uso, dobles) | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts` | [Publicación legal] | una transición de régimen exige autorización aunque la confirmación sea válida |
| TC-M03-253 | Publicación legal | Unitaria (caso de uso, dobles) | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts` | [Publicación legal] | producción sin `--allow-production` no escribe. **Probado con dobles, no contra `production`** |
| TC-M03-254 | Publicación legal | Unitaria (caso de uso, dobles) | `src/modules/identity/application/use-cases/legal-documents.use-cases.spec.ts` | [Publicación legal] | un destino no verificable se rechaza (lector simulado) |
| TC-M03-255 | Publicación legal | Unitaria (CLI, argumentos) | `src/cli/legal-publish.args.spec.ts` | [Publicación legal] | interpreta simulación, destino y autorizaciones; por defecto nada está autorizado |
| TC-M03-256 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | H1: una publicación que completa una transición futura de otro rol la identifica y exige autorización |
| TC-M03-257 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | una transición programada que la publicación no altera se informa sin exigir autorización |
| TC-M03-258 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | cambiar la política incluida en una transición programada la altera |
| TC-M03-259 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | varias fechas futuras se evalúan en orden |
| TC-M03-260 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | fecha pasada: considera versiones de otros tipos vigentes desde entonces |
| TC-M03-261 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | O5: aviso de riesgo 21 con una transición futura |
| TC-M03-262 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | el motivo solo aplica a fechas pasadas y no admite correos ni URLs |
| TC-M03-263 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | O1 y O2: versiones `dev-*` en cualquier capitalización, ya vigentes o programadas |
| TC-M03-264 | Publicación legal | Unitaria (dominio) | `src/modules/identity/domain/legal-publication.spec.ts` | [Publicación legal] | confirmación rechazada si cambian audiencia, motivo, proyecto o cambios programados; no depende del orden de las filas |
| TC-M03-265 | Publicación legal | Unitaria (CLI, argumentos) | `src/cli/legal-publish.args.spec.ts` | [Publicación legal] | rechaza opciones repetidas, otra bandera como valor y valores vacíos; un argumento desconocido no repite lo recibido |
| TC-M03-266 | Publicación legal | Unitaria (CLI, argumentos) | `src/cli/legal-publish.args.spec.ts` | [Publicación legal] | combinaciones: simulación o confirmación, contradicciones y argumentos obligatorios |
| TC-M03-267 | Publicación legal | Unitaria (CLI, `main()`, dobles) | `src/cli/legal-publish.spec.ts` | [Publicación legal] | `--dry-run` solo simula; `--confirm` publica; argumentos inválidos no abren la conexión; cierra la conexión si hay fallo. Sin BD |
| TC-M03-268 | Publicación legal | Integración (C2, datos confirmados) | `test/concurrency/legal-publication.conc-spec.ts` | [Publicación legal] | adaptador real de identidad fuera de transacción. PASS en `br-shy-pond-b50a3m8f` |
| TC-M03-269 | Publicación legal | Integración (C2, datos confirmados) | `test/concurrency/legal-publication.conc-spec.ts` | [Publicación legal] | dos conexiones simultáneas: una publicación confirmada y otra rechazada sin escritura. PASS en `br-shy-pond-b50a3m8f`; una ejecución, no todas las intercalaciones |
| TC-M03-270 | Publicación legal | Integración (C2, datos confirmados) | `test/concurrency/legal-publication.conc-spec.ts` | [Publicación legal] | `ROLLBACK` real ante fallo de auditoría, sin documentos. PASS en `br-shy-pond-b50a3m8f` |
| TC-M03-271 | Publicación legal | Integración (C2, datos confirmados) | `test/concurrency/legal-publication.conc-spec.ts` | [Publicación legal] | confirmación caducada rechazada con el reloj de la BD. PASS en `br-shy-pond-b50a3m8f` |
| TC-M03-272 | Publicación legal | Integración (C2, datos confirmados) | `test/concurrency/legal-publication.conc-spec.ts` | [Publicación legal] | `main()` real: simulación, publicación y rechazo de reutilizar el token. PASS en `br-shy-pond-b50a3m8f`; no ejecuta `pnpm legal:publish` |
| TC-M03-273 | D-38 | Unitaria | `src/modules/doctors/domain/doctor-status.spec.ts` | [D-38] | aceptar los legales no habilita a un médico pendiente o rechazado |
| TC-M03-274 | D-38 | Unitaria | `src/modules/doctors/application/policies/doctor-operational.policy.spec.ts` | [D-38][R-13] | aprobado con aceptación pendiente: la política rechaza, `/me` informa `canOperate: false`; al aceptar vuelve a operar |
| TC-M03-275 | D-38 | Unitaria | ídem | [D-38] | aceptación legal sin aprobación administrativa no habilita |
| TC-M03-276 | D-38 | E2E | `test/doctors.e2e-spec.ts` | [D-38][R-13] | versión legal nueva: sigue en `?status=approved`, fuera de `pending` y de las colas, sin `returned_to_pending`; al aceptar recupera `canOperate` |
| TC-M03-277 | C2 | Unitaria | `test/support/c2-target-guard.spec.ts` | [C2] | concurrencia acepta solo la conexión directa al endpoint aprobado |
| TC-M03-278 | C2 | Unitaria | ídem | [C2] | modo `r2`: solo `R2_BUCKET_NAME === C2_EXPECTED_BUCKET === pei-docs-c2-test` |
| TC-M03-279 | C2 | Unitaria | ídem | [C2] | rechaza otro bucket, credenciales incompletas o credenciales R2 fuera del modo `r2` |
| TC-M03-280 | C2 | Unitaria | ídem | [C2] | `jest-concurrency.json` fija su modo después del tripwire (la comprobación de `jest-r2.json` queda pendiente de la etapa R2) |
| TC-M03-281 | C2 | Unitaria | ídem | [C2] | identidad real por `neon.*`: acepta la aprobada y rechaza otro proyecto, otra rama o la base de desarrollo |
| TC-M03-282 | C2 | Unitaria | `test/support/c2-launcher.spec.ts` | [C2] | lectura de `.env.c2`: claves repetidas o líneas inválidas se rechazan |
| TC-M03-283 | C2 | Unitaria | ídem | [C2] | solo `.env.c2` fuera del repositorio; rechaza `apps/backend/.env` y rutas relativas |
| TC-M03-284 | C2 | Unitaria | ídem | [C2] | el directorio de ejecución de Jest no puede contener `.env` ni estar dentro del repositorio |
| TC-M03-285 | C2 | Unitaria | ídem | [C2] | entorno de lista blanca: R2 y Resend vacíos fuera de `r2`; nada del proceso padre |
| TC-M03-286 | C2 | Unitaria | ídem | [C2] | rechaza configuración incompleta, identidad distinta, pooler en concurrencia, Resend con valor y secreto sin huella; marca de datos confirmados solo `c2-persistent-accepted` |
| TC-M03-287 | C2 | Unitaria | ídem | [C2] | cada spec solo se ejecuta en su modalidad |
| TC-M03-288 | C2 | Unitaria | ídem | [C2] | `rotate-auth-secret` genera un secreto exclusivo con huella y conserva las demás líneas |
| TC-M03-289 | C2 | Unitaria | ídem | [C2] | la salida de Jest oculta secretos, contraseña y cadenas de conexión |
| TC-M03-290 | C2 | Unitaria | ídem | [C2] | el lanzador y su CLI no cargan dotenv ni leen el `.env` del repositorio |
| TC-M03-291 | C2 | Unitaria | `test/support/test-tag.spec.ts` | [C2] | `testTag()` incluye `C2_RUN_ID` tras el prefijo; formato inválido rechazado |
| TC-M03-292 | C2 | Unitaria | ídem | [C2] | régimen legal reutilizable: ambos tipos vigentes y ninguna publicación programada en 24 h |
| TC-M03-293 | C2 | Integración (PostgreSQL C2 real) | `test/integration/admin-bootstrap-better-auth.int-spec.ts` | [DT-12] | con un administrador existente, el bootstrap aborta con `AdminAlreadyExistsError` sin crear nada |
| TC-M03-294 | C2 | Unitaria | `test/support/r2-run.spec.ts` | [C2] | UUID v5 de la ejecución (vector de la RFC 4122) y claves con la gramática de producción |
| TC-M03-295 | C2 | Unitaria | ídem | [C2] | el manifiesto registra cada operación; la limpieza borra solo las claves vivas |
| TC-M03-296 | C2 | Unitaria | ídem | [C2] | no admite claves ajenas (otro espacio, otro médico o no subidas en la ejecución) |
| TC-M03-297 | C2 | Unitaria | ídem | [C2] | un fallo de limpieza queda pendiente y se conserva la evidencia; `cleanups` acumula todas las limpiezas |
| TC-M03-298 | C2 | R2 real | `test/r2/private-storage.r2-spec.ts` | [DT-18] | subida y lectura de PNG, JPEG y PDF: bytes idénticos (SHA-256) y `ContentLength` real |
| TC-M03-299 | C2 | R2 real | ídem | [DT-18] | streaming de un documento de unos 5 MB: se recibe en varias partes y completo |
| TC-M03-300 | C2 | R2 real | ídem | [DT-18] | un objeto inexistente responde `StoredFileNotFoundError` |
| TC-M03-301 | C2 | R2 real | ídem | [DT-18] | borrado idempotente: borrar dos veces no falla y después el objeto no existe |
| TC-M03-302 | C2 | R2 real | ídem | [DT-3] | una clave fuera de la gramática del bucket privado se rechaza sin llamar a R2 |
| TC-M03-303 | C2 | R2 real | ídem | [DT-18] | credenciales inválidas (solo en ese caso): `DocumentStorageError` sin clave, bucket ni credenciales en el mensaje |
| TC-M03-304 | C2 | PostgreSQL y R2 reales | `test/r2/doctor-documents.r2-spec.ts` | [D-16][D-22] | las claves guardadas en PostgreSQL existen en R2 con los mismos bytes (SHA-256); la lectura del admin queda auditada |
| TC-M03-305 | C2 | PostgreSQL y R2 reales | ídem | [D-19][D-16] | aprobar la INE purga en R2 el frente y el reverso; la cédula se conserva con los mismos bytes |
| TC-M03-306 | C2 | PostgreSQL y R2 reales | ídem | [DT-6][D-17] | cédula duplicada: la transacción falla y la compensación elimina el objeto subido; no queda en R2 |
| TC-M03-307 | C2 | Unitaria | `test/support/c2-evidence.spec.ts` | [C2] | las evidencias se organizan por fecha y `C2_RUN_ID`, fuera del repositorio y de `C:\pei-c2` |
| TC-M03-308 | C2 | Unitaria | ídem | [C2] | `C2_RUN_ID` único por ejecución; nunca se reutiliza un directorio ni se sobrescribe un archivo |
| TC-M03-309 | C2 | Unitaria | ídem | [C2] | `run.json` omite los campos que no corresponden y registra el código de salida; `gitState` registra el commit y si el árbol tiene cambios, sin listar archivos |
| TC-M03-310 | C2 | Unitaria | ídem | [C2] | la huella de PostgreSQL solo admite recuentos y hashes, nunca filas |
| TC-M03-311 | C2 | Unitaria | ídem | [C2] | `SHA256SUMS` cubre todos los archivos y detecta cambios, faltantes y archivos añadidos |
| TC-M03-312 | C2 | Unitaria | ídem | [C2] | la depuración del log oculta secretos, conexiones, cookies, tokens, correos reales, CURP, RFC y cadenas largas |
| TC-M03-313 | C2 | Unitaria | ídem | [C2] | revisión para versionar: un paquete limpio (incluidos el manifiesto de R2 y su comprobación final) pasa; uno depurado, sospechoso, binario o desconocido se rechaza |
| TC-M03-314 | C2 | Unitaria | ídem | [C2] | Jest correcto o con fallos: código de salida, log depurado, estado y `SHA256SUMS` |
| TC-M03-315 | C2 | Unitaria | ídem | [C2] | interrupción (o proceso que muere): queda como `interrupted` y se conserva lo parcial |
| TC-M03-316 | C2 | Unitaria | ídem | [C2] | las cuatro modalidades C2 generan su `run.json`; solo `r2` incluye el bucket |
| TC-M03-317 | C2 | Unitaria | `test/support/r2-run.spec.ts` | [C2] | el manifiesto se crea en exclusiva (con y sin `C2_EVIDENCE_DIR`): nunca sobrescribe uno existente |
| TC-M03-318 | C2 | Unitaria | ídem | [C2] | escritura incremental y atómica tras cada operación; operaciones concurrentes sin pérdidas |
| TC-M03-319 | C2 | Unitaria | ídem | [C2] | un fallo al escribir el manifiesto no pierde operaciones: queda en `persistenceErrors` y la siguiente escritura lo recupera |
| TC-M03-320 | C2 | Unitaria | ídem | [C2] | `finalCheck` se registra una vez (manifiesto y `r2-final-check.json`); los specs de R2 no acceden a R2 fuera del manifiesto (salvo el rechazo local de TC-M03-302) |
| TC-M03-321 | C2 | Unitaria | `test/support/c2-pg-fingerprint.spec.ts` | [C2] | huella: dos estados idénticos producen el mismo hash (md5) |
| TC-M03-322 | C2 | Unitaria | ídem | [C2] | cambiar un valor de una fila cambia el hash |
| TC-M03-323 | C2 | Unitaria | ídem | [C2] | cambiar el número de filas (o duplicar una) cambia el hash |
| TC-M03-324 | C2 | Unitaria | ídem | [C2] | NULL es determinista y distinto de cadena vacía o de una columna ausente |
| TC-M03-325 | C2 | Unitaria | ídem | [C2] | ni el orden de lectura ni el tamaño de los bloques alteran el hash |
| TC-M03-326 | C2 | Unitaria | ídem | [C2] | las 13 tablas se leen en una transacción READ ONLY, tras confirmar la identidad de Neon, y terminan con `ROLLBACK`, sin consultas de escritura |
| TC-M03-327 | C2 | Unitaria | ídem | [C2] | otra rama de Neon o una sesión que no es de solo lectura: falla sin leer ninguna tabla |
| TC-M03-328 | C2 | Unitaria | ídem | [C2] | sin cambios, `equal`; una fila nueva o modificada señala exactamente las tablas afectadas |
| TC-M03-329 | C2 | Unitaria | ídem | [C2] | estados de la comparación: `equal`, `different`, `incomplete` y `error` |
| TC-M03-330 | C2 | Unitaria | ídem | [C2] | si `pg-before` falla, Jest no se inicia y se registra `error` |
| TC-M03-331 | C2 | Unitaria | ídem | [C2] | si `pg-after` falla, la comparación queda `incomplete` y se conserva la evidencia anterior |
| TC-M03-332 | C2 | Unitaria | ídem | [C2] | Jest correcto y huellas iguales: código 0, `pg-comparison.json` `equal` y paquete revisable |
| TC-M03-333 | C2 | Unitaria | ídem | [C2] | Jest correcto pero huellas distintas: código 1 y las tablas afectadas en la evidencia, sin corregir nada |
| TC-M03-334 | C2 | Unitaria | ídem | [C2] | Jest con fallos: se toma igualmente `pg-after` y se conserva el código de Jest |
| RT-M03-14 | B8 | Unitaria | `test/architecture.spec.ts` | [P.7] | doctors solo usa de identity dominio, puertos, registro y módulo |
| RT-M03-15 | B8 | Unitaria | ídem | [R-11] | doctors sin SDK de AWS ni infraestructura de private-storage |
| RT-M03-16 | B8 | Unitaria | ídem | [B8] | el spec de concurrencia exige C2, rechaza `rama` y la marca de rama desechable |
| RT-M03-17 | C2 | Unitaria | `test/architecture.spec.ts` | [C2] | `doctors.int-spec` cierra el pool de `src/db` y comprueba que quedó vacío |
| RT-M03-18 | C2 | Unitaria | ídem | [C2] | `admin-bootstrap-better-auth` conserva sus seis escenarios; los dos de bootstrap inicial, marcados como pendientes en C2 |

Casos A1–A3 y TC-M03-060 a 067: estado **Interna** (incluidos en suites que terminaron sin fallos en las ejecuciones descritas
arriba; acreditación agregada, no individual). TC-M03-068 a 074: **Interna**, ejecutados en la rama temporal `rama` con C2 v10.1 (8/8; acreditación agregada, sin evidencia formal). Evidencia formal **pendiente** para todos; A4 no cierra la evidencia formal de M02.

### Ensayo C2 de `0008` (comprobación negativa de las precondiciones)

Se ejecuta en la rama temporal **antes** de aplicar `0008`, porque después los triggers impiden crear el dato
incoherente. No desactiva triggers. Todo dentro de una transacción que se revierte:

1. `BEGIN`.
2. Crear un `user` y un `user_profile` con rol `doctor` (CURP sintética) e insertar un `patient_profile` para él.
3. Ejecutar el bloque `DO` de precondiciones de `0008`: debe fallar con `P0001`, con el mensaje
   `A4/0008 precondiciones` y `paciente_con_rol_distinto=1`, sin ids.
4. `ROLLBACK`, y comprobar que no quedan residuos.

Resultado: **PASS** (2026-10-20, C2 v10, plan `verificar-0008`; ver abajo).

### Ejecución de A4 en la rama temporal (2026-10-20)

Rama temporal `rama` de Neon, identidad verificada en cada paso: `br-autumn-sun-b52qoep4` / `ep-noisy-pond-b5owxox3` / `royal-paper-10258990` (timeline `201103…`). Herramienta C2 fuera del
repositorio (v10 y v10.1, con sumas SHA-256; v9 intacta). Ninguna operación de esta ejecución tocó `production`. Validación **interna**:
no es evidencia formal (`pnpm test:evidence`) y no cierra M02.

| Plan (C2) | Hora (UTC) | Código | Resultado |
|---|---|---|---|
| `verificar-0008` (v10) | 01:35 | 0 | Huella inicial = referencia v9; precondiciones con los datos reales PASS. Comprobación negativa, sin desactivar triggers y en una transacción revertida: N1 paciente sobre médico, N2 médico sobre paciente, N3 ambos perfiles y N4 paciente sobre admin → `P0001` con el conteo exacto. 0008 aplicada dentro de la transacción: función y 2 triggers con la definición esperada; T1–T5 → `P0001`, T6 (roles correctos) aceptado; catálogo intacto; inverso validado en un SAVEPOINT. Huella final idéntica; 0008 no quedó aplicada |
| `aplicar-0008` (v10) | 01:38 | 0 | `antes-aplicar` PASS (16 s antes de `post`; compuerta < 15 min): 8 migraciones, última 0007, 0008 única pendiente con SHA `2576bf98…`. `drizzle-kit migrate` aplicó solo 0008. `post-0008` Q1–Q7 PASS: 9 migraciones, previas intactas, hash de 0008, función y 2 triggers habilitados, sin incoherencias. Únicas diferencias de huella: `migrations` 8→9, `triggers` 29→31 y `last_migration_hash` |
| `probar-a4` (v10.1) | 01:43–01:44 | 0 | Huella previa = post-0008 (SHA fijado). Solo `role-profile-coherence.int-spec.ts`: TC-M03-068 a 074, **8/8**. Huella final idéntica a la previa (sin residuos) |

Observación: Jest avisó de que no terminó un segundo después de las pruebas (manejadores abiertos, como en el resto de
la integración); el plan terminó con código 0.

Distinción: la migración `0008` está **aplicada en `rama`** y su comportamiento en la BD está validado (A4). No es una
validación funcional completa: no se ejecutaron en `rama` las suites completas (unitarias, integración y E2E) con 0008,
y M03 B sigue pendiente. La aplicación en `production` se registra en la sección siguiente.

### Ejecución de `0008` en `production` (2026-10-20)

Herramienta C2 prod-0008 (fuera del repositorio), derivada de C2 v10/v10.1 con la terna de `production` y el SHA de
`0008` fijados, compuerta de 15 minutos y sin reintentos; C2 v10 y v10.1 no se modificaron. Validación **interna**, no
formal. Los valores de esta sección proceden del informe de la ejecución; los artefactos están en `scratchpad/c2/prod-0008/resultados/` (`previo.json`, `aplicar.json`, `posterior.json`, salidas y `SHA256SUMS`), fuera
del repositorio y sin versionar: deben verificarse (sumas incluidas) antes de atribuirles carácter de evidencia versionada.

| Elemento | Resultado |
|---|---|
| Destino | Proyecto `royal-paper-10258990`, rama `br-royal-recipe-b54s5hnn`, endpoint `ep-wandering-bonus-b5kxacor`, timeline `8e2d8b…`; PostgreSQL 18 (`180006`); rol `neondb_owner`, no superusuario. Verificado antes de cada paso |
| Migración | Solo `0008_m03_role_profile_coherence`, SHA-256 `2576bf987d09f4b2629cb5f21d1c5982ebd7e1c0a8844abcb47aa33b1f111fab` (igual al del repositorio) |
| `previo` (02:02 UTC, código 0) | 8 migraciones iguales a las locales, la última 0007 y 0008 única pendiente; sin aplicación parcial; sin perfiles incoherentes; precondiciones de 0008 PASS; esquema igual al de `rama` antes de aplicar (datos distintos por diseño) |
| `aplicar` (02:03 UTC, código 0) | 38 s después de `previo`; identidad verificada justo antes; una sola ejecución de `drizzle-kit migrate` («migrations applied successfully») |
| `posterior` (02:03 UTC, código 0) | Q1–Q12 PASS: 9 migraciones, previas intactas, hash de 0008; función `gst_profile_role_matches` y triggers `patient_profile_role_matches` y `doctor_profile_role_matches` presentes y habilitados; sin perfiles incoherentes; T1–T5 rechazados con `P0001` y T6 admitido, en una transacción revertida |
| Huella | Frente a `previo`, solo `migrations` 8→9, `triggers` 29→31 y `last_migration_hash`; restricciones y conteos de perfiles iguales; sin residuos tras la validación |
| LSN | Previo `0/31E3B68` (02:02:31 UTC); posterior `0/31E7BF0` (02:03:48 UTC) |

Advertencias: **no se verificó la ventana de restauración de Neon** (no es visible por SQL); la vía de recuperación de
`0008` es su inverso lógico (sin datos), validado solo en `rama`. **No se ejecutaron en `production` las suites
completas** de unitarias, integración y E2E, ni la integración de A4: esta sección acredita la aplicación y el estado de
la BD, no una validación funcional completa.

### Ensayo C2 de `0009` en la rama temporal (2026-10-20)

Herramienta C2 v11 (`c2/v11`, fuera del repositorio; copia de v10.1 con `c2-0009.cjs` y el plan `verificar-0009`;
pruebas simuladas 232/232). Destino verificado en cada paso: `br-autumn-sun-b52qoep4` / `ep-noisy-pond-b5owxox3` /
`royal-paper-10258990` (timeline `201103…`). Plan terminado con código 0. Validación **interna**, no formal; `0009`
**no quedó aplicada**.

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `estado9 antes-ensayo` | 04:22:33 | PASS. Huella idéntica a la última de `rama` (v10.1 `despues-pruebas`); 9 migraciones iguales a las locales, la última `0008`; sin tabla `specialty`; journal local de 12 entradas con `0009`–`0011` fijadas por SHA; snapshot `0009` encadenado y solo agrega `specialty` |
| `rehearsal-0009` | 04:22:40 | PASS. Catálogo inicial exacto (3 activas); restricciones `specialty_active_chk`, `_code_format_chk`, `_code_unique`, `_name_chk`, `_pkey`; índices `_active_idx`, `_code_unique`, `_name_lower_uq`, `_pkey`. N1 code repetido y N2 nombre repetido sin distinguir mayúsculas → 23505 con su constraint; N3 formato, N4 nombre vacío, N5/N6 incoherencia `is_active`/`deactivated_at` → 23514 con su constraint; N7 nombre de 101 → 22001. P1 alta válida y P2 desactivar/reactivar aceptados. Inverso (`DROP TABLE`) en SAVEPOINT; tras el ROLLBACK, tabla ausente y huella idéntica |
| `estado9 despues-ensayo` | 04:22:51 | PASS. Huella idéntica a `antes-ensayo` |

Artefactos: `c2/v11/c2-e9-antes-ensayo.json`, `c2-rehearsal-0009.json`, `c2-e9-despues-ensayo.json` y
`ensayo/` (salida, código y `SHA256SUMS`), sin versionar.

### Aplicación de `0009` en la rama temporal (2026-10-20)

Autorizada por el usuario solo para `rama`. C2 v11, plan `aplicar-0009` (código 0). Destino verificado antes de cada
paso (`br-autumn-sun-b52qoep4` / `ep-noisy-pond-b5owxox3` / `royal-paper-10258990`, timeline `201103…`). Como el journal
del repositorio ya incluye `0010` y `0011`, `drizzle-kit migrate` se ejecutó con `drizzle-0009.config.cjs` (SHA
`23f384bf…`) sobre un directorio preparado con copias byte a byte de `0000`–`0009` (journal de 10 entradas), verificado
por la compuerta.

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `estado9 antes-aplicar` | 04:31:18 | PASS. Huella idéntica a `despues-ensayo`; 9 migraciones iguales a las locales, la última `0008`; sin `specialty`; directorio preparado verificado; compuerta escrita |
| `migrate-0009` | 04:31 | Una ejecución de `drizzle-kit migrate` con el driver de Neon; compuerta aprobada (antes-aplicar < 15 min, ensayo PASS, directorio sin cambios) |
| `post-0009` | 04:31:30 | PASS. Q1 10 migraciones iguales a las locales; Q2 las 9 previas intactas; Q3 hash `c2960380…`; Q4 catálogo inicial (3 activas); Q5 restricciones y Q6 índices exactos (los del ensayo); Q7 columnas, tipos, nulabilidad y defaults; Q8 sin triggers en `specialty` y sin triggers ni funciones nuevas (31 y 20); Q9 sin eventos de auditoría; Q10 únicas diferencias de huella `last_migration_hash`, `migrations`, `public_tables` y `tablas.specialty` (3 filas) |

Sumas: `c2-e9-antes-aplicar.json` `6ddab971…`, `c2-pre-0009.json` `e7d464ad…`, `c2-e9-post.json` `a3ea52c7…`
(`c2/v11/aplicacion/SHA256SUMS`, fuera del repositorio). Validación interna, no formal. Los triggers de `specialty`
(DELETE, TRUNCATE y `code` inmutable) siguen pendientes de `0012`.

### Ensayo C2 de `0010` y `0011` en la rama temporal (2026-10-20)

Autorizado por el usuario solo como ensayo en `rama`. C2 v11, plan `verificar-b2`; destino verificado en cada paso
(`br-autumn-sun-b52qoep4` / `ep-noisy-pond-b5owxox3` / `royal-paper-10258990`, timeline `201103…`). SHA-256: `0010`
`e0dab493…a55b2`, `0011` `4355a9d2…feaba5`, inverso del ensayo `b2-inverso.sql` `1a141764…cb7c7`. Ninguna de las dos
quedó aplicada.

**Intento 1 (04:3x UTC): FAIL** solo en L5 por una expectativa errónea de la herramienta: borrar una especialidad
referenciada respondió `23001` (`restrict_violation`, propio de `ON DELETE RESTRICT`) y se esperaba `23503`. Todo lo demás
pasó, incluida la reversión. Se corrigió la expectativa a `23001` (más estricta: distingue RESTRICT de NO ACTION) y se
repitió el ensayo. Salida conservada en `c2/v11/ensayo-b2/intento-1/`.

**Intento 2: PASS** (código 0).

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `estadob2 antes-ensayo` | 04:39:04 | PASS. Huella idéntica a `post-0009`; 10 migraciones iguales a las locales, la última `0009`; `doctor_profile` sin filas; `specialty` con 3; sin tablas de revisión; `specialty_enum` y `doctor_verification_status_enum` presentes |
| `rehearsal-b2` | 04:39:25 | PASS. **0010**: G1 guard con una fila → `P0001`; G2 sin filas pasa; columnas finales (8), `license_number` admite NULL, sin la FK del revisor, tipos antiguos eliminados, trigger de `0008` intacto. **0011**: columnas nuevas (`specialty_id` NOT NULL, revisiones con default 1), restricciones exactas de las 3 tablas, ON DELETE de las 7 FK (RESTRICT hacia `specialty`), índices exactos incluidos los parciales `WHERE status = 'pending'`, tipos nuevos con sus valores, sin triggers nuevos. Casos: D1 23502; D2/D3 23514; D4 23503; D5 perfil sin número con versiones 1/1; I1 válida; I2/I3 23505; I4–I7 23514 con su constraint; I8 rechazo con purga válido; L1 válida; L2 23514; L3 23505; L4 22P02; L5 23001; L6/L7 23503. Inverso en SAVEPOINT con catálogo igual al inicial; tras el ROLLBACK, catálogo y huella idénticos |
| `estadob2 despues-ensayo` | 04:39:34 | PASS. Huella idéntica a `antes-ensayo` |

Sumas: `c2-eb2-antes-ensayo.json` `4c1333a8…`, `c2-rehearsal-b2.json` `796628a3…`, `c2-eb2-despues-ensayo.json`
`b0f2c930…` (`c2/v11/ensayo-b2/SHA256SUMS`, fuera del repositorio). Validación interna, no formal.

### Aplicación de `0010` y `0011` en la rama temporal (2026-10-20)

Autorizada por el usuario solo para `rama`. C2 v11, plan `aplicar-b2` (código 0). Destino verificado antes de cada paso
(`br-autumn-sun-b52qoep4` / `ep-noisy-pond-b5owxox3` / `royal-paper-10258990`, timeline `201103…`). `drizzle-kit
migrate` con `drizzle-b2.config.cjs` (SHA `2392e49c…`) sobre el directorio del repositorio, cuyo journal es exactamente
`0000`–`0011`.

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `estadob2 antes-aplicar` | 04:43:49 | PASS. Huella idéntica a `despues-ensayo`; 10 migraciones, la última `0009`; `doctor_profile` sin filas; compuerta escrita |
| `migrate-b2` | 04:43–04:44 | Una ejecución; compuerta aprobada (antes-aplicar < 15 min, ensayo PASS, 10 aplicadas, journal igual) |
| `post-b2` | 04:44:04 | PASS. Q1 12 migraciones iguales a las locales; Q2 las 10 previas intactas; Q3 hashes de `0010` y `0011`; Q4 catálogo de columnas, restricciones, índices, tipos y triggers idéntico al verificado en el ensayo; Q5 tipos antiguos eliminados; Q6 las tres tablas vacías; Q7 sin triggers nuevos; Q8 sin auditoría; Q9 únicas diferencias de huella `last_migration_hash`, `migrations`, `public_tables` (+2), las dos tablas nuevas y `tablas.doctor_profile.excluidas` |

Sumas: `c2-eb2-antes-aplicar.json` `860b5e4b…`, `c2-pre-b2.json` `34dd2f07…`, `c2-eb2-post.json` `24c49e3d…`
(`c2/v11/aplicacion-b2/SHA256SUMS`, fuera del repositorio). Validación interna, no formal. Los triggers de `0012` (B3)
siguen pendientes: hasta entonces la BD no impone versiones ni inmutabilidad de las revisiones.

### Ensayo C2 de `0012` en la rama temporal (2026-10-20)

Autorizado por el usuario solo como ensayo en `rama`, sin aplicar. C2 v11, plan `verificar-0012` (código 0); destino
verificado en cada paso (`br-autumn-sun-b52qoep4` / `ep-noisy-pond-b5owxox3` / `royal-paper-10258990`, timeline
`201103…`). `0012` **no quedó aplicada**.

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `estado12 antes-ensayo` | 04:53:22 | PASS. Huella idéntica a `post-b2`; 12 migraciones iguales a las locales, la última `0011`; sin funciones de `0012`; en las tablas de médicos solo el trigger de `0008`; tablas vacías |
| `rehearsal-0012` | 04:53:57 | PASS. G0 guard con una función homónima → `P0001`; sin ella pasa. Tras `0012`: 7 funciones y 13 triggers (12 nuevos + `doctor_profile_role_matches`). Casos de 0012.c: 1 INSERT válidos de INE y cédula con `created_at`/`updated_at` fijados por la BD; 2 aprobado al insertar, versión anterior, intento que salta, número o especialidad distintos del perfil → `P0001`; 3 segundo pendiente → `23505 *_one_pending_uq`; 4 aprobar, rechazar, `superseded` y reenvío → aceptados; 5 aprobar con versión vieja (INE y cédula) → `P0001`; 6 cambios desde estados terminales → `P0001`; 7 evidencia en `pending` (clave de INE, documento, número, especialidad, motivo, intento) → `P0001`; 8 revisor sin cambio de estado → `P0001`; 9 purga en `pending` → `P0001`; 10 purga en `approved`, `rejected` y `superseded` → aceptada; 11 purga de una sola clave → `P0001`; 12 purga con motivo → `P0001`; 13 segunda purga → `P0001`; 14 estado y purga juntos → `P0001`; 15 cédula terminal modificada → `P0001`; 16 DELETE/TRUNCATE de revisiones y DELETE de especialidad → `P0001`, `TRUNCATE specialty` → `0A000` (FK, antes del trigger); 17 versión +2 y número o especialidad sin versión → `P0001`, número con versión → aceptado; 18 cambiar `code` → `P0001`, editar el nombre y desactivar → aceptados con `updated_at` fijado por la BD. Inverso en SAVEPOINT; tras el ROLLBACK, objetos y huella idénticos |
| `estado12 despues-ensayo` | 04:54:07 | PASS. Huella idéntica a `antes-ensayo` |

Sumas: `c2-e12-antes-ensayo.json` `0d6c7cc1…`, `c2-rehearsal-0012.json` `df7fe2fa…`, `c2-e12-despues-ensayo.json`
`221a947b…` (`c2/v11/ensayo-0012/SHA256SUMS`, fuera del repositorio). Validación interna, no formal.

### Aplicación de `0012` en la rama temporal (2026-10-20)

Autorizada por el usuario solo para `rama`. C2 v11, plan `aplicar-0012` (código 0); destino verificado antes de cada paso
(`br-autumn-sun-b52qoep4` / `ep-noisy-pond-b5owxox3` / `royal-paper-10258990`, timeline `201103…`). `drizzle-kit
migrate` con `drizzle-0012.config.cjs` (SHA `303980a8…`) sobre el directorio del repositorio (journal `0000`–`0012`).

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `estado12 antes-aplicar` | 04:56:37 | PASS. Huella idéntica a `despues-ensayo`; 12 migraciones, la última `0011`; sin funciones de `0012`; compuerta escrita |
| `migrate-0012` | 04:56 | Una ejecución; compuerta aprobada (antes-aplicar < 15 min, ensayo PASS, 12 aplicadas, journal igual) |
| `post-0012` | 04:56:51 | PASS. Q1 13 migraciones iguales a las locales; Q2 las 12 previas intactas; Q3 hash `e5d24a0f…`; Q4 las 7 funciones y los 13 triggers iguales a los del ensayo; Q5 triggers habilitados; Q6 funciones públicas 20 → 27 y triggers 31 → 43; Q7 tablas de médicos vacías y `specialty` con 3; Q8 sin auditoría; Q9 únicas diferencias de huella `last_migration_hash`, `migrations` y `triggers` |

Sumas: `c2-e12-antes-aplicar.json` `6f630467…`, `c2-pre-0012.json` `0ad0cd9e…`, `c2-e12-post.json` `cb929249…`
(`c2/v11/aplicacion-0012/SHA256SUMS`, fuera del repositorio). Validación interna, no formal. Con `0009`–`0012` aplicadas,
`rama` tiene el esquema completo de M03; `production` sigue en `0008`.

### Regresión completa con M03 en la rama temporal (`probar-m03`, 2026-10-20)

Autorizada por el usuario solo para `rama`. C2 v11; destino verificado en cada paso (`br-autumn-sun-b52qoep4` /
`ep-noisy-pond-b5owxox3` / `royal-paper-10258990`). Servicios externos neutralizados; solo escrituras revertidas.

**Intento 1: FAIL** en `test-int`: 5 casos de `doctors.int-spec.ts` fallaron por errores del soporte de prueba, no del
producto: (a) `doctorAuditActions` enlazaba mal un arreglo de UUID (`any($1::uuid[])` con un solo valor); (b)
`acceptDoctorRegime` publicaba el régimen dos veces en la misma transacción y chocaba con `legal_document_type_published_at_uq`
(now() es fijo en la transacción). Las otras 11 suites de integración (89 casos, incluida la de A4 adaptada) pasaron. El
plan se detuvo antes de `test-e2e` y de la huella posterior; el intento 2 empezó comprobando que la huella seguía
idéntica a la de post-0012, así que el intento 1 no dejó residuos. Salida conservada en `c2/v11/probar-m03/intento-1/`.

**Intento 2: PASS** (código 0), con el soporte corregido (`test/support/doctors-integration.ts`).

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `estadom antes-pruebas` | 05:46:33 | PASS. Huella idéntica a post-0012; 13 migraciones, la última `0012` |
| `test-unit` | — | 588/588 (48 suites) |
| `test-int` | — | 94/94 (12 suites), incluidos `doctors.int-spec.ts` (TC-M03-172 a 182) y `role-profile-coherence.int-spec.ts` (TC-M03-068 a 074) |
| `test-e2e` | — | 104/104 (12 suites), incluidas las E2E con BD (`app`, `me`, `audit-db`) y las de M03 con dobles |
| `estadom despues-pruebas` | 05:51:07 | PASS. Huella idéntica a `antes-pruebas`: sin residuos |

Sumas: `c2-em-antes-pruebas.json` `b2e87aab…`, `c2-em-despues-pruebas.json` `3b3daccb…`, salida `7dcc1ff5…`
(`c2/v11/probar-m03/SHA256SUMS`, fuera del repositorio). Validación interna, no formal (no es `pnpm test:evidence`).

### Concurrencia de M03 en `rama` con datos permanentes (2026-10-20)

El usuario pidió ejecutarla en `rama` en lugar de una rama desechable y confirmó por escrito «confirmo concurrencia en
rama con datos permanentes». Se creó C2 v11.1 (copia de v11; v11 sin cambios), que admite `rama` como destino solo con
esa aceptación literal en `destino-desechable.json`; el spec la admite solo con `C2_COMMITTED_FIXTURES=rama-permanent-accepted`.
Plan `probar-concurrencia` (código 0), destino verificado (`br-autumn-sun-b52qoep4` / `ep-noisy-pond-b5owxox3`).

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `estadod antes-pruebas` | 09:01:40 | PASS. Huella idéntica a la última de `probar-m03`; 13 migraciones, la última `0012` |
| `test-conc` | — | 5/5: TC-M03-183 (cambio primero → la aprobación espera y recibe 409), 184 (aprobación primero → el cambio espera y abre `specialty_changed`), 185 (dos admins: uno gana, un solo evento), 186 (envíos de INE serializados), 187 (FOR SHARE de la política bloquea el cambio) |
| `estadod despues-pruebas` | 09:02:38 | PASS. Sin cambios de esquema; solo cambiaron tablas de datos de las pruebas |

**Datos que quedan en `rama` de forma permanente:** `user` y `user_profile` 1 → 10 (5 médicos y 4 administradores de
prueba, dominio `m00.test.invalid`), `doctor_profile` 0 → 5, `doctor_identity_verification` 0 → 7,
`doctor_license_verification` 0 → 8, `legal_document` 2 → 12 (versiones de prueba de `privacy_policy` y `doctor_terms`:
`rama` ya tiene un régimen legal de médico publicado; el del paciente no cambia porque falta `patient_terms`),
`user_legal_acceptance` 2 → 12 y `audit_log` 0 → 34. Sumas: `c2-ed-antes-pruebas.json` `a90c42ee…`,
`c2-ed-despues-pruebas.json` `fb29d9f2…` (`c2/v11.1/concurrencia/SHA256SUMS`, fuera del repositorio).

### Evidencia formal de M03 (2026-10-20)

Rama limpia `br-rough-truth-b5oc81xl` / `ep-damp-sound-b5m0fm79`, hija de `rama` restaurada al 2026-10-20 08:55:00 UTC
(antes de la concurrencia). C2 v11.3:
- `verificar-limpia` (solo lectura): huella idéntica a la de `rama` tras `probar-m03`; sin administradores, usuarios de
  prueba ni médicos (`c2-el-antes-verificar.json` `6847d64a…`).
- `evidencia-m03` (código 0): `estadol antes-evidencia` PASS → `scripts/record-test-run.mjs M03` sobre el commit
  `35e205c` con el árbol limpio → `estadol despues-evidencia` PASS, huella idéntica (sin residuos). Resultado:
  unitarias 588/588, integración 94/94, E2E 104/104; 0 FAIL y 0 NO EJECUTADA. Sumas: `c2-el-antes-evidencia.json`
  `291ac843…`, `c2-el-despues-evidencia.json` `08a77fdb…` (fuera del repositorio). La concurrencia (TC-M03-183 a 187) no
  forma parte de esta corrida: se ejecutó aparte en `rama` (sección anterior).

### Preflight de `production` para `0009`–`0012` (2026-10-20, solo lectura)

Herramienta C2 `prod-m03` (fuera del repositorio): solo el modo `preflight`, una transacción READ ONLY con ROLLBACK, sin
`drizzle-kit`. Reutiliza la sesión y la verificación de identidad de `prod-0008` y la verificación del journal de C2 v11.3.
Pruebas simuladas 4/4. Ejecución: código 0, `preflight.json` `79efdecf…`.

| Comprobación | Resultado |
|---|---|
| Identidad | `br-royal-recipe-b54s5hnn` / `ep-wandering-bonus-b5kxacor` / `royal-paper-10258990`, timeline `8e2d8b…`, PostgreSQL 18 (`180006`), rol `neondb_owner` |
| Punto de recuperación | LSN `0/321B638` (2026-10-20 09:49:44 UTC) |
| Migraciones | 9 aplicadas (`0000`–`0008`), iguales a las locales en hash y fecha; la última es `0008` |
| Pendientes | Exactamente `0009`–`0012`, con los SHA-256 fijados (`c2960380…`, `e0dab493…`, `4355a9d2…`, `e5d24a0f…`) |
| `0009` | Sin tabla `specialty` |
| `0010` | `doctor_profile` con **0 filas**; el guard de `0010` pasa; las 15 columnas heredadas, la FK del revisor y los tipos `specialty_enum` y `doctor_verification_status_enum` están presentes |
| `0011` | Sin tablas de revisión, tipos nuevos ni índices de M03 |
| `0012` | Sin sus funciones; en `doctor_profile` solo el trigger de `0008` |
| Esquema | Igual al de `rama` justo antes de aplicar `0009` (migraciones, tablas, triggers, restricciones de perfiles y enum legal) |
| Datos | 4 `user_profile` (1 admin, 3 pacientes), 0 médicos, 2 documentos legales (solo el legado), 10 eventos de auditoría, 0 usuarios de prueba |

Observaciones que no bloquean la migración: (a) `production` no tiene publicado el régimen legal del médico
(`privacy_policy`, `doctor_terms`), así que tras desplegar M03 ningún médico podrá completar su registro hasta publicarlo
con `legal:publish`; (b) `drizzle-kit migrate` aplicaría las cuatro migraciones en una sola transacción; (c) el código de
M03 debe desplegarse después de las migraciones (el código actual de `production` no usa las tablas de médicos).

### Ensayo de `0009`–`0012` en una copia de `production` (2026-10-20)

Rama temporal autorizada por el usuario, hija de `production` con datos actuales: `br-winter-pond-b56r7iy6` /
`ep-hidden-queen-b5xmmlx5` (timeline `70d10e…`). C2 v11.4, plan `ensayar-m03-prod`, sin plan de aplicación. `production`
no se tocó.

**Intento 1: detenido** en `rehearsal-m03-prod` por un error de la herramienta (`OBJECTS12` no estaba exportado en
`c2-0012.cjs`); la transacción terminó en ROLLBACK. Se exportó, se agregó una prueba de los símbolos usados (233/233) y
se repitió. El intento 2 empezó comprobando la huella, que seguía idéntica.

**Intento 2: PASS** (código 0).

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `estadop antes-ensayo` | 09:59:28 | PASS. Huella **idéntica** a la del preflight de `production`; 9 migraciones (`0000`–`0008`); 0 médicos |
| `rehearsal-m03-prod` | 09:59:36 | PASS. En una sola transacción con ROLLBACK, en orden: `0009` (3 especialidades activas; 5 restricciones y 4 índices exactos), `0010` y `0011` (catálogo de `doctor_profile` y de las tablas de revisión **idéntico** al verificado en `rama`), `0012` (7 funciones y 13 triggers idénticos a los de `rama`); tablas de médicos vacías; tras el ROLLBACK, huella idéntica y objetos ausentes |
| `estadop despues-ensayo` | 09:59:45 | PASS. Huella idéntica a `antes-ensayo` |

Sumas: `c2-ep-antes-ensayo.json` `1a46358c…`, `c2-rehearsal-m03-prod.json` `a7bdb825…`, `c2-ep-despues-ensayo.json`
`eb8c4297…` (`c2/v11.4/ensayo/SHA256SUMS`, fuera del repositorio). Validación interna, no formal. Los ficheros se
verificaron por SHA antes de ejecutarse (`0009` `c2960380…`, `0010` `e0dab493…`, `0011` `4355a9d2…`, `0012`
`e5d24a0f…`). El ensayo usa las sentencias de los archivos; la aplicación real la hará `drizzle-kit migrate`, que las
ejecuta en una sola transacción.

### Aplicación de `0009`–`0012` en `production` (2026-10-20)

Autorizada de forma independiente por el usuario. Herramienta C2 `prod-m03` (fuera del repositorio), lanzada con
`Start-Prod-M03.ps1` y el entorno de lista blanca. Configuración de `drizzle-kit` fijada por SHA
(`drizzle-prod-m03.config.cjs` `0a7207d4…`). Antes de ejecutar: pruebas simuladas 10/10, sin red.

**Hechos verificados**

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `previo` (solo lectura) | 10:06:15–10:06:24 | PASS. Identidad `br-royal-recipe-b54s5hnn` / `ep-wandering-bonus-b5kxacor` / `royal-paper-10258990`, timeline `8e2d8b…`, PostgreSQL `180006`, rol `neondb_owner`. 9 migraciones (`0000`–`0008`), `0009`–`0012` pendientes con los SHA fijados, 0 médicos, guard de `0010` pasa, esquema igual al de `rama` antes de `0009`. **Punto de recuperación: LSN `0/3248F20`** (10:06:15) |
| `aplicar --confirm-production-write` | 10:06:43 | Compuerta PASS (previo de menos de 15 minutos, journal y configuración iguales, ensayo `a7bdb825…` PASS); identidad verificada de nuevo; `drizzle-kit migrate` aplicó `0009`–`0012` en una sola transacción, código 0. **Escritura persistente** |
| `posterior`, intento 1 | 10:07:00 | **FAIL solo en Q5** (falso fallo de la herramienta; ver abajo). Q1–Q4 y Q6–Q12 PASS |
| `posterior`, intento 2 | 10:12:34–10:12:46 | **PASS: Q1–Q12** |

Resultado de `posterior` (intento 2):

| Comprobación | Resultado |
|---|---|
| Q1 13 migraciones aplicadas | PASS |
| Q2 `0000`–`0008` intactas (iguales a las del previo) | PASS |
| Q3 hashes de `0009`–`0012` (`c2960380…`, `e0dab493…`, `4355a9d2…`, `e5d24a0f…`; ids 10–13) | PASS |
| Q4 catálogo de especialidades (3 activas) | PASS |
| Q5 esquema de médicos igual al ensayado | PASS |
| Q6 7 funciones y 13 triggers iguales a los del ensayo (los 12 que crea `0012` más `doctor_profile_role_matches` de `0008`, todos sobre tablas de M03) | PASS |
| Q7 triggers habilitados | PASS |
| Q8 datos sin cambios (4 `user_profile`, 3 pacientes, 2 documentos legales, 10 eventos de auditoría, 4 usuarios, 1 admin) | PASS |
| Q9 tablas de médicos vacías | PASS |
| Q10 solo cambios de M03 respecto del previo | PASS |
| Q11 reglas activas en transacción revertida: V1 borrar especialidad, V2 cambiar `code`, V3 `TRUNCATE` de revisiones → `P0001` | PASS |
| Q12 sin residuos tras la validación | PASS |

LSN final registrado por `posterior`: `0/3299980` (10:12:34 UTC). `posterior` solo lee (transacción READ ONLY con
ROLLBACK) y valida en una transacción con savepoints que termina en ROLLBACK; no aplica migraciones ni repara nada.

**Falso fallo de Q5 y corrección.** Q5 comparaba el catálogo de médicos leído *después de `0012`* con la referencia
`tras_0011` del ensayo B2, tomada antes de que existieran los triggers de `0012`. Un diagnóstico de solo lectura
(`diag-q5.cjs`, `diag-q5.json` `072f47fe…`) mostró que la única diferencia eran 9 triggers, todos de `0012` sobre
`doctor_identity_verification`, `doctor_license_verification` y `doctor_profile`. Columnas, tipos, restricciones e
índices eran idénticos, y Q6 ya confirmaba los 13 triggers. Corrección: la referencia de Q5 es `tras_0011` más
exactamente esos 9 triggers, tomados del ensayo de `0012`. Ambas referencias están fijadas por SHA y nunca se leen de
`production`. Las demás categorías se siguen comparando sin cambios, y la herramienta se detiene si el número de
triggers añadidos no es 9.

Pruebas locales de `prod-m03` tras la corrección: **15/15**, sin red ni procesos. Incluyen 5 de regresión de Q5:

- la referencia y su origen;
- el esquema esperado pasa;
- el catálogo observado en `production` no da falso fallo, mientras que la comparación antigua sí falla;
- falta, sobra, se renombra o se reordena un trigger → FAIL;
- se quita, se añade o cambia una columna, un tipo, una restricción o un índice → FAIL.

Las migraciones `0009`–`0012` del repositorio no cambiaron.

Sumas SHA-256 (fuera del repositorio, `c2/prod-m03/`):

| Archivo | SHA-256 |
|---|---|
| `resultados-aplicacion/previo.json` | `766e3554453e3ec4185f759b67b52461dc266a88ff269b2300515ef5e047f794` |
| `resultados-aplicacion/aplicar.json` | `1adb4b3b7b1d632e68bb08689dd97fc8dd586e048c2893e921622f90a1b743ab` |
| `resultados-aplicacion/posterior.json` (intento 2) | `e23779131c02eae665f85427bfe9d18199e863ba36b5663610d8725759cb4002` |
| `resultados-aplicacion/diag-q5.json` | `072f47fe89abb40cb532a026d5aaa93f25a2bc9ce9a447ca4323f0929c397116` |
| `SHA256SUMS` (herramienta, pruebas y resultados) | `ef2ee64833ac21d2c879a96bfe76d9284dd75c3f3527cd6934665c7a830d45a8` |

El `posterior.json` del intento 1 se sobrescribió con el del intento 2; su resultado consta en esta sección. Es una
validación interna, no una evidencia formal (`record-test-run.mjs`).

**Pendientes (no realizados)**

- **Código de M03 sin desplegar** en `production`; desplegarlo requiere una autorización aparte.
- **Régimen legal del médico sin publicar** a la fecha de esta sección (2026-10-20). **Actualización del 2026-10-28:** se
  informó que se publicaron en `production` los documentos provisionales `privacy_policy@dev-1` y
  `doctor_terms@dev-1` («DOCUMENTO PROVISIONAL - SOLO DESARROLLO»). No hay evidencia versionada de esa publicación
  (salida de `legal:publish`, inventario de `legal_document` ni eventos `legal_document.published`): queda **pendiente
  de verificación**. Publicar documentos no despliega el código de M03, y el registro y la aceptación de un médico en
  `production` no se han probado de extremo a extremo. Como `privacy_policy` es común a ambos roles, aplica el riesgo 21.
  Texto original de este punto (`privacy_policy`, `doctor_terms` con `legal:publish`): hasta publicarlo,
  ningún médico podrá completar su registro.
- Ventana de restauración de Neon al LSN `0/3248F20` sin verificar.
- Suites completas sin ejecutar contra `production`.
- La evidencia de esta ejecución vive fuera del repositorio.
- Pendiente de decidir qué hacer con `br-winter-pond-b56r7iy6`, que contiene datos reales.

### Régimen legal de PRUEBA del médico en la rama `m03-flujo-medicos` (2026-10-20)

Objetivo: probar el registro de médicos y la aceptación de documentos con un régimen legal de ejemplo, **sin**
declarar vigente un régimen real. Los datos de prueba son persistentes en la rama, por decisión del usuario.

**Publicación en `production`: no se hizo.** El `previo` de `production` (C2 `legal-test`, solo lectura, 10:29:55 UTC)
pasó: inventario exacto, 2 documentos de legado y LSN `0/32F9378`. Aun así, la publicación se detuvo por la condición
del usuario: el código no garantiza que `privacy_policy@TEST-1` no acabe usándose como política de pacientes.

- `PublishLegalDocumentsUseCase` admite publicar más tarde solo `patient_terms` si ya hay un `privacy_policy` vigente.
  Es el comportamiento intencionado N1, cubierto por TC-M03-023.
- Ninguna comprobación distingue un `privacy_policy` de prueba.

Por eso se eligió una rama de pruebas.

**Rama.** Antes de elegirla se revisó `ensayo-m03-prod` (`br-winter-pond-b56r7iy6`) en solo lectura: estaba en `0008`
(sin `0009`–`0012`), con huella idéntica a la de `production` antes de `0009` y con datos reales. Se descartó. El
usuario creó en la consola de Neon la rama `m03-flujo-medicos`: `br-floral-mode-b5hqaix0` / `ep-cool-base-b55xjarv`.
Es hija de `production` con datos actuales; timeline `291fdc…`.

**Documentos** (fuera del repositorio, `c2/legal-test/`):

| Tipo | Versión | SHA-256 |
|---|---|---|
| `privacy_policy` | `TEST-1` | `726d25e958d50883d58674881273dae002b4696b7e56267e1a18d29240cc6dab` |
| `doctor_terms` | `TEST-1` | `f5f1819ef224eefca68d9f5e6c07518a665131422bc6f56b6d87ae8a3dced77b` |

Los textos son ficticios. El título lleva `[TEST / NO VIGENTE]` y un aviso inicial dice: documento de prueba, sin valor
legal, no aprobado por nadie, y su aceptación no es un consentimiento real. No tienen firmas, aprobaciones ni fechas de
entrada en vigor.

**Herramienta.** C2 `flujo-medicos` (`Start-Flujo-Medicos.ps1`), con el destino fijado en `destino-flujo.json`.

- Rechaza `production`, `rama`, `br-rough-truth` y `ensayo-m03-prod` por branch, endpoint y timeline.
- Ejecuta el CLI del repositorio `legal:publish --audience doctor`. El código del CLI está fijado por SHA: 8 archivos
  del commit `7ab6b92`.
- Entorno: lista blanca, URL de la rama y Resend/R2 neutralizados.

Pruebas simuladas antes de ejecutar: 34/34.

**Hechos verificados**

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `previo` (solo lectura) | 10:40:27 | PASS. S1 13 migraciones con hash; S2 esquema de médicos igual al de `production` tras `0012`; S3 7 funciones y 13 triggers; S4 3 especialidades; S5 0 médicos; P1–P4 inventario legal exacto (solo `privacy_notice@1` y `terms_and_conditions@1`), sin futuros, sin publicaciones previas, `TEST-1` libre. LSN `0/332D9E0` |
| `publicar -ConfirmBranchWrite` | 10:40:58 | Código 0. `privacy_policy` TEST-1 y `doctor_terms` TEST-1, con el mismo `published_at` (`2026-10-20T10:40:58.491Z`). **Escritura persistente en la rama** |
| `posterior`, intento 1 | 10:41:07 | **FAIL solo en Q7** (falso fallo de la herramienta; ver abajo); Q9 devolvía un objeto en lugar de un booleano |
| `posterior`, intento 2 | 10:43:25 | **PASS: Q1–Q10** |

Resultado de `posterior` (intento 2):

| Comprobación | Resultado |
|---|---|
| Q1 dos documentos nuevos, versión `TEST-1` | PASS |
| Q2 contenido y `content_hash` idénticos a los archivos | PASS |
| Q3 mismo `published_at`, vigentes | PASS |
| Q4 documentos de legado intactos | PASS |
| Q5 dos eventos `identity.legal_document.published` | PASS |
| Q6 aceptaciones sin cambios | PASS |
| Q7 solo cambian `legal_document` y `audit_log` | PASS |
| Q8 régimen del médico completo (`privacy_policy` y `doctor_terms` en `TEST-1`) | PASS |
| Q9 pacientes en el régimen de legado (sin `patient_terms`) | PASS |
| Q10 esquema M03 intacto (S1–S5) | PASS |

Vigentes en la rama: `privacy_policy` TEST-1, `doctor_terms` TEST-1, `privacy_notice` 1 y `terms_and_conditions` 1.
LSN final: `0/3330F10` (10:43:25 UTC). `posterior` solo lee: dos transacciones READ ONLY con ROLLBACK, sin
validaciones de escritura.

**Falso fallo de Q7 y corrección.** El intento 1 mostró 10 diferencias, todas en `legal_document` o `audit_log` salvo
`identity_audit_log`. Ese campo es un contador derivado de `audit_log` (acciones `identity.%`, `c2-checks.cjs`) y la
lista de diferencias admitidas no lo incluía.

Corrección en `legal-test-publish.cjs` (`q7-q9.diff`):

- Q7 admite `identity_audit_log` solo si sube exactamente lo mismo que `audit_log` y que los eventos de publicación
  nuevos, y si eso coincide con los documentos nuevos. El resto de la huella sigue estricto.
- Q9 devuelve un booleano explícito con las mismas condiciones.

Pruebas locales: **38/38**, sin red. Incluyen 4 de regresión:

- el estado observado pasa, y la lista antigua no lo admitía;
- un cambio en otra tabla o en otro campo de la huella falla;
- `identity_audit_log` no oculta eventos ajenos, de más o de menos;
- Q9 siempre es booleano y detecta los estados incorrectos.

Sumas SHA-256 (fuera del repositorio, `c2/prod-m03/`):

| Archivo | SHA-256 |
|---|---|
| `resultados-flujo/previo.json` | `8a23a502cb3fc1100f96e229c3c09095942af868f97130d0588e8ad57fdea9eb` |
| `resultados-flujo/publicar.json` | `a99c6534bdd8b64dbc8235a634b36d1b59ddf6f5070353b91c206d3d63a9cde5` |
| `resultados-flujo/posterior.json` (intento 2) | `9dc5da3be8dc04abdb45013b8fbbb0f7933adb992e4521ef95672238e47b3826` |
| `q7-q9.diff` | `236d946bd7bad3ff81a777e6fbc77f2f893f6afca6cd782647749a9ff6089f60` |
| `SHA256SUMS` | `17126f16250186470566b1a7381cc010a999d19ffd27eef9e8d6df9a50199833` |

El `posterior.json` del intento 1 se sobrescribió; su resultado consta en esta sección. Es una validación interna, no
una evidencia formal.

**Pendientes (no realizados)**

- No se ha probado el flujo de registro de médicos en la rama. Hace falta levantar el backend local contra
  `br-floral-mode-b5hqaix0` por C2, con un procedimiento y una autorización aparte.
- `production` sigue sin régimen legal del médico. Publicar ahí requiere documentos reales aprobados, o antes un guard
  que impida que un `privacy_policy` de prueba quede en el régimen del paciente (riesgo 21).
- Código de M03 sin desplegar.
- Decidir qué hacer con `br-floral-mode-b5hqaix0` (contiene datos reales copiados de `production` y los documentos
  TEST-1) y con `br-winter-pond-b56r7iy6` (desactualizada y con datos reales).

### Flujo de registro de un médico de prueba en `m03-flujo-medicos` (2026-10-20)

Recorrido por HTTP del registro de un médico con el backend local de `feat/m03-doctors` (`ec6a220`), conectado solo a
`br-floral-mode-b5hqaix0` / `ep-cool-base-b55xjarv` (timeline `291fdc…`). La cuenta de prueba y sus filas son
permanentes en la rama, por decisión del usuario. No se desplegó código ni se tocó `production`.

**Herramienta**

- **Runner** en `apps/backend/test/flujo/` (sin commit):
  - `doctor-registration.flow-spec.ts`, `flow-guard.ts` y `jest-flujo.json`;
  - lo excluyen las suites unitaria y E2E, por su `testRegex`.
- **Arranque:** `Test.createTestingModule` con el `AppModule` real (Drizzle, Better Auth, UnitOfWork y auditoría
  reales), escuchando solo en `127.0.0.1`.
- **Dobles:**
  - almacén privado en memoria (`FakeDocumentStorage`): nada va a R2;
  - captura del enlace de verificación en memoria: nada va a Resend.
- **`flow-guard.ts`** se importa antes que el backend. Exige la rama fijada y `C2_COMMITTED_FIXTURES=flujo-medicos-accepted`.
- **Identidad:** el runner comprueba la identidad del pool del propio backend al arrancar y antes de cada paso que
  escribe.
- **Wrapper:** C2 `flujo-registro` (`Start-Flujo-Registro.ps1`): `previo`, `flujo -ConfirmBranchWrite`, `posterior`.
  - Entorno de lista blanca, URL de la rama y Resend/R2 neutralizados.
  - Runner fijado por SHA.
  - La salida completa del runner se guarda sin mostrarse y se analiza en busca de correos ajenos, CURP reales y
    secretos.
- **Comprobaciones previas:** pruebas simuladas 46/46. Fuera de C2 (sin identidad, con la de `production` o sin el
  marcador), el runner se rechaza al cargar, sin conexiones.

**Recorrido real** (`me-doctor.controller.ts`, `me.controller.ts`, Better Auth):

1. Documentos legales vigentes del médico.
2. Alta de la cuenta en Better Auth y verificación del correo.
3. Especialidades (requieren sesión).
4. Perfil de médico.
5. Aceptación de `privacy_policy` y `doctor_terms` TEST-1.
6. INE y cédula sintéticas.
7. Consulta del estado.

La aceptación va antes de los envíos para que el último envío registre `doctor.registration.completed`.

**Hechos verificados**

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `previo`, intento 1 | 10:57:40 | PASS (S1–S5; régimen TEST-1 del médico; pacientes en legado; 0 cuentas de prueba). LSN `0/335B4D0` |
| `flujo`, intento 1 | entre 10:57:40 y 10:58:38 | **Detenido en el paso 2, sin escrituras**: `GET /specialties` respondió 401 porque el controlador usa `SessionGuard`, y el runner la trataba como pública. Un `previo` repetido (10:58:38) confirmó 0 cuentas de prueba y 0 médicos. Corrección autorizada: la consulta pasa a hacerse con sesión, después de verificar el correo |
| `previo`, intento 2 | 11:10:08 | PASS. LSN `0/3385BC0` |
| `flujo -ConfirmBranchWrite`, intento 2 | entre 11:10:08 y 11:10:56 | Los 10 pasos con los códigos esperados: legales 200, alta 200, verificación 200, especialidades 200, perfil 201, aceptaciones 201, INE 201, cédula 201 (`initial`), estado 200 y `/me` 200. Identidad del pool comprobada en cada escritura. Salida: 0 correos ajenos, 0 CURP, 0 secretos; logger con 60 líneas sin datos ajenos. **Escritura persistente en la rama: una cuenta de prueba.** Código de Jest 1: la última aserción del runner buscaba `canOperate` en `/me/doctor/status` (ver abajo) |
| `posterior`, intento 1 | 11:10:56 | **FAIL en R8 y R9** (falsos fallos de la herramienta; ver abajo). R1–R7, R10 y R11 PASS |
| `posterior`, intento 2 | 13:04:02 | **PASS: R1–R11** |

Resultado de `posterior` (intento 2):

| Comprobación | Resultado |
|---|---|
| R1 identidad y timeline iguales a los de `previo` | PASS |
| R2 los 10 pasos con los códigos HTTP esperados | PASS |
| R3 exactamente una cuenta nueva `@m00.test.invalid`, con el correo verificado | PASS |
| R4 `user_profile` con rol doctor y `doctor_profile` con la especialidad elegida (`medicina_general`) | PASS |
| R5 dos aceptaciones, exactamente `doctor_terms@TEST-1` y `privacy_policy@TEST-1` | PASS |
| R6 INE y cédula, una de cada, en `pending` | PASS |
| R7 exactamente 6 eventos: `doctor.profile.created`, 2 × `identity.legal_document.accepted`, `doctor.identity_verification.submitted`, `doctor.license_verification.submitted` y `doctor.registration.completed` | PASS |
| R8 estado derivado: `pending` en las dos líneas, `registrationComplete=true`, `missing=[]`; en `GET /me`, rol doctor y `canOperate=false` | PASS |
| R9 ningún cambio fuera de las tablas que el registro debía tocar | PASS |
| R10 esquema M03 (S1–S4), migraciones y documentos legales intactos | PASS |
| R11 la salida sin datos ajenos | PASS |

LSN final: `0/33B55B8` (13:04:02 UTC). `posterior` solo lee: tres transacciones READ ONLY con ROLLBACK, sin escrituras
ni procesos. No se volvió a ejecutar `flujo`.

**Falsos fallos de R8 y R9 y corrección** (`flujo-registro.cjs`, `r8-r9.diff`):

- **R8.** Buscaba `canOperate` en `GET /me/doctor/status`, que no lo devuelve. Ese campo lo añade `GET /me`:
  `registrationStatus.canOperate = status === 'approved'` (`doctor-profile-section.provider.ts`). Ahora se lee de
  `GET /me` y debe ser exactamente `false`; si es `true` o falta, R8 falla. El resto de condiciones del estado no cambió.
- **R9.** La huella guarda, por campo crítico, sus no nulos y las versiones de su tabla. El filtro no las cubría para
  `user`, `account`, `session` y `user_profile`. Ahora se admiten solo para esas cuatro tablas; los demás campos y tablas
  siguen estrictos. La referencia sigue siendo `previo.json` y no se regeneró.

Pruebas locales: **50/50**, sin red. Incluyen 4 de regresión:

- R8 pasa con el resultado real del runner y falla si `canOperate` es `true`, falta o solo aparece en
  `/me/doctor/status`;
- R9 admite solo las 11 diferencias de campos críticos observadas en las cuatro tablas;
- una diferencia en cualquier otra tabla o campo crítico ajeno hace fallar R9;
- las referencias salen de `previo.json` y la evaluación no muta sus entradas.

Sumas SHA-256 (fuera del repositorio, `c2/prod-m03/`):

| Archivo | SHA-256 |
|---|---|
| `resultados-registro/previo.json` (intento 2) | `0fdf96b800a40714dae87682367cf73b9435a7d703ba6b482d3b0d13c5bdf382` |
| `resultados-registro/flujo.json` | `11867a63c0a1a49cff9b0bec152c8552183bea3d159cef36fc811829215d6ff5` |
| `resultados-registro/salida-runner.log` (no se muestra) | `bb486761cb282501d4601ae4eff3e12e315372e573941827061b82f371f0703c` |
| `resultados-registro/posterior.json` (intento 2) | `dee7b9cfc5dd38f0b7c5636b98c265e6994eae22ac4c08cc1344e30c8ddddd2a` |
| `r8-r9.diff` | `19ce9070456163314184af13352bcd10385232a2fdd6568f9c8cfc9e5930cff7` |
| `SHA256SUMS` | `e86c657aeeb74b52b8fac97b8b699fb8f8ef5233b5318c7fe6da9eaf0f305416` |

Los `previo.json` y `posterior.json` de los primeros intentos se sobrescribieron; sus resultados constan en esta
sección. Es una validación interna, no una evidencia formal.

**Pendientes (no realizados)**

- La última aserción del runner (`doctor-registration.flow-spec.ts`) sigue buscando `canOperate` en
  `/me/doctor/status`. Se corregirá antes de cualquier nueva ejecución (cambia su SHA fijado en C2).
- El runner en `apps/backend/test/flujo/` no está en ningún commit: decidir si se versiona.
- No se probó la revisión del admin (aprobar o rechazar la INE y la cédula). Además, los documentos de la cuenta de
  prueba apuntan a claves que no existen en R2, porque el almacén estaba en memoria.
- `production` sigue sin régimen legal del médico (riesgo 21) y sin el código de M03 desplegado.
- Decidir qué hacer con `br-floral-mode-b5hqaix0` (datos reales copiados de `production`, documentos TEST-1 y la cuenta
  de prueba) y con `br-winter-pond-b56r7iy6`.

### Revisión del admin sobre el médico de prueba en `m03-flujo-medicos` (2026-10-20)

Recorrido por HTTP de la revisión de la INE y la cédula del médico de prueba ya registrado (sección anterior), con el
backend local de `feat/m03-doctors` conectado solo a `br-floral-mode-b5hqaix0` / `ep-cool-base-b55xjarv` (timeline
`291fdc…`). Datos permanentes en la rama, por decisión del usuario. No se desplegó código ni se tocó `production`.

**Cambios previos en el runner** (`apps/backend/test/flujo/`, sin commit):

- La aserción final del registro lee `canOperate` de `GET /me` mediante `flow-checks.ts`. Sus pruebas unitarias están
  en `flow-checks.spec.ts` (11): `false` pasa; `true`, ausente, `null` o texto fallan.
- La salvaguarda `flow-guard.ts` se generalizó a los dos runners.
- `jest-flujo.json` encuentra los dos `*.flow-spec.ts`. Por eso cada wrapper de C2 ejecuta solo el suyo
  (`--runTestsByPath`): un registro accidental habría creado otra cuenta.
- Revisión de los archivos: sin secretos, credenciales ni datos personales. La contraseña y los tokens se generan en
  tiempo de ejecución y no se imprimen; correos `@m00.test.invalid` y CURP sintética.
- Validación local: oxlint y `tsc` limpios; suite unitaria 50/50 suites y 614/614 pruebas.

**Herramienta**

- **Runner:** `doctor-review.flow-spec.ts`, con el `AppModule` real y el almacén y el correo en memoria. Las
  comprobaciones puras están en `review-checks.ts`, con su `review-checks.spec.ts` (15).
- **Wrapper:** C2 `revision-admin` (`Start-Revision-Admin.ps1`: `previo`, `revision -ConfirmBranchWrite` y
  `posterior`), con el runner fijado por SHA. Plan: `PLAN-revision-admin.md`.
- **Actor administrador**, aprobado por el usuario: una cuenta `@m00.test.invalid` dada de alta y verificada por HTTP,
  y promovida con `createAdmin`, sin endpoint. Es una excepción de prueba a DT-12, solo en esta rama: `admin:bootstrap`
  falla porque la rama ya tiene el admin copiado de `production`, que no se usó.
- **Acceso del médico:** su contraseña nunca se guardó. Se recuperó con el flujo real de recuperación de contraseña
  (enlace capturado en memoria); Better Auth revoca sus sesiones anteriores.
- **Exclusiones:** no se abren documentos, porque eso registraría `*_document.viewed` de objetos que no existen.
- **Pruebas simuladas** antes de ejecutar: 58/58. Fuera de C2, el runner se rechaza al cargar.

**Hechos verificados**

| Paso | Hora (UTC) | Resultado |
|---|---|---|
| `previo` | 13:23:04 | PASS: esquema S1–S4; un solo médico de prueba, con INE 1 y cédula 1 pendientes (los ids del registro); 0 admins de prueba; huella y admin heredado registrados. LSN `0/33DFD78` |
| `revision -ConfirmBranchWrite` | entre 13:23:04 y 13:24:10 | Código 0. 18 pasos con los códigos esperados: recuperación del médico (200, 200; inicio de sesión 200); alta y verificación del admin (200, 200) y promoción; negativos N1 403 (médico en ruta del admin), N2 400 (id no UUID), N3 404 (UUID inexistente) y N4 400 (motivo corto); A1 aprobar INE 1 → 200; A2 repetir → 409; R1 rechazar cédula 1 → 200; S1 reenvío de cédula → 201 (intento 2, `resubmission`); A3 aprobar cédula 2 → 200; historial y colas → 200. Los 5 estados derivados coincidieron exactamente; `canOperate=true` solo al final. **Escritura persistente en la rama** |
| `posterior`, intento 1 | 13:24:10 | **FAIL en V6 y V10** (ver abajo). V1–V5 y V7–V9 PASS |
| `posterior`, intento 2 | 13:35:24 | **PASS: V1–V10** |

Estados derivados observados (de `/me/doctor/status` y `canOperate` de `/me`):

| Etapa | status | identity | professional | canOperate |
|---|---|---|---|---|
| inicial | `pending` | `pending` | `pending` | `false` |
| INE aprobada | `pending` | `approved` | `pending` | `false` |
| cédula rechazada | `rejected` | `approved` | `rejected` | `false` |
| cédula reenviada | `pending` | `approved` | `pending` | `false` |
| aprobado | `approved` | `approved` | `approved` | `true` |

En todas las etapas, `registrationComplete=true` y `missing=[]`: un rechazo cuenta como entregado (D-30).

Resultado de `posterior` (intento 2):

| Comprobación | Resultado |
|---|---|
| V1 identidad y timeline iguales a los de `previo` | PASS |
| V2 todos los pasos y los 5 estados | PASS |
| V3 exactamente un admin de prueba; sigue habiendo un solo médico de prueba | PASS |
| V4 INE 1 `approved` por el admin de prueba y purgada (claves NULL, `documents_deleted_at`) | PASS |
| V5 cédula 1 `rejected` con el motivo `TEST: documento ilegible (prueba M03)`; cédula 2 `approved` (`resubmission`); ambas revisadas por el admin de prueba | PASS |
| V6 exactamente 5 eventos: `doctor.identity_verification.approved`, `doctor.license_verification.rejected` y `doctor.license_verification.approved` del admin; `doctor.license_verification.submitted` y `doctor.status.returned_to_pending` del médico, este último sobre su `doctor_profile` con `{from:'rejected', cause:'license_resubmitted'}` | PASS |
| V7 admin heredado intacto (perfil y sesiones) | PASS |
| V8 ninguna diferencia fuera de las tablas de la revisión; `doctor_profile` y aceptaciones sin cambios | PASS |
| V9 esquema M03 y documentos legales intactos | PASS |
| V10 salida sin datos ajenos, sin secretos y sin claves de objetos en las respuestas | PASS |

LSN final: `0/340F2D0` (13:35:24 UTC). `posterior` solo lee (transacciones READ ONLY con ROLLBACK). No se volvió a
ejecutar `revision`.

**Falsos fallos de V6 y V10 y corrección** (`revision-admin.cjs`, `flujo-registro.cjs` y `review-checks.ts`;
`v6-v10.diff`):

- **V6.** El plan esperaba 4 eventos. Al reenviar la cédula rechazada, el dominio registra además
  `doctor.status.returned_to_pending` (`recordStatusTransition` en `doctor-submissions.use-cases.ts`; diseño v3 §I).
  Ahora se esperan 5 y se comprueban el actor, la entidad y los metadatos de ese evento.
- **V10.** El análisis de la salida contaba la etiqueta del tipo de correo `"password_reset"` (lista `correos_capturados`)
  como un posible secreto. Se revisó su contexto con los valores tachados: no había contraseña, token ni URL. Ahora se
  quita solo ese literal entre comillas; `password`, `token=` y las URLs de conexión siguen contando.
- `posterior` vuelve a analizar el archivo de salida guardado con el análisis vigente y registra su SHA.

Pruebas locales: **62/62** de C2 y **26/26** unitarias de `test/flujo`. Las de regresión cubren:

- V6 con los 5 eventos observados; la lista antigua de 4 ya no basta;
- V6 con eventos de más o de menos, actores cambiados, otra entidad o metadatos distintos;
- V10 con la etiqueta frente a secretos reales;
- V10 con la salida real analizada de nuevo: 0 correos ajenos, 0 CURP, 0 secretos.

Sumas SHA-256 (fuera del repositorio, `c2/prod-m03/`):

| Archivo | SHA-256 |
|---|---|
| `resultados-revision/previo.json` | `5acb3d8f1bca6cca24ea5080306c253fc206bcdc3dfe05a21dcbe7ed5daf8140` |
| `resultados-revision/revision.json` | `deb02d34202397298f3fe39752944c7a9de987246534de8082b4202985a27381` |
| `resultados-revision/salida-runner.log` (no se muestra) | `0cf1fadd8a88bd6df08be1dae3d80c10cb069a6fb279f39afa60fe760dd1b123` |
| `resultados-revision/posterior.json` (intento 2) | `d41ced681c09f2e1d89990fded2b9b8e1642f99bc626c8f9f1eef358f12b731a` |
| `v6-v10.diff` | `f57050f979ce065592f3a626c885096e44203a505d215487bd730a5cbaec94a5` |
| `SHA256SUMS` | `a2740fc5ac43a5f83ac1353faf8a18730956bd4392d1473a55114ea9e0c6e24d` |

El `posterior.json` del intento 1 se sobrescribió; su resultado consta en esta sección. Es una validación interna, no
una evidencia formal.

**Pendientes (no realizados)**

- Los runners y las pruebas de `apps/backend/test/flujo/` siguen sin commit.
  - Recomendación: versionarlos, con etiquetas `TC-M03-nnn` en los títulos, la categoría `*.flow-spec.ts` documentada
    en `docs/testing/README.md` y la nota de que solo se ejecutan mediante C2.
  - Solo son reproducibles con C2 y una rama preparada (régimen TEST-1, sin cuentas de prueba previas), y cada ejecución
    deja datos permanentes.
- No se probaron la apertura de documentos por el admin ni la purga sobre objetos reales de R2: los objetos de la cuenta
  de prueba no existen.
- El médico de prueba queda `approved`, con `canOperate=true`, en la rama. El admin de prueba queda como cuenta
  permanente.
- `production` sigue sin régimen legal del médico (riesgo 21) y sin el código de M03 desplegado.
- Decidir qué hacer con `br-floral-mode-b5hqaix0` y `br-winter-pond-b56r7iy6`.

### Validación con infraestructura real en la rama C2 persistente (2026-11-03)

Ejecuciones con el lanzador C2 (`pnpm c2`, `scripts/c2-run.ts`) contra la rama `br-shy-pond-b50a3m8f`, creada a partir
de la base de desarrollo (`br-royal-recipe-b54s5hnn`, llamada `production` en documentos anteriores) y conservada como
entorno C2 **persistente**: los registros que las pruebas dejan en ella son sintéticos. El lanzador carga solo `C:\pei-c2\.env.c2`, ejecuta Jest desde un directorio sin `.env` (dotenv informó
«injected env (0)»), deja Resend y R2 vacíos fuera del modo `r2` y, antes de cada ejecución, confirma la identidad real
de Neon (`neon.project_id`, `neon.branch_id` y `neon.endpoint_id`). Cada ejecución se comparó con una huella de solo
lectura de 13 tablas (`user`, `session`, `account`, `verification`, `user_profile`, `patient_profile`, `doctor_profile`,
`doctor_identity_verification`, `doctor_license_verification`, `legal_document`, `user_legal_acceptance`, `audit_log` y
`specialty`): recuento total y hash md5 de las filas anteriores a un instante de corte.

| Estado | Significado en esta sección |
|---|---|
| Aprobado | Ejecutado contra la infraestructura indicada y sin fallos |
| Fallido | Ejecutado con al menos un fallo (ninguno en estas ejecuciones) |
| Pendiente / no ejecutado | No se ejecutó; se indica el motivo |
| Infraestructura real | PostgreSQL de la rama C2 |
| Dobles | Pruebas locales sin BD (almacenamiento en memoria, entornos simulados) |

#### PostgreSQL (2026-11-03)

| Ejecución | Casos | `C2_RUN_ID` | Infraestructura | Resultado | Rollback |
|---|---|---|---|---|---|
| Concurrencia (`doctors.conc-spec.ts`), conexión directa | TC-M03-183 a 187 | `c2-20261103212355-50d8` | PostgreSQL C2 real | **5 aprobadas** | No: datos confirmados, autorizados (`c2-persistent-accepted`) |
| Integración (`doctors.int-spec.ts`) | TC-M03-172 a 176 y 178 a 182 | No conservado (la salida filtrada de la consola lo omitió) | PostgreSQL C2 real | **10 aprobadas** | Sí (`withRollback`) |
| Better Auth (`admin-bootstrap-better-auth.int-spec.ts`) | TC-M02-118 ×2, 119, 120 y TC-M03-293 | `c2-20261103214452-f673` | PostgreSQL C2 real | **5 aprobadas**; TC-M02-121 ×2 **pendientes** | Sí (`withRollback`) |

**Concurrencia.** Antes de la ejecución, `doctors.conc-spec.ts` se adaptó para reutilizar los documentos legales
vigentes de la rama (`privacy_policy@dev-1` y `doctor_terms@dev-1`) en lugar de publicar otros. Huella (corte
2026-11-03 21:23:38 UTC):

| Tabla | Antes | Después | Creados por la ejecución |
|---|---|---|---|
| `user` | 7 | 16 | 9 |
| `user_profile` | 6 | 15 | 9 |
| `doctor_profile` | 0 | 5 | 5 |
| `doctor_identity_verification` | 0 | 7 | 7 |
| `doctor_license_verification` | 0 | 8 | 8 |
| `user_legal_acceptance` | 10 | 20 | 10 |
| `audit_log` | 26 | 60 | 34 |
| `session`, `account`, `verification`, `patient_profile`, `legal_document`, `specialty` | — | — | 0 |

- El hash de las filas anteriores al corte es idéntico en las 12 tablas con `created_at`; `legal_document` conserva el
  mismo hash completo y los documentos vigentes no cambiaron.
- `user_legal_acceptance` no tiene `created_at`, por lo que su hash completo cambia al añadir filas. Una comprobación de
  solo lectura aparte, sobre las filas que no pertenecen a los perfiles de la ejecución y con el mismo método, dio el
  mismo hash que antes (10 filas preexistentes sin cambios). Esa comprobación se vio en la consola de la sesión; no se
  conservó en un archivo.
- Los usuarios de la ejecución llevan el `C2_RUN_ID` en su id (`gst-m00-test-c2-20261103212355-50d8-…`); los perfiles,
  médicos, revisiones, aceptaciones y eventos se identifican por pertenecer a esos usuarios. Permanecen en la rama C2.

**Integración.** Las 13 tablas conservaron el mismo recuento y el mismo hash (corte 2026-11-03 21:35:24 UTC); no
persistió ningún registro y los documentos legales vigentes no cambiaron. Antes de esta ejecución se endureció
TC-M03-181: sus aserciones comparan booleanos y nunca imprimen listas, nombres, CURP ni correos de otros registros.
Durante la ejecución Jest avisó «did not exit one second after the test run»: la suite no cerraba el pool. El cierre
(con la comprobación `totalCount === 0` y RT-M03-17) se añadió **después** de esta ejecución y todavía no se ha
ejecutado contra C2.

**Better Auth.** La rama conserva un administrador copiado de la base de desarrollo, así que el bootstrap inicial no es aplicable:
los dos escenarios TC-M02-121 (bootstrap correcto y H1) se conservan sin cambios y quedan marcados como **pendientes en
C2** (`it.skip` con la etiqueta «[pendiente en C2: la rama ya tiene administrador]»); se validarán en una rama sin
administradores. Se quitaron las precondiciones `admins === 0` y `test_users === 0`, los correos sintéticos usan
`testTag()` con `C2_RUN_ID` y se añadió TC-M03-293 (administrador existente: el bootstrap aborta sin crear nada). Las 13
tablas conservaron el mismo recuento y el mismo hash (corte 2026-11-03 21:44:44 UTC): no persistieron usuarios, cuentas,
sesiones, verificaciones, perfiles ni eventos de auditoría. La suite terminó sin el aviso de recursos abiertos y su
registro de salida no contiene correos, cookies, tokens, contraseñas ni cadenas de conexión. Esta suite crea su propia
instancia de Better Auth con un secreto fijo de pruebas, no el de `.env.c2`.

**Evidencias de PostgreSQL.** Huellas de solo lectura de antes y después (`before.json`/`after.json`,
`before-int.json`/`after-int.json`, `before-auth.json`/`after-auth.json`) y registro de salida de Better Auth
(`run-auth.log`), en el directorio temporal de la sesión, fuera del repositorio y sin versionar. No se conservó en
archivo la salida de las ejecuciones de concurrencia ni de integración: sus resultados por caso se vieron en la consola.
Estas ejecuciones son anteriores a los paquetes de evidencias del lanzador (2026-11-06): no hay un paquete que permita
reproducir o comprobar sus resultados (pendiente 27).

**Salvaguardas C2 (TC-M03-277 a 292, 294 a 297; RT-M03-17 y 18).** Pruebas **unitarias locales, sin BD** (dobles y
entornos simulados): pasaron en `pnpm test` (766/766 en la última corrida local). No son pruebas contra infraestructura
real; el lanzador y las salvaguardas sí se usaron en las ejecuciones reales de esta sección. TC-M03-293 es la única de ese
rango ejecutada contra PostgreSQL C2.

#### R2 (2026-11-04 y 2026-11-10)

Pruebas de M03 contra Cloudflare R2 real con el lanzador C2 (`pnpm c2`, `scripts/c2-run.ts`). El lanzador carga solo
`C:\pei-c2\.env.c2`, ejecuta Jest desde un directorio sin `.env` (dotenv: «injected env (0)») y deja Resend vacío. En el
modo `r2` exige `R2_BUCKET_NAME === C2_EXPECTED_BUCKET === pei-docs-c2-test`. Antes de cada ejecución, el preflight
confirma la identidad real de Neon (`neon.project_id`, `neon.branch_id` y `neon.endpoint_id`) y el acceso al bucket
(`HeadBucket`).

| Destino | Valor |
|---|---|
| Proyecto Neon | `royal-paper-10258990` |
| Rama | `br-shy-pond-b50a3m8f` (C2 persistente; nunca `production`) |
| Endpoint | `ep-withered-block-b5e8v9ov` (conexión directa) |
| Bucket R2 | `pei-docs-c2-test` (exclusivo de C2) |

**Identificación de los objetos (opción A).** Las claves conservan la gramática de producción (`doctor-identity/…`,
`doctor-licenses/…`, `doctor-photos/…`). La ejecución se identifica por el `doctorProfileId`:
- en las pruebas del adaptador, el UUID v5 derivado de `C2_RUN_ID`;
- en las de integración, el de los médicos sintéticos que crea la ejecución, registrados con su origen (`createDoctor`)
  y la cuenta sintética de la ejecución que los creó.

Un manifiesto por ejecución registra cada operación, sin bytes, credenciales ni datos personales. La limpieza solo
borra las claves que el manifiesto registró como subidas por la ejecución. `ListObjects` solo se usa en la comprobación
final, por prefijos de la ejecución.

**Ejecuciones válidas (2026-11-10, commit `91de98f`).** Ambas registran `workingTreeDirty: true`. Incluían la
activación de la huella de PostgreSQL (`c2-pg-fingerprint.ts`, `c2-evidence.ts` y `scripts/c2-run.ts`), todavía sin
commit en ese momento, y otros cambios locales ajenos a R2.

| Ejecución | Casos | `C2_RUN_ID` | Resultado | Huella PostgreSQL | R2 al terminar | Evidencia |
|---|---|---|---|---|---|---|
| Adaptador R2 (`private-storage.r2-spec.ts`) | TC-M03-298 a 303 | `c2-20261110235152-506c` | **6/6** | `equal` (13/13) | 0 objetos en 3 prefijos; `livingKeys` vacío; 1 limpieza sin pendientes | `C:\pei-c2-evidencias\2026-11-10\c2-20261110235152-506c\` |
| Documentos con PostgreSQL y R2 (`doctor-documents.r2-spec.ts`) | TC-M03-304 a 306 | `c2-20261110235308-76ca` | **3/3** | `equal` (13/13) | 0 objetos en 15 prefijos; `livingKeys` vacío; 3 limpiezas sin pendientes | `C:\pei-c2-evidencias\2026-11-10\c2-20261110235308-76ca\` |

Cada paquete contiene `run.started.json`, `run.json` (estado `completed`, código de salida 0, `pgComparison: equal`),
`jest-results.json`, `jest-output.log`, `pg-before.json`, `pg-after.json`, `pg-comparison.json`, `r2-manifest.json`,
`r2-final-check.json` y `SHA256SUMS`, verificado sin diferencias, faltantes ni archivos de más. En los dos manifiestos,
`persistenceErrors` está vacío y `revision` es 20 y 32, respectivamente.

**Huella de PostgreSQL.** Las 13 tablas conservaron recuento y hash en las dos ejecuciones, con los mismos valores en
ambas. El hash cubre **todas** las filas: cada fila se serializa con `to_jsonb(fila)::text` en una transacción
`REPEATABLE READ READ ONLY` que vuelve a confirmar la identidad de Neon, y se hace md5 de los hashes de fila ordenados
y del recuento.

| Tabla | Filas | md5 |
|---|---|---|
| `user` | 52 | `e86dcbb912bed3a4b388bf5b3328edb2` |
| `session` | 8 | `4fda1b31aa8212d42fca47a66e0f6909` |
| `account` | 7 | `0076880e692ab2a3742558519a77d190` |
| `verification` | 0 | `897316929176464ebc9ad085f31e7284` |
| `user_profile` | 51 | `21b6c116149dfce6abd11d20a2dfdcd7` |
| `patient_profile` | 23 | `86f46781d15d1b2cf168eb6b604849a9` |
| `doctor_profile` | 17 | `efd12eebd94d18b78a0c6b8e9afc97de` |
| `doctor_identity_verification` | 19 | `00de1523e89dba92cbe538871aeaca8e` |
| `doctor_license_verification` | 20 | `bd85b9b2633b68b1afa6e8af0b3d535f` |
| `legal_document` | 8 | `fb4edcdef01cfe0226f258f825d9512b` |
| `user_legal_acceptance` | 98 | `89292e61ee51659df85154826f13835f` |
| `audit_log` | 222 | `8737bbfcc964f91e123c8e10c51c6f22` |
| `specialty` | 3 | `3f90f6637130685c59b8a8b310bba741` |

**Operaciones registradas en R2:**
- **Adaptador:**
  - Subidas: 5 correctas y 1 fallida a propósito (TC-M03-303, credenciales inválidas en una instancia propia).
  - Lecturas: 4 correctas y 2 de objetos inexistentes, esperadas.
  - Borrados: 2 de la prueba de idempotencia y 4 en la limpieza.
- **Documentos:**
  - Subidas: 8.
  - Borrados de la propia lógica: 3 (2 en la purga de la INE y 1 en la compensación).
  - Borrados en la limpieza: 5.
  - Lecturas de objetos inexistentes, esperadas: 3 (después de la purga y de la compensación).

**Hallazgos de la integración:**
- **TC-M03-304:** las claves guardadas en PostgreSQL corresponden a objetos de R2 con los mismos bytes (SHA-256), y la
  lectura del administrador queda auditada.
- **TC-M03-305:** la purga de la INE elimina el frente y el reverso, y la cédula se conserva.
- **TC-M03-306:** con un número de cédula duplicado, la transacción falla y la compensación elimina el objeto subido.

No se ejecutó la CLI de conciliación global, porque recorre las INE de toda la rama y modificaría registros
preexistentes.

**Ejecuciones anteriores (2026-11-04, código previo a la etapa 2 del manifiesto).**

| Ejecución | `C2_RUN_ID` | Resultado | Evidencia |
|---|---|---|---|
| Adaptador R2 | `c2-20261104162631-70e6` | 6/6 | Manifiesto en `%TEMP%\pei-c2-evidence\` |
| Documentos con PostgreSQL y R2 | `c2-20261104162955-f9c7` | 3/3 | Manifiesto en `%TEMP%\pei-c2-evidence\` |

Sus manifiestos no tienen `revision`, `doctorOwners`, `cleanups` ni `finalCheck`, y en el de integración `cleanup`
conserva solo la última limpieza. La huella de las 13 tablas de esa fecha se comprobó fuera del lanzador y no quedó en
un paquete de evidencias. Se conservan como antecedente; las ejecuciones válidas son las del 2026-11-10.

**Verificaciones de seguridad posibles desde el repositorio:**
- El adaptador usa solo `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET_NAME`. No usa
  `R2_PUBLIC_URL` (TC-M02-087) y no genera URLs públicas ni firmadas: el contenido sale siempre a través del backend.
- Los errores no incluyen la clave, el bucket ni las credenciales (TC-M03-303, con R2 real).
- `.env` está ignorado; los archivos `.env.example` solo tienen nombres de variables, y el historial de Git no contiene
  un valor de `R2_SECRET_ACCESS_KEY`.
- El lanzador oculta los valores sensibles de `.env.c2` en la salida.

**Configuración de Cloudflare (pendiente 28).** Verificada el 2026-11-11 mediante confirmación manual de la persona
usuaria, no por inspección directa del asistente:
- el bucket `pei-docs-c2-test` no tiene acceso público habilitado;
- el token de C2 está limitado a ese bucket, con solo Read y Edit de `Workers R2 Storage Bucket Item` y ningún otro
  permiso.

**Cierre de R2 (2026-11-11).** R2 queda **cerrado para el alcance actual de M03 en C2**: TC-M03-298 a 306 aprobados con
R2 y PostgreSQL reales (huella de 13 tablas `equal`, bucket vacío), código en los commits `91de98f` y `9a0142b`,
pendientes 24 y 25 resueltos por decisión aprobada y 28 verificado. Fuera de este cierre: la conciliación de objetos
huérfanos antes de habilitar R2 en producción (pendiente 25) y las pruebas complementarias (foto del médico y purga
fallida con R2 real; CLI de purga y conciliación, que requiere una rama aislada).

### Ramas temporales de Neon (revisión de solo lectura, 2026-10-20)

| Rama | Origen | Estado | Evidencia que contiene | Datos persistentes conocidos | Conservar | Eliminar |
|---|---|---|---|---|---|---|
| `rama` (`br-autumn-sun-b52qoep4`) | Hija de `production` (2026-10-14) | `0000`–`0012` aplicadas (verificado con C2 v11.2 a las 09:11 UTC; huella sin cambios desde la concurrencia) | Ensayos y aplicaciones de `0007`–`0012`, integración de A4, `probar-m03` y la concurrencia | 9 usuarios de prueba (5 médicos, 4 administradores), 5 `doctor_profile`, 7 revisiones de INE, 8 de cédula, 10 documentos legales de prueba (régimen del médico publicado), 10 aceptaciones, 34 eventos de auditoría, además de los datos copiados de `production` | Respalda la cadena de huellas de los ensayos (las sumas viven en C2). Ocupa almacenamiento de Neon | Se pierde la posibilidad de volver a inspeccionarla; las evidencias de C2 quedan como archivos. Ya no sirve para nuevas pruebas limpias |
| `br-winter-pond-b56r7iy6` | Hija de `production` (datos actuales, 2026-10-20) | `0000`–`0008`; el ensayo no dejó cambios. Ya no refleja `production`, que tiene `0009`–`0012` desde las 10:06 UTC | Ensayo de `0009`–`0012` sobre los datos de `production` | Copia de los datos reales de `production` (4 perfiles, 1 administrador) | Permite repetir el ensayo mientras `production` no cambie | Recomendable eliminarla tras aplicar en `production`: contiene datos reales |
| `br-floral-mode-b5hqaix0` (`m03-flujo-medicos`) | Hija de `production` (datos actuales, 2026-10-20, creada por el usuario) | `0000`–`0012`; `privacy_policy` y `doctor_terms` en `TEST-1` publicados (10:40:58 UTC) | Publicación del régimen legal de prueba del médico (C2 `flujo-medicos`) | Copia de los datos reales de `production` (4 perfiles, 1 administrador), los 2 documentos TEST-1 con sus 2 eventos de auditoría y una cuenta de médico de prueba (`@m00.test.invalid`) con 2 aceptaciones, 6 eventos de registro y, tras la revisión, INE 1 aprobada y purgada, cédula 1 rechazada y cédula 2 aprobada (estado `approved`), más un admin de prueba (`@m00.test.invalid`, promovido directamente) y 5 eventos de revisión | Destino de las pruebas del flujo de registro de médicos | Al terminar las pruebas: contiene datos reales |
| `br-rough-truth-b5oc81xl` | Hija de `rama` restaurada al 2026-10-20 08:55:00 UTC | `0000`–`0012` aplicadas; huella idéntica a la de `rama` tras `probar-m03`; verificada con `verificar-limpia` y `evidencia-m03` (huellas antes y después iguales) | Base de la evidencia formal de M03 | Ninguno nuevo: las pruebas revirtieron todo | Permite repetir la evidencia o regresiones limpias | Una nueva evidencia necesitaría otra restauración (si la ventana de Neon lo permite) o una rama desde `production` |

## Riesgos y decisiones pendientes

| # | Tema | Estado |
|---|---|---|
| 1 | `0007` se aplicó el 2026-10-17 (05:10–05:11 UTC) en la rama `production` de Neon (branch ID `br-royal-recipe-b54s5hnn`, endpoint `ep-wandering-bonus-b5kxacor`; la BD configurada en `.env`; entorno por confirmar); Q1–Q9 PASS verificadas en esa BD. La recuperación de `0007` sigue sin cerrarse: el inverso lógico solo se validó en `rama` y la viabilidad de una restauración de Neon no está confirmada. `0008` (aplicada en `production` el 2026-10-20) tiene un inverso lógico sin datos, validado solo en `rama`, y un LSN previo registrado (`0/31E3B68`); la ventana de restauración de Neon tampoco está verificada para `0008`. Desplegar HEAD requiere una autorización aparte | `0007`: pendiente (P1). `0008`: recuperación por inverso lógico; restauración de Neon sin verificar |
| 2 | Evidencia formal en la rama temporal sin usar la BD de `.env` | Procedimiento propuesto, pendiente de autorización |
| 3 | Enumeración de CURP: el 409 genérico revela que una CURP existe en cualquier rol, también de médicos | Pendiente de aceptación explícita del riesgo |
| 4 | Rama temporal `rama` (`br-autumn-sun-b52qoep4`) con `0007` y `0008` aplicadas (0008 desde el 2026-10-20) | Pendiente: conservar o eliminar |
| 7 | `0008` aplicada y verificada en `production` el 2026-10-20 (C2 prod-0008: `previo`, `aplicar` y `posterior` PASS). Siguen abiertos: la ventana de restauración de Neon sin verificar, las suites completas sin ejecutar en `production`, el código de A4 sin commit ni despliegue (desplegar requiere autorización aparte) y la evidencia de la ejecución fuera del repositorio | Aplicada; pendientes de recuperación, despliegue y evidencia |
| 5 | Las fuentes originales de diseño están fuera del repositorio; el registro de decisiones conserva sus identificadores y su estado | Mitigado por el registro de decisiones |
| 8 | `test/integration/role-profile-coherence.int-spec.ts` (A4, TC-M03-068 a 074) insertaba `doctor_profile.specialty`, que `0010` elimina. **Adaptado** (2026-10-20) a `specialty_id` del catálogo de `0009`, sin cambiar los casos. Desde ahora requiere `0009`–`0011` aplicadas: no se puede volver a ejecutar en `rama` hasta PC-B2 | Adaptado; sin ejecutar |
| 9 | `drizzle-kit migrate` aplica todo lo pendiente del journal: con `0010` y `0011` en el árbol, aplicar una sola migración exige un directorio preparado y una compuerta propia. Resuelto para `0009` en C2 v11 (`staged-0009`, `drizzle-0009.config.cjs`); `production` sigue sin `0009` y requiere autorización y procedimiento aparte | Resuelto en `rama`; `production` pendiente |
| 10 | `0012`: agregué un guard inicial que no figura en 0012.b (aborta si ya existe una función con el mismo nombre, para que `CREATE OR REPLACE` no sustituya nada en silencio); el resto del SQL es el del plan. En el ensayo, tres casos de 0012.c se ajustan al orden real de evaluación: 11 → `P0001` (no `23514`); 5 «intento que no es el último» es inalcanzable con un pendiente por línea; 16 `TRUNCATE specialty` puede responder `0A000` por la FK | Comprobado en el ensayo (11 → `P0001`; 16 `TRUNCATE specialty` → `0A000`); pendiente de revisión en PC-B3 |
| 11 | Interpretaciones de B4 donde el diseño y el plan no son explícitos: (a) `missing` usa `*_resubmission` cuando la línea está `required` pero tiene historial (tras un cambio de CURP, nombre o especialidad sin reutilización) y `*_submission` si nunca hubo envío; (b) un envío de cédula con la línea `required` y con historial se clasifica como `resubmission`; (c) la versión profesional sube siempre que cambia el número del perfil, también en el envío inicial (de NULL a un valor), porque el trigger de `0012` lo exige; (d) `registrationComplete` sigue a 7bis.2 (línea profesional no `required`) en lugar de la condición «hay número de cédula» de D.2, que queda implicada | **Confirmadas** por el usuario (2026-10-20) |
| 12 | B5 cambia M02 de forma acotada: `IdentityModule` exporta `DOCTOR_IDENTITY_GATEWAY` (puerto restringido nuevo, plan v2 A4) y `RATE_LIMITER` (para los límites de M03); `test/support/identity-e2e.ts` acepta un almacén compartido; `object-key.spec.ts` cambió el ejemplo de «espacio no registrado» porque `doctor-licenses` ya está registrado. Ningún contrato HTTP de M02 cambió | Informado |
| 13 | Pendiente de B5 para cerrar con BD: integración de los adaptadores Drizzle (`drizzle-doctor-*`, `drizzle-doctor-identity.gateway`) contra `rama` vía C2; el estado se arma con varias consultas dentro de la transacción (no una sola, diseño v3 §D.6); la purga y la CLI de INE de médicos quedaron en B6 (sin ejecutar) | Pendiente |
| 14 | B6: la lista del admin deriva el estado por médico y filtra en la aplicación (sin SQL equivalente ni prueba de paridad, diseño v3 §D.6); suficiente con pocos médicos. `CliModule` importa `DoctorsModule` para la purga | Informado |
| 15 | B7 cambia el contrato de `GET /me` **solo para el médico** (antes `profile` y `registrationStatus` en `null` por D-A4-2, «hasta la fase B»): ahora trae su perfil y su estado derivado con `canOperate`. El paciente, la cuenta sin perfil, el admin y la organización no cambian; `GET /me/registration-status` sigue reservado al paciente (TC-M03-067). El frontend (`apps/web`) solo usa `registrationStatus` del paciente | Informado |
| 16 | Concurrencia (X-6): ejecutada en `rama` con datos permanentes por decisión del usuario (2026-10-20). **Consecuencia:** `rama` ya no está limpia; los planes de C2 que exigen «sin usuarios de prueba» o una huella encadenada fallan cerrado en ella, y la evidencia formal (B9) y cualquier regresión futura necesitan otra rama (creada desde `production` con `0009`–`0012` aplicadas, o desde un punto de `rama` anterior a las 09:01 UTC del 2026-10-20) | Resuelto con consecuencia aceptada |
| 18 | Base limpia para B9 (2026-10-20): rama hija de `rama` restaurada en un punto entre 05:51:07Z y 09:01:40Z (antes de la concurrencia), creada por el usuario. Rama creada por el usuario: `br-rough-truth-b5oc81xl` / `ep-damp-sound-b5m0fm79`, punto 2026-10-20 08:55:00 UTC. C2 v11.3 `verificar-limpia` (solo lectura): identidad APROBADA y huella **idéntica** a la de `rama` tras `probar-m03` (13 migraciones, sin administradores, usuarios de prueba ni médicos); `c2-el-antes-verificar.json` `6847d64a…`. Pendiente: `probar-m03-limpia` y, tras el commit autorizado, `evidencia-m03` | Resuelto: evidencia formal registrada |
| 17 | B8 encontró en la E2E de seguridad que el doble del gateway no registraba el log del conflicto de CURP que sí registra el adaptador real; se corrigió el doble (sin cambios en producción) | Resuelto |
| 19 | Fin de línea: con `core.autocrlf=true`, un checkout nuevo reescribía las migraciones con CRLF y cambiaba sus hashes (comprobado en un clon desechable: `0012` pasaba de `e5d24a0f…` a `a643d446…`). Resuelto con `.gitattributes`: `apps/backend/src/db/migrations/*.sql -text`. Las 13 migraciones quedan `i/lf w/lf attr/-text`, sus SHA-256 no cambian y renormalizar no modifica ningún blob (2026-10-20) | Resuelto |
| 20 | `0009`–`0012` aplicadas en `production` el 2026-10-20 (C2 `prod-m03`: `previo` y `aplicar` PASS; `posterior` Q1–Q12 PASS en el intento 2, tras corregir un falso fallo de Q5 en la herramienta). LSN previo `0/3248F20`. Siguen abiertos: el código de M03 sin desplegar, el régimen legal del médico sin publicar, la ventana de restauración de Neon sin verificar y la evidencia fuera del repositorio | Aplicada y verificada; pendientes de despliegue y publicación |
| 21 | `privacy_policy` es común a pacientes y médicos. Si se publica un `privacy_policy` de prueba o de un solo rol, una publicación posterior de solo `patient_terms` (admitida por N1, TC-M03-023) lo dejaría en el régimen del paciente; nada en el código, la BD ni C2 lo impide. Por eso el régimen TEST-1 se publicó solo en la rama `m03-flujo-medicos` y no en `production` | Pendiente: guard en la publicación o en la BD antes de cualquier régimen no definitivo en `production` |
| 22 | C-16: la corrección de una CURP o un nombre legal incorrectos no tiene ninguna vía hoy (DP-CORR: flujo definido documentalmente en `M03-decisiones.md`, sección 8, pendiente de implementación). El enum `doctor_license_review_reason_enum` conserva `legal_name_changed` sin uso (no se migra). `docs/academico/M03-doctors.md` todavía describe el cambio de CURP y de nombre (D-28) y la ruta retirada | DP-CORR pendiente de implementación (fase final de M03) |
| 23 | D-37 y RN-140 sin implementar: la conexión de las políticas depende de cada módulo con operaciones protegidas: agenda (M07), citas (M08), videoconsulta (`video`), expediente clínico (`clinical-record`) y prescripciones (`prescriptions`). Ninguno está implementado. Los módulos en carpetas no usan la numeración M07 y M08 | Pendiente de implementación |
| 24 | Conservación de las evidencias de R2. **Decisión aprobada (2026-11-11):** (1) `C:\pei-c2-evidencias\` es la ubicación permanente de trabajo de las evidencias C2 (paquetes del lanzador por `<fecha>\<C2_RUN_ID>\`, con `SHA256SUMS`, fuera del repositorio y separados de los secretos de `C:\pei-c2`); (2) los paquetes completos no se versionan en Git; (3) el repositorio conserva la trazabilidad: `C2_RUN_ID`, resultados, recuentos, hashes y la referencia a la ubicación de cada paquete (sección «R2 (2026-11-04 y 2026-11-10)»); (4) la copia de seguridad fuera del equipo queda como recomendación operativa, no como requisito técnico implementado. Los manifiestos del 2026-11-04 (`%TEMP%\pei-c2-evidence\`) son antecedentes prescindibles | Resuelto (decisión aprobada) |
| 25 | Objetos huérfanos en R2. La compensación (TC-M03-306) y la purga (TC-M03-305) funcionan con R2 real. Huecos residuales sin prueba: (a) si el borrado de compensación falla, el objeto queda huérfano y solo se registra un log sin clave (lo mismo con la foto anterior del médico); (b) si un `COMMIT` se confirma y su respuesta se pierde, la compensación borraría objetos de una fila confirmada. **Decisión aprobada (2026-11-11):** se acepta el riesgo residual para el alcance actual de R2/C2; no se implementa un barrido automático. Se conserva como medida futura una conciliación manual **de solo lectura**: listar las claves de los espacios de M03, cruzarlas con `doctor_*_verification` y `doctor_profile.photo_object_key` y reportar las que no tengan fila y superen un margen de antigüedad; el borrado, solo con aprobación explícita sobre la lista revisada. **Condición para producción:** la conciliación y la resolución de los objetos huérfanos deben hacerse antes de habilitar R2 en producción, en especial por los documentos de identidad y la retención de D-19 | Riesgo aceptado en el alcance actual; conciliación pendiente antes de habilitar R2 en producción |
| 6 | Las etiquetas de decisión de las pruebas (D-, R-, N-, M01-D2) no están en las convenciones de `docs/testing/README.md` | Pendiente de decidir |
| 26 | Bootstrap inicial del primer administrador (TC-M02-121 ×2: caso correcto y H1) sin validar con PostgreSQL real en C2: la rama persistente tiene un administrador copiado de la base de desarrollo. Requiere una rama sin administradores | Pendiente |
| 27 | Evidencia incompleta de las ejecuciones de PostgreSQL del 2026-11-03: no se conservó en archivo la salida de concurrencia ni de integración, ni el `C2_RUN_ID` de integración; las huellas están fuera del repositorio. El cierre del pool de `doctors.int-spec` no se ha ejecutado aún contra C2 | Pendiente: conservar la salida completa en futuras ejecuciones |
| 28 | Configuración de Cloudflare de C2. **Verificado mediante confirmación manual de la persona usuaria (2026-11-11);** el asistente no inspeccionó Cloudflare directamente. Confirmado: el bucket `pei-docs-c2-test` no tiene acceso público habilitado; el token de C2 está limitado a ese bucket y solo tiene los permisos Read y Edit de `Workers R2 Storage Bucket Item`, sin ningún otro permiso. Complementa las comprobaciones desde el repositorio (sin URLs públicas ni firmadas, TC-M02-087; errores sin credenciales, TC-M03-303) | Verificado (confirmación manual del usuario) |
