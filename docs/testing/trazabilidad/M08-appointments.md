# M08 Citas — evidencia de pruebas contra PostgreSQL (C2)

Diseño y decisiones: [M08-diseno](../../arquitectura/M08-diseno.md) (A.13–A.16 para M-1).
Estado: etapa 1 de M08 y M-1 partes A (`0013`) y B (`0014`, AP-26) aplicadas en C2. Reservas reales DESACTIVADAS
(`APPOINTMENTS_BOOKING_ENABLED` sin definir). `0014` NO aplicada en desarrollo; M-1c y el cambio 6 NO aplicados.

**Estado de `0014` (AP-26), tres niveles distintos:**

| Nivel | Estado | Qué significa |
|---|---|---|
| Migración **preparada** | SÍ (2026-11-08, commit `41e07a5`) | `src/db/migrations/0014_m08_m1_legal_acceptance.sql` (idéntico byte a byte a la propuesta `0014 up`, SHA-256 `72af287cf7336d6f56942b35576b89c9cf0e1e3566b42f41ab62145ab440e24c`), entrada idx 14 del journal, `meta/0014_snapshot.json`, columnas/FK/índices/CHECK en `src/db/schema/appointment.ts`, `DrizzleAppointmentRepository.insert` escribe los dos ids y `scripts/c2-migrate-core.ts` autoriza `0014` (y exige `0013` aplicada con su hash) |
| Migración **aplicada** | SÍ en C2 (2026-11-09); NO en desarrollo | Ver «Aplicación de `0014` en C2» |
| Persistencia **validada** | SÍ en C2 (2026-11-09) | `c2-20261109140840-9cd4`: TC-M08-366 (catálogo) y TC-M08-214 (persistencia real), 2/2, sin residuo |

**Fuera de C2:** el esquema de Drizzle declara las dos columnas, así que todo INSERT de citas por Drizzle falla contra
una BD sin `0014` (p. ej., desarrollo). **No desplegar en ningún entorno sin aplicar antes `0014` en él.**

### Aplicación de `0014` en C2 (2026-11-09)

- Respaldo de C2 creado por el responsable del proyecto antes de aplicar (no se generó otro).
- `scripts/c2-migrate.ts`, verificación sin escritura: identidad real `royal-paper-10258990` / `br-shy-pond-b50a3m8f` /
  `ep-withered-block-b5e8v9ov`; 14 migraciones registradas con los hashes del journal (`0013` incluida); pendiente solo
  `0014_m08_m1_legal_acceptance` (SHA-256 `72af287c…`).
- `c2-migrate --apply`, ejecutado por el responsable del proyecto: identidad verificada de nuevo, «aplicada
  0014_m08_m1_legal_acceptance; 15 migraciones registradas». Una nueva verificación sin escritura confirmó la identidad y
  las 15 migraciones registradas.

### Verificación de persistencia en C2 (2026-11-09)

Spec dedicado `test/integration/m08-0014-verify.int-spec.ts` (modo `postgres` del lanzador, con preflight de identidad y
paquete de evidencias), para no ejecutar B1 ni B2 completos.

| Ejecución | Resultado | C2_RUN_ID | Commit | SHA-256 de `SHA256SUMS` |
|---|---|---|---|---|
| Persistencia AP-26 | **2/2** | `c2-20261109140840-9cd4` | `41e07a5` (más el spec, sin confirmar entonces) | `4f30a33d32ba9932662adce8b35860bfdb34a00c565dff850fc2f397695b34ef` |

- **Catálogo (TC-M08-366, transacción READ ONLY):** columnas `privacy_legal_acceptance_id` y `terms_legal_acceptance_id`
  (`uuid`, nulables); FK `appointment_privacy_legal_acceptance_fk` y `appointment_terms_legal_acceptance_fk` →
  `user_legal_acceptance(id)`; CHECK `appointment_legal_acceptances_chk` =
  `((privacy_legal_acceptance_id IS NULL) = (terms_legal_acceptance_id IS NULL))`; índices
  `appointment_privacy_legal_acceptance_idx` y `appointment_terms_legal_acceptance_idx`; trigger
  `appointment_legal_acceptances_check` → `gst_appointment_legal_acceptances_check`, habilitado.
- **TC-M08-214: aprobado.** Una reserva real guarda las dos aceptaciones del paciente (mismo `user_profile`, pareja del
  mismo régimen).
