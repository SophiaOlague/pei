# M01: validación y aplicación de las migraciones 0002 y 0003

BD de PEI: PostgreSQL 18.6 en Neon (BD de desarrollo; host omitido). Commit base: `b622ecc` con los cambios de M01 sin commit.
Las salidas de esta página se copiaron de las ejecuciones reales; los scripts temporales que las produjeron no forman parte del repositorio.

| Archivo | sha256 |
|---|---|
| `0002_audit_log_actor.sql` (generado por Drizzle) | `b5c35526d1fcef500913de4757820558b5d5e65f1799dd5634563c4cee83696d` |
| `0003_audit_log_guards.sql` (SQL personalizado, versión aprobada) | `f07f05dec49690452f26c2ea6813ea88d77c3cec4f72397adc8578a2dd3fbd2e` |

## 1. Primera validación temporal (`BEGIN … ROLLBACK`): discrepancia encontrada

Con la primera versión de `0003` (sha256 `9bf56108…a787`), un evento `system` con `actor_user_profile_id` se rechazaba con `P0001`
en el trigger `BEFORE INSERT`, antes de evaluar `audit_log_actor_chk`, en lugar de `23514`. Se aprobó la opción A: verificar la coherencia
usuario ↔ perfil solo cuando `actor_type = 'user'`. `0002` no cambió. El `ROLLBACK` dejó la BD idéntica.

## 2. Segunda validación temporal (`BEGIN … ROLLBACK`), 2026-10-06T02:52Z

SQL ejecutado en una sola sesión: huella previa (solo lectura) → `BEGIN` → `SET LOCAL lock_timeout = '5s'` → `SET LOCAL statement_timeout = '30s'` →
las 4 sentencias de `0002` → `0003` completo → verificaciones (los casos que deben fallar, dentro de `SAVEPOINT`) → `ROLLBACK` → huella posterior.
No se usó el migrador de Drizzle; `drizzle.__drizzle_migrations` no se modificó.

| # | Verificación | Resultado | Salida |
|---|---|---|---|
| 12 | 0002 y 0003 se aplican en ese orden dentro de una transacción | PASS | 4 sentencias de 0002 + 0003 completo, sin errores |
| 2 | `audit_log.actor_user_id` existe y es `text` | PASS | `{"data_type":"text","is_nullable":"YES"}` |
| 3 | FK `actor_user_id` → `public.user(id)` | PASS | `FOREIGN KEY (actor_user_id) REFERENCES "user"(id)` |
| 4 | `audit_log_actor_chk` y `audit_log_entity_chk` | PASS | Definiciones presentes |
| 5 | Trigger `audit_log_no_truncate` | PASS | `BEFORE TRUNCATE ON public.audit_log FOR EACH STATEMENT EXECUTE FUNCTION gst_append_only()` |
| 6 | Trigger `audit_log_before_insert` | PASS | `BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION gst_audit_log_before_insert()` |
| 7 | `TRUNCATE audit_log` rechazado | PASS | `P0001: La tabla audit_log es de solo inserción: no admite TRUNCATE` |
| 8 | `created_at` impuesto por la BD aunque se envíe 2000-01-01 | PASS | guardado = now() = `2026-10-06T02:52:20.590Z` |
| 9 | Coherencia `actor_user_id` ↔ `actor_user_profile_id` | PASS | perfil propio: aceptado · perfil de otro usuario: `P0001` · perfil inexistente: `P0001` |
| 10 | Actor `system` y CHECKs relacionados | PASS | system solo: aceptado · system+usuario: `23514/audit_log_actor_chk` · system+perfil: `23514/audit_log_actor_chk` · user sin `actor_user_id`: `23514/audit_log_actor_chk` · `entity_id` sin `entity_type`: `23514/audit_log_entity_chk` |
| 11 | Usuario sin `user_profile` aceptado; usuario inexistente rechazado | PASS | sin perfil: aceptado · usuario inexistente: `23503 audit_log_actor_user_id_user_id_fk` |
| 4a | system + profile → `23514 audit_log_actor_chk` | PASS | `23514/audit_log_actor_chk` |
| 4b | system + actor_user_id → `23514 audit_log_actor_chk` | PASS | `23514/audit_log_actor_chk` |
| 4c | user + profile del mismo usuario → aceptado | PASS | aceptado |
| 4d | user + profile de otro usuario → `P0001` | PASS | `P0001` "El perfil … no pertenece al usuario actor del evento de auditoría" |
| 4e | user + profile inexistente → `P0001` | PASS | `P0001` |
| 4f | user sin profile → aceptado | PASS | aceptado |
| 4g | `created_at` protegido | PASS | valor de la app ignorado |
| 4h | `TRUNCATE` protegido | PASS | `P0001` |
| 4i | `UPDATE` protegido (`audit_log_append_only`) | PASS | `P0001: … no admite UPDATE` |
| 13 | Tras `ROLLBACK` la BD queda idéntica a la huella previa | PASS | migraciones, tablas, conteos exactos, columnas y constraints de `audit_log`, triggers, funciones, índices y extensiones idénticos |

Huella después del `ROLLBACK`: migraciones registradas `[1, 2]`; 60 tablas; 24 triggers; 17 funciones; constraints `c` 22, `f` 102, `n` 374, `p` 60, `u` 30, `x` 4;
extensión `plpgsql`; `audit_log` con sus 10 columnas originales.

## 3. Aplicación con `pnpm db:migrate`, 2026-10-06

Salida: `[✓] migrations applied successfully!` (exit 0). El migrador de Drizzle aplica las migraciones pendientes en una sola transacción.

Verificación posterior (solo lectura):

| Elemento | Resultado |
|---|---|
| `drizzle.__drizzle_migrations` | id 3 = `b5c35526…696d` (0002), id 4 = `f07f05de…bd2e` (0003); ids 1 y 2 sin cambios |
| `audit_log.actor_user_id` | `text`, admite nulos |
| Constraints nuevas | `audit_log_actor_chk`, `audit_log_entity_chk`, `audit_log_actor_user_id_user_id_fk` |
| Triggers de `audit_log` | `audit_log_append_only`, `audit_log_before_insert`, `audit_log_no_truncate` |
| Condición de `gst_audit_log_before_insert` | contiene `new.actor_type = 'user' and new.actor_user_profile_id is not null` |
| Totales | 60 tablas; triggers 24 → 26; funciones 17 → 18; CHECK 22 → 24; FK 102 → 103 |
| Esquema Drizzle ↔ migraciones | `No schema changes, nothing to migrate` |
| Datos | Mismos conteos exactos que antes de M01; `audit_log` con 0 filas |
