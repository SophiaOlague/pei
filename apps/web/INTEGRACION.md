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
