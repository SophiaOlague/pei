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
| C-16 | 2026-10-28 | 5.1 | RN-138: ni el paciente ni el médico editan desde su cuenta su CURP ni su nombre legal. RN-004 deja de prever que el médico los cambie | Modificación | DP-12; sustituye D-28 y acota D-9/D-21/D-29 (decisión del 2026-10-28) | Implementada sin commit: se retiró `PUT /me/doctor-profile/identity`; el paciente ya cumplía (DP-12). Corrección pendiente (DP-CORR) |
| C-22 | 2026-10-30 | 5.1 | RN-140: la falta de aceptación legal vigente restringe operaciones, no el acceso a la cuenta. Identificador tomado de la secuencia del Maestro V2.4, donde C-17 a C-21 ya están asignados | Nuevo | D-37 | Pendiente: aprobada documentalmente; bloqueos operativos sin implementar |
| C-23 | 2026-11-07 | 3.2 | RF-66: configuración del precio global de consulta (200.00 MXN inicial, versiones con vigencia inmediata, copia en la cita, auditoría) | Nuevo | CC-5; AP-1, AP-2, AP-9 | Implementado sin commit (backend y panel); carga inicial preparada, no ejecutada |
| C-24 | 2026-11-07 | 7.1 | Aprobadas las estructuras propuestas `appointment.cancellation_policy_id` y `consultation_price_configuration`. Las aprobó la persona responsable del proyecto, que declaró tener esa autoridad; no se atribuye al líder técnico | Aclaración | CC-10; AP-3 | Ya existían en `0000`; M08 las usa |
| C-25 | 2026-11-07 | 6.1 | Estado `rescheduled`: `confirmed → rescheduled`, terminal. La cita nueva conserva precio, política y pago (RN-018) | Nuevo | CC-3; AP-7 | Implementado (M08): 0013 aplicada en C2 y desarrollo; reagendamiento `b8673c6`, probado en C2 (`c2-20261110000243-57bd`) |
| C-26 | 2026-11-07 | 3.3, 5.2 | RF-19, RF-20, RN-025, RN-026 y RN-030: espera protegida con límite total, gracia de reconexión, salida voluntaria y momentos de determinación de inasistencia (N8, N9, N10) | Aclaración | CC-2; AP-5, AP-6, AP-22, AP-24, AP-25 | Implementado (`4e6ebe1`) en la primera entrega de videoconsulta (`modules/video`, 2026-11-22): espera protegida, gracia, salida voluntaria y N8–N10 según AP-25. Requiere 0019: aplicada en C2 (validada) y en desarrollo. Dos casos sin regla quedan pendientes (sección 10) |
| C-27 | 2026-11-07 | 5.1 | RN-140: la cancelación protectora del médico (RN-013) no exige estar habilitado | Aclaración | CC-7; AP-13 | Implementado sin commit (M08) |
| C-28 | 2026-11-07 | 3.2 | RF-12: listado de médicos reservables | Aclaración | CC-6; AP-12 | Implementado sin commit (M08) |
| C-29 | 2026-11-07 | 5.2 | RN-141: reembolso automático de un pago que no puede confirmar la cita; `expired` no se reactiva | Nuevo | CC-4; AP-8 | Contrato en M08 sin commit; el reembolso lo ejecutará pagos |
| C-30 | 2026-11-07 | 3.3 | RF-19: entrada a la sala 15 min antes, admisión por el médico (videoconsulta), resultado registrado en la cita | Aclaración | CC-9; AP-15 | Implementado (`4e6ebe1`) (`modules/video`, 2026-11-22): entrada desde T0 − 15, admisión y resultado en M08. El aviso a ambos solo se muestra en pantalla hasta que exista el módulo de notificaciones. 0019 aplicada y validada en C2 |
| C-31 | 2026-11-07 | 3.2 | La cancelación administrativa (RN-014) no tiene RF ni módulo; queda fuera de M08 | Pendiente de alcance | CC-8; AP-14 | Sin implementar |
| C-32 | 2026-11-07 (precisado el 2026-11-08) | 3.2, 7.1 | RF-12: la cita conserva las referencias a las dos aceptaciones legales vigentes al reservar (privacidad y términos), sin duplicar datos de M02; inmutables desde la reserva y copiadas al reagendar | Nuevo | CC-1, opción C; AP-19, AP-26 | Implementado (M02 `2daebe7`, M08 `41e07a5`): 0014 aplicada en C2 y desarrollo; persistencia validada en C2 (`c2-20261109140840-9cd4`, `c2-20261109235307-6c1b`) y copia al reagendar (`c2-20261110000243-57bd`) |
| C-33 | 2026-11-20 | 5.1 | RN-140: el médico que perdió su habilitación puede finalizar una videoconsulta suya que ya está en curso; no puede admitir, iniciar consultas ni obtener credenciales de la llamada | Aclaración | Diseño de videoconsulta, decisión 11 (`docs/arquitectura/Video-diseno.md` §9) | Implementado (`4e6ebe1`) (`modules/video`); pruebas TC-VID-140 a TC-VID-143, RT-VID-05 y TC-VID-304 (C2) |

