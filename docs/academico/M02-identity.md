# Evidencia académica de M02: Identity / Access Completion de PEI (BORRADOR)

> **Borrador.** La evidencia formal será la **etapa D** (tercera corrida de `pnpm test:evidence M02`), pendiente de una
> red con latencia normal hacia Neon. Los resultados citados provienen de la **etapa A** (validación post-migración,
> 374/374 PASS), que es una validación interna sin salida versionada y **no** evidencia formal. Las etapas B y C
> (corridas de evidencia del 2026-10-07) están descartadas.

Gestinnovo es la empresa; PEI es la aplicación. Esta evidencia sale del código, las migraciones y las pruebas reales de M02.
Solo se incluyen los entregables del documento de dualidad que M02 permite demostrar; no se agregó funcionalidad para
cubrir ejemplos académicos.

Fuentes: [resumen de evidencia de M02](../testing/ejecuciones/2026-10-07_M02-validacion/resumen-de-evidencia.md) y
[matriz de trazabilidad](../testing/trazabilidad/M02-identity.md).

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

---

## 1. Seguridad de la Información

### Mecanismos implementados y verificados

| Tipo | Mecanismo | Evidencia |
|---|---|---|
| Preventivo | Correo verificado obligatorio para iniciar sesión; recuperación con tokens de un solo uso de 1 h; sesiones revocadas al cambiar la contraseña | TC-M02-200, 202–204 |
| Preventivo | Sin enumeración de cuentas: registro y recuperación responden igual exista o no el correo | TC-M02-201, 203 |
| Preventivo | Rate limit siempre activo en autenticación y subidas; no se evade con `X-Forwarded-For` | TC-M02-207, 208, 215 |
| Preventivo | INE en bucket **privado**; claves generadas por el servidor sin datos personales; sin URLs públicas ni firmadas | TC-M02-040–043, 087–089; R2 real 10/10 |
| Preventivo | Archivos validados por firma binaria (no por el tipo MIME) y límite de 5 MB | TC-M02-030–034, 213, 214 |
| Preventivo | Rol no asignable por el cliente e inmutable en la BD; primer administrador solo por CLI que falla cerrado | TC-M02-082, 092, 112–114, 223 |
| Preventivo | CURP validada en la aplicación y en PostgreSQL, única; un duplicado responde 409 sin revelar el valor | TC-M02-001–007, 101, 102, 116, 224 |
| Detectivo | Cada lectura del INE por un administrador queda auditada, con un evento por lado | TC-M02-079, 108, 216 |
| Correctivo | Las imágenes del INE se eliminan al aprobar o rechazar; un CLI completa la purga si falla | TC-M02-077, 078, 109, 110, 218 |
| Correctivo | Compensación: si la BD falla después de subir, se eliminan los objetos subidos | TC-M02-076, 106, 107 |

### Servicios de seguridad

| Servicio | Cómo lo apoya M02 |
|---|---|
| Confidencialidad | Bucket privado; transmisión por el backend con `Cache-Control: no-store`; acceso solo para el administrador y solo con el envío pendiente |
| Integridad | CHECK y unicidades en PostgreSQL (CURP, claves por estado, un solo `pending`, versión legal única); rol inmutable; evidencia legal de solo inserción |
| Autenticación | Better Auth con verificación de correo obligatoria; contraseñas de 8 a 128 caracteres |
| No repudio | Revisiones, accesos y altas auditados con actor, IP y user-agent (M01); aceptaciones legales con IP y user-agent |
| Privacidad (minimización) | Las imágenes del INE solo existen mientras se revisan; la auditoría no guarda contenido, claves, URLs ni CURP |

### Análisis de activos, amenazas e impacto

| Activo | Amenaza | Impacto | Control en M02 | Riesgo residual |
|---|---|---|---|---|
| Imágenes del INE | Exposición pública | Crítico (datos de identidad) | Bucket privado, sin URLs, transmisión con `no-store`, eliminación al resolver | Si la eliminación falla, la imagen permanece hasta la purga por CLI |
| Cuentas | Fuerza bruta y enumeración | Alto | Rate limit, respuestas genéricas, verificación de correo | Rate limit en memoria: solo una instancia |
| Rol de administrador | Escalamiento de privilegios | Alto | Sin endpoint de roles, DTO sin rol, trigger de rol inmutable, CLI que falla cerrado | El rol dueño de la BD puede desactivar triggers (D7) |
| CURP | Enumeración mediante duplicados | Medio | 409 genérico sin el valor; requiere sesión verificada | El 409 sigue indicando que la CURP existe (riesgo aceptado) |
| Archivos subidos | Archivo malicioso con MIME falso | Medio | Firma binaria, 5 MB, solo JPEG o PNG | — |

