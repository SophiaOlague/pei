# Documento Maestro V2.3 (documento vivo)

Requerimientos, reglas de negocio y consideraciones normativas de **PEI**, la app de Gestinnovo.

## 0. Control del documento

| Elemento | Valor |
|---|---|
| Versión | 2.3, **borrador vivo** |
| Base | Documento Maestro V2.2 en PDF (03-oct-2026), con su numeración |
| Fecha de inicio | 2026-10-17 |
| Estado | Borrador. Los cambios del registro de la sección 1 están aprobados por la responsable del producto. El documento se cerrará como V2.3 cuando se genere el PDF y se apruebe |
| Esquema asociado | `schema_gestinovo_v2_2.dbml` más los cambios de la sección 7. Pendiente: actualizarlo a una versión 2.3 |

### Cómo se usa este documento

1. **Todo lo que no aparece aquí sigue igual que en el PDF V2.2**, que se mantiene sin cambios.
2. Aquí se escribe el **texto completo y vigente** de cada requisito o regla que cambia, no solo la diferencia.
3. Cada decisión o requisito nuevo que se apruebe se añade así:
   - una fila en el registro de cambios (sección 1);
   - el texto en su sección;
   - un ID nuevo, a partir del último usado (sección 9).
4. Una decisión técnica aprobada **no entra en el Maestro** hasta que se apruebe aquí como requisito o regla.
5. La columna «Implementación» informa del avance. No cambia lo que exige el requisito.
6. Los documentos académicos no generan cambios en este documento (`docs/academico/instrucciones-academicas.md`).

---

## 1. Registro de cambios

| ID | Fecha de aprobación | Sección | Cambio | Tipo | Fuente | Implementación |
|---|---|---|---|---|---|---|
| C-1 | 2026-10-17 | 5.1 | RN-138: CURP obligatoria, válida y única entre roles | Nuevo | DT-22, DP-12; D-1, D-20/D-35, R-12 | Implementada (`779b13b`, `0007`) |
| C-2 | 2026-10-17 | 5.1 | RN-139: una persona no puede ser paciente y médico a la vez | Nuevo | D-20, D-35 | Implementada mediante C-1; coherencia de rol pendiente (`0008`) |
| C-3 | 2026-10-17 | 3.1 | RF-03: documentos legales según el rol | Modificación | D-32, N1, DC-3 | Implementada (`b40058f`, `0006`); sin documentos nuevos publicados |
| C-4 | 2026-10-17 | 3.1 | RF-04: efecto de una versión nueva. **Prioridad: de Should a Must** | Aclaración y modificación | R-13; decisión del 2026-10-17 | Implementada (A2) |
| C-5 | 2026-10-17 | 3.1 | RF-05: requisitos del registro de médico | Aclaración | D-1, D-3, D-4, D-5, R-5, R-6, R-14 | Pendiente (incremento B) |
| C-6 | 2026-10-17 | 3.1 | RF-06: motivo de rechazo obligatorio | Modificación | D-25 | Pendiente |
| C-7 | 2026-10-17 | 3.1, 5.1 | RF-06, RN-004: revisiones separadas y estado derivado | Aclaración | D-27, R-7/N3, Z-1, R-2 | Pendiente |
| C-8 | 2026-10-17 | 3.1 | RF-07: formatos de la INE y eliminación al resolverse | Aclaración | DP-11, DT-2, DT-4, DT-5; D-19 | Implementada para el paciente; pendiente para el médico |
| C-9 | 2026-10-17 | 3.1 | RF-65: catálogo de especialidades (Must) | Nuevo | D-5, D-26, D-33, D-34, R-4, Z-2 | Pendiente |
| C-10 | 2026-10-17 | 4 | RNF-09: almacenamiento privado de INE y cédula | Aclaración | DP-15, DT-1, DT-3, DT-18; D-2, D-16, D-22, R-11 | Implementada para el paciente; pendiente para el médico |
| C-11 | 2026-10-17 | 4 | RNF-10 y RNF-21 (Must): respuesta genérica y **mitigación** de la enumeración | Aclaración y nuevo | D-17, P2; decisión del 2026-10-17 | Respuesta genérica implementada (A3); mitigación pendiente de diseño |
| C-12 | 2026-10-17 | 3.9, 4 | RF-52, RNF-08: la aceptación legal se audita | Aclaración | R-8 | Implementada (A2) |
| C-13 | 2026-10-17 | 5.1 | RN-004: qué puede hacer un médico no aprobado | Aclaración | D-13, D-23, D-9/D-21/D-29 | Pendiente |
| C-14 | 2026-10-17 | 3.1 | RF-02: alta del primer administrador | Aclaración | DP-5, DT-12; N5 | Implementada (`admin:bootstrap`); no ejecutada |
| C-15 | 2026-10-17 | 7.2 | Integridad de la CURP y coherencia de rol | Modificación | DT-22; R-10 | CURP implementada (`0007`); coherencia de rol pendiente (`0008`) |