Las decisiones de la columna «Fuente» se detallan en `docs/arquitectura/M03-decisiones.md` (D-, N-, R-, Z-), en
`docs/testing/trazabilidad/M02-identity.md` (DP-, DT-) y, para C-23 a C-32, en `docs/arquitectura/M08-diseno.md`
(CC-, AP-, DA-).

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

### 3.2 Citas y pago de consulta

Solo se transcriben los requisitos que cambian. RF-13 a RF-17 siguen igual que en V2.2.

| ID | Requerimiento | Prior. | Criterio de aceptación | Dep. | Cambio |
|---|---|---|---|---|---|
| RF-12 | Reservar, reagendar y cancelar cita | Must | La cita queda asociada a paciente, médico, scheduled_at y precio. Cancelar y reagendar siguen la política de citas (RF-15, RF-16); el reagendamiento conserva la referencia a la cita original. **El paciente elige entre los médicos reservables: solo los habilitados (`canOperate`) con al menos un horario libre en los próximos 31 días. Se muestran su nombre y su especialidad, solo con sesión de paciente, sin buscador ni perfil público. La cita conserva la referencia a la aceptación legal vigente del paciente al reservar, sin copiar sus datos.** | RF-11 | C-28, C-32 |
| **RF-66** | **Configuración del precio global de consulta** | **Must** | **El administrador configura el precio global de consulta, único para toda la plataforma (sin precio por médico ni por especialidad). Cada cambio crea una versión nueva con vigencia inmediata; las versiones anteriores no se modifican. La cita conserva en `appointment.price` el precio vigente al reservar. Los cambios posteriores no modifican las citas ni los pagos existentes, y el reagendamiento conserva el precio original. Se audita quién hizo el cambio, cuándo, y los precios anterior y nuevo. Precio inicial: 200.00 MXN.** | **RF-12, RF-13** | C-23 (nuevo) |

Notas:
- **RF-66.** Se numera a continuación de RF-65, pero pertenece a la sección 3.2. Reglas relacionadas: RN-007 y RN-021.
- **Cancelación administrativa (C-31).** RN-014 y la tabla de estados la prevén, pero ningún RF la asigna. Falta decidir
  su RF y su módulo; queda fuera de M08.

### 3.3 Videoconsulta

