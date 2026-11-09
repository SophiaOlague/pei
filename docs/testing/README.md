# Pruebas de Gestinovo

Convenciones para las pruebas automatizadas y su evidencia. Se completa módulo por módulo.

## Suites

| Suite | Comando (en `apps/backend`) | Ubicación | Base de datos |
|---|---|---|---|
| Unitarias | `pnpm test` | `src/**/*.spec.ts` | No usa |
| Integración | `pnpm test:int` | `test/integration/**/*.int-spec.ts` | BD de desarrollo, **siempre con rollback** |
| E2E / API | `pnpm test:e2e` | `test/**/*.e2e-spec.ts` | Solo lecturas (sesiones simuladas o rutas sin sesión) |
| Evidencia | `pnpm test:evidence -- <etiqueta>` | Ejecuta las tres y guarda resultados | — |
| Flujo (C2) | Solo mediante C2 (`flujo-registro`, `revision-admin`), fuera del repositorio | `test/flujo/**/*.flow-spec.ts`, config `test/flujo/jest-flujo.json` | Rama de pruebas de Neon fijada; **confirma datos permanentes** |

## Pruebas de flujo (`*.flow-spec.ts`)

- No son pruebas Jest convencionales: ninguna suite las incluye (`pnpm test` busca `*.spec.ts`, `test:e2e` `*.e2e-spec.ts`) y no forman parte de `test:evidence`.
- Solo se ejecutan mediante C2, que verifica la identidad de la rama de Neon antes de arrancar y antes de cada escritura, inyecta la URL de esa rama y neutraliza Resend y R2. Cada wrapper ejecuta un solo spec (`--runTestsByPath`).
- `test/flujo/flow-guard.ts` se importa primero y detiene el spec al cargar, sin conexiones, si falta la identidad de C2, si es la rama original o si no está el marcador `C2_COMMITTED_FIXTURES=flujo-medicos-accepted`.
- Confirman datos permanentes en la rama (cuentas `@m00.test.invalid`, revisiones, auditoría). Nunca se ejecutan contra `production` ni contra la BD de `.env`.
- Sus comprobaciones puras (`test/flujo/*-checks.ts`) se prueban en `test/flujo/*.spec.ts`, que sí forman parte de `pnpm test`.

## Reglas para la BD de desarrollo

- Ninguna prueba automatizada confirma (COMMIT) datos.
- Las pruebas de integración escriben solo dentro de `withRollback` (`test/support/with-rollback.ts`), que revierte la transacción incluso si una aserción falla. La unidad de trabajo abre SAVEPOINTs dentro de esa transacción, así que tampoco escapa.
- Las pruebas de concurrencia usan dos conexiones reales y terminan ambas en ROLLBACK.
- Cada archivo de integración compara, con consultas de solo lectura, los registros marcados como de prueba antes y después (`test/support/residue.ts`).

## Identificadores

| Prefijo | Significado | Ejemplo |
|---|---|---|
| `RF-xx`, `RN-xxx`, `RNF-xx` | Requisito del Documento Maestro V2.2 | `RF-02` |
| `RT-Mxx-nn` | Requisito técnico derivado del diseño de un módulo (no es requisito del Maestro) | `RT-M00-02` |
| `TC-Mxx-nnn` | Caso de prueba del módulo | `TC-M00-140` |

El título de cada prueba lleva sus etiquetas: `[TC-M00-140][RT-M00-05][RNF-17] descripción`.
Un caso con `it.each` tiene varias ejecuciones; su resultado es FAIL si alguna falla.

## Evidencia de ejecución

`pnpm test:evidence -- M00` crea `docs/testing/ejecuciones/<fecha>_<commit>_<etiqueta>/` con:

- `unit.json`, `integration.json`, `e2e.json`: salida `--json` de Jest; lo único que se modifica son las rutas absolutas, que se reescriben como relativas a `apps/backend`.
- `resumen.md`: fecha, commit (indica si había cambios sin commit), ambiente, totales, resultado por requisito y por caso.

Los resultados se toman solo de la salida de Jest. Un caso omitido o una suite que no pudo ejecutarse aparece como **NO EJECUTADA**.

## Salvaguarda de destino C2 e incompatibilidades temporales