### Validación con infraestructura real

- **R2** (`pei-documents-dev`): PASS 10/10. El objeto sintético no fue accesible de forma anónima y no quedaron residuos.
- **Resend:** PASS. Un envío a la dirección de prueba del proveedor respondió HTTP 200.
- **Bootstrap del administrador:** pendiente. Depende de `APP_WEB_URL` y de la pantalla del cliente web para establecer
  la contraseña.

### Escaneo de dependencias

M02 no agregó dependencias. Resend se usa por su API REST con `fetch`, sin SDK (DT-9).

---

## 2. Arquitectura Orientada a Servicios

| Propiedad | Evidencia en M02 |
|---|---|
| Bajo acoplamiento | Los casos de uso dependen de puertos (`DocumentStorage`, `EmailSender`, `RateLimiter`, repositorios, `AdminAccountProvisioner`). R2, Resend, Better Auth y Drizzle quedan en adaptadores. Las pruebas reemplazan los adaptadores sin tocar los casos de uso |
| Reusabilidad | La política `CanBookAppointmentsPolicy` se exporta para M08; `AuditTrail` (M01) y `UnitOfWork` (M00) se reutilizan sin duplicarlos |
| Abstracción | Ningún caso de uso conoce S3, la API de Resend ni SQL; ninguna respuesta expone claves de objetos |
| Contratos | API REST con DTO validados; Better Auth detrás de `SessionProvider` y de la fábrica `createAuth` |
| Autonomía | Las reglas críticas también las impone PostgreSQL (CHECK, índices y triggers), aunque se use otro cliente |

---

## 3. Administración de Proyectos: seguimiento

| Tarea de M02 | Estado | Evidencia |
|---|---|---|
| Diagnóstico, diseño y decisiones (DP, DT) | Aprobado | Diseño técnico de M02 |
| Preparación de infraestructura R2 (DT-18) | Terminada | Bucket privado nuevo; checklist DT-18 |
| Corrección del dato de desarrollo (DT-22) | Terminada | 1 fila; huellas sin cambios |
| Implementación (dominio, aplicación, infraestructura y presentación) | Terminada | 178 pruebas de M02 |
| Migraciones 0004 y 0005 | Aplicadas con autorización | Validación 41/41; verificación posterior 23/23 |
| Validación post-migración (etapa A) | Terminada | 374/374 PASS; validación interna, no evidencia formal |
| Validación de infraestructura real | R2 y Resend: PASS; bootstrap: pendiente | Resumen de evidencia |
| Evidencia formal (etapa D, tercera corrida) | **Pendiente** | Bloqueada por latencia de red hacia Neon. Etapas B y C descartadas |
| Hito "M02 cerrado" | Pendiente de la evidencia definitiva, commit y tag | — |

**Incidencias registradas:**
- Dos corridas de evidencia descartadas por timeouts de Jest debidos a la latencia de red, no a defectos. El
  diagnóstico confirmó la BD limpia, sin bloqueos y con el servidor Neon sano.
- Se aplicó un único ajuste autorizado: `testTimeout` en la configuración E2E.

**Ruta crítica:** M02 es predecesor de M08 (agendar) y modelo de registro por rol para M03 y M04. El bootstrap real
depende del cliente web.

---

## 4. Expresión Oral y Escrita: documentación técnica

- [Matriz de trazabilidad de M02](../testing/trazabilidad/M02-identity.md).
- [Resumen de evidencia de M02](../testing/ejecuciones/2026-10-07_M02-validacion/resumen-de-evidencia.md): DT-22,
  migraciones, corridas, diagnóstico de latencia e infraestructura real.
- [Plantilla de variables](../../apps/backend/.env.example) del backend, solo con los nombres.