| ID | Requerimiento | Prior. | Criterio de aceptación | Dep. | Cambio |
|---|---|---|---|---|---|
| RF-19 | Sala de espera | Must | Si el médico continúa en otra consulta, el siguiente paciente permanece en espera; se notifica al paciente y al médico. **El paciente entra a la sala desde 15 minutos antes de la hora programada. El médico admite explícitamente al paciente cuando termina la consulta anterior. La admisión corresponde a videoconsulta, y el resultado final de la cita lo registra el módulo de citas. El retraso del médico no cancela ni vence la cita.** | RF-18 | C-26, C-30 |
| RF-20 | Ventana de espera del médico | Must | Ventana de espera configurable (por ejemplo, 30 minutos) desde la hora programada. Si vence y el paciente sí estuvo disponible pero el médico no inició la consulta, la cita queda como no_show_doctor, no como canceled, y se reembolsa el 100% al paciente. **Mientras el médico atiende otra consulta, la espera del paciente está protegida. El plazo del médico es `min(max(hora programada, fin de la consulta anterior) + ventana, hora programada + límite total)`. El límite total es configurable (valor inicial: 60 minutos) y la ventana ordinaria no se suma a él. Si se alcanza sin admisión y con el paciente disponible, la cita queda como no_show_doctor.** | RF-19, RF-46 | C-26 |

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
| RN-004 | Un médico no atiende nuevas citas hasta ser aprobado por administración. **Está aprobado solo si su INE y su cédula están aprobadas y su registro está completo. Su estado se deriva de las revisiones vigentes: si alguna está pendiente, pending; si no, y alguna está rechazada, rejected. Una revisión pendiente que un cambio invalida pasa a superseded y conserva su historial. Mientras no está aprobado, el médico solo puede entrar y consultar su estado. Cambiar la INE, la cédula o la especialidad lo devuelve a pending. El médico no cambia su CURP ni su nombre legal (RN-138); su corrección es un flujo definido documentalmente (DP-CORR), pendiente de implementación; hoy no existe ninguna vía. El efecto sobre sus citas existentes corresponde a la gestión de citas.** | C-7, C-13, C-16 |
| **RN-138** | **El paciente y el médico registran una CURP obligatoria, en mayúsculas, con el formato oficial y un dígito verificador válido. La CURP es única entre todos los usuarios, sin importar su rol. Ni el paciente ni el médico pueden editar desde su propia cuenta su CURP ni su nombre legal: se capturan al crear el perfil.** | C-1 (nuevo), C-16 |
| **RN-139** | **Una persona no puede tener a la vez cuenta de paciente y de médico. No existe conversión de rol.** | C-2 (nuevo) |
| **RN-140** | **La falta de aceptación de los documentos legales vigentes de su rol no impide la autenticación ni el acceso general a la cuenta: el usuario siempre puede consultar y aceptar sus documentos pendientes. Solo se rechazan, sin efectos secundarios, las operaciones que requieren expresamente esa aceptación: agendar, para el paciente; las operaciones que requieren un médico habilitado, para el médico. **Que el médico cancele sus propias citas confirmadas, con reembolso total al paciente (RN-013), no requiere que esté habilitado.** **Tampoco lo requiere que finalice una videoconsulta suya que ya está en curso; esa excepción no le permite admitir pacientes, iniciar consultas ni obtener credenciales de la llamada.** Toda operación de ese tipo comprueba, sea cual sea el módulo que la implemente, la aceptación legal vigente, la aprobación administrativa y los demás permisos y requisitos funcionales. El primer registro conserva su flujo de aceptación. La aceptación legal, la autenticación y la aprobación administrativa son condiciones independientes.** | C-22 (nuevo), C-27, C-33 |

Notas de implementación (informativas):
- **RN-140 en videoconsulta (C-33).** `modules/video` exige `canOperate` para entrar a la sala, enviar latidos, salir,
  admitir y obtener credenciales. La única excepción es finalizar una consulta activa propia. Leer el estado no es una
  operación protegida, igual que `GET /me/doctor/appointments`.
- **RN-138.** El dígito verificador se valida en la aplicación, no en la BD.
- **RN-138 (C-16).** Sustituye a D-28, que permitía al médico cambiar su CURP o su nombre legal. Esa vía
  (`PUT /me/doctor-profile/identity`) se retiró el 2026-10-28. El paciente ya tenía la restricción (DP-12). La
  corrección de un dato erróneo está pendiente (DP-CORR, sección 10).
