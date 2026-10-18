# Integración del frontend con el backend de PEI

Entrega integrada: `C:\telehealth-web-main` (copiada el 2026-10-17; el original no se modificó).
Fuente funcional: `docs/arquitectura/Maestro-V2.3.md`. Contrato: `apps/backend` (Better Auth 1.7.5).
Incrementos aplicados: **I0** (estructura y configuración) e **I1** (autenticación).

## Configuración

| Elemento | Valor |
|---|---|
| Puerto del frontend | 3001 (`dev` y `start`) |
| Backend | `http://localhost:3000` (`apps/backend/src/main.ts`) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000/api/auth` (ver `.env.example`; crear `.env.local`) |

**Cambio pendiente en el backend (lo hace el responsable, no esta integración):** añadir `http://localhost:3001`
a `AUTH_TRUSTED_ORIGINS` en el `.env` del backend. Sin él, Better Auth rechaza el origen del frontend y los
`callbackURL`/`redirectTo` absolutos que usa I1. Si se define esa variable, sustituye la lista predeterminada
(`http://localhost:3000`, `gestinovo://`), así que debe incluir también `gestinovo://` para la app móvil.

## Contrato de Better Auth verificado

| Aspecto | Comportamiento real | Referencia |
|---|---|---|
| Ruta | `/api/auth/*`, sin body-parser de Nest | `auth.controller.ts:11`, `app.module.ts:31` |
| CORS | `origin: true`, `credentials: true` | `main.ts:11` |
| Orígenes de confianza | `AUTH_TRUSTED_ORIGINS`; por defecto `localhost:3000`, `gestinovo://` | `auth.config.ts:38-46` |
| Cookies | Sesión httpOnly, `SameSite=Lax`; `localhost:3001`→`:3000` es mismo sitio. El cliente envía `credentials: "include"` | better-auth `cookies/index.mjs`, `client/config.mjs` |
| Contraseña | 8–128 caracteres | `auth.config.ts:76-77` |
| Registro con correo existente | Respuesta genérica de éxito (no revela la cuenta) porque la verificación es obligatoria | better-auth `sign-up.mjs:162` |
| Inicio sin verificar | 403 `EMAIL_NOT_VERIFIED` y reenvía el enlace (`sendOnSignIn`) | `auth.config.ts:86` |
| Credenciales inválidas | 401 `INVALID_EMAIL_OR_PASSWORD` | better-auth `sign-in.mjs` |
| Recuperación | Respuesta idéntica exista o no la cuenta; token de 1 h | `password.mjs:58-72`, `auth.config.ts:78` |
| Restablecimiento | El enlace pasa por el backend y redirige a `redirectTo?token=…` o `?error=INVALID_TOKEN`; revoca sesiones | `password.mjs:123-127`, `auth.config.ts:79` |
| Rutas relativas | `callbackURL` relativo se resuelve contra el **backend**: I1 envía URLs absolutas del frontend | `password.mjs:11-16` |
| Límite de intentos | Inicio 5/min, registro 3/min, reenvío y recuperación 3/15 min, restablecimiento 5/15 min → 429 | `auth.config.ts:23-33` |
| Deshabilitado | `/update-user`, `/change-email` | `auth.config.ts:95` |

## Matriz de compatibilidad

| Funcionalidad | Pantalla | Backend real | Estado | Situación tras I1 |
|---|---|---|---|---|
| URL del backend | `lib/auth-client.ts` | `/api/auth` | Soportada | Variable de entorno |
| Registro | `/signup` | `/sign-up/email` | Parcial | Conectado. Faltan CURP, fecha de nacimiento y aceptación legal (I2, RF-02/RF-03) |
| Inicio de sesión | `/login` | `/sign-in/email` | Soportada | Conectado |
| Verificar y reenviar correo | `/verificar-correo` | `/verify-email`, `/send-verification-email` | Soportada | Conectado; el correo pendiente se guarda en `sessionStorage`, nunca en la URL |
| Olvidé mi contraseña | `/olvide-contrasena` | `/request-password-reset` | Soportada | Conectado, sin revelar si la cuenta existe |
| Restablecer contraseña | `/restablecer-contrasena` | `/reset-password` | Soportada | Conectado; lee `token`/`error` de la URL |
| Cerrar sesión | `user-menu` | `/sign-out` | Soportada | Sin cambios de código |
| Nombre en el menú | `user-menu` | `GET /me` | Parcial | Pendiente (I2); sigue «Usuario 1» |
| Protección de rutas por sesión | todas | `get-session`, `SessionGuard` | No implementada | Pendiente (I2) |
| Perfil | `/perfil-usuario` | `GET`/`PATCH /me/profile`, foto | Parcial | Pendiente (I3) |
| Alta de paciente y aceptación legal | sin pantalla | `POST /me/patient-profile`, `/legal-documents/current`, `/me/legal-acceptances` | Ambigua | Decidir si se diseña la pantalla o se espera la entrega |
| Verificación de INE | sin pantalla | `/me/identity-verification` | Ambigua | Igual |
| Citas, expediente, recetas, laboratorio, videollamada, entregas, prevención; pantallas de médico y admin | 30 pantallas | Módulos vacíos | No soportada | Estáticas, sin datos inventados |

