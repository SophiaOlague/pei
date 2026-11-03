# M03 Médicos: registro de decisiones

Registro versionado de las decisiones de diseño e implementación de M03 (incluido el incremento controlado de M02, A1–A3).
PEI es la aplicación; Gestinnovo, la empresa.

> **Estas decisiones no son requisitos del Documento Maestro.** El Documento Maestro V2.2 (PDF) es la fuente normativa de
> requisitos (R-1). Las decisiones de este registro concretan o complementan esos requisitos y se aprobaron en las
> revisiones de diseño. Por ejemplo, la CURP no aparece en el PDF V2.2: proviene de decisiones (DT-22 de M02, D-1, D-20/D-35, R-12).

## 1. Fuentes y su estado

Las fuentes originales están fuera del repositorio (área de trabajo de la sesión de diseño). Este registro conserva sus
identificadores y su estado.

| Fuente | Fecha | Clasificación | Observaciones |
|---|---|---|---|
| Diseño M03 v3 (`M03-design-v3.md`) | 2026-10-07 | **Parcialmente definitiva**: aprobada el 2026-10-07; partes superadas por decisiones posteriores (sección 6) | Reemplaza a las v1 y v2. Su §B pone las decisiones por encima del PDF; prevalece la jerarquía vigente: **PDF V2.2 primero** |
| Plan de implementación M03 v2 (`M03-implementation-plan-v2.md`) | 2026-10-12 | **Borrador ejecutado parcialmente**: su encabezado dice «para revisión»; las fases A1–A3 se ejecutaron con aprobación de cada punto de control | Solo se registran aquí sus desviaciones controladas (DC-1 a DC-4) y la opción A. No se versiona completo |
| Preparación de A3 v2 (`A3-preparacion-v2.md`, §6, P1–P5) | 2026-10-12 | **Propuestas con estado individual** (sección 5) | — |

## 2. Decisiones funcionales (diseño v3 §0.1)

Estado: **aprobadas** con el diseño v3 (2026-10-07), salvo que la sección 6 indique lo contrario.

| ID | Decisión |
|---|---|
| D-1 | El registro del médico requiere INE, CURP, cédula (número en string más archivo) y la aceptación legal vigente |
| D-2 | Claves privadas de R2; nunca se guardan URLs públicas ni firmadas |
| D-3 | Archivo de la cédula: PDF, PNG o JPG/JPEG |
| D-4 | La cédula admite reenvíos y conserva historial |
| D-5, D-26, D-33, D-34 | Catálogo de especialidades configurado por el admin; una especialidad por médico; desactivar no borra y quien la tiene la conserva sin pasar a `pending`; no se asigna a nuevos médicos. Catálogo inicial: Infectología, Psicología y Medicina general |
| D-9, D-21, D-29 | Los cambios de INE, número o documento de cédula o especialidad se aplican de inmediato y devuelven al médico a `pending`. Bio, foto y teléfono se editan libremente. **Acotada por C-16 (2026-10-28):** la CURP y el nombre legal salieron de esta lista porque el médico ya no puede cambiarlos (RN-138) |
| D-10 | Lista mínima de eventos de auditoría (diseño v3 §I; ver la sección 6) |
| D-13, D-23 | Si no tiene `canOperate` (aprobación administrativa `approved` y registro completo, aceptación legal vigente incluida), el médico solo entra, consulta su estado y completa su registro. Las citas existentes son asunto de M08. **Precisada por D-38 (2026-11-03):** antes se expresaba como «si no está `approved`» |
| D-16, D-22 | La cédula se conserva en R2 privado; la ven el médico dueño y el admin (con auditoría). Plazo de conservación: dependencia legal |
| D-17 | Respuesta genérica ante duplicados; la causa solo queda internamente |
| D-19 | La INE del médico sigue el flujo de M02 |
| D-20, D-35 | Una persona no puede tener cuenta de paciente y de médico. **CURP única entre roles.** Sin conversión de rol |
| D-24, D-30, D-31 | `registrationComplete` se deriva, se compone por rol y significa «entregó todo», no «aprobado» |
| D-25 | El motivo de rechazo es obligatorio |
| D-27 | INE y cédula se revisan por separado; `approved` exige ambas aprobadas y registro completo |
| D-28 | ~~Cambiar la CURP o el nombre legal lleva a `pending` y exige una INE nueva~~. **Sustituida por C-16** (2026-10-28): ni el médico ni el paciente editan su CURP ni su nombre legal; se retiró `PUT /me/doctor-profile/identity`. Corrección: DP-CORR (sección 7) |
| D-32 | Requisitos legales: paciente `privacy_policy` + `patient_terms`; médico `privacy_policy` + `doctor_terms` |
| D-36 | Sin directorio, perfil público ni búsqueda de médicos en M03 |
| Admin | Solo `admin` aprueba o rechaza; no existe un rol revisor |
| Alcance | La agenda es de M07. Las citas, la ocupación y las consecuencias de volver a `pending` son de M08 |
| N1 | `privacy_notice` v1 y `terms_and_conditions` v1 y sus aceptaciones se conservan; se crean los tipos nuevos |
| N2 | `appointment_duration_minutes` es de M07; cambiarla no devuelve al médico a `pending` |
| N3 / R-7 | Estado global derivado, sin persistir |
| N4 | Matriz de efectos de cada cambio (diseño v3 §E.3) |
| N5 | Sin admin permanente en producción; en pruebas, fixtures. Aprobaciones bloqueadas hasta el bootstrap real de M02 |

