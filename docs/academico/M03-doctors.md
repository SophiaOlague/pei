# Evidencia académica de M03: Médicos (registro y verificación) de PEI

Gestinnovo es la empresa; PEI es la aplicación. Esta evidencia sale del código, las migraciones y las pruebas reales de
M03. Solo se incluyen los entregables del documento de dualidad que M03 permite demostrar; no se agregó funcionalidad para
cubrir ejemplos académicos.

Fuentes: [matriz de trazabilidad de M03](../testing/trazabilidad/M03-doctors.md),
[registro de decisiones de M03](../arquitectura/M03-decisiones.md) y la
[evidencia formal del 2026-10-20](../testing/ejecuciones/2026-10-20T09-32-22_35e205c_M03/resumen.md).

## Estado de M03

| Aspecto | Estado |
|---|---|
| Implementación | Completa en el repositorio: fases A1–A4 (incremento de M02) y B1–B8. B1–B8 en el commit `35e205c` |
| Evidencia formal | `pnpm test:evidence M03` sobre `35e205c`, árbol limpio: unitarias 588/588, integración 94/94 y E2E 104/104 PASS (2026-10-20, rama temporal limpia de Neon) |
| Concurrencia (dos conexiones) | 5/5 PASS en la rama temporal `rama`, en una corrida aparte con datos de prueba confirmados |
| Migraciones `0009`–`0012` | **Aplicadas solo en ramas temporales de Neon** (`rama` y su copia limpia), cada una ensayada antes con ROLLBACK |
| `production` | **Sin M03**: tiene aplicada hasta `0008`. La aplicación de `0009`–`0012` requiere un procedimiento y una autorización aparte |
| Fuera de alcance | Agenda y duración de la consulta (M07); citas y consecuencias de volver a `pending` (M08); directorio público de médicos (D-36) |

Distinción usada en todo el documento: **implementado y probado** significa que el código y las pruebas existen y pasan;
**aplicado** se refiere a una base de datos concreta. M03 no está desplegado en `production`.

---

## 1. Diseño técnico de M03

### Arquitectura

M03 es el módulo `apps/backend/src/modules/doctors`, con las capas de los módulos anteriores:

| Capa | Contenido |
|---|---|
| `domain/` | Funciones puras sin dependencias: `doctor-status.ts` (estado derivado), `review.ts` (ciclo de revisión), `sensitive-change.ts` (efectos de cada cambio), `specialty.ts`, `license-number.ts`, `legal-name.ts`, `object-keys.ts` y `doctor.errors.ts` |
| `application/` | Puertos (`DoctorProfileRepository`, `DoctorReviewRepository`, `SpecialtyRepository`), casos de uso, `DoctorStatusService`, `DoctorOperationalPolicy` y la sección del médico en `GET /me` |
| `infrastructure/persistence/` | Adaptadores Drizzle de los tres puertos |
| `presentation/` | Controladores REST, DTO con `class-validator`, interceptores de archivos y límites de frecuencia |

Dependencias con otros módulos:

- **Identity (M02):** M03 crea y modifica el `user_profile` del médico solo a través del puerto restringido
  `DOCTOR_IDENTITY_GATEWAY`. Ese puerto fija el rol `doctor`, mantiene la CURP única entre roles y responde a M03 si el
  médico aceptó los documentos legales vigentes. Identity exporta además `RATE_LIMITER` y
  `RoleProfileSectionRegistry`. Identity **no** importa M03; la prueba de arquitectura RT-M03-11 lo verifica.
- **Almacenamiento privado:** el puerto `PRIVATE_OBJECT_STORAGE` (R-11), con los espacios `doctor-identity`,
  `doctor-licenses` y `doctor-photos`.
- **Auditoría (M01):** `AuditTrail`, dentro de la misma `UnitOfWork` que la operación.

### Entidades y relaciones