- **RN-140.** Implementación parcial. M02 y M03 contienen los controles de identidad, registro y estado legal; la conexión de
  las políticas corresponde a cada módulo que implemente una operación protegida: M08 para el agendamiento del paciente
  y, para el médico habilitado, agenda (M07), citas (M08), videoconsulta (`video`), expediente clínico (`clinical-record`) y prescripciones (`prescriptions`). `GET /me/doctor/status` no
  identifica los documentos pendientes. **Backend (`4e6ebe1`):** `GET /me/registration-status` informa
  `legal.reacceptanceRequired`. **Móvil (`a5bd909`):** `registration-gate.tsx` ya no bloquea al paciente que solo tiene
  una reaceptación pendiente; el registro inicial conserva su bloqueo y agendar sigue protegido en la API. **Web
  (`f6b1134`):** `RequireRegistration` aplica el mismo criterio, con aviso, opción de posponer y mensaje al agendar.
- **RN-138 y RN-139.** Se numeran a continuación del último RN de V2.2 (RN-137), pero pertenecen a la sección 5.1.

### 5.2 Citas y videoconsulta

| ID | Regla | Cambio |
|---|---|---|
| RN-025 | Ventana de espera del médico configurable (valor inicial: 30 minutos). Si vence con el paciente disponible y sin inicio, el estado es no_show_doctor; reembolso del 100% y sin importe liquidable. **La ventana se calcula como indica RF-20 (espera protegida con límite total; valor inicial: 60 minutos). Durante la espera protegida no se determina no_show_doctor ni no_show_both.** | C-26 |
| RN-026 | Ventana de tolerancia del paciente configurable desde la hora programada (**valor inicial: 15 minutos**). Si el paciente no se conecta y el médico sí, no_show_patient; si el médico ya está conectado al vencer la tolerancia, se determina de inmediato. **Una desconexión involuntaria no es abandono: el paciente sigue disponible si se reconecta dentro de la gracia de reconexión (valor inicial: 5 minutos). Si el paciente sale voluntariamente de la sala, deja de estar disponible hasta que regrese, sin que eso cancele la cita. Los eventos de conexión y desconexión se conservan (RN-031).** | C-26 |
| RN-030 | Se esperan ambas ventanas antes de determinar no_show_both (reembolso total, sin importe liquidable). Si vence la tolerancia del paciente y el médico no se ha conectado ni ha superado su ventana, aún no se determina. **Si el paciente se conecta por primera vez después de su tolerancia y el médico nunca se conecta, o se conecta fuera de su ventana, el resultado es no_show_both, que solo se determina cuando se cumplen las condiciones de ambas ventanas. Si el médico se conecta dentro de su ventana y los dos están presentes, la consulta continúa normalmente. No se declara una inasistencia definitiva mientras las reglas de ambas ventanas no permitan determinarla.** | C-26 |
| **RN-141** | **Un pago exitoso que no puede confirmar la cita (retención vencida, monto distinto o estado no válido) se reembolsa automáticamente, una sola vez por pago, y queda registrado para la conciliación. Una cita expired nunca se reactiva, y los webhooks duplicados o retrasados no confirman citas.** | C-29 (nuevo) |

Notas:
- Los valores iniciales (ventana de 30, tolerancia de 15, límite de 60 y gracia de 5 minutos) son la primera versión
  configurable de la política (RF-16, RN-021), no constantes del sistema. El límite y la gracia necesitan columnas
  nuevas (M-1).
- **Estado `rescheduled` (C-25)**, para la tabla de estados de la cita (6.1 de V2.2): «Cita confirmada que se
  reagendó. Se cierra sin cancelación ni reembolso; la cita nueva conserva el precio, la política y el pago (RN-018).
  Transición: confirmed → rescheduled, terminal». Pendiente de la migración M-1.
- **RN-141** se numera a continuación de RN-140, pero pertenece a la sección 5.2.

---

## 7. Modelo de datos

### 7.1 Tablas por dominio

Sin cambios. Las tablas nuevas del dominio Médico se añadirán cuando se implementen: la especialidad y las revisiones
de la INE y de la cédula del médico.

