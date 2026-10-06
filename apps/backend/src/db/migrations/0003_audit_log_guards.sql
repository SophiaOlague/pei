-- ============================================================
-- PEI — M01 Audit: protecciones de audit_log que Drizzle no declara.
-- Se aplica después de 0002_audit_log_actor (columna actor_user_id y CHECKs).
-- Usar "generate" + "migrate"; "drizzle-kit push" no conoce estos objetos.
-- ============================================================

-- ------------------------------------------------------------
-- C1. audit_log tampoco admite TRUNCATE.
--     RN-119 y RNF-08: append-only. Los triggers por fila de 0001 no se disparan con TRUNCATE.
--     Reutiliza gst_append_only() (0001): falla con P0001 "no admite TRUNCATE".
--     Nota: el dueño de la tabla puede desactivar este trigger; la protección contra ese rol
--     es el rol de mínimo privilegio (trabajo de infraestructura separado, D7).
-- ------------------------------------------------------------

create trigger audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function gst_append_only();

-- ------------------------------------------------------------
-- C4. Al insertar:
--     - created_at lo fija PostgreSQL con now() (inicio de la transacción), sin importar el valor
--       que envíe la aplicación (D3, RF-52 "fecha"). Los eventos de una misma transacción comparten
--       la fecha; no se garantiza un orden total.
--     - en un actor 'user' con actor_user_profile_id, ese perfil debe pertenecer a actor_user_id (RN-120).
--       Un actor 'system' con perfil o usuario lo rechaza audit_log_actor_chk (23514), no este trigger.
-- ------------------------------------------------------------

create or replace function gst_audit_log_before_insert() returns trigger
language plpgsql as $$
declare
  v_profile_user text;
begin
  new.created_at := now();

  if new.actor_type = 'user' and new.actor_user_profile_id is not null then
    select user_id into v_profile_user
      from user_profile where id = new.actor_user_profile_id;
    if v_profile_user is distinct from new.actor_user_id then
      raise exception 'El perfil % no pertenece al usuario actor del evento de auditoría', new.actor_user_profile_id
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger audit_log_before_insert
  before insert on audit_log
  for each row execute function gst_audit_log_before_insert();