- **Sin residuo:** `afterAll` comparó los conteos de `appointment`, `appointment_status_history`,
  `consultation_price_configuration`, `cancellation_policy`, `user_profile`, `user_legal_acceptance`, `legal_document` y
  `audit_log` antes y después: iguales. Todo ocurrió en transacciones revertidas.
- En esa ejecución la prueba de catálogo se llamaba `[0014-catalogo]`; después se le asignó TC-M08-366 sin otro cambio
  (no se volvió a ejecutar).
- No se ejecutaron B1 ni B2 completos: TC-M08-310, 315 y 317 a 319 (`m08-m1-schema.int-spec.ts`) y el resto de
  `appointments.int-spec.ts` y `appointments.conc-spec.ts` siguen **sin ejecutar** sobre `0014`.

## Alineación de C2 con `0013_m08_m1_core` (2026-11-08)

| Elemento | Valor |
|---|---|
| C2 (destino) | proyecto `royal-paper-10258990`, rama `br-shy-pond-b50a3m8f`, endpoint `ep-withered-block-b5e8v9ov` (identidad real `neon.*`, conexión directa) |
| Respaldo previo | `c2-pre-0013`, rama `br-silent-butterfly-b5z128fu`, endpoint `ep-holy-sea-b5zxmnm6` (creada desde la consola de Neon) |
| Verificación del respaldo (solo lectura) | mismo proyecto; 13 migraciones idénticas (hash y `created_at`); sin M-1; huella completa del esquema idéntica a C2; 63 tablas con recuento y md5 de contenido idénticos. La rama de origen no es visible por SQL: se confirma por la igualdad exacta con C2 |
| SQL aplicado | `apps/backend/src/db/migrations/0013_m08_m1_core.sql`, SHA-256 `2138d4064d8acd97e3189c38eace19e79fbf622b97ed53ecf772c205846b1472` (idéntico a `proposals/m08-m1/0013_m08_m1_core.up.sql`; commit `67f266d`) |
| Mecanismo | `scripts/c2-migrate.ts --apply` (migrador de drizzle-orm). URL leída solo de `C:\pei-c2\.env.c2`; identidad real comprobada antes del plan y justo antes de escribir; exige 13 migraciones previas con los hashes del journal y una sola pendiente, la autorizada |
| Resultado | `aplicada 0013_m08_m1_core; 14 migraciones registradas`. Última: hash `2138d406…6b1472`, `created_at` `1794076271586`. Journal: 14 entradas |
| `validate.sql` | 11 comprobaciones, 0 fallidas (transacción de solo lectura) |
| Columnas | `appointment.agenda_block_ends_at`, `cancellation_policy.max_protected_wait_minutes` y `cancellation_policy.reconnect_grace_minutes` existen; `legal_acceptance_id` (0014) no. 10/10 citas con `agenda_block_ends_at` relleno. Ninguna columna de Drizzle ausente |
| Desarrollo | No se usó: ninguna conexión al endpoint `ep-wandering-bonus-b5kxacor`. El ejecutor y los scripts de verificación solo leen `.env.c2` y rechazan el endpoint de desarrollo |

## Suites de B1 y B2 ejecutadas tras `0013` (lanzador `pnpm c2`, 2026-11-08)

Ejecutadas sobre una **copia de trabajo** del 2026-11-08: commit `67f266d` con cambios sin commit (`run.json` registra
ese commit y `workingTreeDirty`). No se ejecutaron sobre los commits de la infraestructura C2 (I1–I4), de M03 ni de
B1. La equivalencia entre lo ejecutado y lo versionado se verificó con SHA-256 frente a la línea base del 2026-11-08:
los cuatro archivos de B1 (`appointments.int-spec.ts`, `m08-m1-schema.int-spec.ts`, `appointments-integration.ts` y
`m08-m1-sql.ts`) y la infraestructura que usan (`c2-target-guard.ts`, `c2-launcher.ts`, `c2-run.ts`,
`c2-evidence.ts`, `test-tag.ts`, `with-rollback.ts`, `doctors-integration.ts`, `doctor-regime.ts`, `r2-run.ts` y
`jest-integration.json`) son idénticos byte a byte a lo ejecutado.