Las decisiones de la columna «Fuente» se detallan en `docs/arquitectura/M03-decisiones.md` (D-, N-, R-, Z-) y en
`docs/testing/trazabilidad/M02-identity.md` (DP-, DT-).

---

## 3. Requerimientos funcionales

### 3.1 Identidad, acceso y aspectos legales

Solo se transcriben los requisitos que cambian. RF-01, RF-08 y RF-09 siguen igual que en V2.2.

| ID | Requerimiento | Prior. | Criterio de aceptación | Dep. | Cambio |
|---|---|---|---|---|---|
| RF-02 | Roles y permisos | Must | Cada usuario tiene un único rol y un único perfil de dominio; el sistema aplica permisos según patient/doctor/admin/organization. **El rol `admin` no se puede asignar desde el cliente. El primer administrador se crea con un procedimiento controlado de la plataforma, que falla de forma segura si ya existe uno.** | RF-01 | C-14 |
| RF-03 | Aceptación legal en registro | Must | No concluye el registro sin aceptar **los documentos legales vigentes de su rol: el paciente, `privacy_policy` y `patient_terms`; el médico, `privacy_policy` y `doctor_terms`**. Se guarda versión y fecha. **Los documentos anteriores (`privacy_notice`, `terms_and_conditions`) y sus aceptaciones se conservan. El paciente sigue con ellos hasta que los dos documentos nuevos de su rol estén publicados y vigentes.** | RF-01 | C-3 |
| RF-04 | Reaceptación legal | **Must** | Una nueva versión de **un documento legal requerido invalida la aceptación anterior: el registro queda incompleto hasta aceptarla**. **Al aceptarla, el estado se restablece sin reabrir revisiones.** | RF-03 | C-4 |
| RF-05 | Registro de médico | Must | El médico se registra **con INE (frente y reverso, JPEG o PNG), CURP, cédula (número de 1 a 20 caracteres alfanuméricos o guion, y archivo PDF, PNG o JPG de hasta 10 MB), una especialidad activa (RF-65) y la aceptación legal vigente de su rol**, y queda en estado pending para revisión. **La cédula admite reenvíos y conserva su historial.** | **RF-03, RF-65** | C-5 |
| RF-06 | Aprobación o rechazo de médico | Must | El administrador **aprueba o rechaza por separado la INE y la cédula del médico, y debe registrar el motivo de cada rechazo**. **El estado del médico se deriva de esas revisiones (RN-004).** Solo el administrador aprueba o rechaza. El médico no recibe citas hasta ser aprobado. | RF-05 | C-6, C-7 |
| RF-07 | Verificación de identidad del paciente | Must | INE frontal/reverso, estado de revisión y motivo de rechazo. **Imágenes JPEG o PNG de hasta 5 MB, validadas por su contenido. Solo puede haber un envío pendiente a la vez, y solo se reenvía tras un rechazo. Las imágenes se eliminan cuando el envío se aprueba o se rechaza; el historial de envíos se conserva. La INE del médico sigue el mismo flujo.** | RF-01 | C-8 |
| **RF-65** | **Catálogo de especialidades** | **Must** | **El administrador gestiona un catálogo de especialidades: crea, edita el nombre visible, desactiva y reactiva, sin borrar. Cada médico tiene una especialidad. Una especialidad desactivada no se asigna a médicos nuevos; quien ya la tiene la conserva sin volver a pending. Catálogo inicial: Infectología, Psicología y Medicina general. Los cambios del catálogo se auditan (RF-52).** | **RF-02** | C-9 (nuevo) |

Notas:
- **RF-65, prioridad.** Must, confirmada el 2026-10-17. RF-05 (Must) exige una especialidad activa y depende de este
  catálogo.
- **RF-65, ubicación.** Se numera a continuación del último RF de V2.2 (RF-64), pero pertenece a la sección 3.1.

### 3.9 Notificaciones y auditoría

| ID | Requerimiento | Prior. | Criterio de aceptación | Dep. | Cambio |
|---|---|---|---|---|---|
| RF-52 | Auditoría | Must | Las acciones sensibles quedan registradas con actor (user o system), acción, recurso, fecha, IP y user-agent. **Entre ellas, la aceptación de documentos legales para todos los roles, en la misma transacción que la aceptación.** | — | C-12 |

---

## 4. Requerimientos no funcionales

