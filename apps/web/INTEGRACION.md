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