| Tabla | Contenido principal | Relaciones |
|---|---|---|
| `specialty` | `code` (inmutable), `name` (único sin distinguir mayúsculas), `is_active`, `deactivated_at` | Referenciada por `doctor_profile` y `doctor_license_verification` con `ON DELETE RESTRICT` |
| `doctor_profile` | `license_number` (único, admite NULL hasta el primer envío), `bio`, `photo_object_key`, `identity_revision`, `professional_revision` | 1:1 con `user_profile`; N:1 con `specialty` |
| `doctor_identity_verification` | Una fila por envío de INE: `attempt`, `identity_revision`, claves del frente y del reverso, `status`, revisor, motivo, `documents_deleted_at` | N:1 con `doctor_profile`; el revisor es un `user_profile` |
| `doctor_license_verification` | Una fila por revisión de cédula: `attempt`, `professional_revision`, `reason`, `license_number`, `specialty_id`, `document_object_key`, `status`, revisor y motivo | N:1 con `doctor_profile` y con `specialty` |

Tipos: `doctor_review_status_enum` (`pending`, `approved`, `rejected`, `superseded`) y
`doctor_license_review_reason_enum` (`initial`, `resubmission`, `license_number_changed`, `license_document_changed`,
`specialty_changed`, `legal_name_changed`).

El estado global del médico **no se guarda** (N3, R-7): se deriva en cada lectura de sus revisiones vigentes.

### Reglas de negocio implementadas

- **Estado derivado (Z-1).** La revisión vigente de cada línea es la de mayor intento que no está `superseded` y que
  corresponde a la versión actual de la línea; sin revisión vigente, la línea está `required`. El estado global se
  evalúa en este orden: cualquier línea `pending` → `pending`; si no, cualquier `rejected` → `rejected`; ambas
  `approved` y registro completo → `approved`; en otro caso, `pending`.
- **Registro completo** (D-24, D-30): perfil con nombre legal, CURP válida y especialidad; ninguna línea en `required`;
  documentos legales vigentes del médico aceptados. Una revisión rechazada cuenta como entregada.
- **Cambios sensibles** (D-9, D-21, D-28, D-29): se aplican de inmediato.
  - Cambiar la CURP sube la versión de identidad.
  - Cambiar el nombre legal sube ambas versiones.
  - Cambiar el número o el documento de la cédula, o la especialidad, sube la versión profesional.
  - Cada cambio pasa a `superseded` la revisión pendiente de la línea afectada.
  - Si la cédula estaba `approved` o `pending`, el cambio de nombre o de especialidad crea una revisión automática que
    reutiliza el documento conservado.
  - Bio, foto y teléfono se editan libremente.
- **Envío de cédula** (plan v2 §7bis): el documento es siempre obligatorio y el motivo lo deduce el servidor:
  `initial`, `resubmission`, `license_number_changed` o `license_document_changed`.
- **Ciclo de revisión** (R-2): solo una revisión `pending` y vigente se aprueba o se rechaza. El rechazo exige un motivo
  de 10 a 500 caracteres (D-25). Los estados terminales son inmutables.
- **Política operativa** (D-13, RN-004): `DoctorOperationalPolicy` permite operar solo al médico `approved`. Se exporta
  para M07 y M08, que todavía no la consumen.
- **Duplicados** (D-17, D-20, D-35): una CURP de cualquier rol o un número de cédula ya registrado responden el mismo 409
  genérico. La causa solo queda en un log sin datos personales.

### Verificación de identidad y de cédula

| Aspecto | INE del médico | Cédula |
|---|---|---|
| Archivos | Frente y reverso, JPEG o PNG, 5 MB cada uno (R-14) | PDF, PNG o JPEG, 10 MB (D-3, R-5) |
| Tipo de archivo | Por firma binaria, no por el tipo MIME | Ídem |
| Reenvío con una revisión pendiente | La anterior pasa a `superseded` | Ídem |
| Conservación | Se purga al terminar la revisión: `approved`, `rejected` o `superseded` (D-19) | Se conserva (D-16) |
| Lectura por el administrador | Solo si la revisión está pendiente y vigente; un evento de auditoría por lado | En cualquier estado; un evento por lectura (D-22) |
| Lectura por el médico | No se expone | Solo la propia, por `GET /me/doctor/license-document` |

