# Evidencia académica de M01: Audit Trail de PEI

Gestinnovo es la empresa; PEI es la aplicación. Esta evidencia sale del código, las migraciones y las pruebas reales de M01.
Solo se incluyen los entregables del documento de dualidad que M01 permite demostrar; no se agregó funcionalidad para cubrir ejemplos académicos.

Fuentes: [ejecución `2026-10-06T03-53-14_727ea2a_M01`](../testing/ejecuciones/2026-10-06T03-53-14_727ea2a_M01/resumen.md),
[validación y aplicación de migraciones](../testing/ejecuciones/2026-10-06_M01-migraciones/validacion-y-aplicacion.md),
[matriz de trazabilidad](../testing/trazabilidad/M01-audit.md) y [guía de auditoría para los módulos](../arquitectura/auditoria.md).

---

## 1. Seguridad de la Información

### Mecanismos implementados y verificados

| Tipo | Mecanismo | Evidencia |
|---|---|---|
| Detectivo | Registro de auditoría de acciones sensibles: actor (usuario o sistema), acción, entidad, metadata, IP, user-agent y fecha | TC-M01-100, 200, 204 |
| Preventivo | `audit_log` de solo inserción: UPDATE, DELETE y TRUNCATE rechazados por PostgreSQL | TC-M00-120, TC-M01-106; validación 7, 4h, 4i |
| Preventivo | Coherencia del actor impuesta por la BD (CHECK y trigger), aunque alguien se salte la API | TC-M01-107, 109; validación 9, 10, 4a–4e |
| Preventivo | Fecha del evento impuesta por la BD: la aplicación no puede falsificarla | TC-M01-108; validación 8 |
| Correctivo | La auditoría se revierte junto con la operación: no quedan eventos de acciones que no ocurrieron | TC-M01-101, 104, 203 |
| Control de cambios | Las migraciones se validaron en `BEGIN … ROLLBACK` antes de aplicarse; la primera validación detectó y permitió corregir una discrepancia | Evidencia de migraciones, secciones 1 y 2 |

### Servicios de seguridad

| Servicio | Cómo lo apoya M01 |
|---|---|
| No repudio | Cada acción sensible queda asociada a su actor, IP, user-agent y fecha de la BD, sin posibilidad de modificarla con UPDATE, DELETE o TRUNCATE; el rol dueño de la BD aún podría desactivar los triggers (D7) |
| Integridad | Append-only, coherencia del actor y fecha impuesta por PostgreSQL |
| Privacidad | `metadata` limitada a 4 KB y con la regla de no incluir contenido clínico (RN-122); la validación no garantiza el contenido |

### Análisis de activos, amenazas e impacto

| Activo | Amenaza | Impacto | Control en M01 | Riesgo residual |
|---|---|---|---|---|
| `audit_log` | Manipulación o borrado de registros (UPDATE, DELETE, TRUNCATE) | Pérdida de la trazabilidad de acciones sensibles | Triggers append-only y `audit_log_no_truncate` | El rol dueño de la BD puede desactivar triggers; mitigación pendiente: rol de mínimo privilegio |
| `audit_log` | Repudio de una acción ("yo no lo hice") | Imposibilidad de atribuir acciones | Actor, perfil, IP y user-agent; fecha de la BD | La IP depende de la configuración de proxy (aún no definida) |
| `audit_log` | Exposición de información sensible en `metadata` | Fuga de datos de salud | Límite de tamaño y regla documentada RN-122 | No hay detección automática de contenido clínico |
| `audit_log` | Eventos falsos de operaciones revertidas | Registro inconsistente | Auditoría dentro de la misma transacción | — |

### Elementos del documento de dualidad tratados solo como propuesta

El monitoreo con alertas (por ejemplo, una IP que consulta 100 citas en 1 minuto) no es requisito del Documento Maestro y no se implementó.
`audit_log` es una fuente posible para ese análisis en el futuro.

### Escaneo de dependencias

M01 no agregó dependencias; aplica el escaneo registrado en M00.

---

## 2. Arquitectura Orientada a Servicios

| Propiedad | Evidencia en M01 |
|---|---|
| Reusabilidad | `AuditTrail` es un servicio transversal: cualquier módulo de PEI lo inyecta (`AuditModule` global) y sigue la guía de auditoría |
| Bajo acoplamiento | Los casos de uso dependen del puerto `AuditTrail`; Drizzle y PostgreSQL quedan en `DrizzleAuditTrail`. En las pruebas E2E con dobles se reemplaza el adaptador sin tocar el caso de uso (TC-M01-200 a 203) |
| Abstracción | El caso de uso no conoce `audit_log` ni SQL; la fecha y las protecciones las aporta la BD |
| Autonomía | La integridad de `audit_log` no depende de la aplicación: PostgreSQL la impone aunque se use otro cliente |

Dependencias del servicio: `AuditTrail` reutiliza `Actor` y `UnitOfWork` de M00 sin duplicarlos.

---

## 3. Administración de Proyectos: seguimiento

| Tarea de M01 | Estado | Evidencia |
|---|---|---|
| Diagnóstico y diseño | Aprobado | Decisiones D1–D9, C1–C7 |
| Dominio, puerto, adaptador y módulo | Terminada | 45 pruebas unitarias |
| Migraciones 0002 (Drizzle) y 0003 (SQL personalizado) | Terminada | sha256 registrados |
| Validación temporal en Neon | Terminada (2 corridas; la primera detectó una discrepancia corregida) | Evidencia de migraciones |
| `db:migrate` | Aplicada con autorización | Verificación posterior |
| Pruebas de integración y E2E | Terminada | 199/199 PASS |
| Hito "M01 aprobado" | Pendiente de revisión final y commit | — |

Ruta crítica: M01 es predecesor de M02 (Identity) y de todo módulo con acciones sensibles.

---

## 4. Expresión Oral y Escrita: documentación técnica

- [Guía de auditoría para los módulos de PEI](../arquitectura/auditoria.md): cuándo y cómo auditar, convención de acciones, reglas de `metadata` y garantías de la BD.
- [Matriz de trazabilidad de M01](../testing/trazabilidad/M01-audit.md).