Los identificadores D-6 a D-8, D-11, D-12, D-14, D-15 y D-18 no figuran en el diseño v3 y no se registran.

## 3. Resoluciones de diseño (R-, Z-)

| ID | Resolución | Estado |
|---|---|---|
| R-1 | El PDF V2.2 es el Maestro vigente; el DOCX es un borrador no normativo; la trazabilidad usa la numeración del PDF | Aprobada |
| R-2 | Una revisión pendiente invalidada pasa a `superseded`; nunca vuelve a aprobarse ni rechazarse | Aprobada |
| R-4 | El admin puede editar el nombre visible de una especialidad; `code` es inmutable | Aprobada (cerrada técnicamente en v3) |
| R-5 | Tamaño máximo: cédula 10 MB; INE y foto 5 MB | Aprobada (cerrada técnicamente en v3) |
| R-6 | Número de cédula: string de 1 a 20 caracteres `[0-9A-Za-z-]`; validación solo sintáctica | Aprobada (cerrada técnicamente en v3) |
| R-8 | La aceptación legal se audita para todos los roles (cambio en M02) | Aprobada; **implementada en A2** |
| R-10 | Trigger de coherencia `doctor_profile`/`patient_profile` con el rol | Aprobada (cerrada técnicamente en v3); implementada en A4 (`0008`): aplicada en la rama temporal `rama` y en `production` (2026-10-20) |
| R-11 | Puerto de almacenamiento privado compartido en `modules/private-storage` | Aprobada; **implementada en A1** |
| R-12 | La CURP pasa a `user_profile` con un único `UNIQUE`; no queda otra fuente de verdad; la migración conserva el dato del paciente de desarrollo | Aprobada; **implementada en A3** (`0007`) |
| R-13 | Una versión nueva de un documento legal requerido invalida la aceptación anterior (registro incompleto). **Precisada por D-38:** afecta `legalAccepted`, `registrationComplete` y `canOperate`, nunca el estado administrativo `status` ni las revisiones aprobadas | Aprobada; **implementada en A2**; precisión de D-38 implementada sin commit |
| R-14 | INE del médico: JPEG o PNG, frente y reverso | Aprobada (cerrada técnicamente en v3) |
| Z-1 | Precedencia del estado administrativo: `pending` > `rejected` > `approved` (ambas líneas aprobadas) > `pending`. **Enmendada por D-38 (2026-11-03):** ya no exige el registro completo; la aceptación legal y el perfil no intervienen | Aprobada; enmienda implementada sin commit |
| Z-2 | El admin puede reactivar una especialidad; nunca se elimina; activar o desactivar se audita | Aprobada |

