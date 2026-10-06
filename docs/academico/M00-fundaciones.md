# Evidencia académica de M00: Fundaciones

Evidencia obtenida del código y de las pruebas reales de M00. Solo se incluyen los entregables del documento de dualidad
que este módulo permite demostrar; los demás se generarán en los módulos correspondientes.

Fuente de resultados: [ejecución `2026-10-06T00-05-22_58eb4ac-dirty_M00`](../testing/ejecuciones/2026-10-06T00-05-22_58eb4ac-dirty_M00/resumen.md).

---

## 1. Arquitectura Orientada a Servicios: propiedades de los servicios diseñados

### Dependencias reales de M00

```
Controller (presentación)
   │  @UseGuards(SessionGuard, RolesGuard) · @CurrentActor()
   ▼
SessionGuard ──► SessionProvider (puerto) ──► BetterAuthSessionProvider (adaptador: Better Auth)
     │
     └────────► ActorProfileReader (puerto) ──► DrizzleActorProfileReader (adaptador: Drizzle/PostgreSQL)

Caso de uso (aplicación)
   ├──► UnitOfWork (puerto) ──► DrizzleUnitOfWork (adaptador) ──► translatePostgresError
   └──► Clock (puerto) ──► SystemClock (adaptador)

DomainError (dominio) ◄── DomainExceptionFilter (presentación: traduce a HTTP)
```

Las flechas apuntan siempre de las capas externas hacia los puertos. El dominio y los casos de uso no importan
Better Auth, Drizzle, Neon ni Express.

| Propiedad | Cómo se cumple en M00 | Verificación |
|---|---|---|
| Bajo acoplamiento | Los casos de uso dependen de interfaces (`UnitOfWork`, `Clock`); los guards, de `SessionProvider` y `ActorProfileReader`. El filtro HTTP ya no importa los errores de identity: decide por el `kind` de `DomainError`. | En las pruebas E2E el proveedor de sesión y el lector de perfiles se reemplazan sin tocar los guards (TC-M00-200 a 233). |
| Reusabilidad | `CommonModule` y `AuthModule` son globales: cualquier módulo de dominio usa la misma unidad de trabajo, el mismo reloj y los mismos guards. Identity ya los reutiliza. | `identity.module.ts` dejó de declarar su propia unidad de trabajo. |
| Autonomía | Cada adaptador puede cambiarse por separado (por ejemplo, otro proveedor de identidad implementando `SessionProvider`). | TC-M00-020 a 022 prueban la unidad de trabajo con una transacción simulada, sin BD. |
| Abstracción | La unidad de trabajo oculta BEGIN/COMMIT/SAVEPOINT; el traductor oculta los códigos SQLSTATE; el cliente recibe mensajes de dominio, no SQL. | TC-M00-071, 073 y 130: las respuestas no incluyen SQL ni nombres de constraints. |

---

## 2. Seguridad de la Información

### Mecanismos implementados y verificados en M00

| Tipo | Mecanismo | Casos |
|---|---|---|
| Preventivo | Validación global de entrada: rechaza propiedades no declaradas y tipos inválidos. | TC-M00-030 a 033, 230 a 232 |
| Preventivo | Autenticación obligatoria en rutas protegidas (sesión de Better Auth). | TC-M00-050, 200, 201, 240, 241 |
| Preventivo | Autorización por rol de dominio con falla cerrada: una ruta sin roles declarados se niega. | TC-M00-040 a 046, 210 a 221 |
| Preventivo | La IP del actor no se toma de `X-Forwarded-For` enviado por el cliente. | TC-M00-065, 223 |
| Detectivo | Captura de IP y user-agent en el contexto del actor, base para la auditoría (su registro persistente es de M01). | TC-M00-051, 060 a 064, 222 |
| Detectivo | Verificación de que `audit_log` rechaza UPDATE y DELETE (trigger real). | TC-M00-120 |
| Correctivo | Rollback transaccional: un fallo deshace todo el trabajo de la operación. | TC-M00-101, 102, 104 |
| Correctivo | Errores internos responden 500 genérico, sin detalles, y se registran en el servidor. | TC-M00-073 y prueba previa del filtro |

### Relación con OWASP API Security Top 10 (2023)

| Riesgo | Control en M00 | Estado |
|---|---|---|
| API2 Autenticación rota | `SessionGuard` exige sesión válida de Better Auth. | Implementado y probado |
| API3 Autorización a nivel de propiedad (asignación masiva) | `forbidNonWhitelisted`: un cliente no puede enviar campos como `role`. | Implementado y probado |
| API5 Autorización a nivel de función | `RolesGuard` + `@Roles`. | Implementado y probado |
| API8 Configuración insegura | Falla cerrada de `RolesGuard`; errores sin fuga de SQL. | Implementado y probado |
| API1 Autorización a nivel de objeto | Comprobar que el actor es dueño del recurso (por ejemplo, su propia cita). | Pendiente: se implementa en cada módulo con recursos propios |

### Escaneo de dependencias

`pnpm audit --prod` después de agregar `class-validator` y `class-transformer`: 1 vulnerabilidad moderada en `esbuild <= 0.24.2`,
que llega por `better-auth > drizzle-kit > @esbuild-kit/*` y ya existía antes de M00. Las dependencias nuevas no tienen avisos.
Salida completa: [evidencias/M00-pnpm-audit.txt](evidencias/M00-pnpm-audit.txt).

### Hallazgos de seguridad documentados (no corregidos en M00)

- La aplicación se conecta a PostgreSQL con el rol dueño de la base (`neondb_owner`, con `bypassrls`): TRUNCATE no dispara los triggers de solo inserción. Se analizará en M01.
- `main.ts` ejecuta `bootstrap()` sin manejar el rechazo de la promesa (aviso previo de oxlint).

---

## 3. Administración de Proyectos: seguimiento

| Tarea de M00 | Estado | Evidencia |
|---|---|---|
| Errores de dominio y traducción de PostgreSQL | Terminada | TC-M00-001 a 073, 105 a 130 |
| Unidad de trabajo compartida con transacción ambiental | Terminada | TC-M00-020 a 022, 100 a 107 |
| Contexto del actor, guard de roles, decoradores | Terminada | TC-M00-040 a 067, 150, 200 a 243 |
| Validación global de entrada | Terminada | TC-M00-030 a 033, 230 a 233 |
| Infraestructura de pruebas y evidencia | Terminada | `pnpm test:int`, `pnpm test:evidence` |
| Hito "M00 aprobado" | Pendiente de revisión de la responsable | — |

Dependencia: M00 es predecesor de todos los módulos y queda en la ruta crítica hacia Agenda y Citas.