| Suite | Modo | Resultado | C2_RUN_ID | SHA-256 de `SHA256SUMS` |
|---|---|---|---|---|
| `test/integration/appointments.int-spec.ts` | postgres (rollback) | 14/14 | `c2-20261108222952-db6b` | `93bf0ce27f4c7a7d59753db84b99cde24830c0860eed5b31a7acacfb7cfd1c86` |
| `test/integration/m08-m1-schema.int-spec.ts` | postgres (rollback) | 7/7 | `c2-20261108223316-7740` | `5af6d988ff5829460083deb4820e7a62433686a78c65bc6352854f03bc823ce5` |
| `test/concurrency/appointments.conc-spec.ts` | concurrency, `--committed-fixtures c2-persistent-accepted` | 3/3 | `c2-20261108223410-be9f` | `7da213fba200de1cf0b71dd6e54b53667ef36e57f12d20db2bc13d610e2fa3fb` |

Paquetes completos (fuera del repositorio): `C:\pei-c2-evidencias\2026-11-08\<C2_RUN_ID>\` (`run.json` con estado
`completed`, código 0 y el destino de C2).

Las dos suites de B1 revierten todos sus cambios (`withRollback` y transacciones propias con ROLLBACK) y lo comprueban
en `afterAll` con recuentos y la huella del esquema: no dejan residuo en C2. La suite de concurrencia (B2) confirma
datos de forma autorizada (ver «Residuo persistente aceptado»). Su equivalencia con lo versionado también se verificó
con SHA-256 frente a la línea base del 2026-11-08 (`appointments.conc-spec.ts`, `jest-concurrency.json`,
`c2-mode-concurrency.ts` y `c2-mode-setup.ts`); se ejecutó sobre la misma copia de trabajo, no sobre el commit de B2.

**Pruebas de migración desde 0000–0012 (D):** `m08-m1-migration.int-spec.ts` (TC-M08-300 a 306). En C2 falla a propósito
en `beforeAll` (C2 ya tiene `0013`); se ejecuta en la rama aislada `br-green-grass-b5yhyp89` (endpoint `ep-nameless-sun-b5njoeb3`, proyecto `royal-paper-10258990`; hija del respaldo `c2-pre-0013`, `br-silent-butterfly-b5z128fu`), modo `migration` del lanzador (identidad real verificada antes de cada ejecución).

| Ejecución | Resultado | C2_RUN_ID | SHA-256 de `SHA256SUMS` |
|---|---|---|---|
| D, 2026-11-09 | **7/7** (TC-M08-300 a 306) | `c2-20261109041826-79f9` | `ed99da72a71db875f553ad3ca883d0f4543024badbf4ae81893bd8f24429774a` |

`beforeAll` comprobó el esquema 0000–0012 y `afterAll`, que la huella del esquema final es igual a la inicial: `0013`
no quedó aplicada. Los recuentos de datos **no se midieron**: los specs comparan solo la huella del esquema. Todo ocurrió en transacciones revertidas por diseño, pero no se afirma la ausencia de residuo de datos sin una medición. Paquete: `C:\pei-c2-evidencias\2026-11-09\c2-20261109041826-79f9\`.

**Parte B de M-1 (`0014`): propuesta versionada y BLOQUEADA por dependencia de M02.** Se conservan
`src/db/proposals/m08-m1/0014_m08_m1_legal_acceptance.up.sql` y `.down.sql`, `m08-m1-part-b.int-spec.ts`
(TC-M08-307) y su bloqueo `test/support/m08-m1-part-b-gate.spec.ts` (TC-M08-340 a 342). Estado:

- **Contrato aprobado (AP-26, 2026-11-08; A.17 de M08-diseno):** la cita guarda **las dos** aceptaciones legales del
  paciente, privacidad y términos, en `appointment.privacy_legal_acceptance_id` y `appointment.terms_legal_acceptance_id`:
  las dos presentes o las dos nulas, validadas por un trigger (paciente, tipo documental y régimen) e inmutables desde el
  INSERT. `currentFor(userProfileId)` devuelve ambas o `null`. Al reagendar, la cita nueva copia las dos referencias.
- El lector de M02 `BOOKING_LEGAL_ACCEPTANCE_READER` está implementado (TC-M02-249 a 256; integración C2 TC-M02-257 a 261)
  y **M08 ya lo consume** mediante su puerto `BOOKING_LEGAL_ACCEPTANCES` (adaptador
  `infrastructure/booking-legal-acceptances.adapter.ts`). `HoldSlotUseCase` lo lee en la misma transacción, justo antes
  de crear la cita y después de la idempotencia RB-2: sin la pareja vigente lanza `LegalAcceptancesRequiredError`
  (403) y la transacción se revierte entera; con ella, `NewAppointment` transporta `privacyLegalAcceptanceId` y
  `termsLegalAcceptanceId`.
- **Persistencia implementada y validada en C2:** el esquema de Drizzle declara las dos columnas y
  `DrizzleAppointmentRepository.insert` las escribe (ver «Verificación de persistencia en C2» arriba).
- **Propuesta `0014` reescrita según AP-26 (A.17.3):** dos columnas con FK e índices, CHECK
  `appointment_legal_acceptances_chk` (las dos o ninguna), trigger `appointment_legal_acceptances_check` (paciente, tipo
  documental y régimen) y `gst_appointment_guard` redefinido con `CREATE OR REPLACE` para que ambas sean inmutables desde
  el INSERT. `0014 down` restaura literalmente el guard de `0013`. La migración aplicada `0013` y `0013 up` no cambian;
  solo se amplió la comprobación de `0013 down` para que detecte las dos columnas nuevas y se niegue mientras `0014`
  esté aplicada.
- `0014` **está aplicada en C2** (no en desarrollo): la migración de Drizzle es una copia exacta de la propuesta
  (TC-M08-320 comprueba el hash), el journal la registra como idx 14 y se aplicó con `scripts/c2-migrate.ts`.
- `m08-m1-part-b.int-spec.ts` se detiene al cargarse sin `M08_PART_B_AUTHORIZED=0014`, que el lanzador C2 no
  transmite; además exige una rama aislada con esquema 0000–0012.
- **Validación aislada de TC-M08-307** (5 pruebas: dependencia de `0013`, las dos o ninguna, otro paciente, tipo
  incorrecto, regímenes distintos, inmutabilidad, rechazo de `0013 down` y restauración del guard de `0013`), en la
  rama aislada `br-green-grass-b5yhyp89` (endpoint `ep-nameless-sun-b5njoeb3`, proyecto `royal-paper-10258990`; hija del respaldo `c2-pre-0013`, `br-silent-butterfly-b5z128fu`), modo `migration` del lanzador (identidad real verificada antes de cada ejecución), con `--authorize-part-b 0014` (la variable solo llega a este spec en ese modo):

  | Ejecución | Resultado | C2_RUN_ID | SHA-256 de `SHA256SUMS` |
  |---|---|---|---|
  | 1.ª, 2026-11-09 | **4/5, fallida** | `c2-20261109042210-b3ee` | `f7a1f5f1e3d8963505d9bee65aaa3f6f21e1d0a1a74e105f5d1133a4928e4e31` |
  | 2.ª, 2026-11-09 (tras el ajuste del trigger) | **5/5** | `c2-20261109042944-1726` | `47e03f4874e98ab90c181e528fa018661c19339393e1329515bbf60a9b207ee8` |

  - **Fallo de la 1.ª:** la pareja parcial se rechazaba, pero por el trigger de validación (que en PostgreSQL se ejecuta
    antes que el CHECK) con el mensaje «no pertenecen a su paciente», en lugar de por `appointment_legal_acceptances_chk`.
    Corrección: el trigger devuelve `NEW` si alguna referencia es nula y deja la pareja parcial al CHECK; las
    validaciones de paciente, tipo y régimen siguen cuando las dos tienen valor.
  - **2.ª:** las dos parejas parciales se rechazan por `appointment_legal_acceptances_chk`; el md5 de
    `gst_appointment_guard` cambia con `0014` y vuelve a ser exactamente el de `0013` tras `0014 down`; la huella del
    esquema tras `0014 down` es igual a la de después de `0013`, y la final, igual a la inicial (`afterAll`): ni `0014` ni
    `0013` quedaron aplicadas. Los recuentos de datos **no se midieron**: los specs comparan solo la huella del esquema. Todo ocurrió en transacciones revertidas por diseño, pero no se afirma la ausencia de residuo de datos sin una medición.
  - Paquetes: `C:\pei-c2-evidencias\2026-11-09\c2-20261109042210-b3ee\` y
    `C:\pei-c2-evidencias\2026-11-09\c2-20261109042944-1726\`.
- `0014` **sigue sin aplicarse de forma persistente** en ningún entorno. Esta validación aislada no autoriza aplicarla
  en C2, en desarrollo ni en producción.

## Residuo persistente aceptado en C2 (no se limpia)

Solo lo genera la suite de concurrencia (las otras dos revierten todo y lo comprueban en `afterAll`). Diferencia frente
al respaldo `c2-pre-0013` tras la ejecución `c2-20261108223410-be9f`:

| Tabla | Antes | Después | Nota |
|---|---|---|---|
| `appointment` | 10 | 12 | +2 citas `expired` con motivo `c2-m08-conc:<RUN>`; total de concurrencia: 6, todas `expired` |
| `appointment_status_history` | 14 | 18 | solo inserción |
| `consultation_price_configuration` | 12 | 15 | versiones nuevas; la vigente vuelve a ser 200.00 |
| `cancellation_policy` | 1 | 1 | sin cambios |
| `doctor_profile` / `patient_profile` | 15 / 20 | 17 / 23 | perfiles sintéticos nuevos |
| `audit_log` | 194 | 222 | solo inserción |

Las 6 citas en `pending_payment` ya existían antes de esta operación; no se modificaron.

## Casos

| Casos | Spec | Requiere |
|---|---|---|
| TC-M08-200 a 240 (14) | `appointments.int-spec.ts` | 0013 en C2 (TC-M08-221: la BD impide `expired → *` y `confirmed → pending_payment/expired`). Desde la preparación de `0014` el spec exige `0014` aplicada |
| TC-M08-214 | `appointments.int-spec.ts` y `m08-0014-verify.int-spec.ts` (misma prueba) | **APROBADA** en `c2-20261109140840-9cd4` (desde `m08-0014-verify.int-spec.ts`): la reserva real guarda las dos aceptaciones vigentes del paciente (mismo usuario, pareja del mismo régimen) |
| TC-M08-366 | `m08-0014-verify.int-spec.ts` | **APROBADA** en `c2-20261109140840-9cd4`: catálogo de `0014` (columnas, FK, índices, CHECK y trigger), en transacción READ ONLY |
| TC-M08-250 a 252 (3) | `appointments.conc-spec.ts` | 0013 en C2 |
| TC-M08-300 a 306 (7) | `m08-m1-migration.int-spec.ts` | Rama aislada 0000–0012 (modo `migration`): 7/7 en `c2-20261109041826-79f9` |
| TC-M08-310 a 316 (7) | `m08-m1-schema.int-spec.ts` | 0013 en C2. Adaptadas a `0014` y sin ejecutar: TC-M08-310 exige los hashes de `0014` (última) y `0013`; TC-M08-315 revierte `0014 down` → `0013 down` y reaplica `0013 up` → `0014 up` (exige que no haya citas con referencias, que `0014 down` perdería) |
| TC-M08-317 a 319 | `m08-m1-schema.int-spec.ts` | NUEVAS, sin ejecutar (`0014` ya está en C2; pendiente de ejecutar el spec): las dos o ninguna e históricas nulas; otro paciente, tipo incorrecto, regímenes mezclados, id inexistente y régimen anterior válido; inmutabilidad |
| TC-M08-320 a 331 | `scripts/c2-migrate-core.spec.ts` | unitarias, sin conexiones. Autorizan `0014` (idx 14); TC-M08-320 comprueba el SHA-256 de `0014` y que `0013` conserva el suyo |
| TC-M08-307 (5 pruebas) | `m08-m1-part-b.int-spec.ts` | Rama aislada 0000–0012 con `--authorize-part-b 0014`: 4/5 en `c2-20261109042210-b3ee`; 5/5 en `c2-20261109042944-1726` tras ajustar el trigger |
| TC-M08-340 a 342 | `test/support/m08-m1-part-b-gate.spec.ts` | unitarias, sin conexiones. TC-M08-341: TC-M08-307 sigue exclusiva del spec de parte B; los archivos de `0014` solo los nombran ese spec y la lectura perezosa `partB()` de `m08-m1-sql.ts` (lista exacta), y solo `m08-m1-schema.int-spec.ts` invoca `partB()` |
| TC-M08-360 a 364 | `src/modules/appointments/application/use-cases/booking-legal-acceptances.spec.ts` | integración en memoria (adaptador de M08 sobre el doble del lector de M02): régimen actual y anterior, sin aceptaciones, sin privacidad, sin términos, versión nueva no aceptada, rollback completo y RB-2 |
| TC-M08-365 | `test/appointments.e2e-spec.ts` | E2E con dobles: sin aceptaciones vigentes, 403 y sin cita |