R-3 y R-9 no figuran en el diseño v3 y no se registran.

## 4. Incremento controlado de M02 (diseño v3 §N)

| ID | Cambio | Fase | Estado |
|---|---|---|---|
| M02-1 | La CURP pasa a `user_profile` (R-12) | A3 | Implementado (`779b13b`) |
| M02-2 | Duplicados sin revelar la causa (D-17): `RegistrationDataConflictError` | A3 | Implementado (`779b13b`). **Sin el evento de auditoría** previsto en v3 (sección 6, P2) |
| M02-3 | Aceptaciones legales auditadas (R-8) | A2 | Implementado (`b40058f`) |
| M02-4 | Legal por rol (D-32, N1), migración 0006 | A2 | Implementado (`b40058f`) |
| M02-5 | Almacenamiento al puerto privado compartido (R-11) | A1 | Implementado (`a176934`). El adaptador se llama `R2PrivateObjectStorage`, no `R2DocumentStorage` (sección 6) |
| M02-6 | `/me` y estado de registro por rol (D-31) | A4 | Implementado en el árbol de trabajo, sin commit (opción (a) de D-A4-2) |
| M02-7 | Coherencia de rol (R-10), migración 0008 | A4 | Implementado en el árbol de trabajo, sin commit. `0008` ensayada (C2 v10 `verificar-0008`), aplicada en `rama` (`aplicar-0008`, 2026-10-20) y validada con la integración de A4 (C2 v10.1 `probar-a4`, 8/8, solo en `rama`). Aplicada en `production` el 2026-10-20 (C2 prod-0008; controles previo y posterior PASS, sin ejecutar allí la integración) |

## 5. Desviaciones controladas y decisiones de ejecución