| ID | Requerimiento | Prior. | Criterio | Cambio |
|---|---|---|---|---|
| RNF-08 | Auditoría | Must | Aprobaciones, canjes, cierres y acciones sensibles **(incluida la aceptación legal)** son trazables en un audit_log append-only, protegido contra UPDATE/DELETE. **`user_legal_acceptance` sigue siendo la evidencia legal (RNF-12).** | C-12 |
| RNF-09 | Datos sensibles | Must | Los mecanismos de protección deben cubrir los datos de salud y validarse para producción. **La INE y la cédula se guardan en almacenamiento privado; en la BD solo se guarda la clave del objeto, nunca una URL pública ni firmada. Se entregan a través del backend, sin caché, y solo al dueño y al administrador; la INE, solo mientras su revisión está pendiente. Los accesos del administrador se auditan. El plazo de conservación de la cédula es una dependencia legal pendiente (sección 8).** | C-10 |
| RNF-10 | Seguridad de API | Should | Aplicación de prácticas OWASP y controles perimetrales definidos por arquitectura. **Ante un dato de registro duplicado (por ejemplo, la CURP), el sistema responde con un error genérico que no revela qué dato coincide ni su valor. El intento fallido no se registra en la auditoría.** | C-11 |
| **RNF-21** | **Mitigación de la enumeración en el registro** | **Must** | **La respuesta genérica de RNF-10 todavía revela que el dato ya existe en algún rol. Ese riesgo se mitiga: el diseño debe impedir la comprobación masiva de datos de identidad. El mecanismo está pendiente de decisión. Controles actuales: la operación exige una sesión verificada y tiene límite de peticiones.** | C-11 (nuevo) |

Nota: la prioridad Must de **RNF-21** se confirmó el 2026-10-17. El mecanismo de mitigación sigue pendiente de decisión.

---

## 5. Reglas de negocio

### 5.1 Identidad y perfiles

Siguen igual que en V2.2: RN-001, RN-002, RN-003, RN-005 y RN-006.

| ID | Regla | Cambio |
|---|---|---|
| RN-004 | Un médico no atiende nuevas citas hasta ser aprobado por administración. **Está aprobado solo si su INE y su cédula están aprobadas y su registro está completo. Su estado se deriva de las revisiones vigentes: si alguna está pendiente, pending; si no, y alguna está rechazada, rejected. Una revisión pendiente que un cambio invalida pasa a superseded y conserva su historial. Mientras no está aprobado, el médico solo puede entrar y consultar su estado. Cambiar la INE, la CURP, la cédula, la especialidad o el nombre legal lo devuelve a pending. El efecto sobre sus citas existentes corresponde a la gestión de citas.** | C-7, C-13 |
| **RN-138** | **El paciente y el médico registran una CURP obligatoria, en mayúsculas, con el formato oficial y un dígito verificador válido. La CURP es única entre todos los usuarios, sin importar su rol, y el propio usuario no puede editarla.** | C-1 (nuevo) |
| **RN-139** | **Una persona no puede tener a la vez cuenta de paciente y de médico. No existe conversión de rol.** | C-2 (nuevo) |

Notas de implementación (informativas):
- **RN-138.** El dígito verificador se valida en la aplicación, no en la BD.
- **RN-138.** El cambio de CURP del médico está decidido (D-28: vuelve a pending y exige una INE nueva), pero no está
  implementado.
- **RN-138 y RN-139.** Se numeran a continuación del último RN de V2.2 (RN-137), pero pertenecen a la sección 5.1.

---

## 7. Modelo de datos

### 7.1 Tablas por dominio

Sin cambios. Las tablas nuevas del dominio Médico se añadirán cuando se implementen: la especialidad y las revisiones
de la INE y de la cédula del médico.

### 7.2 Constraints e integridad a implementar

Se añaden:
- `user_profile.curp`: única entre todos los roles, en mayúsculas, con formato válido y obligatoria para paciente y
  médico (RN-138). *Implementado en `0007`.*
- Coherencia de rol: `patient_profile` solo para usuarios `patient` y `doctor_profile` solo para `doctor`
  (RN-001, RN-139). *Pendiente, `0008`.*

---

## 8. Pendientes normativos añadidos

- Plazo de conservación de la cédula del médico (RNF-09). Lo debe validar la asesoría jurídica.

---

## 9. Próximos IDs libres

| Tipo | Último usado | Siguiente |
|---|---|---|
| RF | RF-65 | RF-66 |
| RNF | RNF-21 | RNF-22 |
| RN | RN-139 | RN-140 |
| Cambio | C-15 | C-16 |

## 10. Pendientes de decisión

| Tema | Qué falta |
|---|---|
| RNF-21 | Elegir el mecanismo de mitigación |
| Esquema DBML | Publicar `schema_gestinovo_v2_3.dbml`, coherente con la sección 7 |
| PDF V2.3 | Generarlo y aprobarlo; después, actualizar R-1 y las referencias de la trazabilidad |