`test/support/c2-target-guard.ts` (`assertC2BranchTarget`) exige `C2_MODE` (`postgres`, `concurrency`, `r2` o `auth`) y
un único destino aprobado, `C2_TARGET`: proyecto `royal-paper-10258990`, rama `br-shy-pond-b50a3m8f`, endpoint
`ep-withered-block-b5e8v9ov`. Cualquier otra rama, aunque tenga un formato válido, se rechaza al cargar el spec y sin
conexiones. La única marca aprobada para datos confirmados es `C2_PERSISTENT_FIXTURES` (`c2-persistent-accepted`).

Desde esta salvaguarda (2026-11-08), dos grupos de pruebas versionadas son **temporalmente incompatibles**. No están
retiradas: se conservan sin cambios y quedan pendientes de una integración futura con un destino y un modo autorizados.

| Pruebas | Qué esperan | Por qué no se ejecutan ahora |
|---|---|---|
| `test/flujo/**/*.flow-spec.ts` (`flow-guard.ts`) | Rama `br-floral-mode-b5hqaix0` / `ep-cool-base-b55xjarv` y `C2_COMMITTED_FIXTURES=flujo-medicos-accepted` | La salvaguarda solo admite `C2_TARGET` y no existe un modo de flujo |
| `test/concurrency/legal-publication.conc-spec.ts` | Una rama desechable con `C2_COMMITTED_FIXTURES=disposable-branch` | La salvaguarda solo admite `C2_TARGET` y esa marca no está autorizada |

Ninguno de los dos forma parte de `pnpm test`, así que la incompatibilidad solo impide ejecutarlos contra Neon. Las
comprobaciones puras de `test/flujo/*.spec.ts` siguen en la suite unitaria.

## Evidencias de las ejecuciones C2 (lanzador `pnpm c2`)

Las pruebas contra la rama C2 de Neon y el bucket R2 de pruebas se ejecutan solo con el lanzador
(`apps/backend/scripts/c2-run.ts`; modos `postgres`, `concurrency`, `r2` y `auth`). El modo `r2` todavía no está
integrado ni autorizado: `test/r2/`, `jest-r2.json` y `c2-mode-r2.ts` no están versionados. El manifiesto de R2
(`r2-run.ts`) se versiona solo como biblioteca, sin ejecuciones reales. Desde la etapa 1 de evidencias
(2026-11-06), cada `pnpm c2 run` guarda un paquete propio. `check` y `preflight` no generan evidencias.