## Validaciones (2026-10-17)

| Validación | Tipo | Resultado |
|---|---|---|
| `tsc --noEmit` | Local | Sin errores (tras `next build`, que genera `LayoutProps`) |
| `biome check` (archivos nuevos o reescritos) | Local | Sin hallazgos |
| `biome check` (total) | Local | 351 errores y 69 avisos; la entrega original tenía 353 y 73. Los de los archivos editados son heredados (formato, `useButtonType`, `noImgElement`) |
| `next build` | Local | Correcto. Se corrigió solo el tipo en `prevencion-fam.tsx:122` (`"bold" in item`), sin cambiar su contenido |
| Flujos contra el backend real | Integración | **No ejecutado.** La autenticación **no** está validada de extremo a extremo |

## Pruebas manuales contra el backend real (2026-10-18)

Destino: Neon `production` (`br-royal-recipe-b54s5hnn`, migraciones 0000–0007 aplicadas, verificado en solo lectura).
Correo real por Resend a la cuenta de prueba. Backend en `:3000` y frontend en `:3001`, en local.

| Prueba | Resultado | Evidencia |
|---|---|---|
| R1 contraseña corta | OK | Error en el cliente, sin peticiones |
| R2 registro | OK | `sign-up/email` 200 → `/verificar-correo`; correo recibido |
| V1 inicio sin verificar | OK | 403 `EMAIL_NOT_VERIFIED`, reenvío del enlace |
| V2 reenviar | OK | `send-verification-email` 200, mensaje genérico |
| V3 abrir el enlace | OK | Confirmado por la usuaria; la sesión posterior tiene `emailVerified: true` |
| L1 contraseña incorrecta | OK | 401, mensaje genérico |
| L2 correo inexistente | OK | 401, mismo mensaje que L1 |
| L3 inicio correcto | OK | 200 → `/landing-inicio`; `get-session` con sesión |
| S1 cerrar sesión | OK | `sign-out` 200 → `/login`; sin sesión |
| P1 recuperación (correo inexistente) | OK | 200, mismo mensaje que P2 (el primer intento dio 429 porque pruebas previas habían agotado el límite) |
| P2 recuperación (cuenta) | OK | 200; correo recibido |
| P3 restablecer | OK | Confirmado por la usuaria |
| Enlace caducado | OK | Redirige con error: «El enlace no es válido o ya expiró» |
| R3, V4 (enlace ya usado), P4 (reutilizar el enlace), P5 (contraseña anterior/nueva), L4 (límite de intentos) | Sin ejecutar o sin confirmar | — |

Datos que quedan en `production`: el usuario de prueba (verificado, sin perfil de paciente), sus sesiones y tokens.

## H1: finalización del registro y aceptación legal (2026-10-18)

La cuenta, la sesión y la verificación siguen en Better Auth. La aceptación legal se registra **en el backend**,
después de iniciar sesión; el estado de las casillas en React no es evidencia.

### Flujo y endpoints (en este orden)