| ID | Fase | Decisión | Estado |
|---|---|---|---|
| DC-1 | A1 | Los errores de almacenamiento conservan sus nombres de M02; claves como `string`; gramática general en el adaptador | Definitiva |
| DC-2 | A2 | Se difiere el puerto `LegalRequirementsReader` hasta B5 (sin consumidor en A2) | Aprobada; diferida a B5 |
| DC-3 | A2 | `legal:publish` permite una sola versión nueva cuando el régimen del rol ya está vigente | Definitiva |
| DC-4 | A2 | IDs duplicados en `POST /me/legal-acceptances` → 400 en el DTO y en el caso de uso; a lo más un evento por aceptación insertada | Aprobada en la revisión de PC-A2 |
| Opción A (plan v2 §7ter) | B | Cambio del nombre legal: ambas revisiones +1; la línea de identidad pasa a requerida; la cédula recibe una revisión `legal_name_changed` que reutiliza el documento conservado | Aprobada (2026-10-07); implementada en B5. **Retirada por C-16** (2026-10-28) junto con D-28. El valor `legal_name_changed` sigue en el enum de la BD (`0011`) sin uso; no se migra |
| P1 | A3 | Vía de recuperación de `0007` tras su aplicación en la rama `production` (2026-10-17; entorno organizacional por confirmar): inverso lógico como vía principal; restauración de Neon como último recurso, al punto registrado antes de aplicarla (LSN `0/2CB7398`) | **Pendiente** de confirmación (plan, ventana de historial y punto de restauración): el inverso lógico solo se ensayó en `rama`, no en `production`, y la viabilidad de la restauración de Neon no está confirmada |
| P2 | A3 | El conflicto de registro **no** se audita en `audit_log` (respeta M01 D1, D2 y D6); causa interna en el error y log `warn` sin datos personales | **Aprobada** (2026-10-12, fecha de la aprobación en conversación; no consta en un archivo fuente); implementada en A3 (TC-M03-052) |
| P3 | A3 | `scripts/dev-fix-curp-dt22.mjs` se conserva sin cambios hasta cerrar M02; después, nota de obsolescencia | **Aprobada** (2026-10-12, fecha de la aprobación en conversación; no consta en un archivo fuente) |
| P4 | A3 | El traslado de `0007` no modifica `user_profile.updated_at` | **Aprobada** (2026-10-12, fecha de la aprobación en conversación; no consta en un archivo fuente); `0007` no lo toca |
| P5 | A3 | Integración y ensayo de `0007` antes de su aplicación en la BD de destino: rama temporal de Neon (C2) | **Ejecutada** (2026-10-14): `0007` aplicada y validada, en esa fecha, solo en la rama temporal `rama` (`br-autumn-sun-b52qoep4`), creada a partir de `production`; pruebas de integración y E2E PASS como validación interna |
| D-A4-1 | A4 | Los triggers de coherencia rol-perfil de `0008` fallan con `P0001`, como `0005` (A7). Ningún endpoint lo provoca: el rol lo fija el caso de uso; es una defensa en la BD | **Aprobada** (2026-10-18, en conversación; no consta en un archivo fuente); implementada en `0008`; comprobada en `rama` (P0001 en N1–N4 y T1–T5, 2026-10-20) y en `production` (P0001 en T1–T5, transacción revertida, 2026-10-20) |
| D-A4-2 | A4 | Opción (a): el estado de registro se compone por rol; el paciente conserva su contrato actual; el médico sigue recibiendo `null` hasta la fase B (sus requisitos necesitan `0009`–`0012`); admin y organización reciben `null`. `GET /me/registration-status` sigue reservado al paciente | **Aprobada** (2026-10-18, en conversación; no consta en un archivo fuente); implementada en A4 (sin commit) |
| DC-5 | B1 | `0009` sin los triggers de `specialty` (DELETE, TRUNCATE y `code` inmutable): siguen el plan v2 (0012, B3) y no el diseño v3 §L (0009). Mientras tanto, la aplicación no expone borrado y el DTO de edición no admite `code` | Sigue el plan v2 §3; sin decisión nueva |
| DC-6 | B4 | Interpretaciones del dominio: `*_resubmission` en `missing` con línea `required` e historial; envío de cédula con línea `required` e historial = `resubmission`; la versión profesional sube siempre que cambia el número del perfil (también el inicial); `registrationComplete` sigue a plan v2 §7bis.2 | **Aprobada** (2026-10-20, en conversación) |
| DC-7 | B5 | DC-2 se resuelve con el puerto restringido `DOCTOR_IDENTITY_GATEWAY` de Identity (crear el `user_profile` del médico, leer y cambiar su identidad legal y teléfono, y `doctorLegalAccepted`) en lugar de un `LegalRequirementsReader` separado | Implementada (sin commit) |
| DC-8 | B7 | La sección del médico en `GET /me` se registra en `RoleProfileSectionRegistry` de Identity al iniciar `DoctorsModule` (Identity no depende de M03). Cumple el «hasta la fase B» de D-A4-2 | Implementada (sin commit) |

## 6. Previsiones superadas