Las claves de objetos solo contienen UUID (`doctor-identity/{médico}/{envío}/{lado}.ext`,
`doctor-licenses/{médico}/{envío}.ext`). Ninguna respuesta incluye claves ni URLs, y los PDF se entregan como
`attachment` con `Content-Security-Policy: sandbox`. Si la purga posterior falla, la CLI `identity:purge-documents` la
completa.

### Especialidades

Catálogo configurable por el administrador (D-5, D-34). Los datos iniciales son `infectologia`, `psicologia` y
`medicina_general`.

- Solo se edita el nombre visible; `code` es inmutable (R-4).
- Una especialidad se desactiva y se reactiva, pero nunca se borra (D-26, Z-2).
- Una especialidad inactiva no se asigna (`SpecialtyInactiveError`, 422). Quien ya la tiene la conserva (D-33).

### Documentos legales

M03 usa el régimen por rol de M02 (D-32): el médico acepta `privacy_policy` y `doctor_terms` con
`POST /me/legal-acceptances`, y los consulta con `GET /legal-documents/current?audience=doctor`. La aceptación se audita
(R-8). Una versión nueva invalida la aceptación anterior (R-13) y deja al médico en `pending` sin reabrir sus
revisiones.

### Endpoints

| Método y ruta | Quién | Propósito |
|---|---|---|
| `GET /specialties` | Cualquier sesión | Especialidades activas |
| `GET`, `POST /admin/specialties`; `PATCH /admin/specialties/:id`; `POST /admin/specialties/:id/deactivate` y `/activate` | Admin | Catálogo |
| `POST /me/doctor-profile` | Cuenta sin perfil | Registro del médico |
| `GET`, `PATCH /me/doctor-profile` | Médico | Perfil; bio y teléfono |
| `PUT /me/doctor-profile/identity` | Médico | CURP o nombre legal |
| `PUT /me/doctor-profile/specialty` | Médico | Especialidad |
| `PUT`, `GET /me/doctor-profile/photo` | Médico | Foto |
| `GET /me/doctor/status`, `GET /me/doctor/verification-history` | Médico | Estado derivado e historial |
| `POST /me/doctor/identity-verifications` | Médico | Envío de la INE |
| `POST /me/doctor/license-verifications`, `GET /me/doctor/license-document` | Médico | Envío y lectura de su cédula |
| `GET /admin/doctors`, `GET /admin/doctors/:id` | Admin | Lista con estado derivado y detalle |
| `GET /admin/doctor-identity-verifications`, `/:id`, `/:id/documents/:side`; `POST …/:id/approve`, `…/:id/reject` | Admin | Cola, detalle, imágenes y revisión de la INE |
| `GET /admin/doctor-license-verifications`, `/:id`, `/:id/document`; `POST …/:id/approve`, `…/:id/reject` | Admin | Cola, detalle, documento y revisión de la cédula |
| `GET /me` (M02) | Médico | Desde B7 incluye su perfil y su estado con `canOperate` |

### Autorización

- Cada ruta exige sesión. Los roles se exigen con `@Roles` en el controlador **y** dentro de cada caso de uso, que
  falla cerrado (`DoctorProfileRequiredError`, `AdminRequiredError`).
- El médico nunca envía su `doctorProfileId`: se deduce de la sesión. Las rutas con id son solo del administrador.
- Solo el administrador revisa; no existe un rol revisor.
- Límites de frecuencia por usuario: envío de INE, envío de cédula, cambio de identidad y foto.

### Auditoría

21 acciones, registradas en la misma transacción que la operación:

