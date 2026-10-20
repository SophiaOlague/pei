# Trazabilidad M03: Médicos (registro y verificación) de PEI (EN CURSO)

> **Estado:** Implementación de M03 completa (A1–A4 y B1–B8, commit `35e205c` para B1–B8). Evidencia formal registrada: `docs/testing/ejecuciones/2026-10-20T09-32-22_35e205c_M03/` (588 unitarias, 94 de integración y 104 E2E, todas PASS) en la rama limpia `br-rough-truth-b5oc81xl`. `0009`–`0012` aplicadas en `rama` y en la rama limpia; **no en `production`**. Pendiente: aplicación en `production` (autorización aparte) y documento académico.

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
| R-7, N3, Z-1, D-24, D-30, D-31, R-2, D-25, E.5 (reglas), N4/E.3, 7bis.1, 7ter (efectos), R-6, D-28 (VOs) | B4 | `src/modules/doctors/domain/doctor-status.ts`, `review.ts`, `sensitive-change.ts`, `license-number.ts`, `legal-name.ts` | TC-M03-104 a 129 (unitarias: escenarios 1–18 de D.5, las 32 combinaciones de Z-1, secuencias de D.4, E.3, E.4 y 7bis.1) | Unitarias locales, sin BD | Interna |
| RF-05, RF-09, D-1, D-3, D-4, D-9, D-16 (cédula propia), D-17, D-19, D-20, D-21, D-28, D-29, D-33, D-35, R-5, R-6, R-14, 7bis, 7ter, DC-2 | B5 | `src/modules/doctors/application/**` (registro, perfil, cambios, envíos, estado), `presentation/me-doctor.controller.ts`, `infrastructure/persistence/drizzle-doctor-*.ts`; `src/modules/identity/application/ports/doctor-identity.gateway.ts` + `drizzle-doctor-identity.gateway.ts`; `private-storage/domain/object-key.ts` (espacios `doctor-*`) | TC-M03-130 a 146 (unitarias con dobles), 147 a 153 (E2E con dobles); RT-M03-13 | Unitarias y E2E con dobles locales; sin integración | Interna (sin BD) |
| RF-06, RN-005, D-16 (admin), D-19 (purga), D-22, D-25, D-27, D-36, R-2 (revisión), E.5 (vigencia), Admin | B6 | `src/modules/doctors/application/use-cases/admin/**`, `presentation/admin-doctors.controller.ts`, `presentation/dto/admin-doctor.dto.ts`; `drizzle-doctor-review.repository.ts` y `drizzle-doctor-profile.repository.ts` (métodos de B6); `src/cli/identity-purge-documents.ts`, `src/cli/cli.module.ts` | TC-M03-154 a 163 (unitarias con dobles), 164 a 166 (E2E con dobles) | Unitarias y E2E con dobles locales; sin integración | Interna (sin BD) |
| RN-004, D-13, D-23 (política operativa), D-31 y D-A4-2 (`/me` del médico) | B7 | `src/modules/doctors/application/policies/doctor-operational.policy.ts`, `doctor-profile-section.provider.ts`; `src/modules/identity/application/role-profile-section.registry.ts`, `presentation/me.controller.ts` | TC-M03-167 a 170 (unitarias), 171 (E2E con dobles) | Unitarias y E2E con dobles locales | Interna (sin BD) |
| Integración de B5–B7 (adaptadores Drizzle, gateway de Identity, triggers de 0012) | B8 | `test/integration/doctors.int-spec.ts`, `test/support/doctors-integration.ts` | TC-M03-172 a 182 | `probar-m03` en `rama` (intento 2): 94/94 de integración, sin residuos | Interna |
| E.5, R-2, E.1, plan v2 §9 (concurrencia con datos confirmados) | B8 | `test/concurrency/doctors.conc-spec.ts`, `test/jest-concurrency.json` | TC-M03-183 a 187 | C2 v11.1 `probar-concurrencia` en `rama`: 5/5 (datos confirmados, permanentes) | Interna |
| D-17 (enumeración), IDOR, DT-8, DT-4, RN-122 (seguridad) | B8 | `test/doctors-security.e2e-spec.ts` | TC-M03-188 a 192 | E2E con dobles locales | Interna (sin BD) |
| P.7, R-11 (arquitectura) | B8 | `test/architecture.spec.ts` | RT-M03-14 a 16 | Unitarias locales | Interna |
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
| TC-M03-044 | A2 | Integración | `test/integration/legal-regime.int-spec.ts:119` | [N1][R-8] | PublishLegalDocumentsUseCase (núcleo de legal:publish): mismo published_at, content_hash y evento de sistema;  |
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
| TC-M03-108 | B4 | Unitaria | ídem | [Z-1] | las 32 combinaciones de identidad × profesional × legales |
| TC-M03-109 | B4 | Unitaria | ídem | [D-27][R-7] | secuencia rechazo, reenvío y aprobación (D.4) |
| TC-M03-110 | B4 | Unitaria | ídem | [Z-1] | secuencia de revisiones mixtas (D.4) |
| TC-M03-111 | B4 | Unitaria | ídem | [R-13] | versión legal nueva → pending sin reabrir revisiones |
| TC-M03-112 | B4 | Unitaria | ídem | [D-24][D-30] | rechazada cuenta como entregada; perfil incompleto → `profile` |
| TC-M03-113 | B4 | Unitaria | ídem | [D-31] | `missing` distingue primer envío de reenvío |
| TC-M03-114 | B4 | Unitaria | ídem | [D-31] | sin perfil de médico: solo `profile` y `legal` |
| TC-M03-115 | B4 | Unitaria | `src/modules/doctors/domain/review.spec.ts` | [R-2] | aprobar o rechazar desde pending vigente |
| TC-M03-116 | B4 | Unitaria | ídem | [R-2] | estados terminales |
| TC-M03-117 | B4 | Unitaria | ídem | [E.5] | pendiente no vigente no se revisa |
| TC-M03-118 | B4 | Unitaria | ídem | [D-25] | motivo de rechazo de 10 a 500 |
| TC-M03-119 | B4 | Unitaria | ídem | [R-6] | número de cédula |
| TC-M03-120 | B4 | Unitaria | ídem | [D-28] | nombre legal y detección de cambio |
| TC-M03-121 | B4 | Unitaria | `src/modules/doctors/domain/sensitive-change.spec.ts` | [D-28] | cambio de CURP (E.3) |
| TC-M03-122 | B4 | Unitaria | ídem | [7ter] | cambio de nombre con la cédula approved/pending |
| TC-M03-123 | B4 | Unitaria | ídem | [7bis.1] | cambio de nombre con la cédula rejected/required: sin revisión automática |
| TC-M03-124 | B4 | Unitaria | ídem | [7ter.2] | CURP y nombre juntos; sin cambios |
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
| TC-M03-140 | B5 | Unitaria | ídem | [7ter.3] | cambio de nombre de un aprobado: legal_name_changed con la misma clave |
| TC-M03-141 | B5 | Unitaria | ídem | [7bis.1] | cambio de nombre con la cédula rechazada: sin revisión automática |
| TC-M03-142 | B5 | Unitaria | ídem | [D-28] | cambio de CURP: solo identidad, INE pendiente superseded y purgada |
| TC-M03-143 | B5 | Unitaria | ídem | [D-17] | CURP de otra persona → 409; sin cambios → 400 |
| TC-M03-144 | B5 | Unitaria | ídem | [D-33][E.3] | cambio de especialidad: specialty_changed; inactiva 422; misma 400 |
| TC-M03-145 | B5 | Unitaria | ídem | [D-9] | bio y teléfono sin versiones ni auditoría |
| TC-M03-146 | B5 | Unitaria | ídem | [Autorización] | paciente o cuenta sin perfil: falla cerrado |
| TC-M03-147 | B5 | E2E | `test/doctors.e2e-spec.ts` | [RF-05] | POST /me/doctor-profile: 401, 201, 400, 409 |
| TC-M03-148 | B5 | E2E | ídem | [D-17] | CURP repetida → 409 genérico sin la causa |
| TC-M03-149 | B5 | E2E | ídem | [D-13][R-7] | estado, envíos de INE y cédula, historial sin claves |
| TC-M03-150 | B5 | E2E | ídem | [D-3][H.3] | cédula sin archivo o GIF → 400; PDF propio como attachment con sandbox |
| TC-M03-151 | B5 | E2E | ídem | [D-28][7ter] | cambio de nombre de un aprobado → pending |
| TC-M03-152 | B5 | E2E | ídem | [D-33] | especialidad inválida o inactiva; GET y PATCH del perfil |
| TC-M03-153 | B5 | E2E | ídem | [Autorización] | paciente o cuenta sin perfil → 403 |
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
| TC-M03-167 | B7 | Unitaria | `src/modules/doctors/application/policies/doctor-operational.policy.spec.ts` | [RN-004] | solo approved opera; pending → 422; inexistente → 404 |
| TC-M03-168 | B7 | Unitaria | ídem | [D-21][D-23] | un cambio sensible suspende la operación hasta la nueva aprobación |
| TC-M03-169 | B7 | Unitaria | ídem | [D-13] | assertActorCanOperate para el propio médico; otro rol falla cerrado |
| TC-M03-170 | B7 | Unitaria | ídem | [D-31] | la sección del médico se registra en Identity; paciente y admin no |
| TC-M03-171 | B7 | E2E | `test/doctors.e2e-spec.ts` | [D-31][D-A4-2] | GET /me del médico con perfil, estado y canOperate; paciente y admin sin cambios |
| TC-M03-172 | B8 | Integración | `test/integration/doctors.int-spec.ts` | [RF-05][R-10] | registro real: user_profile doctor y doctor_profile, triggers de 0008, auditoría |
| TC-M03-173 | B8 | Integración | ídem | [D-19][0012] | reenvío de INE: superseded, intento 2 y purga |
| TC-M03-174 | B8 | Integración | ídem | [7bis][C-4][0012] | cédula inicial (versión 2), reenvío y cambio de número aceptados por los triggers |
| TC-M03-175 | B8 | Integración | ídem | [D-17] | número de cédula duplicado → 409 genérico (23505) |
| TC-M03-176 | B8 | Integración | ídem | [RF-06][D-27][B7] | aprobación de ambas, purga, eventos y política operativa |
| TC-M03-177 | B8 | Integración | ídem | [7ter.3][0012] | legal_name_changed con la misma clave pasa el trigger |
| TC-M03-178 | B8 | Integración | ídem | [D-17][D-20] | CURP de otra cuenta en registro y cambio → 409 |
| TC-M03-179 | B8 | Integración | ídem | [D-33][0012] | especialidad inactiva 422; specialty_changed |
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
| RT-M03-14 | B8 | Unitaria | `test/architecture.spec.ts` | [P.7] | doctors solo usa de identity dominio, puertos, registro y módulo |
| RT-M03-15 | B8 | Unitaria | ídem | [R-11] | doctors sin SDK de AWS ni infraestructura de private-storage |
| RT-M03-16 | B8 | Unitaria | ídem | [B8] | el spec de concurrencia exige C2, rechaza `rama` y la marca de rama desechable |

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
| 20 | `production` sigue en `0008`. Aplicar `0009`–`0012` requiere su propio procedimiento C2 (precondición de `0010`: 0 médicos en `production`; `drizzle-kit migrate` aplicaría las cuatro juntas) y autorización independiente | Pendiente |
| 6 | Las etiquetas de decisión de las pruebas (D-, R-, N-, M01-D2) no están en las convenciones de `docs/testing/README.md` | Pendiente de decidir |