| Fuente | Previsión | Superada por | Motivo |
|---|---|---|---|
| Diseño v3 §I (evento `identity.registration.conflict`) | Auditar el conflicto de registro en una transacción separada, con `field` | **P2** | Un evento que sobrevive al rollback de la operación fallida contradice M01 D2 |
| Diseño v3 §N, fila M02-2 | «log y evento `identity.registration.conflict` con la causa» | **P2** | Ídem: queda solo el log `warn` sin datos |
| Plan v2 §11 (evento `identity.registration.conflict` en A3 y B5) | Evento en una UoW separada tras el 23505 o la comprobación previa | **P2** | Ídem. Para B5 (`license_number`) se aplicará el mismo criterio salvo nueva decisión |
| Diseño v3 §N, fila M02-5 | «`R2DocumentStorage` se mueve a `private-storage`» | Implementación de A1 | El adaptador se renombró a `R2PrivateObjectStorage` |
| Diseño v3 §B (orden de fuentes) | Decisiones por encima del PDF | Jerarquía vigente del proyecto | El PDF V2.2 prevalece; las decisiones aprobadas lo concretan sin contradecirlo |
| D-28 y opción A (plan v2 §7ter) | El médico cambia su CURP o su nombre legal con `PUT /me/doctor-profile/identity` | **C-16** (RN-138) | La regla aprobada prohíbe que el propio usuario edite su CURP o su nombre legal |

## 7. Decisiones pendientes

| Tema | Pendiente |
|---|---|
| P1 | Confirmar la vía de recuperación de `0007`, ya aplicada en `production` (2026-10-17): viabilidad de la restauración de Neon al punto registrado y, en su caso, validación del inverso lógico fuera de `rama`. El entorno organizacional de `production` sigue por confirmar |
| Enumeración de CURP | Con la unicidad entre roles, el 409 genérico revela que la CURP existe en cualquier rol (también médicos). Requiere aceptación explícita del riesgo; el contrato de respuesta no se cambia sin decisión |
| Rama temporal de Neon `rama` (`br-autumn-sun-b52qoep4`) | Conservarla (necesaria para la evidencia formal; tiene `0007` y `0008` aplicadas) o eliminarla |
| `0008` en `production` | Aplicada y verificada el 2026-10-20 (C2 prod-0008). Pendiente: ventana de restauración de Neon sin verificar (recuperación por inverso lógico, validado solo en `rama`), evidencia de la ejecución fuera del repositorio y despliegue del código de A4 (sin commit) |
| Evidencia formal | Procedimiento de evidencia formal en la rama temporal (E0), pendiente de autorización |
| `admin:bootstrap` | Cierre formal de M02 con excepción documentada o esperar a la ejecución real |
| DP-CORR | Flujo futuro definido en la sección 8 (2026-10-30), sin implementar. Hoy no existe ninguna vía para corregir una CURP o un nombre legal, ni de autoedición (prohibida por RN-138, C-16) ni del administrador. Sigue pendiente el catálogo de documentos oficiales aceptados |
| ~~D-38 (estado global y aceptación legal)~~ | **Resuelta el 2026-11-03: ver la sección 8.4.** Hallazgo del 2026-11-03 (auditoría del panel administrativo). En `doctor-status.ts`, `status: 'approved'` exige `registrationComplete`, que incluye `legalAccepted`. Con una versión legal nueva sin reaceptar, un médico con INE y cédula aprobadas pasa a `pending`: las revisiones aprobadas se conservan (D-37 se cumple literalmente), pero el estado global mezcla la aceptación legal con la aprobación administrativa, contra la independencia de controles de D-37 y RN-140. Falta decidir si `status` refleja solo la aprobación administrativa (con la aceptación legal como indicador separado) y cómo se expone al administrador. Sin cambios en el backend hasta decidirlo. Bloquea la etapa 2 del panel administrativo (listado y filtros por estado) |

## 8. DP-CORR y orden de prioridades de M03

Registrado el 2026-10-30. Esta sección es documental: no cambia el código, el esquema, los endpoints ni las pruebas.

### 8.1 DP-CORR: solicitud de corrección de identidad

**Estado: flujo futuro definido, sin implementar.** No se implementará durante la etapa actual; su implementación queda
pospuesta hasta la fase final de M03.

**Contexto.** La validación actual de la CURP comprueba el formato oficial, la entidad federativa y el dígito
verificador (`modules/identity/domain/curp.ts`), y la unicidad entre roles. No la contrasta con el nombre ni con la
fecha de nacimiento. En ningún caso esas validaciones garantizarían que los datos correspondan a la identidad oficial
de la persona. Por eso se contempla un procedimiento excepcional para corregir errores de identidad.