**C-24 (2026-11-07):** `appointment.cancellation_policy_id` y `consultation_price_configuration` dejan de ser
estructura propuesta: las aprobó la persona responsable del proyecto.

**Pendiente de la migración M-1 (sin autorizar):**
- el estado `rescheduled` (C-25);
- `appointment.agenda_block_ends_at`: el fin del bloque reservado, que solo sirve para calcular la ocupación de la
  agenda. Es distinto de `meeting.ended_at`, el fin oficial de la videoconsulta;
- `appointment.legal_acceptance_id` (C-32);
- `cancellation_policy.max_protected_wait_minutes` y `reconnect_grace_minutes` (C-26);
- la integridad de solo inserción de las versiones de precio y de política.

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
| RF | RF-66 | RF-67 |
| RNF | RNF-21 | RNF-22 |
| RN | RN-141 | RN-142 |
| Cambio | C-33 | C-34 (C-17 a C-21 están asignados en el Maestro V2.4) |

## 10. Pendientes de decisión

| Tema | Qué falta |
|---|---|
| RNF-21 | Elegir el mecanismo de mitigación |
| Esquema DBML | Publicar `schema_gestinovo_v2_3.dbml`, coherente con la sección 7 |
| PDF V2.3 | Generarlo y aprobarlo; después, actualizar R-1 y las referencias de la trazabilidad |
| DP-CORR | Corrección de una CURP o un nombre legal capturados con error. **Flujo definido documentalmente, pendiente de implementación** (`M03-decisiones.md`, sección 8): hoy no existe ninguna vía, ni para el propio usuario (RN-138) ni para el administrador. Cualquier vía futura debe conservar la unicidad entre roles (RN-138, RN-139), la auditoría y el efecto sobre la revisión de la INE (RN-004) |
| RN-140 | Conectar las políticas en cada módulo con operaciones protegidas (agenda (M07), citas (M08), videoconsulta (`video`), expediente clínico (`clinical-record`) y prescripciones (`prescriptions`)) e identificar los documentos pendientes del médico (`M03-decisiones.md`, D-37) |
| C-31 | Asignar la cancelación administrativa (RN-014) a un RF y a un módulo |
| Videoconsulta: plazo de R5 | RN-033 (escenario N13) cuenta la ventana del médico desde su llegada. Falta definir si el límite total `T0 + L` la recorta. Mientras tanto, si ese plazo pasa de `T0 + L`, la cita queda pendiente sin resultado (`r5_beyond_total_limit`) |
| Videoconsulta: paciente tardío | Dos casos sin regla: el paciente que se conecta después de su tolerancia y sale antes de que llegue el médico, y el paciente tardío presente al que el médico no admite. Quedan pendientes sin resultado (`late_patient_left_before_doctor`, `late_patient_not_admitted`); el médico todavía puede admitir |
| Videoconsulta: consulta sin finalizar | Una consulta activa que el médico nunca finaliza no se cierra sola y no tiene plazo. El barrido `video-evaluate-sessions` la lista con su hora de inicio |
| Videoconsulta: revocación de acceso | Al finalizar se revocan las credenciales de los participantes. Falta comprobar con una llamada real que eso expulsa a quien sigue conectado |
| Videoconsulta: proveedor de video | RealtimeKit sigue sin confirmarse. Esta entrega usa un proveedor sin configurar que falla cerrado: la credencial de la llamada responde que no está disponible |
| Videoconsulta: migración 0019 | Aplicada el 2026-11-22 con los ejecutores oficiales en C2 y en desarrollo. Queda pendiente para la futura producción |
| M-1 | Autorizar la migración de C-25, C-26 y C-32 y de la integridad de las versiones (`M08-diseno.md`, A.11.4 y A.12) |
| C-23 a C-32 en el DOCX | Consolidarlos en `PEI_Documento_Maestro_V2.4` (archivo binario; este documento vivo no lo modifica) |
| Maestro V2.4 | `PEI_Documento_Maestro_V2.4_2026-10-20.docx` es anterior a C-16 y conserva el texto previo de RN-004 y RN-138: pendiente de consolidación |
