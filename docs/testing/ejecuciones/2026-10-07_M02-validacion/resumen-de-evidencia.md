# M02 Identity: resumen de evidencia (BORRADOR)

> **Borrador.** La evidencia definitiva de pruebas de M02 es la **tercera corrida** de `pnpm test:evidence M02`, que está
> pendiente hasta disponer de una red con latencia normal hacia Neon. Ninguna de las corridas fallidas de este documento
> es evidencia definitiva.

Gestinnovo es la empresa; PEI es la aplicación. Este documento reúne, en orden, todo lo que se validó para M02 y cómo.
No contiene CURP reales, claves de objetos, URLs públicas de R2 ni credenciales.

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

## 1. Corrección del dato de desarrollo (DT-22, opción A)

| Paso | Resultado |
|---|---|
| Script | `apps/backend/scripts/dev-fix-curp-dt22.mjs`: solo lectura por defecto; escribe solo con `--apply --confirm-dev`; rechaza `NODE_ENV=production`; exige que cada `UPDATE` afecte exactamente 1 fila; nunca imprime CURP |
| Antes | 1 fila incumplía el formato aprobado (solo el 2.º carácter); 1 corregible, 0 no corregibles |
| Aplicación | 1 fila corregida: 2.º carácter y dígito verificador. No se modificó el patrón |
| Después (solo lectura) | 0 CURP fuera del patrón, 0 nulas, 0 en minúsculas, 0 duplicadas |
| Otros datos | Huellas md5 idénticas antes y después en `user`, `account`, `session`, `verification`, `user_profile`, `patient_profile` (sin `curp` ni `updated_at`), `patient_identity_verification`, `legal_document`, `user_legal_acceptance` y `audit_log` |

## 2. Migraciones 0004 y 0005

| Migración | sha256 | `created_at` en `drizzle.__drizzle_migrations` |
|---|---|---|
| `0004_m02_identity.sql` (Drizzle + 3 `RENAME COLUMN` agregados a mano) | `2aec3ba6b991166889301ceb8f4e69957bd489dd1a688c956d286aaebad86602` | 1791326720263 |
| `0005_m02_identity_guards.sql` (SQL personalizado) | `f4295c31e741fd007d3f90b3984b834d240600bec5d64317f2c2a86f2f934434` | 1791326732522 |

**Validación con `BEGIN … ROLLBACK`: 41/41 PASS.**
- Revisión estática: los renombres son `RENAME COLUMN`, sin `DROP COLUMN`. Ninguna sentencia modifica datos; las únicas
  eliminaciones son el `DROP CONSTRAINT` de `UNIQUE(patient_id)` y dos `DROP NOT NULL`.
- Catálogo y comportamiento comprobados: renombres; claves anulables; `attempt`; `documents_deleted_at`;
  `photo_object_key`; CURP NOT NULL, CHECK de mayúsculas, CHECK de formato y UNIQUE; `UNIQUE(patient_id, attempt)`;
  índice único parcial de `pending`; CHECK de claves por estado; `UNIQUE(type, published_at)`; trigger de rol inmutable;
  `TRUNCATE` bloqueado en las tablas legales.
- Después del `ROLLBACK`: esquema original y 4 migraciones registradas, sin restos.

**Aplicación con `pnpm db:migrate`**, autorizada:
- Comprobaciones previas: 0000–0003 aplicadas con hash coincidente; solo 0004 y 0005 pendientes.
- Resultado: `migrations applied successfully!`.
- **Verificación posterior en solo lectura: 23/23 PASS.** 6 migraciones registradas; todas las restricciones existen y
  están validadas; la CURP existente las cumple; la fila `pending` de desarrollo se conserva con `attempt = 1`.
- Datos no relacionados: huellas md5 idénticas antes y después.

## 3. Corridas de pruebas

| Etapa | Corrida | Unitarias | Integración | E2E | Total | Estado |
|---|---|---|---|---|---|---|
| A | Validación post-migración (2026-10-06, ~23:40 UTC, `jest --json` fuera del script de evidencia) | 240/240 | 56/56 | 78/78 | 374/374 PASS | **Validación interna, no evidencia formal**: su salida no está versionada ni es reproducible desde el repositorio |
| B | `2026-10-07T17-54-22_da65914-dirty_M02` (primera de evidencia) | 240/240 | 56/56 | 77/78 | 373/374 | **DESCARTADA (diagnóstico)**: TC-M01-204 por timeout E2E de 5 s |
| C | `2026-10-07T18-07-48_da65914-dirty_M02` (segunda de evidencia) | 240/240 | 55/56 | 78/78 | 373/374 | **DESCARTADA (diagnóstico)**: TC-M02-117 por timeout de integración de 60 s |
| D | Tercera corrida de `pnpm test:evidence M02` | — | — | — | — | **PENDIENTE**: será la evidencia formal y definitiva; requiere una red con latencia normal hacia Neon |

**Etapa A** (validación interna, no evidencia formal). M02 178/178 (110 unitarias, 20 de integración y 48 E2E). M00 116/116, M01 62/62, anteriores a M00 18/18.
BD idéntica antes y después (conteos y huellas de 10 tablas).

**Etapa B** (descartada).
- TC-M01-204 (E2E de M01 contra Neon real) superó el límite por defecto de Jest de 5 s; ninguna aserción falló.
- La configuración E2E no tenía `testTimeout`. Aislada, la prueba tardó 3927, 5015 (FAIL), 2344, 1779 y 4046 ms.
- BD sin cambios.
- **Corrección autorizada:** `"testTimeout": 30000` en `apps/backend/test/jest-e2e.json`. No se modificó TC-M01-204 ni se
  agregaron reintentos.