- **Médico:** `doctor.profile.created`, `doctor.registration.completed` y `doctor.status.returned_to_pending`.
- **Cambios sensibles:** `doctor.curp.changed`, `doctor.legal_name.changed`, `doctor.license_number.changed` y
  `doctor.specialty.changed`.
- **Revisión de la INE:** `doctor.identity_verification.submitted`, `.superseded`, `.approved` y `.rejected`.
- **Revisión de la cédula:** `doctor.license_verification.submitted`, `.superseded`, `.approved` y `.rejected`.
- **Lecturas del administrador:** `doctor.identity_document.viewed` y `doctor.license_document.viewed`.
- **Catálogo:** `catalog.specialty.created`, `.updated`, `.deactivated` y `.activated`.

La metadata solo guarda números de intento y de versión, valores de catálogo (`reason`, `cause`, `from`, `side`), los
nombres de los campos editados, el `code` de una especialidad nueva y los identificadores de especialidad de un cambio.
Nunca guarda CURP, nombres, número de cédula, claves ni URLs; la prueba TC-M03-192 lo verifica.

### Migraciones

| Migración | Contenido | Aplicada en |
|---|---|---|
| `0009_m03_specialty_catalog` | Tabla `specialty` y catálogo inicial | `rama` (2026-10-20) y su copia limpia |
| `0010_m03_doctor_profile_drop_legacy` | Retira las columnas heredadas de `doctor_profile`; aborta si existen médicos | Ídem |
| `0011_m03_doctor_verifications` | Columnas nuevas de `doctor_profile`, tablas de revisión, FK, CHECK e índices (un solo pendiente por línea) | Ídem |
| `0012_m03_doctor_guards` | 7 funciones y 12 triggers: versiones de uno en uno, evidencia inmutable, transiciones solo desde `pending`, purga solo en estado terminal, sin DELETE ni TRUNCATE | Ídem |

Cada migración se ensayó primero en una transacción que terminó en ROLLBACK, con casos que debían fallar y casos que
debían pasar. Después se aplicó con autorización y se verificaron sus postcondiciones, mediante la herramienta C2 (fuera
del repositorio), que verifica la identidad de la rama antes de cada paso. **Ninguna de las cuatro está aplicada en
`production`.**

### Pruebas

| Nivel | Contenido | Resultado |
|---|---|---|
| Unitarias | Dominio (los 18 escenarios del diseño y las 32 combinaciones de Z-1), casos de uso con dobles, esquema y SQL de las migraciones, arquitectura | Incluidas en 588/588 |
| E2E con dobles | Rutas, guards, DTO, archivos, encabezados, enumeración, IDOR, límites de frecuencia | Incluidas en 104/104 |
| Integración | Adaptadores Drizzle contra PostgreSQL con los triggers de `0012`, con ROLLBACK | Incluidas en 94/94 |
| Concurrencia | Dos conexiones: candados y vigencia (E.5), dos administradores, envíos simultáneos y `FOR SHARE` | 5/5 en `rama`, aparte |

Los totales de la evidencia formal corresponden al sistema completo (M00–M03), no solo a M03. El detalle por caso
(TC-M03-001 a 192 y RT-M03-01 a 16) está en la matriz de trazabilidad.

---

## 2. Seguridad de la Información

| Tipo | Mecanismo | Evidencia |
|---|---|---|
| Preventivo | Documentos en un bucket privado, claves sin datos personales, transmisión por el backend con `no-store` | TC-M03-150, 159, 165; RT-M03-13 |
| Preventivo | Archivos validados por firma binaria y tamaño | TC-M03-135, 150, 191 |
| Preventivo | Sin enumeración: CURP y número de cédula duplicados responden lo mismo | TC-M03-148, 188 |
| Preventivo | Sin acceso a documentos ajenos; la INE nunca se expone al médico | TC-M03-189 |
| Preventivo | Límites de frecuencia en subidas y en cambios de identidad | TC-M03-190 |
| Integridad | Triggers de `0012` que impiden alterar la evidencia o saltarse versiones, aunque se use otro cliente | Ensayo C2 de `0012`; TC-M03-174, 177 |
| Detectivo | Auditoría de cada lectura de documentos por el administrador | TC-M03-159, 160, 181 |
| Correctivo | Purga de la INE al terminar la revisión y conciliación por CLI | TC-M03-134, 163, 182 |