**Ubicación.** `C:\pei-c2-evidencias\<AAAA-MM-DD>\<C2_RUN_ID>\`: fuera del repositorio (no se versiona) y separada de
`C:\pei-c2\`, que contiene `.env.c2` con secretos. El lanzador rechaza una raíz dentro del repositorio o dentro de
`C:\pei-c2\`. El directorio de cada ejecución se crea sin reutilizar uno existente y ningún archivo se sobrescribe.

| Archivo | Contenido | Cuándo |
|---|---|---|
| `run.started.json` | Registro inicial (estado `running`) | Al empezar |
| `run.json` | `C2_RUN_ID`, UUID derivado, modo, suite, commit, si había cambios sin commit, destino (proyecto, rama, endpoint y, en `r2`, bucket; sin secretos), fechas, estado (`completed`, `failed`, `interrupted`) y código de salida | Al terminar o al interrumpirse con Ctrl+C |
| `jest-results.json` | Salida `--json` de Jest | La escribe Jest |
| `jest-output.log` | stdout y stderr de Jest con depuración conservadora (secretos conocidos de `.env.c2`, cadenas de conexión, cookies, tokens, correos no sintéticos, CURP y RFC no sintéticos, cadenas largas de alta entropía) | Durante la ejecución |
| `pg-before.json`, `pg-after.json` | Huella de PostgreSQL: recuentos y hashes por tabla, **nunca filas** | Preparado; todavía no se genera |
| `r2-manifest.json`, `r2-final-check.json` | Operaciones sobre objetos de la ejecución y comprobación final por prefijos | Solo en el modo `r2` (los escribe el spec; ver más abajo) |
| `SHA256SUMS` | SHA-256 de todos los archivos anteriores | Al terminar |

Si existe `run.started.json` pero no `run.json`, la ejecución terminó de forma inesperada: lo escrito hasta ese momento
se conserva, sin `SHA256SUMS`.

**Manifiesto de R2** (`test/support/r2-run.ts`, etapa 2, 2026-11-06).

- Al cargarse, el spec vincula el manifiesto al directorio de la ejecución (`attach`): `r2-manifest.json` se crea en
  exclusiva y nunca sobre uno existente.
- Después de cada operación (subida, lectura, borrado, limpieza, fallo, registro de un médico y comprobación final) se
  reescribe de forma atómica: archivo temporal propio y renombrado. Una interrupción conserva todo lo registrado hasta
  ese momento. Las escrituras son síncronas, así que las operaciones concurrentes no se pisan.
- Si una escritura falla, la operación se conserva en memoria, el fallo queda en `persistenceErrors` y la siguiente
  escritura lo incluye. El spec exige que no haya ninguno.
- Propiedad: `put` exige que el médico de la clave sea de la ejecución, ya sea el UUID derivado de `C2_RUN_ID` o un
  médico registrado con `allowDoctor`. `allowDoctor` exige el origen (`createDoctor`) y la cuenta sintética de **esta**
  ejecución (`gst-m00-test-<C2_RUN_ID>-…`); un UUID suelto no basta.
- `delete` y la limpieza exigen además que la clave se haya subido en la ejecución.
- Las lecturas y las comprobaciones de los specs pasan por el manifiesto; la única excepción son las dos claves inválidas
  de TC-M03-302, que el adaptador rechaza sin llamar a R2.
- `cleanup` conserva la última limpieza (el formato de las evidencias anteriores), `cleanups` acumula todas y
  `finalCheck` guarda el recuento por prefijos del listado final.
- Sin `C2_EVIDENCE_DIR` (ejecuciones fuera del lanzador), el manifiesto se escribe una sola vez al final en el directorio
  temporal, también en exclusiva.

**Original y resumen versionable.** El paquete de `C:\pei-c2-evidencias\` es la evidencia original y nunca se versiona
automáticamente: la rama C2 se creó a partir de la base de desarrollo (llamada `production` en documentos anteriores)
y puede contener datos personales; ninguna expresión regular garantiza detectarlos todos. Un resumen en `docs/testing/ejecuciones/` solo puede prepararse a partir de un paquete que supere
`reviewForVersioning` (`test/support/c2-evidence.ts`): la revisión rechaza el paquete ante cualquier archivo no
admitido o binario, cualquier marca de depuración (indica que había algo sensible) o cualquier patrón dudoso, sin repetir
el valor encontrado. Aun así, el resumen se revisa a mano antes de cualquier commit.

**Permisos y respaldo.**

- Restringir el acceso al usuario local, por ejemplo en PowerShell:
  `icacls C:\pei-c2-evidencias /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F"`.
- Respaldar periódicamente la carpeta completa en un medio con acceso restringido (por ejemplo, la unidad institucional)
  y conservarla al menos hasta el cierre de M03 y la entrega académica. Antes de respaldar y después de restaurar,
  comprobar la integridad con `SHA256SUMS`.
- No guardar nunca `.env.c2` ni otros secretos dentro de `C:\pei-c2-evidencias\`.

**Consultar una ejecución por `C2_RUN_ID`.** El identificador aparece en la consola al empezar
(`run <modo>: <spec> (C2_RUN_ID=…)`) y la ruta del paquete al terminar (`evidencias: …`). Para localizarla después:
`Get-ChildItem C:\pei-c2-evidencias -Directory -Recurse -Filter <C2_RUN_ID>`; para comprobar su integridad, comparar
cada línea de `SHA256SUMS` con `Get-FileHash -Algorithm SHA256 <archivo>`. Las matrices de trazabilidad enlazan cada
ejecución por su `C2_RUN_ID`.

Las evidencias anteriores a esta etapa (2026-11-03 y 2026-11-04) siguen donde se generaron; sus limitaciones se documentarán en
la trazabilidad de M03 cuando se integre esa entrega.

## Matrices de trazabilidad por módulo

- [M00 Fundaciones](trazabilidad/M00-fundaciones.md)
- [M01 Audit](trazabilidad/M01-audit.md)
- [M02 Identity](trazabilidad/M02-identity.md) (borrador: evidencia definitiva pendiente)
- [M07 Agenda médica](trazabilidad/M07-agenda.md) (dobles en memoria; integración con BD pendiente)