1. `/signup` → Better Auth crea la cuenta. Ya no hay casilla de términos: un aviso explica que se aceptan al completar el registro.
2. Verificación de correo e inicio de sesión → `callbackURL`/destino: `/completar-registro`.
3. `/completar-registro` (exige sesión) → `GET /me/registration-status`.
   - `profileCompleted: false` → formulario de perfil → `POST /me/patient-profile` con `firstName`, `lastName`, `curp`, `birthDate` (AAAA-MM-DD), los campos obligatorios de `RegisterPatientProfileDto`. Si responde `ProfileAlreadyExistsError` (reintento), solo se relee el estado.
   - `legal.accepted: false` → `GET /legal-documents/current?audience=patient`; se muestran solo los documentos cuyo `id` está en `legal.pending` (título, «versión X», texto desplegable y casilla desmarcada):
     «He leído y acepto los Términos y Condiciones» (`patient_terms` o `terms_and_conditions`) y
     «He leído y acepto el Aviso de Privacidad» (`privacy_policy` o `privacy_notice`).
     El botón se habilita con todas marcadas → `POST /me/legal-acceptances` con exactamente esos IDs. El backend no duplica una aceptación repetida; si un documento dejó de estar vigente (`LegalDocumentNotCurrentError`), se relee el estado.
   - Si no hay régimen publicado (`accepted: false`, `pending: []`), se informa que no se puede completar el registro.
   - Tras cada paso se vuelve a pedir el estado; solo cuando el backend ya no indica `profile` ni `legal` se redirige a `/landing-inicio`.

### Rutas

| Ruta | Protección en la interfaz |
|---|---|
| `(dashboard)/*` (incluye `/perfil-usuario`, `/mis-citas`, …) y `/landing-inicio` | `RequireSession` + `RequireRegistration`: sin sesión → `/login`; falta perfil o aceptación → `/completar-registro`; si la consulta falla, muestra el error (no redirige) |
| `/completar-registro` | Solo `RequireSession` (sin `RequireRegistration`, para no crear un bucle) |
| `/login`, `/signup`, `/verificar-correo`, `/olvide-contrasena`, `/restablecer-contrasena` | Públicas |
| `/citas-admin`, `/citas-perfil-doctor`, `/expediente`, `/expediente-vista-doctor`, `/historial-medico`, `/historial-prescripciones`, `/informacion-medica-vista-doctor`, `/laboratorio`, `/mis-pacientes`, `/mis-prescripciones`, `/more-ets`, `/nueva-receta-*`, `/prevencion-fam`, `/refill-entregas`, `/completa-cita-emergencia` | Sin guard; estáticas y **sin backend** |

Estas redirecciones son solo de interfaz. La autorización la hace el backend: `SessionGuard` (401 sin sesión) y
`RolesGuard`; `POST /me/legal-acceptances` exige perfil (`PatientProfileRequiredError`) y `canBookAppointments`
exige registro completo. La verificación de identidad (INE) no bloquea el panel en la interfaz.

### Pruebas automáticas (Vitest + Testing Library, HTTP simulado)

`pnpm test` en `apps/web` (= `vitest run`). Sin backend, sin BD y sin correo.

- `src/features/registration/complete-registration.test.tsx`: casillas desmarcadas; no se continúa sin todas; título, versión y contenido; IDs exactos de `/current`; error al cargar (con reintento) y al aceptar; perfil antes que aceptación; registro completo → redirección; 401 → `/login`; versión nueva pendiente → solo esa; sin documentos publicados.
- `src/features/components/guards.test.tsx`: sin sesión → `/login`; estado del registro → `/completar-registro`; error sin redirección; `/completar-registro` no se redirige a sí misma.

Resultado (2026-10-18): 21/21, tres ejecuciones seguidas.

### Documentos ficticios

`dev-fixtures/legal/privacy_policy.ficticio.md` y `patient_terms.ficticio.md`: textos marcados como **ficticios y no
aprobados**. **No se publicaron en ninguna BD.** El esquema ya admite `privacy_policy` y `patient_terms` y se publican
con el CLI existente (no hace falta migración). Publicar es permanente (`legal_document` es append-only) y cambia el
régimen del paciente en esa rama. Solo en `rama` (`br-autumn-sun-b52qoep4`), con la URL de esa rama en la variable
de entorno (dotenv no la reemplaza), **después** de confirmar en solo lectura que la conexión es esa rama:

```bash
DATABASE_URL='<url de rama>' pnpm --dir apps/backend legal:publish --audience patient --doc privacy_policy@0.0-ficticio=../web/dev-fixtures/legal/privacy_policy.ficticio.md --doc patient_terms@0.0-ficticio=../web/dev-fixtures/legal/patient_terms.ficticio.md
```

Nunca con el `.env` del backend tal como está: apunta a `production`.

### Limitaciones pendientes