| Activo | Amenaza | Control | Riesgo residual |
|---|---|---|---|
| INE del médico | Exposición | Bucket privado, lectura solo en `pending` y vigente, purga | Si la purga falla, permanece hasta la CLI |
| Cédula | Acceso no autorizado | Solo el dueño y el administrador, con auditoría | Se conserva por dependencia legal (D-22) |
| Estado del médico | Aprobación de evidencia vieja (carrera) | Candados, comprobación de vigencia y triggers | — |
| CURP y número de cédula | Enumeración | 409 genérico | El 409 sigue indicando que el dato existe (riesgo aceptado en M02) |

M03 no agregó dependencias.

---

## 3. Arquitectura Orientada a Servicios

| Propiedad | Evidencia en M03 |
|---|---|
| Bajo acoplamiento | Los casos de uso dependen de puertos. M03 llega a Identity solo por `DOCTOR_IDENTITY_GATEWAY`. Las pruebas sustituyen los adaptadores sin tocar los casos de uso (RT-M03-12, 14, 15) |
| Reusabilidad | `DoctorOperationalPolicy` se exporta para M07 y M08. `AuditTrail`, `UnitOfWork`, el almacenamiento privado y el limitador de frecuencia se reutilizan |
| Abstracción | Ningún caso de uso conoce SQL ni R2; el estado del médico es una función pura |
| Contratos | API REST con DTO validados. `GET /me` cambió solo para el médico (D-A4-2: `null` hasta la fase B) |
| Autonomía | Las reglas críticas también las impone PostgreSQL (CHECK, índices parciales y triggers) |

---

## 4. Administración de Proyectos: seguimiento

| Tarea | Estado |
|---|---|
| Diseño v3 y plan de implementación v2 | Aprobados con desviaciones registradas (DC-1 a DC-8) |
| Incremento de M02 (A1–A4) | Terminado; `0006`–`0008` aplicadas en `production` antes de M03 |
| B1–B8 | Terminadas (`35e205c`) |
| Migraciones `0009`–`0012` | Ensayadas y aplicadas en `rama`; pendientes en `production` |
| Evidencia formal | Registrada (2026-10-20) |
| Despliegue en `production` | **Pendiente**, con autorización aparte |

**Incidencias registradas:**
- Un ensayo de `0010`/`0011` falló por una expectativa errónea de la herramienta: `ON DELETE RESTRICT` responde `23001`,
  no `23503`. Se corrigió la expectativa y se repitió el ensayo.
- La primera regresión en `rama` falló por dos errores del soporte de pruebas, no del producto. Se corrigieron.
- Por decisión de la responsable del producto, la concurrencia se ejecutó en `rama` con datos permanentes. Por eso la
  evidencia formal se generó en una copia de `rama` restaurada a un punto anterior.

**Ruta crítica:** M07 (agenda) y M08 (citas) dependen de `DoctorOperationalPolicy`. El despliegue de M03 en
`production` depende de su propio procedimiento de migración.

---

## 5. Expresión Oral y Escrita: documentación técnica

- [Matriz de trazabilidad de M03](../testing/trazabilidad/M03-doctors.md), con los ensayos, las aplicaciones, la
  concurrencia y la evidencia.
- [Registro de decisiones de M03](../arquitectura/M03-decisiones.md).
- [Evidencia formal de M03](../testing/ejecuciones/2026-10-20T09-32-22_35e205c_M03/resumen.md).