**Etapa C** (descartada).
- TC-M01-204 pasó, y todo E2E (78/78).
- TC-M02-117 superó el límite de 60 s después de 4 aserciones correctas, sin ninguna aserción fallida.
- En la misma corrida, TC-M02-108 tardó 52,5 s, contra 1,7 s el día anterior.

## 4. Diagnóstico posterior a la etapa C (solo lectura)

| Comprobación | Resultado |
|---|---|
| BD | Conteos y huellas de 10 tablas idénticos a la referencia; verificación del esquema de M02 23/23 |
| `pg_stat_activity` | Ninguna otra sesión de cliente; 0 `idle in transaction` |
| `pg_locks` | Ningún bloqueo sobre las tablas de M02, ninguna sesión bloqueada, 0 bloqueos consultivos |
| TC-M02-117 aislada, 5 veces | Todas PASS: 42 694, 17 666, 21 966, 34 610 y 23 515 ms (el día anterior, 2 601 ms) |
| Pruebas de M01 sin cambios de código | TC-M01-100: 491 ms el día anterior, 4 912 ms en la corrida C |
| Servidor Neon | Ejecución de una consulta simple: **0,24 ms** (mediana). 0 deadlocks, 0 archivos temporales, 98 % de aciertos de caché, BD de 12 MB de 1024 MB. El compute se reanudó a las 18:22 UTC (suspensión por inactividad) |
| Red desde el equipo de pruebas | Ida y vuelta de la misma consulta: **222 ms** (mediana); TLS 233–549 ms; DNS 211 ms |
| neonstatus.com | All Systems Operational; AWS us-east-2 operativo el 6 y el 7 de octubre |

**Conclusión del diagnóstico:**
- No hubo bloqueos ni contaminación de la BD, y el servidor Neon está sano.
- La lentitud está en la red entre el equipo de pruebas y Neon (us-east-2). Cada consulta paga ~200–550 ms de ida y
  vuelta, y las pruebas largas superan los límites de tiempo.
- No se aumentó el `testTimeout` de integración.

**No verificable en solo lectura** (requiere el panel o la API de Neon): tamaño del compute, autoescalado, historial de
suspensiones y consumo del plan.

## 5. Infraestructura real

| Validación | Resultado | Detalle |
|---|---|---|
| R2 (`pei-documents-dev`) con el adaptador real | **PASS 10/10** | Subida privada de un objeto sintético; lectura desde el backend con bytes idénticos; GET anónimo al endpoint S3 → HTTP 400; acceso por la URL pública del bucket anterior → 404; eliminación; lectura posterior → `NoSuchKey`; eliminación repetida idempotente; 0 objetos residuales (bucket con 0 objetos) |
| Resend con `ResendEmailSender` real | **PASS** | `RESEND_API_KEY` y `EMAIL_FROM` definidas (valores no mostrados); un envío a `delivered@resend.dev`, la dirección de prueba de Resend → HTTP 200 con id de mensaje |
| `admin:bootstrap` real | **PENDIENTE** (pospuesto, opción B) | Ver sección 6 |

En R2 no se comprobó:
- la transmisión por el endpoint HTTP del administrador con R2 real (cubierta con almacenamiento falso, TC-M02-216);
- el acceso por `r2.dev` del bucket nuevo, que está desactivado según la configuración confirmada en el panel.

Ninguna validación modificó Cloudflare ni el bucket anterior.

`R2_PUBLIC_URL` se eliminó de `apps/backend/.env`. Antes se verificó que ningún código, script, prueba ni configuración
de ejemplo la usa: solo aparece en un comentario y en TC-M02-087, que comprueba que se ignora.

## 6. `admin:bootstrap` y su dependencia

- El CLI está implementado y probado con dobles y con rollback (TC-M02-051, 092, 093, 112 y 113). **No se ejecutó de verdad.**
- Datos acordados para la ejecución: correo acordado del administrador inicial, nombre Administración, apellidos Pei.
  La BD sigue sin administradores.
- Comprobación con la configuración actual (Better Auth en memoria, sin escribir en Neon ni enviar correos):
  - `BETTER_AUTH_URL = http://localhost:3000` y `APP_WEB_URL` no definida.
  - Verificación: `http://localhost:3000/api/auth/verify-email?token=<TOKEN>&callbackURL=%2F` → funciona (302 y sesión),
    pero solo en la máquina donde corre el backend.
  - Contraseña: `http://localhost:3000/api/auth/reset-password/<TOKEN>?callbackURL=` →
    `error?error=INVALID_TOKEN`, porque `callbackURL` va vacío. El `POST /api/auth/reset-password` directo sí funciona (200).
- **Dependencia pendiente:** `APP_WEB_URL` no está definida y el cliente web todavía no tiene la pantalla para
  establecer la contraseña desde el enlace del correo. Se desbloquea con:
  1. esa pantalla, que recibe `token` y envía `POST /api/auth/reset-password`;
  2. `APP_WEB_URL` apuntando a ella, con su origen en `AUTH_TRUSTED_ORIGINS`;
  3. `BETTER_AUTH_URL` accesible desde donde se abra el correo.

## 7. Carpetas de evidencia de M02

| Carpeta | Uso |
|---|---|
| `2026-10-07T17-54-22_da65914-dirty_M02/` | Etapa B: **descartada, de diagnóstico**. Se conserva por decisión de cierre (ver su `DESCARTADA.md`) |
| `2026-10-07T18-07-48_da65914-dirty_M02/` | Etapa C: **descartada, de diagnóstico**. Se conserva por decisión de cierre (ver su `DESCARTADA.md`) |
| `2026-10-07_M02-validacion/` (esta) | DT-22, migraciones, corridas, diagnóstico e infraestructura real |
| Etapa D (futura) | Evidencia formal y definitiva de M02 |
