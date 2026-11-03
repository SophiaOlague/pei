# Seguridad: CORS con credenciales restringido a orígenes explícitos

**Fecha:** 2026-11-03. **Estado:** implementado (`fix(security): restrict credentialed CORS origins`).

## Hallazgo

`apps/backend/src/main.ts` configuraba `app.enableCors({ origin: true, credentials: true })`: el backend reflejaba
cualquier cabecera `Origin` en `Access-Control-Allow-Origin` junto con `Access-Control-Allow-Credentials: true`. Se
comprobó durante la validación local del panel administrativo de M03 (servidor en memoria, sin BD ni R2): una petición
con `Origin: https://sitio-ajeno.example` y la cookie de un administrador recibió autorización CORS. La cookie de
sesión es `SameSite=Lax`, lo que reduce el riesgo entre sitios distintos, pero la política no debe depender solo de eso
(subdominios, navegadores o despliegues futuros).

## Cambio

- `src/common/http/cors.ts` (`corsOptionsFor`) construye la política a partir de `AUTH_TRUSTED_ORIGINS`, la misma lista
  que ya valida Better Auth (`loadAuthConfig`). Una sola fuente de verdad para los orígenes del navegador.
- Solo se autorizan orígenes `http`/`https` exactos (esquema, host y puerto). Los esquemas que no son orígenes web, como
  `gestinovo://` de la app móvil, se omiten: sus peticiones nativas no usan CORS.
- `*`, comodines o un origen con ruta hacen fallar el arranque (`InvalidCorsOriginError`). Nunca se combina `*` con
  credenciales.
- Un origen no listado no recibe `Access-Control-Allow-Origin`; el navegador no le entrega la respuesta. La librería
  `cors` envía `Access-Control-Allow-Credentials` en todas las respuestas; sin `Allow-Origin` no autoriza nada.
- Las peticiones sin `Origin` (app móvil nativa, CLI, servidor a servidor) no cambian: CORS no es un mecanismo de
  autenticación; la sesión y los roles siguen en `SessionGuard` y `RolesGuard`.

## Configuración

- Desarrollo local: `AUTH_TRUSTED_ORIGINS=http://localhost:3000,gestinovo://,http://localhost:3001` (el web corre en
  3001). Sin la variable, el valor por defecto es `http://localhost:3000,gestinovo://`, que no incluye el web local.
- Despliegues: añadir a `AUTH_TRUSTED_ORIGINS` el origen exacto del web de PEI de cada entorno. No se fijaron dominios
  de producción en el código.

## Pruebas

| Caso | Archivo | Qué comprueba |
|---|---|---|
| TC-M00-244 | `src/common/http/cors.spec.ts` | Solo orígenes web, sin duplicados; `gestinovo://` se omite |
| TC-M00-245 | ídem | `*`, comodines y orígenes con ruta se rechazan |
| TC-M00-246 | ídem | Sin orígenes web no se autoriza ninguno (nunca un comodín) |
| TC-M00-247 | `test/cors.e2e-spec.ts` | Un origen permitido recibe su origen y credenciales, también en la petición previa |
| TC-M00-248 | ídem | Un origen no autorizado no recibe `Access-Control-Allow-Origin` (ni reflejo ni `*`) |
| TC-M00-249 | ídem | El esquema de la app móvil no se acepta como origen web |

`test/support/c2-target-guard.spec.ts` registra `test/cors.e2e-spec.ts` como spec con dobles (sin BD).

**No validado:** el comportamiento en un despliegue con dominios reales y HTTPS.