| # | Decisión |
|---|---|
| 1 | Tanto pacientes como médicos pueden presentar una solicitud de corrección de identidad |
| 2 | La solicitud puede involucrar la CURP, el nombre legal o ambos |
| 3 | Se solicitan documentos oficiales definidos según el tipo de corrección |
| 4 | La revisión y la aprobación corresponden a un administrador autorizado distinto del solicitante |
| 5 | Si la solicitud se rechaza, el usuario puede presentar una nueva solicitud con un folio independiente |
| 6 | Una solicitud aprobada se aplica mediante un caso de uso controlado |
| 7 | La aplicación vuelve a validar la unicidad global de la CURP y registra la operación en auditoría |
| 8 | El usuario no puede modificar directamente su CURP ni su nombre legal |

**Alcance:**

- La validación actual de la CURP se conserva sin modificaciones.
- C-16 sigue siendo la regla vigente (RN-138; C-21 en el Maestro V2.4).
- DP-CORR no es una excepción de edición directa, ni para usuarios ni para administradores.

**Pendiente de definición:** el catálogo de documentos oficiales aceptados.

### 8.2 Orden de prioridades de M03

| Prioridad | Trabajo | Contenido |
|---|---|---|
| 1 | Términos y política de privacidad | Resolver las versiones legales aplicables a pacientes y médicos; resolver la compatibilidad de la política de privacidad compartida con los términos específicos de cada rol; garantizar que las aceptaciones queden registradas correctamente |
| 2 | Frontend de registro de médicos | Desarrollar la interfaz web de registro; integrar los datos y validaciones correspondientes; incorporar la aceptación de los documentos legales aplicables |
| 3 | Proceso administrativo de aceptación y rechazo | Desarrollar la interfaz administrativa para revisar solicitudes de registro médico; permitir aceptarlas o rechazarlas; registrar la decisión y sus evidencias |
| 4 | DP-CORR | Implementar el flujo de corrección de identidad (sección 8.1) al llegar a la fase final de M03 |

La aceptación de los términos y de la política de privacidad es independiente de la aprobación administrativa del
registro médico: aceptar los documentos no aprueba al médico, y la aprobación no sustituye la aceptación.

### 8.3 D-37: efecto de la falta de aceptación legal vigente

**Estado: aprobada documentalmente el 2026-10-30, pendiente de implementación.** Se recoge en RN-140 (cambio C-22 del
Maestro). Ningún bloqueo operativo descrito aquí está implementado.

La falta de aceptación legal vigente no bloquea la autenticación ni el acceso general a la cuenta. Solo se restringen
las operaciones que requieren expresamente las aceptaciones de cada rol, y se rechazan sin efectos secundarios.

| Situación | Comportamiento esperado |
|---|---|
| Primer registro | Conserva su flujo de aceptación legal |
| Usuario ya registrado con una versión nueva pendiente | Sigue accediendo a su cuenta. La falta de reaceptación no provoca un bloqueo global |
| Consulta y aceptación de documentos pendientes | Siempre disponibles |
| Vigencia | Se reevalúa al intentar una operación protegida. Las aceptaciones anteriores se conservan como evidencia histórica y no cuentan para una versión nueva cuando el régimen exige aceptarla |
| Paciente | Consulta su cuenta y su perfil. Para agendar necesita la aceptación legal vigente y los demás requisitos, incluida la INE aprobada |
| Médico | Completa las actividades de su registro, incluido el envío de INE y cédula, y consulta su perfil, su estado y sus documentos pendientes, aunque tenga una aceptación pendiente. No realiza operaciones que requieran estar habilitado sin aceptación legal vigente, aprobación administrativa y los demás permisos y requisitos funcionales |

