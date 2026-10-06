# Auditoría en PEI: guía para los módulos

Cómo debe registrar un módulo de PEI sus acciones sensibles en `audit_log` usando la infraestructura de M01.

## Cuándo auditar

Las acciones sensibles que pide el Documento Maestro (RF-52, RNF-08): aprobaciones, canjes, cierres y otras acciones sensibles,
además de las que el Maestro señala de forma explícita en cada módulo (por ejemplo RF-21/RN-027, RF-62, RF-64/RN-036, RNF-18).
Cada módulo declara las suyas en su diseño. No existe un catálogo cerrado de acciones.

`audit_log` no sustituye a los historiales propios de cada módulo (RN-123): una acción que cambia un estado escribe en su historial
(`appointment_status_history`, `order_status_history`, etc.) **y**, si es sensible, en `audit_log`.

## Cómo auditar

Dentro de la `UnitOfWork` del caso de uso, después de la operación:

```ts
await this.unitOfWork.runInTransaction(async () => {
  await this.doctors.approve(doctorId, actor.userProfileId);
  await this.auditTrail.record(
    AuditEvent.create({
      actor: AuditActor.fromActor(actor),           // o AuditActor.system('nombre-del-proceso')
      action: 'identity.doctor.approved',
      entity: { type: 'doctor_profile', id: doctorId },
      metadata: { reason },
    }),
  );
});
```

- Inyectar el puerto con `@Inject(AUDIT_TRAIL)`; `AuditModule` es global.
- El `Actor` llega del controller con `@CurrentActor()` (M00).
- `record()` fuera de una `UnitOfWork` lanza `AuditOutsideTransactionError`.
- Si la operación se revierte, el evento también; si el registro falla, la operación falla.

## Convención de acciones

`dominio.entidad.accion`, en minúsculas y snake_case, con al menos tres segmentos y máximo 100 caracteres.
Ejemplos: `identity.doctor.approved`, `dispensing.voucher.redeemed`, `support.request.resolved`.

## Entidad

`entity.type` en snake_case (normalmente el nombre de la tabla) y `entity.id` opcional en formato UUID.
Las referencias que no son UUID van en `metadata`.

## metadata

- Objeto JSON serializable (null, booleanos, números finitos, strings, arreglos y objetos planos), máximo 4 KB.
- `correlationId` es opcional y se pasa como campo del evento, no dentro de `metadata`.
- `correlationId` y `systemProcess` son claves reservadas.
- **No debe contener contenido clínico (RN-122) ni datos personales innecesarios.** La validación solo comprueba forma y tamaño;
  el contenido es responsabilidad del módulo y de la revisión de código.

## Fecha y orden

PostgreSQL fija `created_at` con `now()`, que es el inicio de la transacción. Los eventos de una misma transacción comparten la fecha.
M01 no garantiza un orden total de eventos.

## Qué garantiza la BD de PEI

- `audit_log` no admite UPDATE, DELETE ni TRUNCATE.
- Actor `user`: `actor_user_id` obligatorio; si trae perfil, debe pertenecer a ese usuario.
- Actor `system`: sin usuario ni perfil.
- `entity_id` solo con `entity_type`.
- `created_at` lo impone la BD.

Límite: el rol dueño de la BD puede desactivar triggers. La protección frente a ese rol es el rol de mínimo privilegio (pendiente, fuera de M01).
