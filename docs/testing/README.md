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

## Matrices de trazabilidad por módulo

- [M00 Fundaciones](trazabilidad/M00-fundaciones.md)
- [M01 Audit](trazabilidad/M01-audit.md)
- [M02 Identity](trazabilidad/M02-identity.md) (borrador: evidencia definitiva pendiente)