- Flujo de H1 probado contra el backend real el 2026-10-18 (ver tabla siguiente) con los documentos vigentes; no se probó con `privacy_policy`/`patient_terms` (no publicados).
- En `production` está vigente el régimen de legado (`privacy_notice` y `terms_and_conditions` v1, según la nota de M03); la interfaz muestra lo que devuelva `/current`.
- Consentimiento específico de datos sensibles: sin documento ni decisión (D3).
- Sin pantalla para la verificación de identidad (INE); perfil editable (I3) pendiente.
- Cuentas con rol distinto de paciente: `/me/registration-status` responde 403 y la interfaz muestra el error.

### Pruebas manuales de H1 contra el backend real (2026-10-18)

BD de desarrollo `production` (`br-royal-recipe-b54s5hnn`), cuenta de prueba existente (verificada, sin perfil
antes de la prueba), régimen vigente `privacy_notice@1` + `terms_and_conditions@1`. Sin documentos ficticios
publicados, sin cuentas nuevas y sin correos.

| Prueba | Resultado | Evidencia |
|---|---|---|
| H1-2 `/perfil-usuario` sin registro completo | OK | Redirige a `/completar-registro`, paso 1; sin bucle (consultas estables) |
| H1-3 CURP inválida | OK | `POST /me/patient-profile` 400; se muestra «curp no tiene un formato válido» |
| H1-4 perfil con CURP sintética de `curp.spec.ts` | OK | 201; pasa al paso 2 |
| H1-5 paso legal | OK | «Aviso de Privacidad versión 1» y «Términos y Condiciones versión 1», con texto; casillas desmarcadas; con una sola, botón deshabilitado |
| H1-6 aceptar ambas | OK | `POST /me/legal-acceptances` 201 → `/landing-inicio` |
| H1-7 BD (solo lectura) | OK | 1 perfil `patient` con CURP; 2 filas en `user_legal_acceptance` (versiones vigentes, con fecha, IP y user-agent); `audit_log`: `patient_profile.created` + 2 `legal_document.accepted` con el tipo y la versión |
| H1-8 acceso tras completar | OK | `/perfil-usuario` se muestra; `/completar-registro` redirige a `/landing-inicio`; estado: `missing: [identity_submission]` |

Datos que quedan en la BD de desarrollo: el perfil de paciente de la cuenta de prueba (nombre «Prueba Integracion»,
CURP sintética `XEXX010101HNEXXXA4`; el nombre legal no es editable, DP-12), sus 2 aceptaciones y 3 eventos de auditoría.

## Perfil del paciente (I3, 2026-10-18)

`/perfil-usuario` conserva el diseño de la entrega (encabezado, tarjeta de foto y nombre, botón «Editar perfil» /
«Guardar cambios», bloques «Información personal» y «Seguridad»), ahora con datos del backend.

| Endpoint | Uso en la pantalla |
|---|---|
| `GET /me/profile` | Carga inicial y recarga tras guardar. Estados: «Cargando perfil...», error con «Reintentar», 401 → `/login` |
| `PATCH /me/profile` | Solo `phone`, `address`, `emergencyContactName`, `emergencyContactPhone`; se envían solo los campos modificados y un campo vacío como `null` (el DTO no admite cadena vacía). «Cambios guardados» aparece solo tras la respuesta correcta; si falla, se muestra el mensaje del backend y se mantiene la edición |
| `PUT /me/profile/photo` | `FormData` con el campo `photo` (sin forzar `Content-Type`). Antes de subir se avisa si no es JPEG/PNG o pasa de 5 MB; el backend valida el contenido real. «Foto actualizada» solo tras la respuesta correcta |
| `GET /me/profile/photo` | Solo si `hasPhoto`; se descarga con la sesión y se muestra desde un blob local (la imagen es privada) |

Solo lectura: nombre y apellidos, CURP, fecha de nacimiento (DP-12) y correo (`/change-email` desactivado).
Ajuste al contrato: el contacto de emergencia se muestra en dos campos (nombre y teléfono), como en el backend.

Pruebas: `src/features/landing/pages/perfil-usuario.test.tsx` (10): carga y campos editables, error con reintento,
401, descarga de la foto, edición (solo cambios, vacío → `null`, confirmación tras éxito), error 400, sin cambios no
llama al backend, subida multipart, tipo rechazado en el cliente y error del backend al subir.
Resultado (2026-10-18): 31/31 en total (dos ejecuciones), `tsc` sin errores, `next build` correcto, Biome sin hallazgos
en los archivos tocados.

