# M03 · R2: borrador de trazabilidad (INTEGRADO en `M03-doctors.md`, 2026-11-10)

**Estado.** Este archivo era el borrador de la validación de R2 del 2026-11-04. Su contenido ya está integrado y
actualizado en `docs/testing/trazabilidad/M03-doctors.md`:

- **Matriz:** filas de R2 real y de las evidencias, el manifiesto y la huella de C2 (TC-M03-298 a 306 y 307 a 334).
- **Casos de prueba:** TC-M03-298 a 334.
- **Validación con infraestructura real:** sección «R2 (2026-11-04 y 2026-11-10)».
- **Riesgos y decisiones pendientes:** filas 24, 25 y 28.

**Ejecuciones válidas (2026-11-10, commit `91de98f` con cambios locales):**
- `c2-20261110235152-506c`: TC-M03-298 a 303, 6/6.
- `c2-20261110235308-76ca`: TC-M03-304 a 306, 3/3.

Las dos con la huella de PostgreSQL de 13 tablas `equal` y el bucket vacío al terminar. Evidencias en
`C:\pei-c2-evidencias\2026-11-10\<C2_RUN_ID>\`.

**Cierre (2026-11-11).** R2 está **cerrado para el alcance actual de M03 en C2**:
- Pendiente 24 (conservación de evidencias): propuesta **aprobada**. `C:\pei-c2-evidencias\` es la ubicación permanente de
  trabajo, los paquetes no se versionan y el repositorio conserva la trazabilidad.
- Pendiente 25 (objetos huérfanos): propuesta **aprobada**. Se acepta el riesgo residual, sin barrido automático; la
  conciliación manual de solo lectura queda como condición previa para habilitar R2 en producción (D-19).
- Pendiente 28 (Cloudflare): **verificado mediante confirmación manual de la persona usuaria** (bucket sin acceso
  público; token limitado a `pei-docs-c2-test` con solo Read y Edit de `Workers R2 Storage Bucket Item`).

El detalle está en `M03-doctors.md` (sección «R2 (2026-11-04 y 2026-11-10)» y filas 24, 25 y 28).

El texto siguiente se conserva sin cambios como antecedente (ejecuciones del 2026-11-04, anteriores a la etapa 2 del
manifiesto). Este archivo se puede eliminar una vez versionado `M03-doctors.md`.

---

## Borrador original (2026-11-04)

| DT-18, R-11, D-16, D-19, DT-6 (almacenamiento privado con R2 real) | C2 | `test/r2/private-storage.r2-spec.ts`, `test/support/r2-run.ts`, `test/support/r2-verify.ts`, `test/jest-r2.json` | TC-M03-298 a 303 | Lanzador C2, modo `r2`, `c2-20261104162631-70e6`: 6/6; manifiesto; bucket vacío al terminar | Interna |

| D-16, D-19, DT-6, D-17, D-22 (documentos del médico con PostgreSQL y R2 reales) | C2 | `test/r2/doctor-documents.r2-spec.ts` | TC-M03-304 a 306 | Lanzador C2, modo `r2`, `c2-20261104162955-f9c7`: 3/3; 13 tablas con recuentos y hashes iguales; bucket vacío al terminar | Interna |

| TC-M03-298 | C2 | R2 real | `test/r2/private-storage.r2-spec.ts` | [DT-18] | subida y lectura de PNG, JPEG y PDF: bytes idénticos (SHA-256) y `ContentLength` real |

| TC-M03-299 | C2 | R2 real | ídem | [DT-18] | streaming de un documento de unos 5 MB: se recibe en varias partes y completo |

| TC-M03-300 | C2 | R2 real | ídem | [DT-18] | un objeto inexistente responde `StoredFileNotFoundError` |

| TC-M03-301 | C2 | R2 real | ídem | [DT-18] | borrado idempotente: borrar dos veces no falla y después el objeto no existe |

| TC-M03-302 | C2 | R2 real | ídem | [DT-3] | una clave fuera de la gramática del bucket privado se rechaza sin llamar a R2 |

| TC-M03-303 | C2 | R2 real | ídem | [DT-18] | credenciales inválidas (solo en ese caso): `DocumentStorageError` sin clave, bucket ni credenciales en el mensaje |

| TC-M03-304 | C2 | PostgreSQL y R2 reales | `test/r2/doctor-documents.r2-spec.ts` | [D-16][D-22] | las claves guardadas en PostgreSQL existen en R2 con los mismos bytes (SHA-256); la lectura del admin queda auditada |

| TC-M03-305 | C2 | PostgreSQL y R2 reales | ídem | [D-19][D-16] | aprobar la INE purga en R2 el frente y el reverso; la cédula se conserva con los mismos bytes |

| TC-M03-306 | C2 | PostgreSQL y R2 reales | ídem | [DT-6][D-17] | cédula duplicada: la transacción falla y la compensación elimina el objeto subido; no queda en R2 |

#### R2 (2026-11-04)


Primeras pruebas de M03 contra Cloudflare R2 real. Lanzador C2 (`pnpm c2`, `scripts/c2-run.ts`): carga solo
`C:\pei-c2\.env.c2`, ejecuta Jest desde un directorio sin `.env`, deja Resend vacío y exige en el modo `r2` que
`R2_BUCKET_NAME === C2_EXPECTED_BUCKET === pei-docs-c2-test`. Antes de cada ejecución, `pnpm c2 preflight r2` confirmó
la identidad real de Neon (`neon.project_id`, `neon.branch_id` y `neon.endpoint_id`) y el acceso al bucket
(`HeadBucket`).

| Destino | Valor |
|---|---|
| Proyecto Neon | `royal-paper-10258990` |
| Rama | `br-shy-pond-b50a3m8f` (C2 persistente; nunca `production`) |
| Endpoint | `ep-withered-block-b5e8v9ov` (conexión directa) |
| Bucket R2 | `pei-docs-c2-test` (exclusivo de C2) |

**Identificación de los objetos (opción A).** Las claves conservan la gramática de producción (`doctor-identity/…`,
`doctor-licenses/…`, `doctor-photos/…`); la ejecución se identifica por el `doctorProfileId`: el UUID v5 derivado de
`C2_RUN_ID` en las pruebas del adaptador, o el de los médicos sintéticos creados por la ejecución en las de integración.
Un manifiesto por ejecución registra cada operación (sin bytes, credenciales ni datos personales). La limpieza solo borra
claves que el manifiesto registró como subidas y que pertenecen a la ejecución; `ListObjects` solo se usó para la
comprobación final, por prefijos de la ejecución.

| Ejecución | Casos | `C2_RUN_ID` | UUID derivado | Resultado | Evidencia |
|---|---|---|---|---|---|
| Adaptador R2 (`private-storage.r2-spec.ts`) | TC-M03-298 a 303 | `c2-20261104162631-70e6` | `8cb16c66-9111-5fce-bc45-8cdffe1472b2` | **6/6** | `c2-20261104162631-70e6-r2-manifest.json` |
| Documentos con PostgreSQL y R2 (`doctor-documents.r2-spec.ts`) | TC-M03-304 a 306 | `c2-20261104162955-f9c7` | `c87aa31d-4d77-57a8-a589-900c5bf11a27` | **3/3** | `c2-20261104162955-f9c7-doctor-documents-manifest.json` |

Resultados del adaptador: 5 subidas correctas, 1 subida fallida a propósito (TC-M03-303, credenciales inválidas en una
instancia propia; las demás pruebas usaron las credenciales reales sin cambios), 2 lecturas de objetos inexistentes
esperadas, 2 borrados de la prueba de idempotencia y 4 borrados en la limpieza. **0 objetos pendientes; bucket vacío**
(listado de solo lectura del bucket completo y de los prefijos de la ejecución).

Hallazgos de la integración:

- **TC-M03-304:** las claves guardadas en PostgreSQL corresponden a objetos existentes en R2; integridad verificada con
  SHA-256; la lectura del administrador queda auditada.
- **TC-M03-305:** la purga de la INE elimina en R2 el frente y el reverso; la cédula profesional se conserva.
- **TC-M03-306:** con un número de cédula duplicado, la transacción falla y la compensación elimina el objeto subido.
- **PostgreSQL:** las operaciones fueron dentro de `withRollback`. Las 13 tablas verificadas (`user`, `session`,
  `account`, `verification`, `user_profile`, `patient_profile`, `doctor_profile`, `doctor_identity_verification`,
  `doctor_license_verification`, `legal_document`, `user_legal_acceptance`, `audit_log` y `specialty`) conservaron el
  mismo recuento y el mismo hash antes y después; no persistieron registros de la ejecución (0 usuarios con su
  `C2_RUN_ID`, 0 usuarios y 0 eventos de auditoría posteriores al corte).
- **R2:** los 8 objetos subidos se eliminaron (3 por la propia lógica: 2 en la purga y 1 en la compensación; 5 en la
  limpieza de cada prueba). Bucket vacío al terminar.
- No se ejecutó la CLI de conciliación global (recorre las INE de toda la rama y modificaría registros preexistentes).
- No se modificaron registros preexistentes ni los documentos legales vigentes (`privacy_policy@dev-1` y
  `doctor_terms@dev-1`, los mismos antes y después).

**Evidencia.** Los manifiestos están fuera del repositorio, en `%TEMP%\pei-c2-evidence\` del equipo donde se
ejecutaron; no están versionados. Contienen claves, operaciones, resultados y nombres de error, sin bytes, credenciales
ni datos personales.

**Limitación de la evidencia (no es una falla de las pruebas).** En el manifiesto de la integración, el campo `cleanup`
conserva solo el resultado de la última limpieza (la de TC-M03-306). Las operaciones individuales de las tres limpiezas
sí están en `operations`, y cada prueba verificó que su limpieza terminara sin claves pendientes.


| 24 | Evidencia de las pruebas reales de R2 (2026-11-04): los manifiestos están en `%TEMP%\pei-c2-evidence\`, fuera del repositorio y sin versionar; una limpieza del directorio temporal los perdería | Pendiente: decidir dónde se conservan |

| 25 | R2 y PostgreSQL: la compensación cubre el fallo de la transacción (TC-M03-306), pero un borrado de compensación fallido deja un objeto huérfano (solo un log) y un `COMMIT` confirmado cuya respuesta se pierda llevaría a borrar objetos de una fila confirmada. Sin prueba ni barrido de huérfanos | Pendiente de decisión |
