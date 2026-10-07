-- ============================================================
-- PEI — M02 Identity: protecciones que Drizzle no declara.
-- Se aplica después de 0004_m02_identity.
-- Usar "generate" + "migrate"; "drizzle-kit push" no conoce estos objetos.
-- ============================================================

-- ------------------------------------------------------------
-- A7. El rol de un user_profile no cambia (RN-001, DP-5).
--     Ningún endpoint asigna roles; esta protección cubre también a quien se salte la API.
--     Nota: el dueño de la tabla puede desactivar el trigger (deuda D7, rol de mínimo privilegio).
-- ------------------------------------------------------------

create or replace function gst_user_profile_role_immutable() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role then
    raise exception 'El rol de un perfil de usuario no se puede cambiar'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
--> statement-breakpoint

create trigger user_profile_role_immutable
  before update of role on user_profile
  for each row execute function gst_user_profile_role_immutable();
--> statement-breakpoint

-- ------------------------------------------------------------
-- A8. Las tablas legales tampoco admiten TRUNCATE (RN-006, RNF-12).
--     Los triggers por fila de 0001 no se disparan con TRUNCATE.
--     Reutiliza gst_append_only() (0001): falla con P0001 "no admite TRUNCATE".
-- ------------------------------------------------------------

create trigger legal_document_no_truncate
  before truncate on legal_document
  for each statement execute function gst_append_only();
--> statement-breakpoint

create trigger user_legal_acceptance_no_truncate
  before truncate on user_legal_acceptance
  for each statement execute function gst_append_only();