Pruebas manuales contra el backend real: ver la tabla siguiente. La subida de foto **no** se probó contra el backend
(no hay forma de volver a «sin foto": el backend no tiene endpoint para borrarla).

### Pruebas manuales del perfil contra la BD de desarrollo (2026-10-18)

`production` (`br-royal-recipe-b54s5hnn`), cuenta de prueba existente. Estado inicial (lectura): los 4 campos editables
`null`, sin foto, 3 eventos de auditoría.

| Prueba | Resultado | Evidencia |
|---|---|---|
| P-1 carga | OK | `GET /me/profile` 200; nombre, CURP sintética y «1 de enero, 2001»; campos vacíos como «—»; sin foto |
| P-2 error del backend | OK | Teléfono de 31 dígitos → `PATCH` 400; se muestra el mensaje, sin «Cambios guardados», sigue en edición |
| P-3 guardar los 4 campos | OK | `PATCH` 200 + `GET` 200; «Cambios guardados»; en BD (lectura) los 4 valores y un evento `patient_profile.updated` con los 4 campos |
| P-4 persistencia | OK | Tras recargar se ven los 4 valores |
| P-5 foto no permitida | OK | Un GIF se rechaza en el cliente («La foto debe ser una imagen JPEG o PNG.»), 0 peticiones a `/me/profile/photo` |
| Subida y visualización de foto | **Omitida** | Sin endpoint para borrar la foto no se puede restaurar «sin foto» |
| Restauración | OK | Campos vaciados en la pantalla → `PATCH` con `null` 200; en BD (lectura) los 4 campos vuelven a `null`, sin foto |

Cambios permanentes: 2 eventos `identity.patient_profile.updated` en `audit_log` (append-only).

Incidencias:
- Los mensajes de validación del backend llegan en inglés (texto por defecto de class-validator), p. ej. «phone must be shorter than or equal to 30 characters».
- Un error de foto anterior seguía visible después de guardar el perfil. **Corregido** (2026-10-18): se limpia al empezar a editar y al guardar con éxito; prueba nueva en `perfil-usuario.test.tsx` (falló antes de la corrección y pasa después). Validación: Vitest 32/32 (dos ejecuciones), `tsc` sin errores, `next build` correcto, Biome sin hallazgos en los archivos tocados. Sin nuevas pruebas manuales.

## Nombre en el encabezado y cambio de contraseña (2026-10-18)

### Nombre real en `UserMenu`
- Antes: «Usuario 1» fijo. Ahora: `GET /me` → `profile.firstName` + `profile.lastName` (nombre legal del perfil de
  paciente). Si la cuenta aún no tiene perfil, el nombre que la persona escribió al registrarse (Better Auth
  `user.name`). Mientras carga, sin sesión o si `/me` falla, no se muestra ningún nombre (nunca uno ficticio).
- Una sola petición a `/me` por usuario mientras dura la página (`getMeCached` en `src/lib/api.ts`), aunque haya
  varios encabezados; se descarta al cerrar sesión o si la petición falla. Sin sesión no se pide `/me`.
- Avatar: ver «Avatar real en el encabezado».

### Cambio de contraseña en `/perfil-usuario`
- Operación de Better Auth 1.7.5 existente: `POST /api/auth/change-password` (`authClient.changePassword`), con la
  sesión actual (cookie). No está en `disabledPaths` (solo `/update-user` y `/change-email`). Sin endpoint propio.
- En «Seguridad», «Cambiar» abre un modal con el diseño de la entrega: contraseña actual, nueva y confirmación. Antes de
  enviar se exigen los tres campos, coincidencia y 8–128 caracteres (mismos límites que el backend).
- «Contraseña actualizada» solo tras la respuesta correcta. Errores: `INVALID_PASSWORD` («La contraseña actual no es
  correcta.»), 429 (límite de Better Auth para `/change-password`: 3 cada 10 s), sin conexión. Las contraseñas no se
  registran en consola ni se guardan.
- `revokeOtherSessions: true` (opción por petición, no configuración global): Better Auth borra las demás sesiones
  del usuario y crea una sesión nueva para la actual (cookie nueva). Se eligió por coherencia con
  `revokeSessionsOnPasswordReset: true` del backend.

### Pruebas y validación
- `src/features/components/user-menu.test.tsx` (6): nombre del perfil, nombre de registro sin perfil, error sin nombre,
  sin sesión sin petición, una sola petición para varios encabezados, caché descartada al cerrar sesión.
- `src/features/landing/pages/change-password-modal.test.tsx` (8): campos obligatorios, no coincidencia, longitud
  mínima, éxito con `revokeOtherSessions: true`, contraseña actual incorrecta, 429, sin conexión, sin contraseñas en consola.
- `perfil-usuario.test.tsx` (+1): «Cambiar» abre el modal; tras un error no confirma; tras el éxito, «Contraseña actualizada».
- Resultado: Vitest 47/47 (dos ejecuciones), `tsc` sin errores, `next build` correcto. Biome: sin hallazgos nuevos;
  `user-menu.tsx` conserva 4 avisos de accesibilidad que ya tenía la entrega.
- Cambio de contraseña probado contra el backend real (ver tabla siguiente). El nombre del encabezado no se verificó en
  el navegador en esta etapa.

### Prueba manual del cambio de contraseña (2026-10-18)

BD de desarrollo `production` (`br-royal-recipe-b54s5hnn`), cuenta de prueba existente, con autorización. Las
contraseñas no se registraron; la verificación en BD fue de solo lectura (conteo de sesiones, fecha de la cuenta y una
huella corta no reversible del hash). Antes: 4 sesiones activas (2 del panel y 2 de otro navegador de la usuaria,
que autorizó cerrarlas); ninguna sesión activa de otras cuentas.

| Paso | Resultado | Evidencia |
|---|---|---|
| 1. Contraseña actual incorrecta | OK | `POST /api/auth/change-password` 400; «La contraseña actual no es correcta.»; sin confirmación; huella del hash y fecha de la cuenta sin cambios |
| 2. Cambio a una contraseña temporal | OK | 200; «Contraseña actualizada»; huella del hash cambió |
| 4. Sesiones | OK | La sesión del panel siguió válida (cookie nueva); sesiones activas 4 → 1 (`revokeOtherSessions`); otras cuentas sin cambios |
| 3. Nuevo inicio de sesión | OK | Tras cerrar sesión: contraseña anterior → «Correo o contraseña incorrectos.»; temporal → 200 y `/landing-inicio` |
| 5. Restauración | OK | Cambio de la temporal a la original desde el perfil (200); después: temporal → 401, original → 200 con sesión |

Estado final: la cuenta vuelve a funcionar con su contraseña original; 1 sesión activa (la del panel). Sin cambios en
el perfil ni archivos subidos. Better Auth no impide volver a una contraseña usada antes.

## Avatar real en el encabezado (2026-10-18)

- `UserMenu` muestra la foto privada del perfil (`GET /me/profile/photo`, con la cookie de sesión) cuando `GET /me`
  indica `profile.hasPhoto`. Si no hay foto, no hay sesión o la descarga falla, se conserva el avatar de la entrega
  (`/perfil-usuario.png`) con las mismas clases y dimensiones (48×48, `rounded-full`, responsivo).
- Una sola descarga por usuario, compartida por todos los encabezados y por `/perfil-usuario`
  (`getProfilePhotoUrlCached` en `src/lib/api.ts`). La imagen se muestra desde un blob local; la URL anterior se
  libera (`URL.revokeObjectURL`) al reemplazarla o al cerrar sesión. Si la descarga falla, se reintenta en la
  siguiente consulta.
- Caché: el backend responde `Cache-Control: no-store` y la petición usa `cache: "no-store"`. Tras
  `PUT /me/profile/photo`, `profilePhotoChanged` marca `hasPhoto` en la caché de `/me`, descarta la foto anterior y
  avisa a los encabezados y al perfil, que piden la nueva.
- Pruebas (`user-menu.test.tsx`, +7): foto disponible, sin foto (sin petición), error de descarga, sin sesión, una
  descarga para varios encabezados, recarga y liberación tras una foto nueva, liberación al cerrar sesión.
- Resultado: Vitest 54/54 (dos ejecuciones), `tsc` sin errores, `next build` correcto; Biome sin hallazgos nuevos
  (los 4 avisos de accesibilidad de `user-menu.tsx` son de la entrega).
- **Sin prueba manual**: subir una foto y comprobar el avatar queda a cargo de la usuaria (escribe en R2 y en la BD).