**Independencia de controles.** La aceptación legal, la autenticación y la aprobación administrativa son independientes.
La aceptación no concede aprobación ni permisos funcionales, y la aprobación no sustituye mantener las aceptaciones
vigentes. Una versión legal nueva no elimina las revisiones administrativas ya aprobadas.

**Separación por módulos:**

| Módulo | Responsabilidad |
|---|---|
| M02 y M03 | Controles de identidad, registro y estado legal. En esta etapa se pueden adaptar interfaces y probar políticas |
| M08 | Agendamiento de citas por el paciente |
| Áreas con operaciones del médico habilitado | Agenda (M07), citas (M08), videoconsulta (`video`), expediente clínico (`clinical-record`) y prescripciones (`prescriptions`) |

Toda operación que requiera un médico habilitado comprueba, sea cual sea el módulo que la implemente: (1) la aceptación
legal vigente; (2) la aprobación administrativa del médico; (3) los demás permisos y requisitos funcionales. Las áreas
citadas son las identificadas hoy, no una lista cerrada. La conexión efectiva de las políticas a esas operaciones queda
pendiente de sus módulos respectivos.

**Trabajo pendiente registrado:**

- `RequireRegistration` (web) y `registration-gate.tsx` (móvil) aplican hoy restricciones globales que deberán
  ajustarse después. No se cambian en esta decisión.
- `GET /me/doctor/status` solo informa el estado legal y no identifica los documentos pendientes. La consulta detallada
  se contempla en la prioridad 2 (frontend de registro de médicos).

### 8.4 D-38: estado administrativo, aceptación legal y habilitación operativa

**Estado: aprobada el 2026-11-03 (opción A); implementada sin commit.** Resuelve el conflicto entre Z-1 y la
independencia de controles de D-37 y RN-140.

`DoctorStatus` (`doctors/domain/doctor-status.ts`) expresa tres conceptos independientes:

| Campo | Significado |
|---|---|
| `status` | Estado **administrativo**: resultado de las revisiones de INE y cédula (Z-1 enmendada). No depende de `registrationComplete` ni de la aceptación legal |
| `legalAccepted` | Aceptación de las versiones vigentes de `privacy_policy` y `doctor_terms` |
| `canOperate` | Habilitación operativa: `status === 'approved' && registrationComplete` |

`identity`, `professional`, `registrationComplete` (D-30: «entregó todo», aceptación legal incluida) y `missing` no
cambian de significado. No se introducen estados nuevos.

**Reglas:**

- Una versión legal nueva conserva la aprobación administrativa, no devuelve al médico a la cola de revisión ni genera
  `doctor.status.returned_to_pending`. El médico queda con `legalAccepted: false` y `canOperate: false`.
- Al aceptar la versión vigente recupera `canOperate` si cumple lo demás, sin una nueva aprobación.
- Aceptar los documentos legales no aprueba ni habilita a un médico pendiente o rechazado.
- Ninguna autorización operativa compara `status === 'approved'`: usa `isOperational` (`canOperate`) o
  `DoctorOperationalPolicy`. RN-140 no se conecta en módulos que aún no existen.
- Panel administrativo: el filtro «Aprobados» (`?status=approved`) es la aprobación administrativa; un aprobado con la
  aceptación pendiente permanece ahí. «Pendientes» (`?status=pending`) agrupa las líneas en revisión o sin enviar. La
  aceptación legal y la habilitación se muestran aparte, solo informativas.

**Compatibilidad:** el estado no se persiste (N3); sin migración ni backfill. Contratos aditivos: `legalAccepted` y
`canOperate` se añaden a `GET /me/doctor/status`, `GET /me` (sección del médico), `GET /admin/doctors`,
`GET /admin/doctors/:id` y `doctorStatus` de aprobar o rechazar. Cambia el significado de `?status=approved`.

**Maestro:** procede proponer **C-23** (ver la sección 9 del Maestro V2.3): precisar que la aprobación administrativa
del médico no depende de la aceptación legal y que la habilitación operativa exige ambas. No se ha modificado el
Maestro.

